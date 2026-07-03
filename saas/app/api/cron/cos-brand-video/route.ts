// saas/app/api/cron/cos-brand-video/route.ts
// VOICE-ONLY stage. This cron now does exactly one thing: produce the voiced +
// captioned (unbranded) video per language and store it in
// metadata.video.unbrandedVoiced[lang].
//
// BRANDING IS NOT DONE HERE ANYMORE. The SignalBoostAi banner is burned in by
// the free FFmpeg worker on GitHub Actions (scripts/brand-overlay-worker.mjs,
// every 10 minutes), which reads unbrandedVoiced[lang] and writes voiced[lang]
// + brandedLangs[lang]. JSON2Video is fully removed from the pipeline — no
// credits, no vendor polling, no renderBrandOverlayVideo import.
//
// CRITICALLY: this cron must NEVER touch metadata.video.brandingLock. That
// lock belongs to the GH worker; when this cron used to hold it every 2
// minutes, the GH worker (5-minute lock respect) was starved and nothing ever
// got branded. Voice work uses its own voiceLock key instead.
//
// GUARD 1 (backlog cutoff): only campaigns created after COS_BRAND_SINCE
// (default 2026-07-02T12:00:00Z) are processed, to keep the old backlog from
// burning ElevenLabs credits. To voice an older campaign, set the
// COS_BRAND_SINCE env var in Vercel to an earlier date (the GH worker reads
// the same var from its own Actions env if needed).
//
// GUARD 2 (billing-aware attempts): an ElevenLabs quota error is the
// account's fault, not the video's — it does not consume one of the 3 voice
// attempts. When the quota resets or is topped up, everything resumes.

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

  // Legacy field migration: a pre-existing primary voiced-but-unbranded URL.
  if (!unbrandedVoiced[primary] && !brandedLangs[primary] && v.unbrandedVoicedUrl) {
    unbrandedVoiced[primary] = String(v.unbrandedVoicedUrl)
  }

  // A language needs voicing if it is neither branded nor already voiced.
  const attempts: Record<string, number> = v.voiceAttempts || {}
  const needsVoice = langs.filter((l) => !brandedLangs[l] && !unbrandedVoiced[l])
  if (!needsVoice.length) return { status: 'skipped' } // voice done; GH worker owns the rest

  // Our own lock — NEVER brandingLock, which belongs to the GH FFmpeg worker.
  const nowMs = Date.now()
  const lock = v.voiceLock
  if (lock && lock.at && nowMs - Date.parse(lock.at) < VOICE_LOCK_MS) return { status: 'skipped' }

  const eligibleLang = needsVoice.find((l) => (attempts[l] || 0) < MAX_VOICE_ATTEMPTS)
  if (!eligibleLang) {
    const exhaustedError = `Voice attempts exhausted (${MAX_VOICE_ATTEMPTS}/lang): ${JSON.stringify(attempts)}. Branding of already-voiced languages continues on GitHub Actions.`
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

  // voicedUrl: what the dashboard plays. Branded primary wins; otherwise the
  // freshest unbranded primary (the GH worker overwrites this on branding).
  const voiced: Record<string, string> = v.voiced || {}
  const primaryFinal = voiced[primary] || unbrandedVoiced[primary] || v.voicedUrl || null

  const patch: any = {
    ...v,
    status: 'ready',
    unbrandedVoiced,
    voicedUrl: primaryFinal,
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

  return NextResponse.json({ ok: true, mode: 'voice-only (branding on GitHub Actions FFmpeg)', voiced, progressed, exhausted, skipped, billingBlocked, results })
}
