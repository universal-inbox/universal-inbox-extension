import { DEFAULT_CONFIG } from "../types.ts";
import type { StatusType } from "../types.ts";
import { updateBeforeSendHeadersHandler } from "../firefox.ts";

let apiUrlInput: HTMLInputElement;
let settingsForm: HTMLFormElement;
let statusDiv: HTMLDivElement;

document.addEventListener("DOMContentLoaded", async (): Promise<void> => {
  apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
  settingsForm = document.getElementById("settingsForm") as HTMLFormElement;
  statusDiv = document.getElementById("status") as HTMLDivElement;

  await loadSettings();

  settingsForm.addEventListener("submit", handleSaveSettings);
});

// Load settings from Chrome storage
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(DEFAULT_CONFIG);
    apiUrlInput.value = result.apiUrl || DEFAULT_CONFIG.apiUrl;
  } catch (error) {
    console.error("Error loading settings:", error);
    showStatus("Error loading settings", "error");
  }
}

// Save settings to Chrome storage
async function saveSettings(apiUrl: string): Promise<boolean> {
  try {
    await chrome.storage.sync.set({
      apiUrl: apiUrl.trim(),
    });

    await updateBeforeSendHeadersHandler();

    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
}

// Handle save settings form submission
async function handleSaveSettings(event: Event): Promise<void> {
  event.preventDefault();

  const apiUrl = apiUrlInput.value.trim();

  if (!apiUrl) {
    showStatus("API URL is required", "error");
    return;
  }

  try {
    new URL(apiUrl);
  } catch {
    showStatus("Please enter a valid URL", "error");
    return;
  }

  // Request host permission before saving
  const permissionGranted = await requestHostPermission(apiUrl);
  if (!permissionGranted) {
    showStatus("Permission denied for this URL", "error");
    return;
  }

  const success = await saveSettings(apiUrl);
  if (success) {
    showStatus("Settings saved successfully!", "success");
  } else {
    showStatus("Error saving settings", "error");
  }
}

// Request host permission for a given URL
async function requestHostPermission(apiUrl: string): Promise<boolean> {
  try {
    const url = new URL(apiUrl);
    const origin = `${url.protocol}//${url.host}/*`;

    // const hasPermission = await chrome.permissions.contains({
    //   origins: [origin],
    // });

    // if (hasPermission) {
    //   return true;
    // }

    const granted = await chrome.permissions.request({
      origins: [origin],
    });

    return granted;
  } catch (error) {
    console.error("Error requesting host permission:", error);
    return false;
  }
}

// Show status message
function showStatus(message: string, type: StatusType): void {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = "block";

  if (type === "success") {
    setTimeout(() => {
      statusDiv.style.display = "none";
    }, 4000);
  }
}
