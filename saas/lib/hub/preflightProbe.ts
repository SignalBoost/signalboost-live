// saas/lib/hub/preflightProbe.ts
//
// Live preflight probes. Each registered provider is checked against its real
// credential/health endpoint using its ACTUAL env key (read from the executors,
// not invented). No secret is ever returned — only present/reachable verdicts.

type Probe = {
  envKeys: string[]                 // first present wins
  url: (key: string) => string
  headers: (key: string) => Record<string, string>
}

function env(...names: string[]): string | undefined {
  for (const n of names) { const v = process.env[n]; if (v && v.trim()) return v }
  return undefined
}

const PROBES: Record<string, Probe> = {
  stripe: { envKeys: ['STRIPE_SECRET_KEY'], url: () => 'https://api.stripe.com/v1/account', headers: k => ({ Authorization: `Bearer ${k}` }) },
  openai: { envKeys: ['OPENAI_API_KEY'], url: () => 'https://api.openai.com/v1/models', headers: k => ({ Authorization: `Bearer ${k}` }) },
  anthropic: { envKeys: ['ANTHROPIC_API_KEY'], url: () => 'https://api.anthropic.com/v1/models', headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }) },
  github: { envKeys: ['GITHUB_WRITE_TOKEN'], url: () => 'https://api.github.com/user', headers: k => ({ Authorization: `Bearer ${k}`, 'User-Agent': 'signalboost-operator', Accept: 'application/vnd.github+json' }) },
  elevenlabs: { envKeys: ['ELEVENLABS_API_KEY'], url: () => 'https://api.elevenlabs.io/v1/user', headers: k => ({ 'xi-api-key': k }) },
  gemini: { envKeys: ['GEMINI_API_KEY'], url: k => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`, headers: () => ({}) },
  resend: { envKeys: ['RESEND_API_KEY'], url: () => 'https://api.resend.com/domains', headers: k => ({ Authorization: `Bearer ${k}` }) },
  assemblyai: { envKeys: ['ASSEMBLYAI_API_KEY'], url: () => 'https://api.assemblyai.com/v2/transcript?limit=1', headers: k => ({ Authorization: k }) },
  vercel: { envKeys: ['VERCEL_TOKEN'], url: () => 'https://api.vercel.com/v2/user', headers: k => ({ Authorization: `Bearer ${k}` }) },
  supabase: {
    envKeys: ['SUPABASE_SERVICE_ROLE_KEY'],
    url: () => `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/rest/v1/`,
    headers: k => ({ apikey: k, Authorization: `Bearer ${k}` }),
  },
  supabase_mkt: {
    envKeys: ['SECONDARY_SUPABASE_SERVICE_ROLE_KEY', 'MARKETING_SUPABASE_SERVICE_ROLE_KEY'],
    url: () => `${process.env.SECONDARY_SUPABASE_URL || process.env.MARKETING_SUPABASE_URL || ''}/rest/v1/`,
    headers: k => ({ apikey: k, Authorization: `Bearer ${k}` }),
  },
}

export interface ProbeResult {
  provider: string
  credentialsValid: boolean   // required env key present
  providerHealth: boolean     // endpoint authenticated/reachable
  status: number | null
  detail?: string
}

export async function probeProvider(providerId: string): Promise<ProbeResult> {
  const probe = PROBES[providerId]
  if (!probe) {
    // Unknown provider — conservative: cannot confirm health.
    return { provider: providerId, credentialsValid: false, providerHealth: false, status: null, detail: 'no probe defined' }
  }
  const key = env(...probe.envKeys)
  if (!key) {
    return { provider: providerId, credentialsValid: false, providerHealth: false, status: null, detail: `missing env: ${probe.envKeys.join(' | ')}` }
  }
  try {
    const res = await fetch(probe.url(key), { method: 'GET', headers: probe.headers(key), cache: 'no-store' })
    return { provider: providerId, credentialsValid: true, providerHealth: res.ok, status: res.status, detail: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e: any) {
    return { provider: providerId, credentialsValid: true, providerHealth: false, status: null, detail: e?.message || 'request failed' }
  }
}

export async function probeAll(providerIds: string[]): Promise<Record<string, ProbeResult>> {
  const results = await Promise.all(providerIds.map(probeProvider))
  const out: Record<string, ProbeResult> = {}
  for (const r of results) out[r.provider] = r
  return out
}
