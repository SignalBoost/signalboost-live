// saas/app/api/cron/cos-campaign-measure/route.ts
// Post-publish performance review — the "CEO checks what actually happened"
// duty. Runs on a schedule, finds campaigns published long enough ago to have
// real numbers, and pulls REAL stats: platform performance (views/likes/
// comments via the same OAuth token already stored for publishing), REAL
// first-party click counts (from cos_campaign_clicks, logged by /api/track),
// and estimated cost (see campaign-cost.ts). Cost, traffic, and performance
// all land together on the campaign record.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { measureCampaignPerformance } from '@/lib/cos/campaign-queue/measure'
import { estimateCampaignCost } from '@/lib/cos/campaign-queue/campaign-cost'
import { getCampaignTraffic } from '@/lib/cos/campaign-queue/campaign-traffic'
import { recordMeasuredCampaignLifecycle } from '@/lib/enterprise/memory/lifecycleRecorder'
import type { SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_HOURS_BEFORE_MEASURE = Number(process.env.COS_MEASURE_DELAY_HOURS || 24)
const INTERNAL_APPROVAL_MARKER = 'cos_internal_preparation'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

function resolveTokenOwner(campaign: any, entry: any): string | null {
  if (entry?.publishedBy) return String(entry.publishedBy)
  const approvedBy = campaign?.approved_by
  if (approvedBy && approvedBy !== INTERNAL_APPROVAL_MARKER) return String(approvedBy)
  return null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = db()
  const { data: running } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .eq('status', 'running')
    .limit(20)

  const cutoff = Date.now() - MIN_HOURS_BEFORE_MEASURE * 60 * 60 * 1000
  let measured = 0
  let skipped = 0

  for (const campaign of running || []) {
    const published = (campaign.metadata && campaign.metadata.published) || {}
    const entries = Object.entries(published) as Array<[string, any]>

    if (entries.length === 0) { skipped++; continue }
    if (campaign.metadata?.performance) { skipped++; continue }

    const allOldEnough = entries.every(([, entry]) => {
      const t = entry?.publishedAt ? new Date(entry.publishedAt).getTime() : 0
      return t > 0 && t <= cutoff
    })
    if (!allOldEnough) { skipped++; continue }

    const performance: Record<string, any> = {}
    for (const [key, entry] of entries) {
      const platform = (key.includes('::') ? key.split('::')[0] : key) as SocialPlatform
      const tokenOwner = resolveTokenOwner(campaign, entry)
      if (!tokenOwner) {
        performance[key] = {
          platform,
          videoId: null,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          fetchedAt: new Date().toISOString(),
          supported: false,
          error: 'No resolvable token owner: published entry has no publishedBy and approved_by is an internal marker.',
        }
        continue
      }
      performance[key] = await measureCampaignPerformance({
        admin: sb,
        ownerUserId: tokenOwner,
        platform,
        liveUrl: entry?.result?.liveUrl || null,
      })
    }

    const traffic = await getCampaignTraffic(sb, campaign.id)
    const cost = estimateCampaignCost(campaign)
    const measuredAt = new Date().toISOString()
    const anySupported = Object.values(performance).some((m: any) => m.supported && !m.error)
    const updatedCampaign = {
      ...campaign,
      status: anySupported ? 'measured' : campaign.status,
      metadata: { ...(campaign.metadata || {}), performance, traffic, cost, measured_at: measuredAt },
    }

    await sb.from('cos_campaign_queue').update({
      status: updatedCampaign.status,
      metadata: updatedCampaign.metadata,
    }).eq('id', campaign.id)

    await recordMeasuredCampaignLifecycle(updatedCampaign, { performance, traffic, cost, measuredAt }).catch(() => null)
    measured++
  }

  return NextResponse.json({ ok: true, measured, skipped })
}
