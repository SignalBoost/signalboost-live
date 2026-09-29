// saas/lib/ai/cos/cosUniversityMassRetentionDelay.ts
//
// How long a mass-distilled student must exist before its independent exam may run.
//
// Owner direction 2026-09-28 (test phase): "make it 10 minutes - we are in test phase trying to make sure the
// pipelines work end to end". It was 12 hours. A trained artifact is an immutable, hash-pinned adapter: its
// answers do not change while it waits, so the wait adds time, not evidence. The retention CHECK itself is
// unchanged - same questions, same references, same non-regression rule, same judge.
//
// This is the ONE TypeScript value for the wait (evaluation approval, the evaluator's own guard and canary
// ordering all import it). The atomic claim in SQL enforces the same wait
// (claim_next_mass_distilled_evaluation: `a.created_at <= v_now - interval '10 minutes'`); change both together.
export const MASS_RETENTION_DELAY_MS = 10 * 60 * 1000
export const MASS_RETENTION_DELAY_SQL_INTERVAL = '10 minutes' as const
