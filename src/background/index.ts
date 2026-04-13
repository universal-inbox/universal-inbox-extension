import { DEFAULT_CONFIG } from "../types.ts";
import type { NotificationPayload } from "../types.ts";
import { updateBeforeSendHeadersHandler } from "../firefox.ts";
import { startPolling } from "../slack/poller.ts";

// Listen for messages from the options page
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; apiUrl?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { ok: boolean; error?: string }) => void
  ): boolean => {
    if (message.type === "VERIFY_API" && message.apiUrl) {
      verifyApiConnectivity(message.apiUrl).then(
        (result) => sendResponse(result),
        (err) => sendResponse({ ok: false, error: String(err) })
      );
      return true;
    }

    return false;
  }
);

// Verify API connectivity by fetching /api/users/me
async function verifyApiConnectivity(
  apiUrl: string
): Promise<{ ok: boolean; error?: string }> {
  // Ensure cookie injection is up to date for this URL
  await updateBeforeSendHeadersHandler();

  const response = await fetch(`${apiUrl}/api/users/me`, {
    method: "GET",
    credentials: "include",
  });

  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 401) {
    return { ok: false, error: "Not authenticated. Please log in first." };
  }

  return {
    ok: false,
    error: `${response.status} ${response.statusText}`,
  };
}

// Handle extension icon click (action button)
chrome.action.onClicked.addListener(
  async (tab: chrome.tabs.Tab): Promise<void> => {
    try {
      const settings = await chrome.storage.sync.get(DEFAULT_CONFIG);
      const apiUrl: string = settings.apiUrl || DEFAULT_CONFIG.apiUrl;
      const url = tab.url;

      if (
        !url ||
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("moz-extension://") ||
        url.startsWith("about:")
      ) {
        return;
      }

      await sendUrlToUniversalInbox(apiUrl, tab);
    } catch (error) {
      console.error("Error in action click handler:", error);
    }
  }
);

// Function to send URL to Universal Inbox API
async function sendUrlToUniversalInbox(
  apiUrl: string,
  tab: chrome.tabs.Tab
): Promise<void> {
  try {
    // Check if we have permission for the API URL
    const hasPermission = await checkHostPermission(apiUrl);
    if (!hasPermission) {
      console.error("Missing host permission for:", apiUrl);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "/icons/extension_128.png",
        title: "Universal Inbox Error",
        message: "Please configure API URL permissions in extension options",
      });
      return;
    }

    const payload: NotificationPayload = {
      url: tab.url!,
      title: tab.title || "Web Page",
      timestamp: new Date().toISOString(),
      source: "browser-extension",
      favicon: tab.favIconUrl || null,
    };

    const response = await fetch(
      `${apiUrl}/api/third_party/notification/items`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "WebPage", content: payload }),
      }
    );

    if (response.ok) {
      console.log("URL sent successfully to Universal Inbox");

      chrome.notifications.create({
        type: "basic",
        iconUrl: "/icons/extension_128.png",
        title: "Universal Inbox",
        message: `Page sent to Universal Inbox: ${tab.title || tab.url}`,
      });
    } else {
      const errorText = await response.text();
      console.error("API Error:", response.status, errorText);

      chrome.notifications.create({
        type: "basic",
        iconUrl: "/icons/extension_128.png",
        title: "Universal Inbox Error",
        message: `Failed to send page: ${response.status}`,
      });
    }
  } catch (error) {
    console.error("Network error sending to Universal Inbox:", error);

    chrome.notifications.create({
      type: "basic",
      iconUrl: "/icons/extension_128.png",
      title: "Universal Inbox Error",
      message: "Network error occurred",
    });
  }
}

// Function to check host permission for a given URL
async function checkHostPermission(apiUrl: string): Promise<boolean> {
  try {
    const url = new URL(apiUrl);
    const origin = `${url.protocol}//${url.host}/*`;

    // Check if we have permission
    return await chrome.permissions.contains({
      origins: [origin],
    });
  } catch (error) {
    console.error("Error checking host permission:", error);
    return false;
  }
}

// Handle installation
chrome.runtime.onInstalled.addListener(
  (details: chrome.runtime.InstalledDetails): void => {
    // Set default settings if not already set
    chrome.storage.sync.get(DEFAULT_CONFIG).then((result) => {
      if (!result.apiUrl) {
        chrome.storage.sync.set(DEFAULT_CONFIG);
        console.log("Default settings applied");
      }

      updateBeforeSendHeadersHandler();

      console.log(`Universal Inbox extension ${details.reason}ed`);
    });
  }
);

// Re-register webRequest handler when apiUrl changes in storage
chrome.storage.onChanged.addListener(
  (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === "sync" && changes.apiUrl) {
      updateBeforeSendHeadersHandler();
    }
  }
);

// Initialize webRequest handler at service worker startup
// (onInstalled only fires on install/update, not on every SW restart)
updateBeforeSendHeadersHandler();

// Retry after a delay so MAC extension has time to initialize
const CONTAINER_RETRY_ALARM = "retry-container-cache";
chrome.alarms.create(CONTAINER_RETRY_ALARM, { delayInMinutes: 0.15 });
chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === CONTAINER_RETRY_ALARM) {
    updateBeforeSendHeadersHandler();
  }
});

// Start the Slack bridge poller on service worker startup
startPolling();
