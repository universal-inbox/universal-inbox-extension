import { DEFAULT_CONFIG } from "./types.ts";

// Cache for container information to avoid async operations in webRequest listener
const containerCache = new Map<
  string,
  { cookieStoreId: string; userContextId: number | null; cookies: string }
>();

// Minimal typing of the Firefox-only contextualIdentities API
interface ContextualIdentity {
  cookieStoreId: string;
  name: string;
}
interface ContextualIdentitiesApi {
  query(details: object): Promise<ContextualIdentity[]>;
}

// Update the onBeforeSendHeaders listener when settings change
export async function updateBeforeSendHeadersHandler(): Promise<void> {
  if (!isFirefox()) {
    return;
  }
  const settings = await chrome.storage.sync.get(DEFAULT_CONFIG);
  const apiUrl: string = settings.apiUrl || DEFAULT_CONFIG.apiUrl;

  // Pre-cache container information for the domain
  // because beforeSendHeadersHandler cannot execute async
  await updateContainerCache(apiUrl);

  chrome.webRequest.onBeforeSendHeaders.removeListener(
    beforeSendHeadersHandler
  );

  chrome.webRequest.onBeforeSendHeaders.addListener(
    beforeSendHeadersHandler,
    { urls: [`${apiUrl}/*`] },
    ["blocking", "requestHeaders"]
  );
}

// Refresh the cached container cookies (e.g. after a login or logout),
// without re-registering the webRequest listener
export async function refreshContainerCache(): Promise<void> {
  if (!isFirefox()) {
    return;
  }
  const settings = await chrome.storage.sync.get(DEFAULT_CONFIG);
  await updateContainerCache(settings.apiUrl || DEFAULT_CONFIG.apiUrl);
}

export function isFirefox(): boolean {
  return chrome.runtime.getURL("").startsWith("moz-extension://");
}

// Listener for modifying request headers to include cookies from the appropriate container
function beforeSendHeadersHandler(
  details: chrome.webRequest.WebRequestHeadersDetails
): chrome.webRequest.BlockingResponse {
  const headers = details.requestHeaders || [];
  const url = new URL(details.url);
  const domain = url.hostname;

  // Check cache for container information
  const containerInfo = containerCache.get(domain);
  if (containerInfo && containerInfo.cookies) {
    // Extension requests carry the default store cookies: replace them with
    // the cookies of the container holding the session
    const cookieHeaderIndex = headers.findIndex(
      (h: chrome.webRequest.HttpHeader) => h.name.toLowerCase() === "cookie"
    );

    if (cookieHeaderIndex === -1) {
      headers.push({ name: "Cookie", value: containerInfo.cookies });
    } else {
      headers[cookieHeaderIndex].value = containerInfo.cookies;
    }
  }

  return { requestHeaders: headers };
}

// Update container cache with current container and cookie information
async function updateContainerCache(apiUrl: string): Promise<void> {
  try {
    const uiDomain = new URL(apiUrl).hostname;
    const container = await getContainerForDomain(apiUrl);

    let cookieStoreId: string = container.cookieStoreId;
    let userContextId: number | null = container.userContextId;
    let cookies = await chrome.cookies.getAll({
      storeId: cookieStoreId,
      domain: uiDomain,
    });

    // If the MAC-assigned container has no session, look for the store holding one
    if (bestSessionCookieRank(cookies) === 0) {
      const found = await findCookieStoreForDomain(uiDomain);
      if (found) {
        cookieStoreId = found.storeId;
        cookies = found.cookies;
        userContextId = null;
      }
    }

    console.info(
      `[Containers] Using cookie store ${cookieStoreId} for ${uiDomain}, cookies:`,
      cookies.map((cookie) => cookie.name)
    );
    containerCache.set(uiDomain, {
      cookieStoreId,
      userContextId,
      cookies: toCookieHeader(cookies),
    });
  } catch (error) {
    console.error("Failed to update container cache:", error);
  }
}

// Rank a cookie name as the Universal Inbox session cookie (see
// `session_cookie_name` in the API): `__Host-id` on real hosts, `id-<port>` on
// localhost, legacy `id` on instances not yet migrated. 0 means not a session cookie.
function sessionCookieRank(name: string): number {
  if (name === "__Host-id") {
    return 3;
  }
  if (/^id-\d+$/.test(name)) {
    return 2;
  }
  if (name === "id") {
    return 1;
  }
  return 0;
}

function bestSessionCookieRank(cookies: chrome.cookies.Cookie[]): number {
  return Math.max(
    0,
    ...cookies.map((cookie) => sessionCookieRank(cookie.name))
  );
}

// Scan all cookie stores to find the one holding the best-ranked session cookie
async function findCookieStoreForDomain(
  domain: string
): Promise<{ storeId: string; cookies: chrome.cookies.Cookie[] } | null> {
  let best: {
    storeId: string;
    cookies: chrome.cookies.Cookie[];
    rank: number;
  } | null = null;
  for (const storeId of await listCookieStoreIds()) {
    const cookies = await chrome.cookies.getAll({ storeId, domain });
    const rank = bestSessionCookieRank(cookies);
    if (rank > 0 && (!best || rank > best.rank)) {
      best = { storeId, cookies, rank };
    }
  }
  return best;
}

// List every cookie store: getAllCookieStores() only returns stores that
// currently have an open tab, so containers are also listed from
// contextualIdentities (a container without open tab still keeps its cookies)
async function listCookieStoreIds(): Promise<string[]> {
  const storeIds = new Set<string>(["firefox-default"]);
  for (const store of await chrome.cookies.getAllCookieStores()) {
    storeIds.add(store.id);
  }
  try {
    const contextualIdentities = (
      chrome as unknown as { contextualIdentities?: ContextualIdentitiesApi }
    ).contextualIdentities;
    for (const identity of (await contextualIdentities?.query({})) ?? []) {
      storeIds.add(identity.cookieStoreId);
    }
  } catch (error) {
    // contextualIdentities.query fails when containers are disabled
    console.warn("[Containers] Unable to list containers:", error);
  }
  return [...storeIds];
}

// Format cookies as a Cookie header string
function toCookieHeader(cookies: chrome.cookies.Cookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

// Get the container info for a given URL using the Multi-Account Containers API
async function getContainerForDomain(url: string): Promise<any> {
  try {
    const assignment = await chrome.runtime.sendMessage(
      "@testpilot-containers",
      {
        method: "getAssignment",
        url: url,
      }
    );

    if (assignment) {
      // Convert userContextId to full cookieStoreId
      const cookieStoreId = `firefox-container-${assignment.userContextId}`;

      return {
        cookieStoreId: cookieStoreId,
        userContextId: assignment.userContextId,
        isPermanent: assignment.neverAsk,
      };
    } else {
      // No assignment found - would use default container
      return {
        cookieStoreId: "firefox-default",
        userContextId: null,
        isPermanent: false,
      };
    }
  } catch (error) {
    console.warn(
      "Multi-Account Containers not available or no permission, falling back to default cookie store:",
      error
    );
    return {
      cookieStoreId: "firefox-default",
      userContextId: null,
      isPermanent: false,
    };
  }
}
