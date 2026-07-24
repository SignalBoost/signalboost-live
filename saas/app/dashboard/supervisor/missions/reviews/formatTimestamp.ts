/**
 * Formats API timestamps for the read-only Mission Review UI without allowing
 * malformed values or browser formatting failures to escape into rendering.
 */
export function formatTimestamp(value: string | undefined, fallback: string): string {
  try {
    if (!value) return fallback
    const timestamp = new Date(value)
    if (!Number.isFinite(timestamp.getTime())) return fallback
    return timestamp.toLocaleString()
  } catch {
    return fallback
  }
}
