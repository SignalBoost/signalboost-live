// saas/lib/ai/cos/cosUniversityWarmWindowPicker.ts
//
// Pure helpers between the two clock pickers on the University settings page and the stored `HH:MM-HH:MM` (UTC)
// warm window. Owner, 2026-10-04: pick the times from a clock "to avoid human error", and show them in local time.
// Browser-safe: no environment, no store, no React.
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** `HH:MM-HH:MM` -> its two halves; anything else -> empty pickers. */
export function splitWarmWindow(stored: string | null | undefined): Readonly<{ start: string; end: string }> {
  const [start = '', end = ''] = String(stored ?? '').split('-')
  return TIME.test(start) && TIME.test(end) ? Object.freeze({ start, end }) : Object.freeze({ start: '', end: '' })
}

/** Two picker values -> the stored form, or null until both are picked. */
export function joinWarmWindow(start: string, end: string): string | null {
  return TIME.test(start) && TIME.test(end) ? `${start}-${end}` : null
}

/** A UTC `HH:MM` as the viewer's local wall-clock time today, in the viewer's locale (or the given one). */
export function utcToLocalClock(utc: string, now: Date = new Date(), locale?: string, timeZone?: string): string {
  const match = TIME.exec(utc)
  if (!match) return '—'
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(match[1]), Number(match[2])))
  return at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
}

/** `HH:MM-HH:MM` UTC -> "local–local", or null when there is no usable window. */
export function localWarmWindowRange(window: string | null | undefined, now: Date = new Date(), locale?: string, timeZone?: string): string | null {
  const halves = splitWarmWindow(window)
  return halves.start ? `${utcToLocalClock(halves.start, now, locale, timeZone)}–${utcToLocalClock(halves.end, now, locale, timeZone)}` : null
}
// end of saas/lib/ai/cos/cosUniversityWarmWindowPicker.ts (if this line is missing, the paste was cut short)
