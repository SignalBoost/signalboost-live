// saas/lib/hub/providers/digitalocean.ts
// Real DigitalOcean execution handler. Credentials: DIGITALOCEAN_TOKEN (required).

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

export async function executeDigitalOceanAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const token = process.env.DIGITALOCEAN_TOKEN
  if (!token) return { ok: false, error: 'DigitalOcean not configured — set DIGITALOCEAN_TOKEN' }
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  if (template.id === 'digitalocean.create_droplet') {
    const name = String(payload.name || '')
    const region = String(payload.region || '')
    const size = String(payload.size || '')
    const image = String(payload.image || 'ubuntu-22-04-x64')
    if (!name || !region || !size) return { ok: false, error: 'Name, region, and size are required' }
    const res = await fetch('https://api.digitalocean.com/v2/droplets', {
      method: 'POST', headers, body: JSON.stringify({ name, region, size, image }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `DigitalOcean error (HTTP ${res.status})` }
    return { ok: true, message: `Droplet "${name}" provisioning`, data: { id: data?.droplet?.id, status: data?.droplet?.status } }
  }

  if (template.id === 'digitalocean.view_droplets') {
    const res = await fetch('https://api.digitalocean.com/v2/droplets?per_page=50', { method: 'GET', headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `DigitalOcean error (HTTP ${res.status})` }
    const droplets = Array.isArray(data?.droplets) ? data.droplets : []
    return {
      ok: true,
      message: `${droplets.length} droplet${droplets.length === 1 ? '' : 's'}`,
      data: { count: droplets.length, droplets: droplets.slice(0, 25).map((d: any) => ({ id: d.id, name: d.name, status: d.status, region: d.region?.slug })) },
    }
  }

  return { ok: false, error: 'Unknown DigitalOcean action: ' + template.id }
}
