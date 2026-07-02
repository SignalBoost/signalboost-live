// saas/app/api/cron/cos-brand-video/route.ts
// Adds a voiceover+captions pass (video-voice.ts) then burns the persistent
// SignalBoostAi name + URL banner (video-compose.ts) onto each campaign's
// video, one language per campaign per tick.
//
// FIX (retries were dead code): on overlay failure the old version stored the
// unbranded URL into voiced[lang], and eligibility checked !voiced[lang] — so
// a language that failed once was NEVER retried, despite brandAttempts saying
// 1 of 2. Evidence: a campaign stuck at attempts {en:1} while a direct run of
// the same overlay succeeded ("rendering scenes" is a TRANSIENT JSON2Video
// error). Success is now tracked in its own map (brandedLangs); failures keep
// the paid voiced file in unbrandedVoiced[lang] so retries reuse it (no new
// TTS/compose cost — only J2V credits) and actually happen on later ticks.
//
// FIX (language scope): languages now come from campaign.languages instead of
// a hardcoded 5-language list — a single-language campaign no longer burns
// money producing four languages nobody asked for.
//
// MAX_ATTEMPTS raised to 3 for transient-vendor headroom. A campaign that
// exhausts every requested language is marked brandingExhausted with a clear
// error, visible on the dashboard, and skipped for good.

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
const TIME_BUDGET_MS = 260_000 // stay safely under maxDuration=300s

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

async function processCampaign(sb: any, campaign: any): Promise<{ status: 'branded' | 'progressed' | 'exhausted' | 'skipped'; lang?: string; error?: string }> {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  if (!v.url) return { status: 'skipped' }
  if (v.brandingExhausted === true) return { status: 'skipped' }

  const langs = campaignLangs(campaign)
  const primary = langs[0]
  const brandedLangs: Record<string, boolean> = v.brandedLangs || {}
  // Back-compat: rows written before brandedLangs existed marked overall
  // success with branded:true — honor that for the primary language.
  if (v.branded === true && !Object.keys(brandedLangs).length) brandedLangs[primary] = true
  if (langs.every((l) => brandedLangs[l])) return { status: 'skipped' } // fully done

  const nowMs = Date.now()
  const lock = v.brandingLock
  if (lock && lock.at && nowMs - Date.parse(lock.at) < LOCK_MS) return { status: 'skipped' }

  const attempts: Record<string, number> = v.brandAttempts || {}
  const aspect: '9:16' | '16:9' = v.aspect === '9:16' || v.aspect === '16:9' ? v.aspect : campaign.channel === 'short_video' ? '9:16' : '16:9'

  // Eligibility is now driven by SUCCESS (brandedLangs), not by the presence
  // of a voiced URL — so failed languages remain retryable until MAX_ATTEMPTS.
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

  // Reuse an already-paid voiced file for this language when we have one —
  // retries then cost only JSON2Video credits, never a second TTS/compose.
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

  const newVoiced: Record<string, string> = { ...(v.voiced || {}) }
  const newUnbranded: Record<string, string> = { ...unbrandedVoiced }
  const newBrandedLangs: Record<string, boolean> = { ...brandedLangs }
  const newAttempts: Record<string, number> = isBranded ? attempts : { ...attempts, [lang]: (attempts[lang] || 0) + 1 }

  if (isBranded) {
    newVoiced[lang] = String(overlay.url)
    newBrandedLangs[lang] = true
    delete newUnbranded[lang]
  } else {
    // Keep the paid voiced file for reuse on retry; do NOT mark this language
    // done — that is exactly the bug that killed retries before.
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
    voiceError: isBranded ? null : `brand overlay error: [${lang}] ${overlay.error || 'overlay error'} (attempt ${(newAttempts[lang] || 0)}/${MAX_ATTEMPTS} — will retry)`,
    brandedAt: newBrandedLangs[primary] ? (v.brandedAt || doneIso) : null,
    brandDebug: overlay.debug || null,
  }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
  return { status: isBranded ? 'branded' : 'progressed', lang, error: isBranded ? undefined : patch.voiceError }
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
    .limit(20)

  const startMs = Date.now()
  const results: any[] = []
  let branded = 0
  let progressed = 0
  let exhausted = 0
  let skipped = 0

  for (const campaign of ready || []) {
    if (Date.now() - startMs > TIME_BUDGET_MS) break
    const r = await processCampaign(sb, campaign)
    if (r.status === 'branded') branded++
    else if (r.status === 'progressed') progressed++
    else if (r.status === 'exhausted') exhausted++
    else skipped++
    if (r.status !== 'skipped') results.push({ campaign: campaign.id, ...r })
  }

  return NextResponse.json({ ok: true, branded, progressed, exhausted, skipped, results })
}
