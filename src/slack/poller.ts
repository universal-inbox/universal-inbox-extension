import { DEFAULT_CONFIG, type Config } from "../types.ts";
import {
  markThreadAsRead,
  markChannelAsRead,
  unsubscribeFromThread,
  getSlackTabCredentials,
} from "./api.ts";
import {
  fetchPendingActions,
  reportActionComplete,
  reportActionFailed,
  type PendingSlackAction,
} from "./universal-inbox-api.ts";

const ALARM_NAME = "slack-bridge-poll";
const POLL_INTERVAL_MINUTES = 0.5; // 30 seconds

export function startPolling(): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      pollAndExecute();
    }
  });
  console.log(
    "[Slack Bridge] Polling started with interval:",
    POLL_INTERVAL_MINUTES * 60,
    "seconds"
  );
}

async function getConfig(): Promise<Config> {
  const result = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return { apiUrl: result.apiUrl || DEFAULT_CONFIG.apiUrl };
}

async function pollAndExecute(): Promise<void> {
  try {
    const config = await getConfig();

    // Extract credentials live from open Slack tabs
    const liveCredentials = await getSlackTabCredentials();
    // Always poll (even with empty credentials) so the API records the heartbeat
    const actions = await fetchPendingActions(config.apiUrl, liveCredentials);
    if (actions.length === 0) {
      return;
    }

    let succeeded = 0;
    let failed = 0;

    for (const action of actions) {
      try {
        await executeAction(action);
        await reportActionComplete(config.apiUrl, action.id);
        succeeded++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("[Slack Bridge] Action failed:", action.id, errorMessage);
        await reportActionFailed(config.apiUrl, action.id, errorMessage);
        failed++;
      }
    }

    console.log(
      `[Slack Bridge] Poll complete: ${succeeded} succeeded, ${failed} failed`
    );
  } catch (error) {
    console.error("[Slack Bridge] Poll error:", error);
  }
}

async function executeAction(action: PendingSlackAction): Promise<void> {
  switch (action.action_type) {
    case "MarkAsRead": {
      const isThread = action.slack_thread_ts !== action.slack_last_message_ts;
      const result = isThread
        ? await markThreadAsRead(
            action.slack_team_id,
            action.slack_channel_id,
            action.slack_thread_ts,
            action.slack_last_message_ts
          )
        : await markChannelAsRead(
            action.slack_team_id,
            action.slack_channel_id,
            action.slack_last_message_ts
          );
      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error || "unknown"}`);
      }
      break;
    }
    case "Unsubscribe": {
      const result = await unsubscribeFromThread(
        action.slack_team_id,
        action.slack_channel_id,
        action.slack_thread_ts,
        action.slack_last_message_ts
      );
      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error || "unknown"}`);
      }
      break;
    }
    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}
