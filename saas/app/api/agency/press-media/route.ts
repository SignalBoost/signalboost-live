// saas/app/api/agency/press-media/route.ts
// Press & Media portable — live surface. Calls the host engine (saas/press-media-host).
// ADDITIVE: does not touch the existing /api/agency/press-dispatch flow.
//
// GET  → provider cockpit data: the five adapter types with live/coming status read from the
//        registry, a summary, and recent press_campaigns (so the UI mirrors the social cockpit).
// POST → actions:
//        (default) run  → generate + validate + cost + SPEND GATE + queue (owner-gated auto-dispatch)
//        dispatch        → OWNER-ONLY: send an approved campaign through its provider adapter
//        record_url      → OWNER-ONLY: record the REAL published link (resolves the maybe-URL proof)
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { ownerOverrideIsValid, getPressAdminClient } from '@/lib/agency/pressOutreach'
import { getPressMediaHost } from '@/press-media-host'
import { getAdminSupabase } from '@/utils/supabase/server'
import type { CampaignBrief, MediaTarget, MediaTargetType } from '@/press-media-core'

export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 4
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

// The five adapter TYPES from the design doc (§4). Display metadata for the cockpit; the
// registry decides which are actually live. When an adapter is registered, its card flips
// to live automatically — no change here.
const ROADMAP = [
  { id: 'free_submission', label: 'Free editor submission', type: 'free_submission', cost: 'free', proof: 'maybe_url', needs: ['editor email or submit form'], blurb: 'Submit AI-written releases to verified editors and free / trade press. Zero cost; the editor decides if and when it runs.' },
  { id: 'pr_wire', label: 'PR wire distribution', type: 'pr_wire', cost: 'per release', proof: 'distribution report', needs: ['API key'], blurb: 'Business Wire, PR Newswire, GlobeNewswire, EIN Presswire. Guaranteed distribution with a report back — billed per release on your own provider account.' },
  { id: 'media_database', label: 'Media database', type: 'media_database', cost: 'subscription', proof: 'feeds target validation', needs: ['API key'], blurb: 'Cision, Muck Rack, Meltwater. Supplies verified journalist contacts that feed target validation for the other providers.' },
  { id: 'ad_platform', label: 'Ad platform', type: 'ad_platform', cost: 'budget', proof: 'real-time ad report', needs: ['OAuth', 'budget'], blurb: 'Google, LinkedIn, Meta, Taboola, Outbrain. Budgeted paid distribution with a real-time report — spend runs on your own ad account.' },
  { id: 'direct_io', label: 'Direct insertion order', type: 'direct_io', cost: 'insertion order', proof: 'tearsheet', needs: ['manual'], blurb: 'Print, IT magazines, TV, radio via a publisher or media agency. Insertion-order workflow; proof is a tearsheet or affidavit, weeks later.' },
]

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

