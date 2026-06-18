import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { requireOwner } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

// Editable enums. 'owner' is intentionally NOT assignable here — owner transfer
// is a separate, deliberate flow, and every write below filters owner rows out
// (.neq) with the protect_last_owner DB trigger as the deeper backstop.
const VALID_ROLES = ['admin', 'member'] as const
const VALID_STATUSES = ['active', 'removed', 'pending'] as const
const COLUMNS = 'id, member_email, member_id, role, status, created_at'

const ok = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v)

async function getClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    },
  )
}

// ── GET ─ fetch the roster (all statuses) for the owner's account ────────────
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return ok({ members: [], error: guard.error }, guard.status)

  const supabase = await getClient()
  const { data, error } = await supabase
    .from('team_members')
    .select(COLUMNS)
    .eq('owner_id', guard.ctx.userId)
    .order('created_at', { ascending: true })

  if (error) return ok({ members: [], error: error.message }, 500)
  return ok({ members: data || [] })
}

// ── POST ─ add a line (invite). Reserves a Pending seat for the email ────────
export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return fail(guard.error, guard.status)

  let body: any
  try { body = await req.json() } catch { return fail('Invalid JSON') }

  const email = String(body?.email || '').trim().toLowerCase()
  const role = has(VALID_ROLES, body?.role) ? body.role : 'member'

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Please enter a valid email address.')
  if (email === (guard.ctx.email || '')) return fail('You are the owner — you are already on the team.')

  const supabase = await getClient()
  const { data, error } = await supabase
    .from('team_members')
    .upsert(
      { owner_id: guard.ctx.userId, member_email: email, role, status: 'pending' },
      { onConflict: 'owner_id,member_email' },
    )
    .select(COLUMNS)
    .single()

  if (error) return fail(error.message, 500)
  return ok({ member: data })
}

// ── PATCH ─ update role and/or status (activate / deactivate) ────────────────
export async function PATCH(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return fail(guard.error, guard.status)

  let body: any
  try { body = await req.json() } catch { return fail('Invalid JSON') }

  const id = String(body?.id || '').trim()
  if (!id) return fail('id is required')

  const updates: Record<string, string> = {}
  if (body?.role !== undefined) {
    if (!has(VALID_ROLES, body.role)) return fail('Invalid role.')
    updates.role = body.role
  }
  if (body?.status !== undefined) {
    if (!has(VALID_STATUSES, body.status)) return fail('Invalid status.')
    updates.status = body.status
  }
  if (Object.keys(updates).length === 0) return fail('Provide a role or status to update.')

  const supabase = await getClient()
  const { data, error } = await supabase
    .from('team_members')
    .update(updates)
    .eq('id', id)
    .eq('owner_id', guard.ctx.userId)
    .neq('role', 'owner')
    .select(COLUMNS)
    .single()

  if (error) return fail(error.message, 500)
  return ok({ member: data })
}

// ── DELETE ─ permanently purge a row (owner rows protected) ──────────────────
export async function DELETE(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return fail(guard.error, guard.status)

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return fail('id is required')

  const supabase = await getClient()
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', id)
    .eq('owner_id', guard.ctx.userId)
    .neq('role', 'owner')

  if (error) return fail(error.message, 500)
  return ok({ ok: true })
}
