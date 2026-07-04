// saas/app/api/cron/cos-final-video-compose/route.ts
// Final scheduled COSA video composer.
// Picks up campaigns with unbranded voiced/captioned video and renders the final
// JSON2Video template with SignalBoostAi + www.saas.signalboostapp.com.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from '@/lib/cos/brand-schema'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const LOCK_MS = 5 * 60 * 1000
const MAX_PER_RUN = 3

function db() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function pickJob(campaign: any) {
  const video = campaign?.metadata?.video || {}
  if (video.status !== 'ready') return null
  if (video.branded === true && video.voicedUrl) return null
  const unbranded = video.unbrandedVoiced || {}
  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : ['en']
  const brandedLangs = video.brandedLangs || {}
  for (const lang of langs) {
    if (brandedLangs[lang]) continue
    if (unbranded[lang]) return { lang, sourceUrl: String(unbranded[lang]), primary: langs[0] }
  }
  return null
}

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = db()
  const { data: campaigns, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .gte('created_at', BACKLOG_CUTOFF)
    .filter('metadata->video->>status', 'eq', 'ready')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: any[] = []
  let finalized = 0
  let skipped = 0
  let failed = 0

  for (const campaign of campaigns || []) {
    if (finalized >= MAX_PER_RUN) break
    const video = campaign.metadata?.video || {}
    const lock = video.finalComposeLock
    if (lock?.at && Date.now() - Date.parse(lock.at) < LOCK_MS) { skipped++; continue }

    const job = pickJob(campaign)
    if (!job) { skipped++; continue }

    const aspect: '16:9' | '9:16' = video.aspect === '9:16' || video.aspect === '16:9'
      ? video.aspect
      : (campaign.channel === 'short_video' ? '9:16' : '16:9')

    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: { ...video, finalComposeLock: { lang: job.lang, at: new Date().toISOString() } } },
    }).eq('id', campaign.id)

    const composed = await renderBrandOverlayVideo({ campaign, sourceUrl: job.sourceUrl, aspect, lang: job.lang })
    const current = { ...(video || {}) }
    const unbrandedVoiced = { ...(current.unbrandedVoiced || {}) }
    const brandedLangs = { ...(current.brandedLangs || {}) }
    const voiced = { ...(current.voiced || {}) }

    if (composed.ok && composed.url) {
      delete unbrandedVoiced[job.lang]
      brandedLangs[job.lang] = true
      voiced[job.lang] = composed.url
      const isPrimary = job.lang === job.primary
      const patched = {
        ...current,
        status: 'ready',
        voiced,
        brandedLangs,
        unbrandedVoiced,
        voicedUrl: isPrimary ? composed.url : (current.voicedUrl || composed.url),
        branded: Boolean(brandedLangs[job.primary]),
        brandSchemaVersion: brandedLangs[job.primary] ? BRAND_SCHEMA_VERSION : current.brandSchemaVersion || null,
        brandText: brandedLangs[job.primary] ? BRAND_TEXT : current.brandText || null,
        brandedAt: brandedLangs[job.primary] ? (current.brandedAt || new Date().toISOString()) : current.brandedAt || null,
        finalComposeLock: null,
        voiceError: null,
        brandDebug: composed.debug || null,
      }
      await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patched } }).eq('id', campaign.id)
      finalized++
      results.push({ campaign: campaign.id, title: campaign.title, lang: job.lang, ok: true, url: composed.url })
    } else {
      const attempts = { ...(current.finalComposeAttempts || {}), [job.lang]: ((current.finalComposeAttempts || {})[job.lang] || 0) + 1 }
      await sb.from('cos_campaign_queue').update({
        metadata: { ...(campaign.metadata || {}), video: { ...current, finalComposeAttempts: attempts, finalComposeLock: null, voiceError: `final compose error: [${job.lang}] ${composed.error || 'unknown'}` } },
      }).eq('id', campaign.id)
      failed++
      results.push({ campaign: campaign.id, title: campaign.title, lang: job.lang, ok: false, error: composed.error || 'unknown' })
    }
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, finalized, skipped, failed, results })
}
