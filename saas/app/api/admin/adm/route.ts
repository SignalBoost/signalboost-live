import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'

async function safeCount(admin: any, table: string, filter?: (query: any) => any): Promise<number> {
  let query = admin.from(table).select('id', { count: 'exact', head: true })
  if (filter) query = filter(query)
  const { count } = await query
  return count || 0
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pending, approved, sent, rejected, sends24h, rateLimit24h, security24h, aiErrors24h, sendLimit, panicSwitch] = await Promise.all([
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'pending')),
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'approved')),
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'sent')),
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'rejected')),
    safeCount(ctx.admin, 'outreach_sends', q => q.gte('sent_at', since24h)),
    safeCount(ctx.admin, 'api_rate_limit_events', q => q.gte('created_at', since24h)),
    safeCount(ctx.admin, 'security_events', q => q.gte('created_at', since24h)),
    safeCount(ctx.admin, 'ai_task_log', q => q.eq('status', 'error').gte('created_at', since24h)),
    enforceDailySendLimit(ctx.admin),
    isOutreachSendingDisabled(ctx.admin),
  ])

  const { data: recentOutreach } = await ctx.admin
    .from('outreach_queue')
    .select('id,business_name,business_url,source_platform,status,created_at,approved_at,sent_at,analyzer_summary,business_model_profile,predictive_needs,outreach_message,website_json,review_strategy,social_plan,promo_plan')
    .order('created_at', { ascending: false })
    .limit(25)

  const { data: recentAiTasks } = await ctx.admin
    .from('ai_task_log')
    .select('id,task_type,provider,model,status,duration_ms,fallback_used,error_message,created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: recentSecurityEvents } = await ctx.admin
    .from('security_events')
    .select('id,event_type,severity,route_key,created_at,metadata')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    metrics: {
      pending,
      approved,
      sent,
      rejected,
      sends24h,
      rateLimit24h,
      security24h,
      aiErrors24h,
      sendLimit,
      panicSwitch,
    },
    recentOutreach: recentOutreach || [],
    recentAiTasks: recentAiTasks || [],
    recentSecurityEvents: recentSecurityEvents || [],
    hmi: {
      summary: 'ADM Console shows approval-safe outreach, model behavior, security events, and Digits integration health in one place.',
      nextActions: ['Review pending outreach', 'Approve only safe value-first messages', 'Monitor daily send limit', 'Keep panic switch available for incidents'],
    },
  })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (typeof body?.outreach_sending_disabled !== 'boolean') {
    return NextResponse.json({ error: 'outreach_sending_disabled boolean is required' }, { status: 400 })
  }

  const value = body.outreach_sending_disabled
  const { error } = await ctx.admin
    .from('system_settings')
    .upsert({ key: 'outreach_sending_disabled', value, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: value ? 'security.outreach_panic_enabled' : 'security.outreach_panic_disabled',
    targetType: 'system_settings',
    targetId: 'outreach_sending_disabled',
  })

  return NextResponse.json({ ok: true, outreach_sending_disabled: value })
}
