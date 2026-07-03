// saas/app/api/cron/cos-brand-video/route.ts
// VOICE-ONLY stage. Produces the voiced + captioned (still UNBRANDED) video
// per language and stores it in metadata.video.unbrandedVoiced[lang]. That is
// its entire job.
//
// THE MANDATORY BRAND BANNER (SignalBoostAi + www.saas.signalboostapp.com,
// burned into the pixels) is applied by the FINAL COMPOSITION STEP: the free
// FFmpeg worker on GitHub Actions (scripts/brand-overlay-worker.mjs). Only
// that worker writes voiced[lang] / brandedLangs[lang] / voicedUrl.
//
// HARD RULE ENFORCED HERE: voicedUrl NEVER carries an unbranded URL. Until
// the banner is burned in, voicedUrl stays null (or keeps a previously
// branded URL). Unbranded intermediates live ONLY in unbrandedVoiced, which
// nothing displays or publishes.
//
// This cron NEVER touches metadata.video.brandingLock — that lock belongs to
// the GitHub Actions worker. Voice work uses its own voiceLock key.
//
// GUARD 1 (backlog cutoff): only campaigns created after COS_BRAND_SINCE
// (default 2026-07-02T12:00:00Z) are processed. Override with the
// COS_BRAND_SINCE env var in Vercel to reach older campaigns.
// GUARD 2 (billing-aware attempts): an ElevenLabs quota error does not
// consume a voice attempt; work resumes automatically after top-up.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_LANGS = ['en']
const VOICE_LOCK_MS = 5 * 60 * 1000
const MAX_VOICE_ATTEMPTS = 3
const TIME_BUDGET_MS = 260_000
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'

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
  return m.includes('quota') || m.includes('insufficient credit') || m.includes('upgrade your plan') || m.includes('character limit')
}

async function processCampaign(
  sb: any,
  campaign: any
): Promise<{ status: 'voiced' | 'progressed' | 'exhausted' | 'skipped' | 'billing_blocked'; lang?: string; error?: string }> {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  if (!v.url) return { status: 'skipped' } // Kling render not done yet
  if (v.status !== 'ready') return { status: 'skipped' }

  // GUARD 1: backlog stays out of scope.
  const createdAt = campaign.created_at ? Date.parse(campaign.created_at) : 0
  if (!createdAt || createdAt < Date.parse(BACKLOG_CUTOFF)) return { status: 'skipped' }

  const langs = campaignLangs(campaign)
  const primary = langs[0]
  const brandedLangs: Record<string, boolean> = v.brandedLangs || {}
  const unbrandedVoiced: Record<string, string> = { ...(v.unbrandedVoiced || {}) }

  // Legacy migration: an old primary voiced-but-unbranded URL.
  if (!unbrandedVoiced[primary] && !brandedLangs[primary] && v.unbrandedVoicedUrl) {
    unbrandedVoiced[primary] = String(v.unbrandedVoicedUrl)
  }

  const attempts: Record<string, number> = v.voiceAttempts || {}
  const needsVoice = langs.filter((l) => !brandedLangs[l] && !unbrandedVoiced[l])
  if (!needsVoice.length) return { status: 'skipped' } // voice done; the banner worker owns the rest

  // Our own lock — NEVER brandingLock (that belongs to the GH FFmpeg worker).
  const nowMs = Date.now()
  const lock = v.voiceLock
  if (lock && lock.at && nowMs - Date.parse(lock.at) < VOICE_LOCK_MS) return { status: 'skipped' }

  const eligibleLang = needsVoice.find((l) => (attempts[l] || 0) < MAX_VOICE_ATTEMPTS)
  if (!eligibleLang) {
    const exhaustedError = `Voice attempts exhausted (${MAX_VOICE_ATTEMPTS}/lang): ${JSON.stringify(attempts)}. Banner-burning of already-voiced languages continues on GitHub Actions.`
    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, unbrandedVoiced, voiceLock: null, voiceError: exhaustedError } },
    }).eq('id', campaign.id)
    return { status: 'exhausted', error: exhaustedError }
  }

  const lang = eligibleLang
  await sb.from('cos_campaign_queue').update({
    metadata: { ...(campaign.metadata || {}), video: { ...v, voiceLock: { lang, at: new Date().toISOString() } } },
  }).eq('id', campaign.id)

  const voice = await addVoiceToCampaignVideo(campaign, lang)
  const ok = voice.ok && !!voice.url
  const billingBlocked = !ok && isBillingQuotaError(voice.error || '')

  // GUARD 2: billing failures don't consume attempts.
  const newAttempts: Record<string, number> = ok || billingBlocked ? attempts : { ...attempts, [lang]: (attempts[lang] || 0) + 1 }
  if (ok) unbrandedVoiced[lang] = String(voice.url)

  // BANNER GUARANTEE: voicedUrl is BRANDED-ONLY. If the primary language has
  // a banner-burned URL (written by the GH worker into voiced[primary]), keep
  // it; otherwise voicedUrl is null and nothing plays or publishes.
  const voiced: Record<string, string> = v.voiced || {}
  const brandedPrimaryUrl = brandedLangs[primary] ? (voiced[primary] || (v.branded === true ? v.voicedUrl : null)) : null

  const patch: any = {
    ...v,
    status: 'ready',
    unbrandedVoiced,
    voicedUrl: brandedPrimaryUrl || null,
    voiceAttempts: newAttempts,
    voiceLock: null,
    voiceError: ok
      ? null
      : billingBlocked
        ? `ElevenLabs quota exhausted — voicing paused, no attempts consumed. Resumes automatically after quota reset/top-up.`
        : `voice compose error: [${lang}] ${voice.error || 'unknown'} (attempt ${newAttempts[lang] || 0}/${MAX_VOICE_ATTEMPTS} — will retry)`,
  }
  await sb.from('cos_campaign_queue').update({
    metadata: { ...(campaign.metadata || {}), video: patch },
  }).eq('id', campaign.id)

  return { status: ok ? 'voiced' : billingBlocked ? 'billing_blocked' : 'progressed', lang, error: ok ? undefined : patch.voiceError }
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
  let voiced = 0
  let progressed = 0
  let exhausted = 0
  let skipped = 0
  let billingBlocked = 0

  for (const campaign of ready || []) {
    if (Date.now() - startMs > TIME_BUDGET_MS) break
    const r = await processCampaign(sb, campaign)
    if (r.status === 'voiced') voiced++
    else if (r.status === 'progressed') progressed++
    else if (r.status === 'exhausted') exhausted++
    else if (r.status === 'billing_blocked') billingBlocked++
    else skipped++
    if (r.status !== 'skipped') results.push({ campaign: campaign.id, ...r })
  }

  return NextResponse.json({ ok: true, mode: 'voice-only (banner burned by GitHub Actions FFmpeg worker)', voiced, progressed, exhausted, skipped, billingBlocked, results })
}
