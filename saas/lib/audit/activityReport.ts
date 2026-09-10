// saas/lib/audit/activityReport.ts
//
// Audit Log & Activity Timeline generator. PURE — takes raw activity/evidence rows,
// returns a shaped timeline + status summary. No I/O, no LLM, no React. The
// route does the query; this only normalizes and aggregates so it's testable.

export type ActivityStatus =
  | 'success' | 'failure' | 'blocked' | 'denied' | 'error' | 'config_error'
  | 'queued' | 'running' | 'testing' | 'verifying'

export interface ActivityRawRow {
  id?: number | string
  created_at?: string
  actor?: string | null
  action?: string | null
  status?: string | null
  target?: string | null
  message?: string | null
}

export interface ActivityEvent {
  id: string
  createdAt: string
  actor: string
  action: string
  status: ActivityStatus
  target: string
  message: string
}

export interface ActivityReportData {
  generatedAt: string
  events: ActivityEvent[] // newest-first
  summary: {
    total: number
    success: number
    failure: number
    blocked: number
    denied: number
    error: number
    configError: number
    active: number
    actors: number // distinct actors
    since: string // oldest event in the window
    until: string // newest event in the window
  }
}

const KNOWN: ActivityStatus[] = ['success', 'failure', 'blocked', 'denied', 'error', 'config_error', 'queued', 'running', 'testing', 'verifying']

function normStatus(s?: string | null): ActivityStatus {
  const v = String(s || '').toLowerCase()
  if ((KNOWN as string[]).includes(v)) return v as ActivityStatus
  if (v === 'fail' || v === 'failed') return 'failure'
  if (v === 'succeeded' || v === 'fixed' || v === 'complete' || v === 'completed' || v === 'merged') return 'success'
  if (v === 'paused' || v === 'checks_pending' || v === 'auto_merge_queued') return 'testing'
  return 'error'
}

export function buildActivityReport(rows: ActivityRawRow[]): ActivityReportData {
  const list = Array.isArray(rows) ? rows : []

  const events: ActivityEvent[] = list.map((r, i) => ({
    id: String(r.id ?? i),
    createdAt: r.created_at || '',
    actor: r.actor || 'unknown',
    action: r.action || '',
    status: normStatus(r.status),
    target: r.target || '',
    message: r.message || '',
  }))

  // Newest-first for display.
  events.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))

  const count = (st: ActivityStatus) => events.filter(e => e.status === st).length
  const actors = new Set(events.map(e => e.actor).filter(Boolean)).size
  const times = events.map(e => e.createdAt).filter(Boolean).sort()

  return {
    generatedAt: new Date().toISOString(),
    events,
    summary: {
      total: events.length,
      success: count('success'),
      failure: count('failure'),
      blocked: count('blocked'),
      denied: count('denied'),
      error: count('error'),
      configError: count('config_error'),
      active: count('queued') + count('running') + count('testing') + count('verifying'),
      actors,
      since: times[0] || '',
      until: times[times.length - 1] || '',
    },
  }
}
