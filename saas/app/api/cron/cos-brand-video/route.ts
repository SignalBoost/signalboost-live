// saas/app/api/cron/cos-brand-video/route.ts
// Autonomous branded-video finisher. No button, no click.
//
// The moment a campaign video render is 'ready' (set by cos-video-poll), this
// cron produces the FINAL branded video for each language — b-roll looped to
// ~60s + ElevenLabs voiceover + auto captions + burned-in "SignalBoostAi" and
// "www.saas.signalboostapp.com" — via JSON2Video, and stores the result.
//
// Design:
//  - Processes ONE (campaign, language) unit per invocation so a single ~4-min
//    JSON2Video render always fits inside the 300s budget.
//  - A short per-campaign lock (brandingLock) prevents overlapping cron runs
//    from double-rendering the same unit and wasting credits.
//  - voiced{} accumulates all 5 languages; voicedUrl mirrors the primary (en)
//    so the existing card shows the branded video with zero UI changes.
//  - Gives up on a language after 2 failed attempts (records the error) so a
//    persistently failing unit can't loop forever.
//
// CRON_SECRET-gated, same as the other crons.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderBrandedVideo } from '@/lib/cos/video-compose'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LANGS = ['en', 'es', 'pt', 'pl', 'ru']
const LOCK_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 2

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
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

  const nowMs = Date.now()

  for (const campaign of ready || []) {
    const v = (campaign.metadata && campaign.metadata.video) || {}
    if (!v.url) continue

    // Skip a campaign that another run is actively branding (fresh lock).
    const lock = v.brandingLock
    if (lock && lock.at && nowMs - Date.parse(lock.at) < LOCK_MS) continue

    const voiced = v.voiced || {}
    const attempts = v.brandAttempts || {}
    const aspect: '9:16' | '16:9' =
      v.aspect === '9:16' || v.aspect === '16:9'
        ? v.aspect
        : campaign.channel === 'short_video' ? '9:16' : '16:9'

    // Find the next language that still needs branding.
    const lang = LANGS.find((l) => !voiced[l] && (attempts[l] || 0) < MAX_ATTEMPTS)
    if (!lang) continue // this campaign is fully branded (or exhausted) — next campaign

    const nowIso = new Date().toISOString()

    // Take the lock, then render.
    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: { lang, at: nowIso } } },
    }).eq('id', campaign.id)

    const r = await renderBrandedVideo({ campaign, brollUrl: v.url, aspect, lang })
    const doneIso = new Date().toISOString()

    if (r.ok && r.url) {
      const newVoiced = { ...voiced, [lang]: r.url }
      const patch: any = { ...v, voiced: newVoiced, branded: true, brandSchemaVersion: BRAND_SCHEMA_VERSION, brandText: BRAND_TEXT, brandingLock: null, voiceError: null, brandedAt: doneIso }
      if (lang === 'en' || !v.voicedUrl) patch.voicedUrl = r.url
      await sb.from('cos_campaign_queue').update({
        metadata: { ...(campaign.metadata || {}), video: patch },
      }).eq('id', campaign.id)
      return NextResponse.json({ ok: true, campaign: campaign.id, lang, url: r.url })
    }

    // Failure: record attempt + error, release lock.
    const newAttempts = { ...attempts, [lang]: (attempts[lang] || 0) + 1 }
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...(campaign.metadata || {}),
        video: { ...v, branded: false, brandSchemaVersion: v.brandSchemaVersion || null, brandAttempts: newAttempts, brandingLock: null, voiceError: `branded compose failed: [${lang}] ${r.error || 'branded compose failed'}` },
      },
    }).eq('id', campaign.id)
    return NextResponse.json({ ok: false, campaign: campaign.id, lang, error: r.error || 'branded compose failed' })
  }

  return NextResponse.json({ ok: true, idle: true })
}
