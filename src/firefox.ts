import { DEFAULT_CONFIG } from "./types.ts";

// Cache for container information to avoid async operations in webRequest listener
const containerCache = new Map<
  string,
  { cookieStoreId: string; userContextId: number | null; cookies: string }
>();

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

function isFirefox(): boolean {
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
    const cookieHeaderIndex = headers.findIndex(
      (h: chrome.webRequest.HttpHeader) => h.name.toLowerCase() === "cookie"
    );

    if (cookieHeaderIndex === -1) {
      headers.push({ name: "Cookie", value: containerInfo.cookies });
    }
  }

  return { requestHeaders: headers };
}

// Update container cache with current container and cookie information
async function updateContainerCache(apiUrl: string): Promise<void> {
  try {
    const uiDomain = new URL(apiUrl).hostname;
    const container = await getContainerForDomain(apiUrl);

    let cookieStoreId = container.cookieStoreId;
    let userContextId = container.userContextId;
    let cookies = await getCookiesForContainer(cookieStoreId, uiDomain);

    // If MAC-assigned container has no cookies, scan all cookie stores
    if (!cookies) {
      const found = await findCookieStoreForDomain(uiDomain);
      if (found) {
        cookieStoreId = found.storeId;
        cookies = found.cookies;
        userContextId = null;
      }
    }

    containerCache.set(uiDomain, {
      cookieStoreId,
      userContextId,
      cookies,
    });
  } catch (error) {
    console.error("Failed to update container cache:", error);
  }
}

// Scan all cookie stores to find one with cookies for the given domain
async function findCookieStoreForDomain(
  domain: string
): Promise<{ storeId: string; cookies: string } | null> {
  const stores = await chrome.cookies.getAllCookieStores();
  for (const store of stores) {
    const cookies = await getCookiesForContainer(store.id, domain);
    if (cookies) {
      return { storeId: store.id, cookies };
    }
  }
  return null;
}

// Get cookies for a specific container and domain, formatted as a Cookie header string
async function getCookiesForContainer(
  cookieStoreId: string,
  domain: string
): Promise<string> {
  const cookies = await chrome.cookies.getAll({
    storeId: cookieStoreId,
    domain: domain,
  });

  const cookieHeader = cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  return cookieHeader;
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
