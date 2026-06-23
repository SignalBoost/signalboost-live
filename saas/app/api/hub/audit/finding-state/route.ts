// saas/app/api/hub/audit/finding-state/route.ts
// Per-finding triage state — owner-gated.
//   GET  → all stored states (overlay onto any report's findings by id)
//   POST → upsert one finding's status / owner / note

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { createClient } from '@supabase/supabase-js'
import { normalizeStatus } from '@/lib/audit/findingState'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  // Untyped: audit_finding_state isn't in the generated Database types.
  return createClient(url, key, { auth: { persistSession: false } }) as any
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    const client = db()
    if (!client) return NextResponse.json({ ok: true, states: [] })
    const { data, error } = await client
      .from('audit_finding_state')
      .select('finding_id,status,owner,note,due_date,updated_at,updated_by')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, states: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load finding state.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const userId = (guard as any).ctx?.userId ?? (guard as any).ctx?.user?.id ?? null

  let body: any = null
  try { body = await req.json() } catch { body = null }
  const findingId = body && typeof body.findingId === 'string' ? body.findingId.slice(0, 200) : ''
  if (!findingId) return NextResponse.json({ ok: false, error: 'findingId required' }, { status: 400 })

  // Partial upsert: only the provided fields are written; others keep their
  // value on an existing row, or take table defaults on a new row.
  const row: any = { finding_id: findingId, updated_at: new Date().toISOString(), updated_by: userId }
  if (body.status !== undefined) row.status = normalizeStatus(body.status)
  if (body.owner !== undefined) row.owner = body.owner ? String(body.owner).slice(0, 200) : null
  if (body.note !== undefined) row.note = body.note ? String(body.note).slice(0, 2000) : null
  if (body.dueDate !== undefined) {
    const d = String(body.dueDate || '').trim()
    row.due_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
  }

  try {
    const client = db()
    if (!client) return NextResponse.json({ ok: false, error: 'Storage not configured.' }, { status: 500 })
    const { data, error } = await client
      .from('audit_finding_state')
      .upsert(row, { onConflict: 'finding_id' })
      .select('finding_id,status,owner,note,due_date,updated_at,updated_by')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, state: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save finding state.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
