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
    console.debug(`Found Firefox container for ${domain} with cookies`);
    const cookieHeaderIndex = headers.findIndex(
      (h: chrome.webRequest.HttpHeader) => h.name.toLowerCase() === "cookie"
    );

    if (cookieHeaderIndex === -1) {
      console.debug(
        `No cookies sent to ${domain}. Injecting cookies found from the Firefox container`
      );
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

    if (container) {
      const cookies = await getCookiesForContainer(
        container.cookieStoreId,
        uiDomain
      );
      containerCache.set(uiDomain, {
        cookieStoreId: container.cookieStoreId,
        userContextId: container.userContextId,
        cookies: cookies,
      });
    }
  } catch (error) {
    console.error("Failed to update container cache:", error);
  }
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
    console.error(
      "Multi-Account Containers not available or no permission:",
      error
    );
    return null;
  }
}
