import { DEFAULT_CONFIG } from "./types.ts";
import { refreshContainerCache } from "./firefox.ts";
import { hasSlackPermission } from "./slack/api.ts";
import { isAuthenticated } from "./slack/universal-inbox-api.ts";

const CONNECTED_COLOR = "#16a34a";
const DISCONNECTED_COLOR = "#dc2626";

// Show the API connection state as a colored dot on the toolbar icon:
// green when the API accepts our session and Slack access is granted, red
// otherwise. The tooltip keeps the default action title and explains the state.
export async function setConnectionStatus(
  ok: boolean,
  detail?: string
): Promise<void> {
  try {
    if (ok && !(await hasSlackPermission())) {
      ok = false;
      detail = "Slack access not granted, open the extension options";
    }
    const settings = await chrome.storage.sync.get(DEFAULT_CONFIG);
    const apiUrl: string = settings.apiUrl || DEFAULT_CONFIG.apiUrl;
    const host = new URL(apiUrl).host;
    await chrome.action.setBadgeText({ text: " " });
    await chrome.action.setBadgeBackgroundColor({
      color: ok ? CONNECTED_COLOR : DISCONNECTED_COLOR,
    });
    await chrome.action.setTitle({
      title: ok
        ? `Send page to Universal Inbox (connected to ${host})`
        : `Send page to Universal Inbox (not connected to ${host}${detail ? `: ${detail}` : ""})`,
    });
  } catch (error) {
    console.error("Failed to update connection status:", error);
  }
}

let connectionCheck: Promise<void> | null = null;

// Probe the API session and update the toolbar dot. Concurrent calls share
// the same probe.
export function checkConnection(): Promise<void> {
  if (!connectionCheck) {
    connectionCheck = probeConnection().finally(() => {
      connectionCheck = null;
    });
  }
  return connectionCheck;
}

async function probeConnection(): Promise<void> {
  const settings = await chrome.storage.sync.get(DEFAULT_CONFIG);
  const apiUrl: string = settings.apiUrl || DEFAULT_CONFIG.apiUrl;
  try {
    const url = new URL(apiUrl);
    const hasPermission = await chrome.permissions.contains({
      origins: [`${url.protocol}//${url.host}/*`],
    });
    if (!hasPermission) {
      await setConnectionStatus(false, "missing host permission");
      return;
    }
    await refreshContainerCache();
    if (await isAuthenticated(apiUrl)) {
      await setConnectionStatus(true);
    } else {
      await setConnectionStatus(false, "not logged in");
    }
  } catch (error) {
    console.error("Connection check failed:", error);
    await setConnectionStatus(false, "unreachable");
  }
}
