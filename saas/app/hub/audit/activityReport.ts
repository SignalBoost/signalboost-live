// saas/lib/audit/activityReport.ts
//
// Audit Log & Activity Timeline generator. PURE — takes raw hub_audit_log rows,
// returns a shaped timeline + status summary. No I/O, no LLM, no React. The
// route does the query; this only normalizes and aggregates so it's testable.

export type ActivityStatus =
  | 'success' | 'failure' | 'blocked' | 'denied' | 'error' | 'config_error'

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
    actors: number // distinct actors
    since: string // oldest event in the window
    until: string // newest event in the window
  }
}

const KNOWN: ActivityStatus[] = ['success', 'failure', 'blocked', 'denied', 'error', 'config_error']

function normStatus(s?: string | null): ActivityStatus {
  const v = String(s || '').toLowerCase()
  if ((KNOWN as string[]).includes(v)) return v as ActivityStatus
  if (v === 'fail') return 'failure'
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
      actors,
      since: times[0] || '',
      until: times[times.length - 1] || '',
    },
  }
}
