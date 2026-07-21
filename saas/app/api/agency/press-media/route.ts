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
    try {
      const supabase = getPressAdminClient()
      const { data } = await supabase.from('press_campaigns').select('*').order('updated_at', { ascending: false }).limit(30)
      campaigns = data || []
    } catch { /* campaigns are optional context for the cockpit */ }

    return NextResponse.json({ ok: true, providers, summary: { total: providers.length, live, coming: providers.length - live }, campaigns })
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
