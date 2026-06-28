import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildDefaultMarketingRecommendation, buildRecommendation } from '@/lib/cos/recommendation/engine'
import { campaignFromRecommendation } from '@/lib/cos/recommendation/campaign'
import type { CosSignal } from '@/lib/cos/recommendation/types'

export const dynamic = 'force-dynamic'

function signalFromMetrics(metrics: Record<string, any>): CosSignal[] {
  const signals: CosSignal[] = []

  if ((metrics.pending || 0) > 0) {
    signals.push({
      source: 'adm_outreach',
      metric: 'pending_approvals',
      value: metrics.pending,
      confidence: 80,
      evidence: ['There is work waiting for owner approval.'],
      observed_at: new Date().toISOString(),
    })
  }

  if ((metrics.sent || 0) < 10) {
    signals.push({
      source: 'adm_outreach',
      metric: 'growth_activity_low',
      value: metrics.sent || 0,
      change: 15,
      confidence: 65,
      evidence: ['Outbound activity is low, so educational content can create reusable demand.'],
      observed_at: new Date().toISOString(),
    })
  }

  return signals
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pendingResult, approvedResult, sentResult, sendsResult] = await Promise.all([
    ctx.admin.from('outreach_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ctx.admin.from('outreach_queue').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    ctx.admin.from('outreach_queue').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    ctx.admin.from('outreach_sends').select('id', { count: 'exact', head: true }).gte('sent_at', since),
  ])

  const metrics = {
    pending: pendingResult.count || 0,
    approved: approvedResult.count || 0,
    sent: sentResult.count || 0,
    sends24h: sendsResult.count || 0,
  }

  const signals = signalFromMetrics(metrics)
  const recommendation = signals.length
    ? buildRecommendation({ department: 'marketing', signals, summary: 'COSA found a growth action that should be prepared as a campaign and reviewed by the owner.' })
    : buildDefaultMarketingRecommendation()
  const campaign = campaignFromRecommendation(recommendation)

  return NextResponse.json({ ok: true, metrics, recommendations: [recommendation], campaigns: [campaign] })
}
