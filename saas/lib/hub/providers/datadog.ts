// saas/lib/hub/providers/datadog.ts
// Real Datadog execution handler.
// Credentials: DATADOG_API_KEY (required) + DATADOG_APP_KEY (required for writes/queries).
// Site override: DATADOG_API_URL (default https://api.datadoghq.com).

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

function base(): string {
  return (process.env.DATADOG_API_URL || 'https://api.datadoghq.com').replace(/\/$/, '')
}

export async function executeDatadogAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const apiKey = process.env.DATADOG_API_KEY
  const appKey = process.env.DATADOG_APP_KEY
  if (!apiKey) return { ok: false, error: 'Datadog not configured — set DATADOG_API_KEY' }
  if (!appKey) return { ok: false, error: 'Set DATADOG_APP_KEY (application key) in Vercel for monitor/metric APIs' }
  const headers = { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, 'Content-Type': 'application/json' }

  if (template.id === 'datadog.create_monitor') {
    const name = String(payload.name || '')
    const query = String(payload.query || '')
    const message = String(payload.message || '')
    if (!name || !query) return { ok: false, error: 'Monitor name and query are required' }
    const res = await fetch(`${base()}/api/v1/monitor`, {
      method: 'POST', headers, body: JSON.stringify({ name, type: 'metric alert', query, message }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.errors?.[0] || `Datadog error (HTTP ${res.status})` }
    return { ok: true, message: `Monitor created: ${name}`, data: { id: data?.id } }
  }

  if (template.id === 'datadog.check_metrics') {
    const query = String(payload.query || '')
    if (!query) return { ok: false, error: 'Metric query is required' }
    const to = Math.floor(Date.now() / 1000)
    const from = to - 300
    const res = await fetch(`${base()}/api/v1/query?from=${from}&to=${to}&query=${encodeURIComponent(query)}`, { method: 'GET', headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || `Datadog error (HTTP ${res.status})` }
    const series = Array.isArray(data?.series) ? data.series : []
    return { ok: true, message: `${series.length} series returned`, data: { series: series.slice(0, 5).map((s: any) => ({ metric: s.metric, points: (s.pointlist || []).length })) } }
  }

  return { ok: false, error: 'Unknown Datadog action: ' + template.id }
}
