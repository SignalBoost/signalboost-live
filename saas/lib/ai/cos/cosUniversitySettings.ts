// saas/lib/ai/cos/cosUniversitySettings.ts
//
// Buyer-controlled University settings, read and written through one small module so every University surface
// agrees on the keys, the validation and the record of who changed what.
//
// Owner, 2026-10-04: "any other settings/configuration regarding the portable should be with the University
// telemetry" - a buyer configures the portable from the University's own operations page, in their own hours, with
// no redeploy and no environment variable. The settings here are:
//
//   cos_university_workforce_warm_window   `HH:MM-HH:MM` UTC. Inside it the reserved graduates keep one worker warm.
//   cos_university_line_paused             true/false. Owner: "including a on/off button if users wants to
//                                          stop/pause production". While true, every production station answers
//                                          `paused` and does no work. The workforce (graduates already serving) is
//                                          NOT paused: a sold worker keeps working; pausing stops the factory, not
//                                          the products.
//
// The store is the deployment's `system_settings` table (key -> jsonb value, updated_by, updated_at), which the
// University's role policy and practice runner already treat as the buyer-controlled store. Nothing here grades,
// promotes or spends.
import {
  inWarmWindow,
  nextWarmWindowChange,
  parseWarmWindow,
  resolveWarmWindow,
  type WarmWindowSource,
} from './cosUniversityWorkforceReservation.ts'

export const WORKFORCE_WARM_WINDOW_SETTING_KEY = 'cos_university_workforce_warm_window' as const
export const LINE_PAUSED_SETTING_KEY = 'cos_university_line_paused' as const

type SettingsDb = {
  from: (table: string) => any
}

type StoredSetting = Readonly<{ value: unknown; updatedAt: string | null; updatedBy: string | null }>

const clean = (value: unknown, max = 120): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

async function readSetting(db: SettingsDb, key: string): Promise<StoredSetting | null> {
  const result = await db.from('system_settings')
    .select('value,updated_at,updated_by')
    .eq('key', key)
    .maybeSingle()
  if (result?.error) throw result.error
  const row = result?.data
  if (!row) return null
  return Object.freeze({
    value: row.value,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  })
}

async function writeSetting(input: { db: SettingsDb; key: string; value: unknown; updatedBy: string | null; now?: Date }): Promise<void> {
  const result = await input.db.from('system_settings').upsert({
    key: input.key,
    value: input.value,
    updated_by: input.updatedBy,
    updated_at: (input.now ?? new Date()).toISOString(),
  }, { onConflict: 'key' })
  if (result?.error) throw result.error
}

// ---------------------------------------------------------------------------------------------------------------
// Warm window
// ---------------------------------------------------------------------------------------------------------------

export type WorkforceWarmWindowSetting = Readonly<{
  /** The stored declaration (`HH:MM-HH:MM` UTC) or null when none is stored / it was cleared. */
  value: string | null
  updatedAt: string | null
  updatedBy: string | null
}>

/** Read the stored warm window. A missing row is null; an unreadable store is an error the caller decides about. */
export async function readWorkforceWarmWindowSetting(db: SettingsDb): Promise<WorkforceWarmWindowSetting> {
  const row = await readSetting(db, WORKFORCE_WARM_WINDOW_SETTING_KEY)
  if (!row) return Object.freeze({ value: null, updatedAt: null, updatedBy: null })
  const raw = typeof row.value === 'string' ? row.value : (row.value && typeof row.value === 'object' ? (row.value as any).window : null)
  const value = clean(raw, 20)
  return Object.freeze({ value: value ? value : null, updatedAt: row.updatedAt, updatedBy: row.updatedBy })
}

export type WorkforceWarmWindowWrite =
  | Readonly<{ ok: true; value: string | null }>
  | Readonly<{ ok: false; error: 'workforce_warm_window_invalid' }>

/**
 * Store a new warm window. An empty value clears it (the window is then off, or the env fallback applies). Anything
 * that does not parse is refused before it reaches the store, so the station can never read an unusable window.
 */
export async function writeWorkforceWarmWindowSetting(input: {
  db: SettingsDb
  value: unknown
  updatedBy: string | null
  now?: Date
}): Promise<WorkforceWarmWindowWrite> {
  const raw = clean(input.value, 20)
  const parsed = raw ? parseWarmWindow(raw) : null
  if (raw && !parsed) return Object.freeze({ ok: false, error: 'workforce_warm_window_invalid' as const })
  const value = parsed ? parsed.declared : null
  // PostgREST maps a top-level null to SQL NULL; system_settings.value is NOT NULL.
  // Its supported object form preserves an explicit clear without violating that column.
  await writeSetting({ db: input.db, key: WORKFORCE_WARM_WINDOW_SETTING_KEY, value: value ?? { window: null }, updatedBy: input.updatedBy, now: input.now })
  return Object.freeze({ ok: true, value })
}

