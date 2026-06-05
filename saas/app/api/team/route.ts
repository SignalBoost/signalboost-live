import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { requireOwner } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['admin', 'member'] // owner is not assignable via the UI; there is exactly one owner

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

// List your team
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ members: [], error: guard.error }, { status: guard.status })
  const { ctx } = guard

  const supabase = await getClient()
  const { data, error } = await supabase
    .from('team_members')
    .select('id, member_email, member_id, role, status, created_at')
    .eq('owner_id', ctx.userId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ members: [], error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [] })
}

// Invite / add a member by email with a role
export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { ctx } = guard

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const email = String(body?.email || '').trim().toLowerCase()
  const role = VALID_ROLES.includes(body?.role) ? body.role : 'member'

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (email === (ctx.email || '')) {
    return NextResponse.json({ error: 'You are the owner — you are already on the team.' }, { status: 400 })
  }

  const supabase = await getClient()
  const { data, error } = await supabase
    .from('team_members')
    .upsert(
      { owner_id: ctx.userId, member_email: email, role, status: 'pending' },
      { onConflict: 'owner_id,member_email' },
    )
    .select('id, member_email, member_id, role, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

// Change a member's role
export async function PATCH(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { ctx } = guard

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!VALID_ROLES.includes(body?.role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

  const supabase = await getClient()
  const { data, error } = await supabase
    .from('team_members')
    .update({ role: body.role })
    .eq('id', id)
    .eq('owner_id', ctx.userId)
    .neq('role', 'owner') // never let the owner row be downgraded here
    .select('id, member_email, member_id, role, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

// Remove a member
export async function DELETE(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const { ctx } = guard

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = await getClient()
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', id)
    .eq('owner_id', ctx.userId)
    .neq('role', 'owner') // can't delete the owner row

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
