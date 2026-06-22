// saas/lib/audit/findingState.ts
//
// Pure helpers for per-finding triage state. No I/O, no React. The route reads/
// writes audit_finding_state; this only normalizes and indexes rows so the UI
// can overlay status + owner onto the deterministically-derived findings.

export type FindingStatusValue = 'open' | 'in_progress' | 'resolved' | 'accepted' | 'wont_fix'

export const FINDING_STATUSES: FindingStatusValue[] = ['open', 'in_progress', 'resolved', 'accepted', 'wont_fix']

// Statuses that take a finding out of the active fix queue.
const HANDLED: FindingStatusValue[] = ['resolved', 'accepted', 'wont_fix']

export function normalizeStatus(s?: string): FindingStatusValue {
  const v = String(s || '').toLowerCase()
  return (FINDING_STATUSES.indexOf(v as FindingStatusValue) !== -1 ? v : 'open') as FindingStatusValue
}

export function isHandled(status?: string): boolean {
  return HANDLED.indexOf(normalizeStatus(status)) !== -1
}

export interface FindingStateRow {
  finding_id: string
  status: string
  owner: string | null
  note: string | null
  updated_at?: string
  updated_by?: string | null
}

export interface FindingState {
  status: FindingStatusValue
  owner: string
  note: string
}

export type FindingStateMap = Record<string, FindingState>

export function indexStates(rows: FindingStateRow[]): FindingStateMap {
  const map: FindingStateMap = {}
  for (const r of rows || []) {
    if (!r || !r.finding_id) continue
    map[r.finding_id] = { status: normalizeStatus(r.status), owner: r.owner || '', note: r.note || '' }
  }
  return map
}
