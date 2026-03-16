/**
 * Return the current time as an ISO 8601 string.
 * All timestamps in the database use this format.
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Return today's date as YYYY-MM-DD in the user's local timezone.
 * Used for daily limits and stats grouping.
 */
export function today(): string {
  return new Date().toLocaleDateString("en-CA"); // en-CA gives YYYY-MM-DD
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * e.g. 65000 → "1m 5s"
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Format an interval in days to a human-readable string.
 * e.g. 0.0007 → "1m", 0.007 → "10m", 1 → "1d", 30 → "1mo"
 */
export function formatInterval(days: number): string {
  if (days < 1 / 24 / 60) return "< 1m";
  if (days < 1 / 24) {
    const minutes = Math.round(days * 24 * 60);
    return `${minutes}m`;
  }
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  if (days < 30) {
    return `${Math.round(days)}d`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months}mo`;
  }
  const years = (days / 365).toFixed(1);
  return `${years}y`;
}
