import type { ExtensionCredential } from "./universal-inbox-api.ts";

export interface SlackApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function findSlackTab(): Promise<number | null> {
  const tabs = await chrome.tabs.query({
    url: "https://app.slack.com/*",
    status: "complete",
  });
  if (tabs.length === 0) {
    return null;
  }
  return tabs[0].id ?? null;
}

// Reads team_id + user_id from localStorage in the MAIN world of a Slack tab
function extractCredentialsFromPage(): Array<{
  team_id: string;
  user_id: string;
}> {
  try {
    const localConfig = localStorage.getItem("localConfig_v2");
    if (!localConfig) return [];

    const parsed = JSON.parse(localConfig);
    const credentials: Array<{ team_id: string; user_id: string }> = [];

    if (parsed.teams) {
      for (const [teamId, teamData] of Object.entries(parsed.teams)) {
        const data = teamData as Record<string, unknown>;
        if (
          typeof data.token === "string" &&
          (data.token as string).startsWith("xoxc-")
        ) {
          credentials.push({
            team_id: teamId,
            user_id: (data.user_id as string) || "",
          });
        }
      }
    }

    return credentials;
  } catch {
    return [];
  }
}

// Extracts live credentials from all open Slack tabs
export async function getSlackTabCredentials(): Promise<ExtensionCredential[]> {
  const tabs = await chrome.tabs.query({
    url: "https://app.slack.com/*",
    status: "complete",
  });

  const allCredentials: ExtensionCredential[] = [];

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: extractCredentialsFromPage,
      });
      const creds = results?.[0]?.result;
      if (Array.isArray(creds)) {
        allCredentials.push(...creds);
      }
    } catch (error) {
      console.warn(
        `[Slack Bridge] Failed to extract credentials from tab ${tab.id}:`,
        error
      );
    }
  }

  // Deduplicate by team_id (keep first occurrence)
  const seen = new Set<string>();
  return allCredentials.filter((c) => {
    if (seen.has(c.team_id)) return false;
    seen.add(c.team_id);
    return true;
  });
}

// Runs in the MAIN world of the Slack page — has access to .slack.com cookies.
// Looks up the xoxc token from localStorage for the given team, then makes the API call.
async function executeSlackApiInPage(
  teamId: string,
  apiPath: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  try {
    const localConfig = localStorage.getItem("localConfig_v2");
    if (!localConfig) {
      return {
        ok: false,
        error: "No Slack configuration found in localStorage",
      };
    }
    const parsed = JSON.parse(localConfig);
    const teamData = parsed.teams?.[teamId];
    if (!teamData?.token) {
      return { ok: false, error: `No token found for team ${teamId}` };
    }

    const url = `${window.location.origin}${apiPath}`;
    const formData = new FormData();
    formData.append("token", teamData.token);
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, value);
    }
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      error: `Page context fetch failed: ${error}`,
    };
  }
}

async function fetchWithSlackAuth(
  teamId: string,
  apiMethod: string,
  params: Record<string, string>
): Promise<SlackApiResult> {
  const tabId = await findSlackTab();
  if (tabId === null) {
    throw new Error("No Slack tab found. Please open app.slack.com in a tab.");
  }

  const apiPath = `/api/${apiMethod}`;

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: executeSlackApiInPage,
      args: [teamId, apiPath, params],
    });
  } catch (error) {
    throw new Error(`executeScript failed on tab ${tabId}: ${error}`);
  }

  const result = results?.[0]?.result as SlackApiResult | undefined;
  if (!result) {
    throw new Error(`Slack API call returned no result from tab ${tabId}`);
  }

  return result;
}

export async function getThreadSubscription(
  teamId: string,
  channel: string,
  threadTs: string
): Promise<SlackApiResult> {
  return fetchWithSlackAuth(teamId, "subscriptions.thread.get", {
    channel,
    thread_ts: threadTs,
  });
}

export async function markThreadAsRead(
  teamId: string,
  channel: string,
  threadTs: string,
  lastMessageTs: string
): Promise<SlackApiResult> {
  return fetchWithSlackAuth(teamId, "subscriptions.thread.mark", {
    channel,
    thread_ts: threadTs,
    ts: lastMessageTs,
    read: "1",
  });
}

export async function markChannelAsRead(
  teamId: string,
  channel: string,
  ts: string
): Promise<SlackApiResult> {
  return fetchWithSlackAuth(teamId, "conversations.mark", {
    channel,
    ts,
  });
}

export async function unsubscribeFromThread(
  teamId: string,
  channel: string,
  threadTs: string,
  lastRead: string
): Promise<SlackApiResult> {
  return fetchWithSlackAuth(teamId, "subscriptions.thread.remove", {
    channel,
    thread_ts: threadTs,
    last_read: lastRead,
  });
}
