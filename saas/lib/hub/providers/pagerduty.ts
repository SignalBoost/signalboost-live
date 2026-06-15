// saas/lib/hub/providers/pagerduty.ts
// Real PagerDuty execution handler. Credentials: PAGERDUTY_API_KEY (required).
// Extra: PAGERDUTY_FROM_EMAIL (a valid PD user email) required to trigger incidents.

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

export async function executePagerDutyAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const token = process.env.PAGERDUTY_API_KEY
  if (!token) return { ok: false, error: 'PagerDuty not configured — set PAGERDUTY_API_KEY' }
  const headers: Record<string, string> = {
    Authorization: 'Token token=' + token,
    Accept: 'application/vnd.pagerduty+json;version=2',
    'Content-Type': 'application/json',
  }

  if (template.id === 'pagerduty.list_incidents') {
    const res = await fetch('https://api.pagerduty.com/incidents?statuses[]=triggered&statuses[]=acknowledged&limit=25', { method: 'GET', headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message || `PagerDuty error (HTTP ${res.status})` }
    const incidents = Array.isArray(data?.incidents) ? data.incidents : []
    return {
      ok: true,
      message: `${incidents.length} active incident${incidents.length === 1 ? '' : 's'}`,
      data: { count: incidents.length, incidents: incidents.slice(0, 25).map((i: any) => ({ id: i.id, title: i.title, status: i.status, urgency: i.urgency })) },
    }
  }

  if (template.id === 'pagerduty.trigger_incident') {
    const fromEmail = process.env.PAGERDUTY_FROM_EMAIL
    if (!fromEmail) return { ok: false, error: 'Set PAGERDUTY_FROM_EMAIL (a valid PagerDuty user email) in Vercel' }
    const title = String(payload.title || '')
    const service = String(payload.service || '')
    const urgency = String(payload.urgency || 'high')
    if (!title || !service) return { ok: false, error: 'Title and service ID are required' }
    const res = await fetch('https://api.pagerduty.com/incidents', {
      method: 'POST',
      headers: { ...headers, From: fromEmail },
      body: JSON.stringify({ incident: { type: 'incident', title, service: { id: service, type: 'service_reference' }, urgency } }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message || `PagerDuty error (HTTP ${res.status})` }
    return { ok: true, message: `Incident triggered: ${title}`, data: { id: data?.incident?.id, status: data?.incident?.status } }
  }

  return { ok: false, error: 'Unknown PagerDuty action: ' + template.id }
}