export async function GET() {
  try {
    const host = getPressMediaHost()
    const liveIds = new Set(host.registry.ids())
    // Free is live once registered; a paid provider is "live" only once actually connected
    // (an active provider_registry row exists) — otherwise it stays "coming soon".
    const providers = await Promise.all(ROADMAP.map(async (p) => {
      const registered = liveIds.has(p.id)
      let live = registered && p.id === 'free_submission'
      if (registered && p.id !== 'free_submission' && host.ports.runner) {
        const cfg = await host.ports.runner.loadConfig(p.id).catch(() => null)
        live = Boolean(cfg?.connected)
      }
      return { ...p, live, registered }
    }))
    const live = providers.filter((p) => p.live).length

    let campaigns: any[] = []
    let campaignTotal: number | null = null
    try {
      const supabase = getPressAdminClient()
      // A 30-DRAFT RUN FILLED THIS ENTIRELY. The cap was invisible: the queue simply ended,
      // with no indication that older campaigns existed below it, so a second run pushed the
      // first out of sight and the owner had no way to know. 300 covers the largest run the
      // job path will produce (MAX_REQUESTED 40) many times over, and the count below tells
      // the UI when it is looking at a truncated list rather than the whole queue.
      const { count: totalCount } = await supabase
        .from('press_campaigns').select('id', { count: 'exact', head: true })
      campaignTotal = typeof totalCount === 'number' ? totalCount : null
      const { data } = await supabase.from('press_campaigns').select('*').order('updated_at', { ascending: false }).limit(300)
      campaigns = data || []
    } catch { /* campaigns are optional context for the cockpit */ }

    // The company profile is the fact-set the generator is allowed to state. Surfaced so the
    // owner can see at a glance whether the AI has real facts or will emit placeholders.
    let profile: any = null
    try {
      const db = getAdminSupabase()
      const { data } = await db.from('press_company_profile').select('*').limit(1)
      profile = (Array.isArray(data) ? data[0] : null) || null
    } catch { /* profile is optional context */ }

    return NextResponse.json({
      ok: true,
      providers,
      summary: { total: providers.length, live, coming: providers.length - live },
      campaigns,
      campaign_total: campaignTotal ?? campaigns.length,
      campaigns_truncated: campaignTotal != null && campaignTotal > campaigns.length,
      profile,
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'capabilities_failed' }, { status: 500 })
  }
}

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
    // OWNER-ONLY: save the company facts the generator may state.
    if (action === 'save_profile') {
      if (!ownerApproved) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
      const db = getAdminSupabase()
      const row = {
        singleton: true,
        legal_name: str(body?.legal_name) || null,
        brand_name: str(body?.brand_name) || null,
        website: str(body?.website) || null,
        products: str(body?.products) || null,
        boilerplate: str(body?.boilerplate) || null,
        spokesperson_name: str(body?.spokesperson_name) || null,
        spokesperson_title: str(body?.spokesperson_title) || null,
        approved_quote: str(body?.approved_quote) || null,
        permitted_claims: str(body?.permitted_claims) || null,
        forbidden_claims: str(body?.forbidden_claims) || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await db.from('press_company_profile').upsert(row, { onConflict: 'singleton' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // OWNER-ONLY: edit a queued draft before it is dispatched (the review step).
    if (action === 'update_copy') {
      if (!ownerApproved) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
      const campaignId = str(body?.campaign_id || body?.id)
      const copy = String(body?.copy ?? body?.content_body ?? '')
      if (!campaignId) return NextResponse.json({ ok: false, error: 'campaign_id_required' }, { status: 400 })
      const result = await host.updateCampaignCopy(campaignId, copy)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (action === 'dispatch') {
      if (!ownerApproved) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
      const campaignId = str(body?.campaign_id || body?.id)
      if (!campaignId) return NextResponse.json({ ok: false, error: 'campaign_id_required' }, { status: 400 })
      const result = await host.dispatchApprovedCampaign(campaignId)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (action === 'record_url') {
      if (!ownerApproved) return NextResponse.json({ ok: false, error: 'owner_approval_required' }, { status: 403 })
      const campaignId = str(body?.campaign_id || body?.id)
      const publishedUrl = str(body?.published_url || body?.live_url || body?.url)
      if (!campaignId || !publishedUrl) return NextResponse.json({ ok: false, error: 'campaign_id_and_url_required' }, { status: 400 })
      const result = await host.recordPublishedUrl(campaignId, publishedUrl)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (!ownerApproved && rateLimited(`press-media-run:${clientIpKey(req)}`)) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const goal = str(body?.goal || body?.objective || body?.brief)
    const manualCopy = String(body?.manual_copy ?? body?.copy ?? '').trim()
    // Manual mode is a first-class choice: with your own copy, no goal is needed and the AI is
    // never called. Otherwise a goal is required for generation.
    if (!goal && !manualCopy) return NextResponse.json({ ok: false, error: 'goal_or_copy_required' }, { status: 400 })

    const brief: CampaignBrief = {
      goal: goal || 'Owner-supplied copy',
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
      manualCopy: manualCopy || undefined,
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
