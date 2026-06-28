import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { decideCosaMarketingChannels } from '@/lib/cosa/channelDecision'

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

  const [pendingApprovals, approvedOutreach, sentOutreach, sends24h, aiErrors24h, security24h] = await Promise.all([
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'pending')),
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'approved')),
    safeCount(ctx.admin, 'outreach_queue', q => q.eq('status', 'sent')),
    safeCount(ctx.admin, 'outreach_sends', q => q.gte('sent_at', since24h)),
    safeCount(ctx.admin, 'ai_task_log', q => q.eq('status', 'error').gte('created_at', since24h)),
    safeCount(ctx.admin, 'security_events', q => q.gte('created_at', since24h)),
  ])

  const { data: recentOutreach } = await ctx.admin
    .from('outreach_queue')
    .select('predictive_needs,promo_plan,social_plan,review_strategy')
    .order('created_at', { ascending: false })
    .limit(25)

  const topNeeds = (recentOutreach || [])
    .flatMap((row: any) => {
      const needs = row.predictive_needs?.likely_next_needs || row.predictive_needs?.needs || []
      if (Array.isArray(needs)) return needs.map((need: any) => typeof need === 'string' ? need : need?.need || need?.label || '').filter(Boolean)
      return []
    })
    .slice(0, 12)

  const snapshot = { pendingApprovals, approvedOutreach, sentOutreach, sends24h, aiErrors24h, security24h, topNeeds }
  const recommendations = decideCosaMarketingChannels(snapshot)

  return NextResponse.json({
    ok: true,
    snapshot,
    recommendations,
    operatingRule: 'COSA chooses the marketing channel from signals. Humans approve medium/high-risk execution before publishing, sending, or spending.',
  })
}
