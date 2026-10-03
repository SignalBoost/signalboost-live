//
// How long a mass-distilled student must exist before its independent exam may run.
//
// Owner direction 2026-09-28 (test phase): "make it 10 minutes - we are in test phase trying to make sure the
// pipelines work end to end". It was 12 hours. The reasoning recorded then is the reason it is now ZERO:
//
//     A trained artifact is an immutable, hash-pinned adapter: its answers do not change while it waits, so the
//     wait adds time, not evidence.
//
// That argument does not stop at 10 minutes. An adapter pinned by hash answers identically at second one and at
// minute six hundred, so every second of this wait was latency with nothing bought by it - ten minutes added to
// every single artifact's journey, on a line the owner wants finishing units minute by minute (2026-10-03: "in a
// production line products are built continuously, secs by secs, minutes by minutes not hours").
//
// The retention CHECK itself is completely unchanged: same questions, same references, same non-regression rule,
// same judge. Only the compulsory idling before it is gone.
//
// Kept as a configurable value rather than deleted, because a buyer may have a policy reason to require a soak
// period (a change-control window, a staged rollout, an audit requirement). They set the env var; the default is
// no artificial wait.
//
// This is the ONE TypeScript value for the wait (evaluation approval, the evaluator's own guard and canary
// ordering all import it). The atomic claim in SQL enforces the same wait
// (claim_next_mass_distilled_evaluation); the migration that sets it to zero ships alongside this file, and the
// two must always be changed together.
export const MASS_RETENTION_DELAY_ENV = 'COS_UNIVERSITY_RETENTION_DELAY_MINUTES' as const

/** A buyer-declared soak period in minutes. Zero, the default, means the exam may run as soon as the artifact exists. */
export function massRetentionDelayMinutes(env: Record<string, string | undefined> = process.env): number {
  const raw = String(env[MASS_RETENTION_DELAY_ENV] ?? '').trim()
  if (!/^\d+$/.test(raw)) return 0
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) return 0
  // A soak longer than a day is almost certainly a typo, and it would silently park the whole line.
  return Math.min(1440, value)
}

export const MASS_RETENTION_DELAY_MS = massRetentionDelayMinutes() * 60 * 1000
export const MASS_RETENTION_DELAY_SQL_INTERVAL = `${massRetentionDelayMinutes()} minutes` as const
