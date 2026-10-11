// saas/app/api/lab/providers/route.ts
// Customer LAB provider keys. GET  ?organizationId= -> catalog + saved keys (names only, never values)
//                              POST { organizationId, providerKind, label, secret, endpoint? } -> save (owner/admin)
//                              DELETE { organizationId, credentialId } -> revoke (owner/admin)
// Keys are encrypted here before the database sees them, bound to this organization and this key's id.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { assertPublicHttpUrl } from '@/lib/security/publicFetchGuard'
import { customerSession, rpcErrorCode, UUID_RE } from '@/lib/lab/customerSession'
import { LAB_CREDENTIAL_KINDS, sealCustomerCredential } from '@/lib/ai/cos/labCustomerCredentialVault'
import { LAB_PROVIDER_CATALOG } from '@/lib/ai/cos/labCustomerProviderCatalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'cache-control': 'no-store' }

export async function GET(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore })
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ ok: false, error: 'lab_organization_required' }, { status: 400, headers: noStore })
  const { data, error } = await session.supabase.rpc('itmounts_lab_customer_list_credentials', { p_organization_id: organizationId })
  if (error) return NextResponse.json({ ok: false, error: rpcErrorCode(error) }, { status: 403, headers: noStore })
  return NextResponse.json({ ok: true, catalog: LAB_PROVIDER_CATALOG, credentials: data ?? [] }, { headers: noStore })
}

export async function POST(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore })
  const body = await req.json().catch(() => null)
  const organizationId = String(body?.organizationId ?? '')
  const providerKind = String(body?.providerKind ?? '')
  const label = String(body?.label ?? '').trim().slice(0, 80)
  const endpoint = providerKind === 'openai_compatible' ? String(body?.endpoint ?? '').trim() : ''
  if (!UUID_RE.test(organizationId) || !(LAB_CREDENTIAL_KINDS as readonly string[]).includes(providerKind) || !label) {
    return NextResponse.json({ ok: false, error: 'lab_credential_request_invalid' }, { status: 400, headers: noStore })
  }
  if (providerKind === 'openai_compatible' && !/^https:\/\/[^/@\s]+(\/[^\s#]*)?$/.test(endpoint)) {
    return NextResponse.json({ ok: false, error: 'lab_customer_endpoint_required' }, { status: 400, headers: noStore })
  }
  if (providerKind === 'openai_compatible') {
    try { await assertPublicHttpUrl(endpoint) }
    catch { return NextResponse.json({ ok: false, error: 'lab_customer_endpoint_required' }, { status: 400, headers: noStore }) }
  }
  const credentialId = randomUUID()
  let sealed
  try {
    sealed = sealCustomerCredential({ organizationId, credentialId, secret: String(body?.secret ?? '') })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'lab_credential_value_invalid' }, { status: 400, headers: noStore })
  }
  const { error } = await session.supabase.rpc('itmounts_lab_customer_store_credential', {
    p_organization_id: organizationId, p_credential_id: credentialId, p_provider_kind: providerKind, p_label: label,
    p_endpoint: endpoint || null, p_ciphertext: sealed.ciphertext, p_iv: sealed.iv, p_tag: sealed.tag,
  })
  if (error) return NextResponse.json({ ok: false, error: rpcErrorCode(error) }, { status: 403, headers: noStore })
  return NextResponse.json({ ok: true, credentialId }, { headers: noStore })
}

export async function DELETE(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: noStore })
  const body = await req.json().catch(() => null)
  const organizationId = String(body?.organizationId ?? '')
  const credentialId = String(body?.credentialId ?? '')
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(credentialId)) return NextResponse.json({ ok: false, error: 'lab_credential_request_invalid' }, { status: 400, headers: noStore })
  const { data, error } = await session.supabase.rpc('itmounts_lab_customer_revoke_credential', { p_organization_id: organizationId, p_credential_id: credentialId })
  if (error) return NextResponse.json({ ok: false, error: rpcErrorCode(error) }, { status: 403, headers: noStore })
  return NextResponse.json({ ok: true, revoked: data === true }, { headers: noStore })
}
