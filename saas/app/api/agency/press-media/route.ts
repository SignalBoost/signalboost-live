// saas/app/api/agency/press-media/route.ts
// ACTIVATION of the Press & Media portable. This is the first live surface that calls the
// host engine (saas/press-media-host). It is ADDITIVE — it does not touch the existing
// /api/agency/press-dispatch flow, so the verified press-outreach path is unchanged.
//
// Actions (POST):
//   (default) run       → generate + validate + cost + SPEND GATE + queue (owner-gated auto-dispatch)
//   dispatch            → OWNER-ONLY: send an approved campaign through its provider adapter
//   record_url          → OWNER-ONLY: record the REAL published link (resolves the maybe-URL proof)
//
// All persistence lands in the existing press_campaigns table, so GET
// /api/agency/press-dispatch already lists these campaigns for the PressOutreachStudio queue.
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { ownerOverrideIsValid } from '@/lib/agency/pressOutreach'
import { getPressMediaHost } from '@/press-media-host'
import type { CampaignBrief, MediaTarget, MediaTargetType } from '@/press-media-core'

export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 4
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function clientIpKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string) {
  const now = Date.now()
  const existing = rateBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  existing.count += 1
  if (existing.count % 50 === 0 || rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
  }
  return existing.count > RATE_MAX
}

const CORE_TARGETS = new Set<MediaTargetType>(['digital_press', 'newspaper_print', 'magazine_print', 'trade_press', 'broadcast'])
function coreTarget(value: unknown): MediaTargetType {
  const v = String(value || '').trim() as MediaTargetType
  return CORE_TARGETS.has(v) ? v : 'digital_press'
}

function str(value: unknown): string { return String(value ?? '').trim() }

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const access = await getAccess().catch(() => null)
  const ownerApproved = Boolean(access?.isOwner) || ownerOverrideIsValid(str(body?.owner_override_token))
  const action = str(body?.action) || 'run'
  const host = getPressMediaHost()

  try {
    // OWNER-ONLY: push an approved campaign through its provider adapter.
    if (action === 'dispatch') {
      if (!ownerApproved) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
      const campaignId = str(body?.campaign_id || body?.id)
      if (!campaignId) return NextResponse.json({ ok: false, error: 'campaign_id_required' }, { status: 400 })
      const result = await host.dispatchApprovedCampaign(campaignId)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    // OWNER-ONLY: record the real published link later (two-stage proof resolution).
    if (action === 'record_url') {
      if (!ownerApproved) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
      const campaignId = str(body?.campaign_id || body?.id)
      const publishedUrl = str(body?.published_url || body?.live_url || body?.url)
      if (!campaignId || !publishedUrl) return NextResponse.json({ ok: false, error: 'campaign_id_and_url_required' }, { status: 400 })
      const result = await host.recordPublishedUrl(campaignId, publishedUrl)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    // DEFAULT: run a campaign. Non-owner submissions are rate-limited and can only ever queue
    // for owner review — the engine never auto-dispatches without ownerApproved.
    if (!ownerApproved && rateLimited(`press-media-run:${clientIpKey(req)}`)) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const goal = str(body?.goal || body?.objective || body?.brief)
    if (!goal) return NextResponse.json({ ok: false, error: 'goal_required' }, { status: 400 })

    const brief: CampaignBrief = {
      goal,
      audience: str(body?.audience) || undefined,
      ctaUrl: str(body?.cta_url || body?.ctaUrl) || undefined,
      language: str(body?.language || body?.lang) || undefined,
    }
    const target: MediaTarget = {
      mediaTargetType: coreTarget(body?.media_target_type || body?.mediaTargetType),
      publicationName: str(body?.publication_name || body?.publicationName) || undefined,
      editorEmail: str(body?.editor_email || body?.editorEmail) || undefined,
      submitFormUrl: str(body?.submit_form_url || body?.submitFormUrl) || undefined,
    }

    const result = await host.runCampaign({
      providerId: str(body?.provider_id || body?.providerId) || undefined,
      brief,
      target,
      ownerApproved,
      ownerBudgetApproved: Boolean(body?.owner_budget_approved || body?.ownerBudgetApproved),
      autoDispatch: Boolean(body?.auto_dispatch || body?.autoDispatch),
      createdByRole: ownerApproved ? 'owner' : 'staff',
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'press_media_failed' }, { status: 500 })
  }
}
