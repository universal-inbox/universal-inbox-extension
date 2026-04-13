import { DEFAULT_CONFIG } from "../types.ts";
import type { StatusType } from "../types.ts";

let apiUrlInput: HTMLInputElement;
let settingsForm: HTMLFormElement;
let statusDiv: HTMLDivElement;

document.addEventListener("DOMContentLoaded", async (): Promise<void> => {
  apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
  settingsForm = document.getElementById("settingsForm") as HTMLFormElement;
  statusDiv = document.getElementById("status") as HTMLDivElement;

  await loadSettings();
  await verifyConnection();

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
  if (!success) {
    showStatus("Error saving settings", "error");
    return;
  }

  showStatus("Settings saved. Verifying connection...", "success");
  await verifyConnection(apiUrl);
}

// Request host permission for a given URL
async function requestHostPermission(apiUrl: string): Promise<boolean> {
  try {
    const url = new URL(apiUrl);
    const origin = `${url.protocol}//${url.host}/*`;

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
}

// Verify API connectivity via the background script
async function verifyConnection(apiUrl?: string): Promise<void> {
  if (!apiUrl) {
    const result = await chrome.storage.sync.get(DEFAULT_CONFIG);
    apiUrl = result.apiUrl || DEFAULT_CONFIG.apiUrl;
  }

  try {
    const result: { ok: boolean; error?: string } =
      await chrome.runtime.sendMessage({
        type: "VERIFY_API",
        apiUrl,
      });

    if (result.ok) {
      showStatus("Connected and authenticated.", "success");
    } else {
      showStatus(`Connection failed: ${result.error}`, "error");
    }
  } catch (error) {
    showStatus(`Connection check failed: ${error}`, "error");
  }
}