// ---------------------------------------------------------------------------------------------------------------
// Line pause
// ---------------------------------------------------------------------------------------------------------------

export type LinePauseSetting = Readonly<{
  paused: boolean
  /** False when the store could not be read. The stations then run: a store outage must not stop production. */
  known: boolean
  updatedAt: string | null
  updatedBy: string | null
}>

const NOT_PAUSED: LinePauseSetting = Object.freeze({ paused: false, known: true, updatedAt: null, updatedBy: null })

/** True only for the stored boolean true or the strings "true"/"1"; anything else is not paused. */
export function pausedValue(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true' || value.trim() === '1'
  if (value && typeof value === 'object') return pausedValue((value as any).paused)
  return false
}

/** Read the pause switch. Never throws: an unreadable store reports `known: false` and `paused: false`. */
export async function readLinePauseSetting(db: SettingsDb | null | undefined): Promise<LinePauseSetting> {
  if (!db) return Object.freeze({ paused: false, known: false, updatedAt: null, updatedBy: null })
  try {
    const row = await readSetting(db, LINE_PAUSED_SETTING_KEY)
    if (!row) return NOT_PAUSED
    return Object.freeze({ paused: pausedValue(row.value), known: true, updatedAt: row.updatedAt, updatedBy: row.updatedBy })
  } catch {
    return Object.freeze({ paused: false, known: false, updatedAt: null, updatedBy: null })
  }
}

/** The body every paused station answers with, so a log, a prover and the dashboard all read the same shape. */
export function pausedStationResponse(station: string): Readonly<{ ok: true; paused: true; station: string; skipped: 'line_paused_by_operator' }> {
  return Object.freeze({ ok: true as const, paused: true as const, station, skipped: 'line_paused_by_operator' as const })
}

// ---------------------------------------------------------------------------------------------------------------
// The view the operations page shows
// ---------------------------------------------------------------------------------------------------------------

export type UniversitySettingsView = Readonly<{
  warmWindow: Readonly<{
    /** What the buyer stored (may be null). */
    stored: string | null
    /** What the workforce station will actually apply after precedence (setting > env > none). */
    effective: string | null
    source: WarmWindowSource
    inWindow: boolean | null
    opensAt: string | null
    closesAt: string | null
    updatedAt: string | null
    updatedBy: string | null
  }>
  linePaused: Readonly<{
    paused: boolean
    known: boolean
    updatedAt: string | null
    updatedBy: string | null
  }>
}>

/** Pure: compose what the page shows from the two stored settings, the environment and the clock. */
export function universitySettingsView(input: {
  warmWindow: WorkforceWarmWindowSetting
  linePause: LinePauseSetting
  env: Record<string, string | undefined>
  now: Date
}): UniversitySettingsView {
  const resolved = resolveWarmWindow({ setting: input.warmWindow.value, env: input.env })
  const change = resolved.window ? nextWarmWindowChange(resolved.window, input.now) : { opensAt: null, closesAt: null }
  return Object.freeze({
    warmWindow: Object.freeze({
      stored: input.warmWindow.value,
      effective: resolved.window ? resolved.window.declared : null,
      source: resolved.source,
      inWindow: resolved.window ? inWarmWindow(resolved.window, input.now) : null,
      opensAt: change.opensAt,
      closesAt: change.closesAt,
      updatedAt: input.warmWindow.updatedAt,
      updatedBy: input.warmWindow.updatedBy,
    }),
    linePaused: Object.freeze({
      paused: input.linePause.paused,
      known: input.linePause.known,
      updatedAt: input.linePause.updatedAt,
      updatedBy: input.linePause.updatedBy,
    }),
  })
}

export async function writeLinePauseSetting(input: {
  db: SettingsDb
  paused: boolean
  updatedBy: string | null
  now?: Date
}): Promise<Readonly<{ ok: true; paused: boolean }>> {
  const paused = input.paused === true
  await writeSetting({ db: input.db, key: LINE_PAUSED_SETTING_KEY, value: paused, updatedBy: input.updatedBy, now: input.now })
  return Object.freeze({ ok: true, paused })
}
// end of saas/lib/ai/cos/cosUniversitySettings.ts (if this line is missing, the paste was cut short)
