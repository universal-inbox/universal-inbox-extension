export interface PendingSlackAction {
  id: string;
  action_type: "MarkAsRead" | "Unsubscribe";
  slack_team_id: string;
  slack_channel_id: string;
  slack_thread_ts: string;
  slack_last_message_ts: string;
}

export interface ExtensionCredential {
  team_id: string;
  user_id: string;
}

export async function fetchPendingActions(
  apiUrl: string,
  credentials: ExtensionCredential[]
): Promise<PendingSlackAction[]> {
  const url = `${apiUrl}/api/slack-bridge/pending-actions`;
  console.log(
    "[Slack Bridge] Fetching pending actions, credentials:",
    credentials.length
  );

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ credentials }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch pending actions: ${response.status} ${errorText}`
    );
  }

  const actions: PendingSlackAction[] = await response.json();
  console.log("[Slack Bridge] Received", actions.length, "pending action(s)");
  return actions;
}

export async function reportActionComplete(
  apiUrl: string,
  actionId: string
): Promise<void> {
  const url = `${apiUrl}/api/slack-bridge/actions/${actionId}/complete`;
  console.log("[Slack Bridge] Reporting action complete:", actionId);

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to report action complete: ${response.status} ${errorText}`
    );
  }
}

export async function reportActionFailed(
  apiUrl: string,
  actionId: string,
  error: string
): Promise<void> {
  const url = `${apiUrl}/api/slack-bridge/actions/${actionId}/fail`;
  console.log("[Slack Bridge] Reporting action failed:", actionId, error);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ error }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to report action failure: ${response.status} ${errorText}`
    );
  }
}
