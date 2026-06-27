import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

type AppRole = 'user' | 'admin' | 'owner'

type RoleRow = {
  id: string
  email: string
  role: AppRole
}

function normalizeRole(value: unknown): AppRole {
  const role = String(value || '').toLowerCase()
  if (role === 'owner') return 'owner'
  if (role === 'admin') return 'admin'
  return 'user'
}

function put(map: Map<string, RoleRow>, row: RoleRow) {
  const key = row.email || row.id
  const existing = map.get(key)
  if (!existing) {
    map.set(key, row)
    return
  }
  const rank: Record<AppRole, number> = { user: 1, admin: 2, owner: 3 }
  if (rank[row.role] > rank[existing.role]) map.set(key, row)
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const users = new Map<string, RoleRow>()

  if (guard.ctx.userId && guard.ctx.email) {
    put(users, {
      id: guard.ctx.userId,
      email: guard.ctx.email,
      role: guard.ctx.isOwner ? 'owner' : guard.ctx.isAdmin ? 'admin' : 'user',
    })
  }

  try {
    const admin = getAdminSupabase()
    const { data } = await admin
      .from('team_members')
      .select('owner_id,member_id,member_email,role,status')
      .in('status', ['active', 'pending'])
      .limit(250)

    if (Array.isArray(data)) {
      for (const member of data) {
        const email = String(member.member_email || '').toLowerCase()
        const id = String(member.member_id || email || member.owner_id || '')
        if (!email && !id) continue
        put(users, { id, email: email || id, role: normalizeRole(member.role) })
      }
    }
  } catch {
    // If team_members is unavailable, the current admin session remains visible.
  }

  const rank: Record<AppRole, number> = { owner: 0, admin: 1, user: 2 }
  const list = Array.from(users.values()).sort((a, b) => rank[a.role] - rank[b.role] || a.email.localeCompare(b.email))

  return NextResponse.json({ ok: true, currentUser: guard.ctx, users: list })
}
