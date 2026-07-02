// saas/app/api/cron/cos-brand-video/route.ts
// Voice + captions + persistent SignalBoostAi name/URL banner, one language
// per campaign per tick, with real retries (success tracked in brandedLangs).
//
// GUARD 1 (backlog cutoff): only campaigns created after COS_BRAND_SINCE
// (default 2026-07-02T12:00:00Z) are processed. Without this, enabling real
// retries re-opened ~50 stale July-1 backlog campaigns × 5 languages and
// burned the entire JSON2Video credit balance (credits = seconds rendered)
// plus ElevenLabs voice costs on languages nobody wanted. Old campaigns are
// permanently out of scope; to brand a specific old one, bump its created_at
// or use the diagnose-brand-overlay route.
//
// GUARD 2 (billing-aware attempts): a quota/credits error is the ACCOUNT's
// fault, not the video's — it no longer consumes one of the 3 attempts. So a
// credit outage can't push campaigns into brandingExhausted; when credits are
// topped up, everything in scope resumes and self-heals automatically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_LANGS = ['en']
const LOCK_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 3
const TIME_BUDGET_MS = 260_000
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'

type VoiceResult = { ok: boolean; url?: string; error?: string }

function db() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function campaignLangs(campaign: any): string[] {
  const langs = Array.isArray(campaign.languages) ? campaign.languages.filter(Boolean) : []
  return langs.length ? langs : DEFAULT_LANGS
}

function isBillingQuotaError(message: string): boolean {
  const m = String(message || '').toLowerCase()
  return m.includes('quota') || m.includes('insufficient credit') || m.includes('upgrade your plan')
}

