// saas/app/api/hub/vault/sync/route.ts
// Wave 2 — the console's FIRST WRITE operation.
// POST { id, envName } -> decrypts one vault key in memory and upserts it
// as a Vercel environment variable (Production + Preview).
// Owner-only. Every sync is audit-logged. The plaintext never persists.

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireOwner } from '@/lib/auth/access'
import { vaultDecrypt } from '@/lib/vault/crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const VERCEL_PROJECT = 'signalboost-live'

export async function POST(req: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const token = process.env.VERCEL_TOKEN
  if (!token) return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 500 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = String(body?.id || '')
  const envName = String(body?.envName || '').trim()
  if (!id || !envName) return NextResponse.json({ error: 'id and envName are required' }, { status: 400 })
  // Vercel env names: uppercase letters, digits, underscores; must not start with a digit.
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) {
    return NextResponse.json({ error: 'Environment variable names must use UPPERCASE letters, digits and underscores (e.g. OPENAI_API_KEY)' }, { status: 400 })
  }

  const admin = getAdminSupabase()
  const { data: item, error } = await admin
    .from('vault_items')
    .select('id, provider, label, value_encrypted, iv, tag')
    .eq('id', id)
    .single()
  if (error || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const dec = vaultDecrypt(item.value_encrypted, item.iv, item.tag)
  if (!dec.ok) return NextResponse.json({ error: dec.error }, { status: 500 })

  // Upsert into Vercel: creates the variable or replaces its value if it exists.
  const res = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/env?upsert=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: envName,
      value: dec.value,
      type: 'encrypted',
      target: ['production', 'preview'],
    }),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || `Vercel API error (${res.status})`
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  try {
    await admin.from('vault_audit').insert({
      actor: guard.ctx.email || 'owner',
      action: 'sync_vercel',
      provider: item.provider,
      label: `${item.label} → ${envName}`,
    })
  } catch {}

  return NextResponse.json({
    synced: true,
    envName,
    note: 'Variable saved in Vercel (Production + Preview). A redeploy is required before the app uses the new value.',
  })
}
