// saas/app/api/agency/provider-keys/route.ts
// Per-user BYOK vault. Logged-in users connect a provider key once and reuse it.
// Values encrypted at rest (AES-256-GCM via lib/vault/crypto). Plaintext exists
// only in memory during save. Never returned to the client, never logged.
// GET    -> list connected providers (id, last4, dates — never values)
// POST   -> connect { provider, value }
// DELETE -> disconnect { provider }

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { vaultEncrypt } from '@/lib/vault/crypto'
import { getUserProvider } from '@/lib/agency/userProviders'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET() {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ connected: [], signedIn: false })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('user_provider_keys')
    .select('provider, last4, created_at, last_used_at')
    .eq('user_id', access.userId)
    .order('provider', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connected: data || [], signedIn: true })
}

export async function POST(req: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to save provider keys.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const providerId = String(body?.provider || '').trim().slice(0, 60)
  const value = String(body?.value || '').trim()
  const template = getUserProvider(providerId)

  if (!template) return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 })
  if (template.status !== 'live') return NextResponse.json({ error: 'This provider is not available yet.' }, { status: 400 })
  if (value.length < 20 || value.length > 400) return NextResponse.json({ error: 'That does not look like a valid API key.' }, { status: 400 })

  const enc = vaultEncrypt(value)
  if (!enc.ok) return NextResponse.json({ error: enc.error }, { status: 500 })

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('user_provider_keys')
    .upsert({
      user_id: access.userId,
      provider: providerId,
      value_encrypted: enc.valueEncrypted,
      iv: enc.iv,
      tag: enc.tag,
      last4: value.slice(-4),
    }, { onConflict: 'user_id,provider' })
    .select('provider, last4, created_at, last_used_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connected: data })
}

export async function DELETE(req: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const providerId = String(body?.provider || '').trim().slice(0, 60)
  if (!providerId) return NextResponse.json({ error: 'provider required' }, { status: 400 })

  const admin = getAdminSupabase()
  const { error } = await admin
    .from('user_provider_keys')
    .delete()
    .eq('user_id', access.userId)
    .eq('provider', providerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
