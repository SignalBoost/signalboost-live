import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const VIDEO_CHANNELS = ['youtube', 'short_video']
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const LIMIT = 3

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function campaignLangs(campaign: any): string[] {
  const langs = Array.isArray(campaign.languages) ? campaign.languages.filter(Boolean) : []
  return langs.length ? langs : ['en']
}

function needsVoice(campaign: any) {
  const video = campaign?.metadata?.video || null
  if (!video || video.status !== 'ready' || !video.url) return false
  if (campaign.status === 'rejected') return false
  const createdAt = campaign.created_at ? Date.parse(campaign.created_at) : 0
  if (!createdAt || createdAt < Date.parse(BACKLOG_CUTOFF)) return false
  const brandedLangs = video.brandedLangs || {}
  const unbranded = video.unbrandedVoiced || {}
  return campaignLangs(campaign).some((lang) => !brandedLangs[lang] && !unbranded[lang])
}

async function runVoice(sb: any, campaign: any) {
  const video = campaign?.metadata?.video || {}
  const langs = campaignLangs(campaign)
  const brandedLangs = video.brandedLangs || {}
  const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
  const lang = langs.find((item) => !brandedLangs[item] && !unbrandedVoiced[item]) || langs[0]
  const voice = await addVoiceToCampaignVideo(campaign, lang)
  if (!voice.ok || !voice.url) {
    const patch = { ...video, voiceLock: null, voiceError: `manual voice dispatch failed: ${voice.error || 'unknown'}` }
    await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
    return { id: campaign.id, ok: false, lang, error: patch.voiceError }
  }
  unbrandedVoiced[lang] = String(voice.url)
  const patch = {
    ...video,
    status: 'ready',
    unbrandedVoiced,
    voiceLock: null,
    voiceStatus: voice.fallback ? 'COMPLETED_FALLBACK' : 'COMPLETED',
    voiceFallback: Boolean(voice.fallback),
    voiceError: voice.fallback ? (voice.fallbackReason || 'COMPLETED_FALLBACK: fallback voice/video artifact created.') : null,
  }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
  return { id: campaign.id, ok: true, lang, fallback: Boolean(voice.fallback) }
}

async function handle(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })
  const sb = admin()
  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '').trim()
  let query = sb.from('cos_campaign_queue').select('*').in('channel', VIDEO_CHANNELS).neq('status', 'rejected').gte('created_at', BACKLOG_CUTOFF).order('created_at', { ascending: false }).limit(LIMIT)
  if (id) query = sb.from('cos_campaign_queue').select('*').eq('id', id).limit(1)
  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const candidates = (data || []).filter(needsVoice)
  const results = []
  for (const campaign of candidates) results.push(await runVoice(sb, campaign))
  return NextResponse.json({ ok: true, scanned: data?.length || 0, processed: results.length, results })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
