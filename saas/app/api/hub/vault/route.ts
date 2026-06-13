// saas/app/api/hub/vault/route.ts
// Key Vault API — owner/admin only.
// GET    -> list items (names, provider, last4, dates — never values)
//           GET ?audit=1 -> activity timeline (last 60 entries)
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
export const maxDuration = 15

// Fire-and-forget audit entry. Vault actions are recorded even if logging fails.
async function logAudit(admin: any, actor: string, action: string, provider: string, label: string) {
  try {
    await admin.from('vault_audit').insert({ actor, action, provider, label })
  } catch {}
}

export async function GET(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const admin = getAdminSupabase()
  const url = new URL(req.url)
  if (url.searchParams.get('audit') === '1') {
    const { data, error } = await admin
      .from('vault_audit')
      .select('id, actor, action, provider, label, created_at')
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ audit: data || [] })
  }
  const { data, error } = await admin
    .from('vault_items')
    .select('id, provider, label, last4, created_at, last_accessed_at, expires_at')
    .order('provider', { ascending: true })
    .order('label', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const provider = String(body?.provider || '').trim().slice(0, 60)
  const label = String(body?.label || '').trim().slice(0, 120)
  const value = String(body?.value || '')
  if (!provider || !label || !value) return NextResponse.json({ error: 'provider, label and value are required' }, { status: 400 })
  if (value.length > 4000) return NextResponse.json({ error: 'Value too long' }, { status: 400 })
  const expiresAt = body?.expiresAt ? String(body.expiresAt) : null

  const enc = vaultEncrypt(value)
  if (!enc.ok) return NextResponse.json({ error: enc.error }, { status: 500 })

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit(admin, guard.ctx.email || 'owner', 'add', provider, label)
  return NextResponse.json({ item: data })
}

export async function PUT(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('vault_items')
    .select('id, value_encrypted, iv, tag, provider, label')
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const dec = vaultDecrypt(data.value_encrypted, data.iv, data.tag)
  if (!dec.ok) return NextResponse.json({ error: dec.error }, { status: 500 })

  await admin.from('vault_items').update({ last_accessed_at: new Date().toISOString() }).eq('id', id)
  await logAudit(admin, guard.ctx.email || 'owner', 'reveal', data.provider, data.label)
  return NextResponse.json({ value: dec.value })
}

export async function DELETE(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const admin = getAdminSupabase()
  const { data: item } = await admin.from('vault_items').select('provider, label').eq('id', id).single()
  const { error } = await admin.from('vault_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit(admin, guard.ctx.email || 'owner', 'delete', item?.provider || '?', item?.label || '?')
  return NextResponse.json({ deleted: true })
}

// PATCH -> record a client-side event (e.g. copy to clipboard) in the audit log.
export async function PATCH(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = String(body?.action || '').slice(0, 30)
  const provider = String(body?.provider || '?').slice(0, 60)
  const label = String(body?.label || '?').slice(0, 120)
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })
  const admin = getAdminSupabase()
  await logAudit(admin, guard.ctx.email || 'owner', action, provider, label)
  return NextResponse.json({ logged: true })
}
