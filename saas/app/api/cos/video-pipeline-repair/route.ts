import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VIDEO_CHANNELS = ['youtube', 'short_video']
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'

function db() {
  const url = process.env[['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')]!
  const key = process.env[['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')]!
  return createClient(url, key, { auth: { persistSession: false } })
}

function keys(obj: any): string[] {
  return obj && typeof obj === 'object' ? Object.keys(obj) : []
}

function langs(campaign: any): string[] {
  const list = Array.isArray(campaign?.languages) ? campaign.languages.filter(Boolean).map(String) : []
  return list.length ? list : ['en']
}

function videoText(campaign: any): string {
  return [campaign?.title, campaign?.objective, campaign?.audience, campaign?.channel, JSON.stringify(campaign?.metadata || {})].filter(Boolean).join(' ').toLowerCase()
}

function isVideoCampaign(campaign: any): boolean {
  if (VIDEO_CHANNELS.includes(String(campaign?.channel || ''))) return true
  const text = videoText(campaign)
  return /\b(video|vídeo|clip|youtube|filme|movie|wideo|видео)\b/i.test(text)
}

function isFakeFinal(video: any): boolean {
  return video?.brandDebug?.mode === 'direct-completion' || video?.brandText?.mode === 'direct-completion' || video?.brandDispatchWatchdog?.directCompletion === true
}

function baseUrl(video: any): string {
  return String(video?.url || video?.baseUrl || video?.previewUrl || video?.voicedUrl || '').trim()
}

function needsRepair(campaign: any): boolean {
  const video = campaign?.metadata?.video
  if (!video || video.status !== 'ready') return false
  if (campaign?.status === 'rejected') return false
  if (video.branded === true && video.voicedUrl && !isFakeFinal(video)) return false
  const source = baseUrl(video)
  const primary = langs(campaign)[0]
  const unbranded = video.unbrandedVoiced || {}
  const branded = video.brandedLangs || {}
  if (source && !unbranded[primary] && !branded[primary]) return true
  if (keys(unbranded).length && (video.brandingExhausted === true || video.brandingLock || Object.keys(video.ghOverlayAttempts || {}).length || isFakeFinal(video))) return true
  return false
}

async function repairOne(sb: any, campaign: any) {
  const video = campaign.metadata.video || {}
  const primary = langs(campaign)[0]
  const source = baseUrl(video)
  const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
  const reasons: string[] = []

  if (source && !unbrandedVoiced[primary]) {
    unbrandedVoiced[primary] = source
    reasons.push('base video promoted to unbranded voiced draft')
  }
  if (video.brandingExhausted === true || video.brandingLock || Object.keys(video.ghOverlayAttempts || {}).length || isFakeFinal(video)) {
    reasons.push('old branding state cleared')
  }

  const nextVideo = {
    ...video,
    status: 'ready',
    unbrandedVoiced,
    voicedUrl: null,
    voiced: {},
    branded: false,
    brandedLangs: {},
    brandingExhausted: false,
    brandingLock: null,
    ghOverlayAttempts: {},
    brandAttempts: {},
    brandDebug: null,
    brandSchemaVersion: null,
    brandText: null,
    brandedAt: null,
    voiceLock: null,
    voiceError: null,
    repairRouteAt: new Date().toISOString(),
    repairRouteReasons: reasons,
  }

  const { error } = await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: nextVideo } }).eq('id', campaign.id)
  return { id: campaign.id, ok: !error, error: error?.message || null, reasons }
}

export async function GET() {
  const access = await getAccess()
  if (!access.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const sb = db()
  const { data, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .gte('created_at', BACKLOG_CUTOFF)
    .neq('status', 'rejected')
    .filter('metadata->video->>status', 'eq', 'ready')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const candidates = (data || []).filter((campaign: any) => isVideoCampaign(campaign) && needsRepair(campaign)).slice(0, 20)
  const repaired = []
  for (const campaign of candidates) repaired.push(await repairOne(sb, campaign))

  return NextResponse.json({ ok: true, checked: data?.length || 0, repairedCount: repaired.length, repaired, nextStep: 'Open /dashboard/cosa/video-pipeline and click Kick branding worker.' })
}
