// saas/app/api/lab/teacher-models/route.ts
// Live model-list discovery using a customer's own credential.
// This performs read-only catalog GET requests; no inference, training, or spend.
// Never expose, cache, or log customer secrets or raw provider payloads.
// Each model says whether it has an active verified teacher price: only priced models can run (lab.teacher_rate_cards).
// OpenRouter's model list carries its own documented prices, so for OpenRouter the payload just read is also handed to
// the service-role-only price sync (at most once an hour across all instances, via a shared lease). Prices therefore
// load the first time anyone looks, without depending on the scheduled job.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { customerSession, UUID_RE } from '@/lib/lab/customerSession'
import { openCustomerCredential } from '@/lib/ai/cos/labCustomerCredentialVault'
import { LAB_PROVIDER_CATALOG, customModelsUrl } from '@/lib/ai/cos/labCustomerProviderCatalog'
import { assertPublicHttpUrl } from '@/lib/security/publicFetchGuard'
import { getAdminSupabase } from '@/utils/supabase/server'
import { syncOpenRouterTeacherPrices } from '@/lib/lab/openRouterTeacherPrices'
import { createSupabaseLearningSourceProviderLeasePort } from '@/lib/cos-core/layers/learning/providerLease'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'cache-control': 'no-store' }

// Fixed, HTTPS-only endpoints. Never follow a redirect. The custom endpoint is derived below and guarded.
const API_MODELS: Readonly<Record<string, { url: string; auth: 'bearer' | 'anthropic' | 'gemini' }>> = {
  // The inference router lists the models Hugging Face can actually serve, not every Hub repository.
  huggingface: { url: 'https://router.huggingface.co/v1/models', auth: 'bearer' },
  openai: { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  anthropic: { url: 'https://api.anthropic.com/v1/models?limit=100', auth: 'anthropic' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', auth: 'gemini' },
  xai: { url: 'https://api.x.ai/v1/models', auth: 'bearer' },
  deepseek: { url: 'https://api.deepseek.com/models', auth: 'bearer' },
  qwen: { url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', auth: 'bearer' },
  mistral: { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  groq: { url: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  openrouter: { url: 'https://openrouter.ai/api/v1/models', auth: 'bearer' },
  together: { url: 'https://api.together.xyz/v1/models', auth: 'bearer' },
  fireworks: { url: 'https://api.fireworks.ai/inference/v1/models', auth: 'bearer' },
  deepinfra: { url: 'https://api.deepinfra.com/v1/openai/models', auth: 'bearer' },
}

// OpenRouter prices: one sync per hour across all instances; a failed sync retries after five minutes.
const PRICE_LEASE = 'lab_openrouter_prices'
async function refreshOpenRouterPrices(payload: unknown): Promise<void> {
  try {
    const port = createSupabaseLearningSourceProviderLeasePort()
    const leaseId = randomUUID()
    if (!(await port.claim({ providerId: PRICE_LEASE, leaseId, holder: 'lab-teacher-models', ttlSeconds: 30 }))) return
    const admin = getAdminSupabase()
    const outcome = await syncOpenRouterTeacherPrices(payload, (fn, args) => admin.rpc(fn, args))
    await port.release({ providerId: PRICE_LEASE, leaseId, outcome: outcome.ok ? 'ok' : 'error', cooldownSeconds: outcome.ok ? 3600 : 300, error: outcome.ok ? null : outcome.error })
  } catch {
    // Prices then come only from what is already stored; the model list itself is unaffected.
  }
}

const clean = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 241 && /^[\w./:-]+$/.test(value)
function collectModels(payload: unknown, provider: string): string[] {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const rows: unknown[] = Array.isArray(payload) ? payload : Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : []
  const models = rows.flatMap(row => {
    if (!row || typeof row !== 'object') return []
    const item = row as Record<string, unknown>
    const id = item.id ?? item.name
    if (!clean(id)) return []
    // Gemini responses often use models/model-name, while generation requires model-name.
    const name = provider === 'gemini' ? id.replace(/^models\//, '') : id
    if (!clean(name)) return []
    if (provider === 'gemini' && Array.isArray(item.supportedGenerationMethods) &&
        !item.supportedGenerationMethods.includes('generateContent')) return []
    return [name]
  })
  return [...new Set(models)].sort((a,b) => a.localeCompare(b)).slice(0, 250)
}

export async function GET(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore })
  const org = req.nextUrl.searchParams.get('organizationId') ?? ''
  const credentialId = req.nextUrl.searchParams.get('credentialId') ?? ''
  const provider = req.nextUrl.searchParams.get('provider') ?? ''
  if (!UUID_RE.test(org) || !UUID_RE.test(credentialId) || (!API_MODELS[provider] && provider !== 'openai_compatible') ||
      !LAB_PROVIDER_CATALOG.some(p => p.kind === provider && p.supports['teacher.generate'])) {
    return NextResponse.json({ ok: false, error: 'model_directory_selection_invalid' }, { status: 400, headers: noStore })
  }
  const { data, error } = await session.supabase.rpc('itmounts_lab_customer_open_model_directory_credential', {
    p_organization_id: org, p_credential_id: credentialId,
  })
  if (error || !data || data.providerKind !== provider || data.id !== credentialId) {
    return NextResponse.json({ ok: false, error: 'model_directory_connection_unavailable' }, { status: 403, headers: noStore })
  }
  let key = ''
  try {
    key = openCustomerCredential({ organizationId: org, credentialId, sealed: data })
  } catch {
    return NextResponse.json({ ok: false, error: 'model_directory_connection_unavailable' }, { status: 403, headers: noStore })
  }
  let spec = API_MODELS[provider]
  if (provider === 'openai_compatible') {
    const url = customModelsUrl(data.endpoint)
    if (!url) return NextResponse.json({ ok: false, error: 'model_directory_provider_unavailable' }, { status: 502, headers: noStore })
    try { await assertPublicHttpUrl(url) }
    catch { return NextResponse.json({ ok: false, error: 'model_directory_provider_unavailable' }, { status: 502, headers: noStore }) }
    spec = { url, auth: 'bearer' }
  }
  const headers: Record<string,string> = { accept: 'application/json' }
  if (spec.auth === 'bearer') headers.authorization = `Bearer ${key}`
  if (spec.auth === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01' }
  if (spec.auth === 'gemini') headers['x-goog-api-key'] = key
  let live: string[]
  try {
    const response = await fetch(spec.url, {
      method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return NextResponse.json({ ok: false, error: 'model_directory_provider_unavailable' }, { status: 502, headers: noStore })
    const payload = await response.json()
    live = collectModels(payload, provider)
    if (provider === 'openrouter') await refreshOpenRouterPrices(payload)
  } catch {
    return NextResponse.json({ ok: false, error: 'model_directory_provider_unavailable' }, { status: 502, headers: noStore })
  }
  const priced = await session.supabase.rpc('itmounts_lab_customer_priced_teacher_models', { p_organization_id: org, p_provider_kind: provider })
  const pricedSet = new Set<string>(!priced.error && Array.isArray(priced.data) ? priced.data.map(String) : [])
  const models = live.map(id => ({ id, priced: pricedSet.has(id) }))
  return NextResponse.json({ ok: true, models, pricedAvailable: !priced.error, source: 'live' }, { headers: noStore })
}
