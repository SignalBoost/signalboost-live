// saas/app/api/hub/vault/route.ts
// Key Vault API — owner/admin only.
// GET    -> ?providers=1 -> provider list (name + count) for the dropdown
//           ?provider=Name -> that provider's keys only (dynamic retrieval)
//           (no params)   -> all items (names, provider, last4, dates — never values)
//           ?audit=1      -> activity timeline (last 60 entries)
// POST   -> add item   { provider, label, value, expiresAt? }  (encrypted at rest)
// PUT    -> reveal     { id }  (decrypts ONE item, stamps last_accessed_at)
// DELETE -> remove     { id }
// PATCH  -> log client event { action, provider, label } (e.g. copy)
// Plaintext values exist only in memory during add/reveal. Never logged.

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireOwner } from '@/lib/auth/access'
import { vaultEncrypt, vaultDecrypt } from '@/lib/vault/crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 15

function noStoreJson(body: any, init: ResponseInit = {}) {
  const res = NextResponse.json(body, init)
  res.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

// Fire-and-forget audit entry. Vault actions are recorded even if logging fails.
async function logAudit(admin: any, actor: string, action: string, provider: string, label: string) {
  try {
    await admin.from('vault_audit').insert({ actor, action, provider, label })
  } catch {}
}

export async function GET(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return noStoreJson({ error: guard.error }, { status: guard.status })
  const admin = getAdminSupabase()
  const url = new URL(req.url)

  // ?providers=1 -> lightweight list of providers that have keys (name + count).
  // The home screen shows this dropdown; keys are fetched per provider on demand.
  if (url.searchParams.get('providers') === '1') {
    const { data, error } = await admin.from('vault_items').select('provider')
    if (error) return noStoreJson({ error: error.message }, { status: 500 })
    const counts: Record<string, number> = {}
    for (const row of data || []) counts[row.provider] = (counts[row.provider] || 0) + 1
    const providers = Object.entries(counts)
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => a.provider.localeCompare(b.provider))
    return noStoreJson({ providers })
  }

  if (url.searchParams.get('audit') === '1') {
    const { data, error } = await admin
      .from('vault_audit')
      .select('id, actor, action, provider, label, created_at')
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) return noStoreJson({ error: error.message }, { status: 500 })
    return noStoreJson({ audit: data || [] })
  }

  // ?provider=Name -> dynamic retrieval: only that provider's keys are fetched.
  // ?status=archived | all  (default: active only — archived keys are hidden)
  const providerFilter = url.searchParams.get('provider')
  const statusFilter = url.searchParams.get('status') || 'active'

  async function listItems(withStatus: boolean) {
    let q = admin
      .from('vault_items')
      .select(
        withStatus
          ? 'id, provider, label, last4, created_at, last_accessed_at, expires_at, status'
          : 'id, provider, label, last4, created_at, last_accessed_at, expires_at',
      )
      .order('provider', { ascending: true })
      .order('label', { ascending: true })
    if (providerFilter) q = q.eq('provider', providerFilter)
    if (withStatus && statusFilter !== 'all') q = q.eq('status', statusFilter)
    return q
  }

  // Try with the status column; if the migration hasn't been run yet, fall back.
  let { data, error } = await listItems(true)
  if (error && /status/i.test(error.message || '')) {
    ;({ data, error } = await listItems(false))
  }
  if (error) return noStoreJson({ error: error.message }, { status: 500 })
  return noStoreJson({ items: data || [] })
}

