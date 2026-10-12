// saas/app/api/lab/models/route.ts
// Base models the selected training account can actually train, read live with the customer's own key.
// GET ?provider=&organizationId=&credentialId=
//   huggingface -> Hub text-generation models with safetensors weights and no license gate. The Hub list is public, so
//                  without credentialId it is read anonymously (the dropdown works before a key is saved).
//   together    -> the customer's Together model list, models that carry a fine-tuning price
//   fireworks   -> Fireworks public base models that support LoRA SFT and fall in a verified price band
// Read-only catalog requests: no training, no spend. Keys are never returned, cached or logged.
import { NextRequest, NextResponse } from 'next/server'
import { customerSession, rpcErrorCode, UUID_RE } from '@/lib/lab/customerSession'
import { openCustomerCredential } from '@/lib/ai/cos/labCustomerCredentialVault'
import { providerEntry } from '@/lib/ai/cos/labCustomerProviderCatalog'
import { listFireworksBaseModels, listTogetherBaseModels, normalizeRateCards, type BaseModelOption } from '@/lib/ai/cos/labCustomerProviderTraining'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'cache-control': 'no-store' }
const HF_MODELS = 'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=100&expand[]=safetensors&expand[]=gated'

async function huggingFaceBaseModels(token: string | null): Promise<BaseModelOption[]> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(HF_MODELS, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('model_directory_provider_unavailable')
  const rows: unknown = await response.json()
  if (!Array.isArray(rows)) throw new Error('model_directory_provider_unavailable')
  const out: BaseModelOption[] = []
  for (const row of rows as any[]) {
    const id = String(row?.id ?? '')
    const parameters = Number(row?.safetensors?.total ?? 0)
    // Training needs safetensors weights; gated repos need a license acceptance LAB cannot do for the customer.
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(id) || !(parameters > 0) || (row?.gated && row.gated !== false)) continue
    out.push({ id, label: `${id} · ${(parameters / 1e9).toFixed(parameters < 1e9 ? 2 : 1)}B` })
  }
  return out.slice(0, 60)
}

export async function GET(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore })
  const provider = req.nextUrl.searchParams.get('provider') || ''
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  const credentialId = req.nextUrl.searchParams.get('credentialId') || ''
  if (!providerEntry(provider)?.supports['training.execute']) return NextResponse.json({ ok: false, error: 'lab_training_provider_unsupported' }, { status: 400, headers: noStore })
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ ok: false, error: 'model_directory_selection_invalid' }, { status: 400, headers: noStore })
  if (!credentialId && provider === 'huggingface') {
    // Membership still gates the request; the Hub directory itself is public.
    const member = await session.supabase.rpc('itmounts_lab_customer_list_credentials', { p_organization_id: organizationId })
    if (member.error) return NextResponse.json({ ok: false, error: rpcErrorCode(member.error) }, { status: 403, headers: noStore })
    try { return NextResponse.json({ ok: true, models: await huggingFaceBaseModels(null), source: 'live_public' }, { headers: noStore }) }
    catch { return NextResponse.json({ ok: false, error: 'model_directory_provider_unavailable' }, { status: 502, headers: noStore }) }
  }
  if (!UUID_RE.test(credentialId)) return NextResponse.json({ ok: false, error: 'model_directory_selection_invalid' }, { status: 400, headers: noStore })
  const { data, error } = await session.supabase.rpc('itmounts_lab_customer_open_model_directory_credential', {
    p_organization_id: organizationId, p_credential_id: credentialId,
  })
  if (error || !data || data.providerKind !== provider || data.id !== credentialId) {
    return NextResponse.json({ ok: false, error: 'model_directory_connection_unavailable' }, { status: 403, headers: noStore })
  }
  let key = ''
  try { key = openCustomerCredential({ organizationId, credentialId, sealed: data }) }
  catch { return NextResponse.json({ ok: false, error: 'model_directory_connection_unavailable' }, { status: 403, headers: noStore }) }
  try {
    let models: BaseModelOption[]
    if (provider === 'together') models = await listTogetherBaseModels(key, fetch)
    else if (provider === 'fireworks') {
      const cards = await session.supabase.rpc('itmounts_lab_customer_training_rate_cards', { p_organization_id: organizationId })
      if (cards.error) return NextResponse.json({ ok: false, error: rpcErrorCode(cards.error) }, { status: 403, headers: noStore })
      models = await listFireworksBaseModels(key, normalizeRateCards(cards.data), fetch)
    } else models = await huggingFaceBaseModels(key)
    return NextResponse.json({ ok: true, models, source: 'live' }, { headers: noStore })
  } catch {
    return NextResponse.json({ ok: false, error: 'model_directory_provider_unavailable' }, { status: 502, headers: noStore })
  }
}
