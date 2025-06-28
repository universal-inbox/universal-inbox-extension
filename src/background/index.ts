import { DEFAULT_CONFIG } from "../types.ts";
import type { NotificationPayload } from "../types.ts";

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
        console.log("Cannot send system URLs to Universal Inbox");
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
    if (details.reason === "install") {
      console.log("Universal Inbox extension installed");

      // Set default settings if not already set
      chrome.storage.sync.get(DEFAULT_CONFIG).then((result) => {
        if (!result.apiUrl) {
          chrome.storage.sync.set(DEFAULT_CONFIG);
          console.log("Default settings applied");
        }
      });
    }
  }
);
