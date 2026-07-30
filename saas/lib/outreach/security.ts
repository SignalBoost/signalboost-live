// saas/lib/outreach/security.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { getAccess } from '@/lib/auth/access'

export type AdminContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
  admin: ReturnType<typeof getAdminSupabase>
}

export async function requireAdmin(): Promise<AdminContext | NextResponse> {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Single source of truth for the role decision (team_members + owner/admin env backstops).
  const access = await getAccess()
  if (!access.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Keep returning the service-role client the outreach routes depend on.
  const admin = getAdminSupabase()
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

// Rolling 24-hour send cap.
//
// The cap is now OFF by default at the owner's instruction: OUTREACH_DAILY_SEND_LIMIT
// is unset, so `limit` resolves to 0 and every send is allowed. The counting still
// happens — `count` remains accurate and is surfaced in the console and in every send
// response — so volume stays observable even with no ceiling on it.
//
// Setting OUTREACH_DAILY_SEND_LIMIT to a positive number in Vercel re-imposes a cap
// without a code change. The database trigger reads the same value from
// system_settings.outreach_daily_send_limit; keep the two in step if you set either.
//
// Callers that pass an explicit number still win, so a future route can cap itself.
const UNLIMITED = 0

function configuredDailyLimit(): number {
  const raw = String(process.env.OUTREACH_DAILY_SEND_LIMIT ?? '').trim().toLowerCase()
  if (!raw || raw === 'off' || raw === 'none' || raw === 'unlimited') return UNLIMITED
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : UNLIMITED
}

export async function enforceDailySendLimit(
  admin: ReturnType<typeof getAdminSupabase>,
  limit?: number,
): Promise<{ ok: boolean; count: number; limit: number; unlimited: boolean }> {
  const effective = typeof limit === 'number' && limit > 0 ? limit : configuredDailyLimit()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', since)

  const current = count || 0
  if (effective === UNLIMITED) return { ok: true, count: current, limit: 0, unlimited: true }
  return { ok: current < effective, count: current, limit: effective, unlimited: false }
}
