// Shared types for the Universal Inbox extension

export interface Config {
  apiUrl: string;
}

export interface NotificationPayload {
  url: string;
  title: string;
  timestamp: string;
  source: string;
  favicon?: string | null;
}

export type StatusType = "success" | "error";

// Default configuration
export const DEFAULT_CONFIG: Config = {
  apiUrl: "https://app.universal-inbox.com",
};
