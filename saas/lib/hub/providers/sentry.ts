// saas/lib/hub/providers/sentry.ts
// Real Sentry execution handler. Credentials: SENTRY_AUTH_TOKEN (required).
// Extra: SENTRY_ORG (org slug) for listing project issues.

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

export async function executeSentryAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const token = process.env.SENTRY_AUTH_TOKEN
  if (!token) return { ok: false, error: 'Sentry not configured — set SENTRY_AUTH_TOKEN' }
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  if (template.id === 'sentry.list_issues') {
    const org = process.env.SENTRY_ORG
    if (!org) return { ok: false, error: 'Set SENTRY_ORG (your Sentry org slug) in Vercel' }
    const project = String(payload.project || '')
    if (!project) return { ok: false, error: 'Project slug is required' }
    const res = await fetch(`https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is:unresolved&limit=25`, { method: 'GET', headers })
    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: `Sentry error (HTTP ${res.status}): ${err.slice(0, 300)}` }
    }
    const list = await res.json().catch(() => [])
    const arr = Array.isArray(list) ? list : []
    return {
      ok: true,
      message: `${arr.length} unresolved issue${arr.length === 1 ? '' : 's'}`,
      data: { count: arr.length, issues: arr.slice(0, 25).map((i: any) => ({ id: i.id, title: i.title, level: i.level, count: i.count })) },
    }
  }

  if (template.id === 'sentry.resolve_issue') {
    const issueId = String(payload.issueId || '')
    if (!issueId) return { ok: false, error: 'Issue ID is required' }
    const res = await fetch(`https://sentry.io/api/0/issues/${encodeURIComponent(issueId)}/`, {
      method: 'PUT', headers, body: JSON.stringify({ status: 'resolved' }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: `Sentry error (HTTP ${res.status}): ${err.slice(0, 300)}` }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, message: `Issue ${issueId} resolved`, data: { id: issueId, status: data?.status || 'resolved' } }
  }

  return { ok: false, error: 'Unknown Sentry action: ' + template.id }
}
