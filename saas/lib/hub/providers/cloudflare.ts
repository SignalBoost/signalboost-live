// saas/lib/hub/providers/cloudflare.ts
// Real Cloudflare execution handler.
// Credentials: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID (required).

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

export async function executeCloudflareAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const zone = process.env.CLOUDFLARE_ZONE_ID
  if (!token || !zone) return { ok: false, error: 'Cloudflare not configured — set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID' }
  const base = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone)}`
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  if (template.id === 'cloudflare.add_dns_record') {
    const type = String(payload.type || '')
    const name = String(payload.name || '')
    const content = String(payload.content || '')
    if (!type || !name || !content) return { ok: false, error: 'Type, name, and content are required' }
    const ttl = Number(payload.ttl) || 3600
    const proxied = Boolean(payload.proxied)
    const res = await fetch(`${base}/dns_records`, { method: 'POST', headers, body: JSON.stringify({ type, name, content, ttl, proxied }) })
    const data = await res.json().catch(() => ({}))
    if (!data?.success) return { ok: false, error: data?.errors?.[0]?.message || `Cloudflare error (HTTP ${res.status})` }
    return { ok: true, message: `DNS record created: ${type} ${name}`, data: { id: data.result?.id, name: data.result?.name } }
  }

  if (template.id === 'cloudflare.toggle_proxy') {
    const recordId = String(payload.recordId || '')
    if (!recordId) return { ok: false, error: 'Record ID is required' }
    const proxied = Boolean(payload.proxied)
    const res = await fetch(`${base}/dns_records/${encodeURIComponent(recordId)}`, { method: 'PATCH', headers, body: JSON.stringify({ proxied }) })
    const data = await res.json().catch(() => ({}))
    if (!data?.success) return { ok: false, error: data?.errors?.[0]?.message || `Cloudflare error (HTTP ${res.status})` }
    return { ok: true, message: `Proxy ${proxied ? 'enabled' : 'disabled'} for ${data.result?.name}`, data: { id: data.result?.id, proxied: data.result?.proxied } }
  }

  if (template.id === 'cloudflare.purge_cache') {
    const res = await fetch(`${base}/purge_cache`, { method: 'POST', headers, body: JSON.stringify({ purge_everything: true }) })
    const data = await res.json().catch(() => ({}))
    if (!data?.success) return { ok: false, error: data?.errors?.[0]?.message || `Cloudflare error (HTTP ${res.status})` }
    return { ok: true, message: 'Edge cache purged for the zone', data: { id: data.result?.id } }
  }

  return { ok: false, error: 'Unknown Cloudflare action: ' + template.id }
}
