import { DEFAULT_CONFIG, type Config } from "../types.ts";
import {
  markThreadAsRead,
  markChannelAsRead,
  unsubscribeFromThread,
  getChannelLastRead,
  getThreadLastRead,
  getSlackTabCredentials,
  findSlackTab,
  hasSlackPermission,
} from "./api.ts";
import {
  refreshContainerCache,
  updateBeforeSendHeadersHandler,
} from "../firefox.ts";
import { setConnectionStatus } from "../connection-status.ts";
import {
  fetchPendingActions,
  isAuthenticated,
  reportActionComplete,
  reportActionFailed,
  UnauthorizedError,
  type PendingSlackAction,
} from "./universal-inbox-api.ts";
import { latestSlackTs, shouldMarkAsRead } from "./ts.ts";

const ALARM_NAME = "slack-bridge-poll";
const POLL_INTERVAL_MINUTES = 0.5; // 30 seconds
// Set when the API answered 401: polling stays stopped until the user is
// authenticated again, instead of hammering the API every 30 seconds.
const AUTH_PAUSED_KEY = "slackBridgeAuthPaused";

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollAndExecute();
  }
});

// Start polling on service worker startup, unless a previous 401 paused it
// and the user is still not authenticated.
export async function startPolling(): Promise<void> {
  const stored = await chrome.storage.local.get(AUTH_PAUSED_KEY);
  if (stored[AUTH_PAUSED_KEY]) {
    await resumePollingIfAuthenticated();
    return;
  }
  schedulePolling();
}

let resumeCheck: Promise<void> | null = null;

// Resume a paused poller if the API now accepts our session. Cheap no-op when
// polling is not paused, so it can be called on every cookie change.
export function resumePollingIfAuthenticated(): Promise<void> {
  if (!resumeCheck) {
    resumeCheck = checkAuthAndResume().finally(() => {
      resumeCheck = null;
    });
  }
  return resumeCheck;
}

async function checkAuthAndResume(): Promise<void> {
  const stored = await chrome.storage.local.get(AUTH_PAUSED_KEY);
  if (!stored[AUTH_PAUSED_KEY]) {
    return;
  }
  try {
    // Refresh the Firefox container cookie cache before probing
    await updateBeforeSendHeadersHandler();
    const config = await getConfig();
    if (!(await isAuthenticated(config.apiUrl))) {
      console.log("[Slack Bridge] Still not authenticated, polling paused");
      setConnectionStatus(false, "not logged in");
      return;
    }
  } catch (error) {
    console.error("[Slack Bridge] Authentication check failed:", error);
    setConnectionStatus(false, "unreachable");
    return;
  }
  setConnectionStatus(true);
  await chrome.storage.local.remove(AUTH_PAUSED_KEY);
  schedulePolling();
  pollAndExecute();
}

function schedulePolling(): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
  console.log(
    "[Slack Bridge] Polling started with interval:",
    POLL_INTERVAL_MINUTES * 60,
    "seconds"
  );
}

async function pausePollingUntilAuthenticated(): Promise<void> {
  await chrome.storage.local.set({ [AUTH_PAUSED_KEY]: true });
  await chrome.alarms.clear(ALARM_NAME);
  console.warn(
    "[Slack Bridge] Not authenticated, polling paused until next login"
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
    // Refresh the Firefox container cookies so a stale cache cannot send the
    // request without session
    await refreshContainerCache();
    // Always poll (even with empty credentials) so the API records the heartbeat
    let actions: PendingSlackAction[];
    try {
      actions = await fetchPendingActions(config.apiUrl, liveCredentials);
    } catch (error) {
      // fetch() rejects with a TypeError on network failure
      if (error instanceof TypeError) {
        setConnectionStatus(false, "unreachable");
      }
      throw error;
    }
    setConnectionStatus(true);
    if (actions.length === 0) {
      return;
    }

    // Without a reachable Slack tab every action would fail: leave them
    // pending on the API so the next poll retries them
    if (!(await hasSlackPermission())) {
      console.warn(
        `[Slack Bridge] Slack access not granted, keeping ${actions.length} action(s) pending`
      );
      return;
    }
    if ((await findSlackTab()) === null) {
      console.warn(
        `[Slack Bridge] No Slack tab open, keeping ${actions.length} action(s) pending`
      );
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
        if (error instanceof UnauthorizedError) {
          throw error;
        }
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
    if (error instanceof UnauthorizedError) {
      setConnectionStatus(false, "session expired");
      await pausePollingUntilAuthenticated();
      return;
    }
    console.error("[Slack Bridge] Poll error:", error);
  }
}

async function executeAction(action: PendingSlackAction): Promise<void> {
  switch (action.action_type) {
    case "MarkAsRead": {
      const isThread = action.slack_thread_ts !== action.slack_last_message_ts;
      // The user may have read further directly in Slack since the action
      // was queued: never move the read marker backwards
      const currentLastRead = isThread
        ? await getThreadLastRead(
            action.slack_team_id,
            action.slack_channel_id,
            action.slack_thread_ts
          )
        : await getChannelLastRead(
            action.slack_team_id,
            action.slack_channel_id
          );
      if (!shouldMarkAsRead(action.slack_last_message_ts, currentLastRead)) {
        console.log(
          `[Slack Bridge] Skip mark: Slack last_read ${currentLastRead} >= action ts ${action.slack_last_message_ts}`
        );
        break;
      }
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
      const currentLastRead = await getThreadLastRead(
        action.slack_team_id,
        action.slack_channel_id,
        action.slack_thread_ts
      );
      const result = await unsubscribeFromThread(
        action.slack_team_id,
        action.slack_channel_id,
        action.slack_thread_ts,
        latestSlackTs(action.slack_last_message_ts, currentLastRead)
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
