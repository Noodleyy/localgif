const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** 83.456 -> "01:23:45" (minutes:seconds:hundredths) */
export function formatTimecode(seconds: number) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const total = Math.floor(Math.max(0, seconds) * 100 + 1e-6); // epsilon: 0.29 mustn't show as 0.28
  const minutes = Math.floor(total / 6000);
  const secs = Math.floor(total / 100) % 60;
  return `${pad(minutes)}:${pad(secs)}:${pad(total % 100)}`;
}

/** 900 -> "1 KB", 2.34 MB -> "2.3 MB", 412 MB -> "412 MB", 1.7 GB -> "1.7 GB" */
export function formatBytes(bytes: number) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}

/** 4.56 -> "4.5s", 42.9 -> "42s", 125 -> "2m 5s" */
export function formatSeconds(s: number) {
  if (s >= 60) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  return s >= 10 ? `${Math.floor(s)}s` : `${Math.floor(s * 10) / 10}s`;
}
