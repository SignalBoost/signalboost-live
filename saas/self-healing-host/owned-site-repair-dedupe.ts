// saas/self-healing-host/owned-site-repair-dedupe.ts
//
// Pure dedupe policy for owned-site Self-Healing repairs (Website Optimizer / Cybersecurity Preview).
//
// The remediation key is `<deployed revision>:<kind>:<finding codes>`. Before 2026-09-27 the "is a repair already
// active?" check matched that key EXACTLY, so every merge to main (new deployed revision) made the same findings look
// new and queued another repair job. On 2026-09-27 that left 35 queued website-optimizer repairs for the same findings
// (oldest 01:46, one added every few minutes) behind a scheduler that runs one Builder job per 5-minute tick; jobs ran
// 15+ hours late against superseded revisions and failed (builder_repository_revision_mismatch, round timeouts).
//
// The revision still belongs in the key (it records where the finding was observed), but it must not decide whether
// the SAME findings already have a repair in flight. This module compares the revision-free scope instead.

export const OWNED_SITE_REPAIR_RETRY_SUPPRESSION_MS = 6 * 60 * 60 * 1000
/** A `running` row not touched for this long is a dead claim, not an active repair (Builder slices are <= 5 min). */
export const OWNED_SITE_REPAIR_RUNNING_STALE_MS = 15 * 60 * 1000

export type OwnedSiteRepairRow = Readonly<{
  id: unknown
  status: unknown
  created_at?: unknown
  updated_at?: unknown
  metadata?: unknown
}>

export type OwnedSiteRepairBlocker = Readonly<{
  disposition: 'already_active' | 'recently_attempted'
  jobId: string
}>

/** `<revision>:<kind>:<codes>` → `<kind>:<codes>`. A key without a revision prefix is returned unchanged. */
export function ownedSiteRepairScope(key: string): string {
  const value = String(key || '').trim().toLowerCase()
  const first = value.indexOf(':')
  return first >= 0 ? value.slice(first + 1) : value
}

function keyOf(row: OwnedSiteRepairRow): string {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {}
  return typeof metadata.selfHealingKey === 'string' ? metadata.selfHealingKey : ''
}

function ms(value: unknown): number {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/**
 * Returns the existing repair that makes a new one redundant, or null when a new repair should be queued.
 * Active = queued, paused, or running with a recent heartbeat. Recently attempted = succeeded within 6h.
 * Newest match wins so the reported job is the one the owner will see progressing.
 */
export function ownedSiteRepairBlocker(input: {
  rows: readonly OwnedSiteRepairRow[]
  key: string
  nowMs: number
}): OwnedSiteRepairBlocker | null {
  const scope = ownedSiteRepairScope(input.key)
  if (!scope) return null
  const sameScope = input.rows
    .filter(row => row && typeof row.id === 'string' && row.id && ownedSiteRepairScope(keyOf(row)) === scope)
    .sort((a, b) => (ms(b.created_at) || 0) - (ms(a.created_at) || 0))

  const active = sameScope.find(row => {
    if (row.status === 'queued' || row.status === 'paused') return true
    if (row.status !== 'running') return false
    const touched = ms(row.updated_at)
    return Number.isFinite(touched) && input.nowMs - touched < OWNED_SITE_REPAIR_RUNNING_STALE_MS
  })
  if (active) return Object.freeze({ disposition: 'already_active', jobId: String(active.id) })

  const recent = sameScope.find(row => {
    if (row.status !== 'succeeded') return false
    const created = ms(row.created_at)
    return Number.isFinite(created) && input.nowMs - created < OWNED_SITE_REPAIR_RETRY_SUPPRESSION_MS
  })
  return recent ? Object.freeze({ disposition: 'recently_attempted', jobId: String(recent.id) }) : null
}
