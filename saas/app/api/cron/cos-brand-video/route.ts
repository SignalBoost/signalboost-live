// saas/app/api/cron/cos-brand-video/route.ts
// Adds a voiceover+captions pass (video-voice.ts) then burns the persistent
// SignalBoostAi name + URL banner (video-compose.ts) onto each campaign's
// video, one language at a time. FIX: previously this returned after handling
// only the FIRST eligible campaign per invocation — if that one campaign kept
// failing, it silently blocked every OTHER campaign from ever getting a cron
// cycle, since the same campaign would be first in the fetch order again next
// tick. Now it loops through every fetched candidate, bounded by a time
// budget so it never runs past maxDuration. FIX 2: the old `|| 'en'` fallback
// ignored MAX_ATTEMPTS once every language had failed twice, causing an
// infinite retry loop on a single stuck campaign. Now a campaign that
// exhausts every language's attempts is marked brandingExhausted and skipped
// for good, with a clear error saved so it's visible on the dashboard instead
// of retried forever.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LANGS = ['en', 'es', 'pt', 'pl', 'ru']
const LOCK_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 2
const TIME_BUDGET_MS = 260_000 // stay safely under maxDuration=300s

type VoiceResult = { ok: boolean; url?: string; error?: string }

function db() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

async function processCampaign(sb: any, campaign: any): Promise<{ status: 'branded' | 'progressed' | 'exhausted' | 'skipped'; lang?: string; error?: string }> {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  if (!v.url) return { status: 'skipped' }
  if (v.branded === true && v.voicedUrl) return { status: 'skipped' }
  if (v.brandingExhausted === true) return { status: 'skipped' }

  const nowMs = Date.now()
  const lock = v.brandingLock
  if (lock && lock.at && nowMs - Date.parse(lock.at) < LOCK_MS) return { status: 'skipped' }

  const voiced = v.voiced || {}
  const attempts = v.brandAttempts || {}
  const aspect: '9:16' | '16:9' = v.aspect === '9:16' || v.aspect === '16:9' ? v.aspect : campaign.channel === 'short_video' ? '9:16' : '16:9'
  const eligibleLang = LANGS.find((l) => !voiced[l] && (attempts[l] || 0) < MAX_ATTEMPTS)

  // Every language has either succeeded or exhausted its attempts, and we're
  // still not branded — give up on this campaign for good instead of looping
  // forever on a fallback language whose attempts are already maxed out.
  if (!eligibleLang) {
    const exhaustedError = `All languages exhausted ${MAX_ATTEMPTS} branding attempts each: ${JSON.stringify(attempts)}`
    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: null, brandingExhausted: true, voiceError: exhaustedError } },
    }).eq('id', campaign.id)
    return { status: 'exhausted', error: exhaustedError }
  }

  const lang = eligibleLang
  const nowIso = new Date().toISOString()
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: { lang, at: nowIso } } } }).eq('id', campaign.id)

  const sourceUrl = v.unbrandedVoicedUrl || v.voicedUrl || null
  const voice: VoiceResult = sourceUrl ? { ok: true, url: String(sourceUrl) } : await addVoiceToCampaignVideo(campaign, lang)
  if (!voice.ok || !voice.url) {
    const newAttempts = { ...attempts, [lang]: (attempts[lang] || 0) + 1 }
    const voiceError = voice.error || 'compose error'
    await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, brandAttempts: newAttempts, brandingLock: null, voiceError: `voice compose error: [${lang}] ${voiceError}` } } }).eq('id', campaign.id)
    return { status: 'progressed', lang, error: voiceError }
  }

  const overlay = await renderBrandOverlayVideo({ campaign, sourceUrl: voice.url, aspect, lang })
  const doneIso = new Date().toISOString()
  const finalUrl = overlay.ok && overlay.url ? overlay.url : voice.url
  const isBranded = overlay.ok && !!overlay.url
  const newVoiced = { ...voiced, [lang]: finalUrl }
  const newAttempts = isBranded ? attempts : { ...attempts, [lang]: (attempts[lang] || 0) + 1 }
  const patch: any = {
    ...v,
    status: 'ready',
    voiced: newVoiced,
    voicedUrl: finalUrl,
    branded: isBranded,
    brandAttempts: newAttempts,
    brandSchemaVersion: isBranded ? BRAND_SCHEMA_VERSION : null,
    brandText: isBranded ? BRAND_TEXT : null,
    brandingLock: null,
    voiceError: isBranded ? null : `brand overlay error: [${lang}] ${overlay.error || 'overlay error'}`,
    brandedAt: isBranded ? doneIso : null,
    brandDebug: overlay.debug || null,
    unbrandedVoicedUrl: isBranded ? null : voice.url,
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