export async function POST(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return noStoreJson({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return noStoreJson({ error: 'Invalid JSON' }, { status: 400 }) }
  const provider = String(body?.provider || '').trim().slice(0, 60)
  const label = String(body?.label || '').trim().slice(0, 120)
  const value = String(body?.value || '')
  if (!provider || !label || !value) return noStoreJson({ error: 'provider, label and value are required' }, { status: 400 })
  if (value.length > 4000) return noStoreJson({ error: 'Value too long' }, { status: 400 })
  const expiresAt = body?.expiresAt ? String(body.expiresAt) : null

  const enc = vaultEncrypt(value)
  if (!enc.ok) return noStoreJson({ error: enc.error }, { status: 500 })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('vault_items')
    .insert({
      owner_id: guard.ctx.userId || '00000000-0000-0000-0000-000000000000',
      provider,
      label,
      value_encrypted: enc.valueEncrypted,
      iv: enc.iv,
      tag: enc.tag,
      last4: value.slice(-4),
      expires_at: expiresAt,
    })
    .select('id, provider, label, last4, created_at, last_accessed_at, expires_at')
    .single()
  if (error) return noStoreJson({ error: error.message }, { status: 500 })
  await logAudit(admin, guard.ctx.email || 'owner', 'add', provider, label)
  return noStoreJson({ item: data })
}

export async function PUT(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return noStoreJson({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return noStoreJson({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body?.id || '')
  if (!id) return noStoreJson({ error: 'id required' }, { status: 400 })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('vault_items')
    .select('id, value_encrypted, iv, tag, provider, label')
    .eq('id', id)
    .single()
  if (error || !data) return noStoreJson({ error: 'Item not found' }, { status: 404 })

  const dec = vaultDecrypt(data.value_encrypted, data.iv, data.tag)
  if (!dec.ok) return noStoreJson({ error: dec.error }, { status: 500 })

  await admin.from('vault_items').update({ last_accessed_at: new Date().toISOString() }).eq('id', id)
  await logAudit(admin, guard.ctx.email || 'owner', 'reveal', data.provider, data.label)
  return noStoreJson({ value: dec.value })
}

export async function DELETE(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return noStoreJson({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return noStoreJson({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body?.id || '')
  if (!id) return noStoreJson({ error: 'id required' }, { status: 400 })
  const admin = getAdminSupabase()
  const { data: item } = await admin.from('vault_items').select('provider, label').eq('id', id).single()
  const { error } = await admin.from('vault_items').delete().eq('id', id)
  if (error) return noStoreJson({ error: error.message }, { status: 500 })
  await logAudit(admin, guard.ctx.email || 'owner', 'delete', item?.provider || '?', item?.label || '?')
  return noStoreJson({ deleted: true })
}

// PATCH -> one of three operations, selected by `op`:
//   op:'edit'    { id, value }            -> re-encrypt and replace the stored secret
//   op:'archive' { id, archived?:bool }   -> set status active/archived (soft delete)
//   (default)    { action, provider, label } -> record a client-side event in the audit log
export async function PATCH(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return noStoreJson({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return noStoreJson({ error: 'Invalid JSON' }, { status: 400 }) }
  const admin = getAdminSupabase()
  const op = String(body?.op || '').trim()

  // --- Edit: replace the secret value (re-encrypts, updates last4) ---
  if (op === 'edit') {
    const id = String(body?.id || '')
    const value = String(body?.value || '')
    if (!id) return noStoreJson({ error: 'id required' }, { status: 400 })
    if (!value) return noStoreJson({ error: 'value required' }, { status: 400 })
    if (value.length > 4000) return noStoreJson({ error: 'Value too long' }, { status: 400 })

    const { data: existing, error: findErr } = await admin
      .from('vault_items')
      .select('provider, label')
      .eq('id', id)
      .single()
    if (findErr || !existing) return noStoreJson({ error: 'Item not found' }, { status: 404 })

    const enc = vaultEncrypt(value)
    if (!enc.ok) return noStoreJson({ error: enc.error }, { status: 500 })

    const { error } = await admin
      .from('vault_items')
      .update({
        value_encrypted: enc.valueEncrypted,
        iv: enc.iv,
        tag: enc.tag,
        last4: value.slice(-4),
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return noStoreJson({ error: error.message }, { status: 500 })
    await logAudit(admin, guard.ctx.email || 'owner', 'edit', existing.provider, existing.label)
    return noStoreJson({ updated: true })
  }

  // --- Archive / unarchive: soft delete via status column ---
  if (op === 'archive') {
    const id = String(body?.id || '')
    if (!id) return noStoreJson({ error: 'id required' }, { status: 400 })
    const archived = body?.archived === false ? false : true

    const { data: existing, error: findErr } = await admin
      .from('vault_items')
      .select('provider, label')
      .eq('id', id)
      .single()
    if (findErr || !existing) return noStoreJson({ error: 'Item not found' }, { status: 404 })

    const { error } = await admin
      .from('vault_items')
      .update({
        status: archived ? 'archived' : 'active',
        archived_at: archived ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) return noStoreJson({ error: error.message }, { status: 500 })
    await logAudit(admin, guard.ctx.email || 'owner', archived ? 'archive' : 'unarchive', existing.provider, existing.label)
    return noStoreJson({ archived })
  }

  // --- Default: record a client-side event (e.g. copy to clipboard) ---
  const action = String(body?.action || '').slice(0, 30)
  const provider = String(body?.provider || '?').slice(0, 60)
  const label = String(body?.label || '?').slice(0, 120)
  if (!action) return noStoreJson({ error: 'action required' }, { status: 400 })
  await logAudit(admin, guard.ctx.email || 'owner', action, provider, label)
  return noStoreJson({ logged: true })
}
