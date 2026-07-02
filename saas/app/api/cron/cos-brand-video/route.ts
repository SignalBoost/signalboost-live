// saas/app/api/cron/cos-brand-video/route.ts
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
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
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

  const nowMs = Date.now()

  for (const campaign of ready || []) {
    const v = (campaign.metadata && campaign.metadata.video) || {}
    if (!v.url) continue

    const lock = v.brandingLock
    if (lock && lock.at && nowMs - Date.parse(lock.at) < LOCK_MS) continue

    const voiced = v.voiced || {}
    const attempts = v.brandAttempts || {}
    const aspect: '9:16' | '16:9' =
      v.aspect === '9:16' || v.aspect === '16:9'
        ? v.aspect
        : campaign.channel === 'short_video' ? '9:16' : '16:9'

    const lang = LANGS.find((l) => !voiced[l] && (attempts[l] || 0) < MAX_ATTEMPTS)
    if (!lang) continue

    const nowIso = new Date().toISOString()

    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: { lang, at: nowIso } } },
    }).eq('id', campaign.id)

    const r = await renderBrandedVideo({ campaign, brollUrl: v.url, aspect, lang })
    const doneIso = new Date().toISOString()

    if (r.ok && r.url) {
      const newVoiced = { ...voiced, [lang]: r.url }
      const patch: any = {
        ...v,
        status: 'ready',
        voiced: newVoiced,
        branded: true,
        brandSchemaVersion: BRAND_SCHEMA_VERSION,
        brandText: BRAND_TEXT,
        brandingLock: null,
        voiceError: null,
        brandedAt: doneIso,
        brandDebug: r.debug || null,
      }
      if (lang === 'en' || !v.voicedUrl) patch.voicedUrl = r.url
      await sb.from('cos_campaign_queue').update({
        metadata: { ...(campaign.metadata || {}), video: patch },
      }).eq('id', campaign.id)
      return NextResponse.json({ ok: true, campaign: campaign.id, lang, url: r.url })
    }

    const newAttempts = { ...attempts, [lang]: (attempts[lang] || 0) + 1 }
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...(campaign.metadata || {}),
        video: {
          ...v,
          status: 'brand_error',
          voicedUrl: null,
          voiced: {},
          branded: false,
          brandSchemaVersion: null,
          brandText: null,
          brandedAt: null,
          brandAttempts: newAttempts,
          brandingLock: null,
          voiceError: `branded compose error: [${lang}] ${r.error || 'compose error'}`,
          brandDebug: r.debug || null,
        },
      },
    }).eq('id', campaign.id)
    return NextResponse.json({ ok: false, campaign: campaign.id, lang, error: r.error || 'compose error', debug: r.debug || null }, { status: 502 })
  }

  return NextResponse.json({ ok: true, idle: true })
}
