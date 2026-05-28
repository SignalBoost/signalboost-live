import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'

export type AdminContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
  admin: ReturnType<typeof getAdminSupabase>
}

export async function requireAdmin(): Promise<AdminContext | NextResponse> {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)

  const emailAllowed = !!user.email && adminEmails.includes(user.email.toLowerCase())
  const admin = getAdminSupabase()

  let roleAllowed = false
  const { data: memberships } = await admin
    .from('team_members')
    .select('role,status,owner_id,member_id')
    .or(`member_id.eq.${user.id},owner_id.eq.${user.id}`)

  if (memberships?.length) {
    roleAllowed = memberships.some((m: any) =>
      (m.status === 'active' || m.owner_id === user.id) &&
      (m.role === 'owner' || m.role === 'admin' || m.owner_id === user.id)
    )
  }

  if (!emailAllowed && !roleAllowed) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  return { user, admin }
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  return forwarded.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function auditAdminAction(args: {
  admin: ReturnType<typeof getAdminSupabase>
  actorId: string
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}) {
  await args.admin.from('admin_audit_log').insert({
    actor_id: args.actorId,
    action: args.action,
    target_type: args.targetType || null,
    target_id: args.targetId || null,
    metadata: args.metadata || {},
  })
}

export async function enforceRouteRateLimit(args: {
  req: NextRequest
  admin: ReturnType<typeof getAdminSupabase>
  routeKey: string
  limit: number
  windowMinutes: number
}): Promise<NextResponse | null> {
  const ip = getClientIp(args.req)
  const since = new Date(Date.now() - args.windowMinutes * 60 * 1000).toISOString()
  const { count } = await args.admin
    .from('api_rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('route_key', args.routeKey)
    .eq('identifier', ip)
    .gte('created_at', since)

  if ((count || 0) >= args.limit) {
    await args.admin.from('security_events').insert({
      event_type: 'rate_limit_block',
      severity: 'warning',
      ip_address: ip,
      route_key: args.routeKey,
      metadata: { limit: args.limit, windowMinutes: args.windowMinutes },
    })
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  await args.admin.from('api_rate_limit_events').insert({ route_key: args.routeKey, identifier: ip })
  return null
}

export async function isOutreachSendingDisabled(admin: ReturnType<typeof getAdminSupabase>): Promise<boolean> {
  const { data } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'outreach_sending_disabled')
    .maybeSingle()

  return data?.value === true || data?.value?.disabled === true
}

export async function enforceDailySendLimit(admin: ReturnType<typeof getAdminSupabase>, limit = 50): Promise<{ ok: boolean; count: number; limit: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', since)

  const current = count || 0
  return { ok: current < limit, count: current, limit }
}
