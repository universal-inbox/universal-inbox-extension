// Slack timestamps are "seconds.micros" strings (e.g. "1712345678.000200").
// Parsing them as one float loses precision, so compare each part as an integer.

const ZERO_TS = /^0*(\.0*)?$/;

function parseSlackTs(ts: string): [number, number] {
  const [seconds, micros = ""] = ts.trim().split(".");
  return [Number(seconds || "0"), Number(micros.padEnd(6, "0").slice(0, 6))];
}

// Returns a negative number when a < b, 0 when equal, a positive number when a > b
export function compareSlackTs(a: string, b: string): number {
  const [aSeconds, aMicros] = parseSlackTs(a);
  const [bSeconds, bMicros] = parseSlackTs(b);
  return aSeconds !== bSeconds ? aSeconds - bSeconds : aMicros - bMicros;
}

function isUnsetTs(ts: string | undefined): ts is undefined {
  return ts === undefined || ZERO_TS.test(ts.trim());
}

// Marking as read is monotonic: only mark when the action's ts is newer than
// Slack's current read marker, never move the marker backwards
export function shouldMarkAsRead(
  actionTs: string,
  currentLastRead: string | undefined
): boolean {
  return (
    isUnsetTs(currentLastRead) || compareSlackTs(actionTs, currentLastRead) > 0
  );
}

// Most recent of the two timestamps, ignoring an unset current read marker
export function latestSlackTs(
  actionTs: string,
  currentLastRead: string | undefined
): string {
  return shouldMarkAsRead(actionTs, currentLastRead)
    ? actionTs
    : (currentLastRead as string);
}