async function processCampaign(sb: any, campaign: any): Promise<{ status: 'branded' | 'progressed' | 'exhausted' | 'skipped' | 'billing_blocked'; lang?: string; error?: string }> {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  if (!v.url) return { status: 'skipped' }
  if (v.brandingExhausted === true) return { status: 'skipped' }

  // GUARD 1: backlog stays out of scope, permanently.
  const createdAt = campaign.created_at ? Date.parse(campaign.created_at) : 0
  if (!createdAt || createdAt < Date.parse(BACKLOG_CUTOFF)) return { status: 'skipped' }

  const langs = campaignLangs(campaign)
  const primary = langs[0]
  const brandedLangs: Record<string, boolean> = v.brandedLangs || {}
  if (v.branded === true && !Object.keys(brandedLangs).length) brandedLangs[primary] = true
  if (langs.every((l) => brandedLangs[l])) return { status: 'skipped' }

  const nowMs = Date.now()
  const lock = v.brandingLock
  if (lock && lock.at && nowMs - Date.parse(lock.at) < LOCK_MS) return { status: 'skipped' }

  const attempts: Record<string, number> = v.brandAttempts || {}
  const aspect: '9:16' | '16:9' = v.aspect === '9:16' || v.aspect === '16:9' ? v.aspect : campaign.channel === 'short_video' ? '9:16' : '16:9'

  const eligibleLang = langs.find((l) => !brandedLangs[l] && (attempts[l] || 0) < MAX_ATTEMPTS)

  if (!eligibleLang) {
    const exhaustedError = `All requested languages exhausted ${MAX_ATTEMPTS} branding attempts each: ${JSON.stringify(attempts)}`
    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: null, brandingExhausted: true, voiceError: exhaustedError } },
    }).eq('id', campaign.id)
    return { status: 'exhausted', error: exhaustedError }
  }

  const lang = eligibleLang
  const nowIso = new Date().toISOString()
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: { lang, at: nowIso } } } }).eq('id', campaign.id)

  const unbrandedVoiced: Record<string, string> = v.unbrandedVoiced || {}
  const reusable = unbrandedVoiced[lang] || (lang === primary && v.unbrandedVoicedUrl ? String(v.unbrandedVoicedUrl) : null)
  const voice: VoiceResult = reusable ? { ok: true, url: reusable } : await addVoiceToCampaignVideo(campaign, lang)
  if (!voice.ok || !voice.url) {
    const newAttempts = { ...attempts, [lang]: (attempts[lang] || 0) + 1 }
    const voiceError = voice.error || 'compose error'
    await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, brandAttempts: newAttempts, brandingLock: null, voiceError: `voice compose error: [${lang}] ${voiceError}` } } }).eq('id', campaign.id)
    return { status: 'progressed', lang, error: voiceError }
  }

  const overlay = await renderBrandOverlayVideo({ campaign, sourceUrl: voice.url, aspect, lang })
  const doneIso = new Date().toISOString()
  const isBranded = overlay.ok && !!overlay.url
  const billingBlocked = !isBranded && isBillingQuotaError(overlay.error || '')

  const newVoiced: Record<string, string> = { ...(v.voiced || {}) }
  const newUnbranded: Record<string, string> = { ...unbrandedVoiced }
  const newBrandedLangs: Record<string, boolean> = { ...brandedLangs }
  // GUARD 2: billing failures don't consume attempts — the video did nothing wrong.
  const newAttempts: Record<string, number> = isBranded || billingBlocked ? attempts : { ...attempts, [lang]: (attempts[lang] || 0) + 1 }

  if (isBranded) {
    newVoiced[lang] = String(overlay.url)
    newBrandedLangs[lang] = true
    delete newUnbranded[lang]
  } else {
    newUnbranded[lang] = String(voice.url)
  }

  const primaryFinal = newVoiced[primary] || newUnbranded[primary] || v.voicedUrl || null
  const patch: any = {
    ...v,
    status: 'ready',
    voiced: newVoiced,
    voicedUrl: primaryFinal,
    branded: Boolean(newBrandedLangs[primary]),
    brandedLangs: newBrandedLangs,
    unbrandedVoiced: newUnbranded,
    brandAttempts: newAttempts,
    brandSchemaVersion: newBrandedLangs[primary] ? BRAND_SCHEMA_VERSION : null,
    brandText: newBrandedLangs[primary] ? BRAND_TEXT : null,
    brandingLock: null,
    voiceError: isBranded
      ? null
      : billingBlocked
        ? `JSON2Video credits exhausted — branding paused, no attempts consumed. Will resume automatically after top-up at json2video.com/dashboard/credits.`
        : `brand overlay error: [${lang}] ${overlay.error || 'overlay error'} (attempt ${(newAttempts[lang] || 0)}/${MAX_ATTEMPTS} — will retry)`,
    brandedAt: newBrandedLangs[primary] ? (v.brandedAt || doneIso) : null,
    brandDebug: overlay.debug || null,
  }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
  return { status: isBranded ? 'branded' : billingBlocked ? 'billing_blocked' : 'progressed', lang, error: isBranded ? undefined : patch.voiceError }
}

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = db()
  const { data: ready } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .filter('metadata->video->>status', 'eq', 'ready')
    .gte('created_at', BACKLOG_CUTOFF)
    .limit(20)

  const startMs = Date.now()
  const results: any[] = []
  let branded = 0
  let progressed = 0
  let exhausted = 0
  let skipped = 0
  let billingBlocked = 0

  for (const campaign of ready || []) {
    if (Date.now() - startMs > TIME_BUDGET_MS) break
    const r = await processCampaign(sb, campaign)
    if (r.status === 'branded') branded++
    else if (r.status === 'progressed') progressed++
    else if (r.status === 'exhausted') exhausted++
    else if (r.status === 'billing_blocked') billingBlocked++
    else skipped++
    if (r.status !== 'skipped') results.push({ campaign: campaign.id, ...r })
  }

  // If credits are exhausted, one failure is all the information there is —
  // stop hammering the vendor this tick.
  return NextResponse.json({ ok: true, branded, progressed, exhausted, skipped, billingBlocked, results })
}
