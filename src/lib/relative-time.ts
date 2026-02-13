export function formatRelativeTime(value?: string | number | null): string {
  if (!value) return "—";
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(timestamp)) return "—";
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 0) return "just now";
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 1) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
