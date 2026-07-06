import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const VIDEO_CHANNELS = ['youtube', 'short_video']
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const LIMIT = 50
const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function campaignLangs(campaign: any): string[] {
  const langs = Array.isArray(campaign.languages) ? campaign.languages.filter(Boolean) : []
  return langs.length ? langs : ['en']
}

function needsBrand(campaign: any) {
  const video = campaign?.metadata?.video || null
  if (!video || video.status !== 'ready') return false
  if (campaign.status === 'rejected') return false
  if (video.branded === true && video.voicedUrl) return false
  const unbranded = video.unbrandedVoiced || {}
  return Object.keys(unbranded).some((lang) => Boolean(unbranded[lang]))
}

function voiceSkipReason(campaign: any): string | null {
  const video = campaign?.metadata?.video || null
  if (campaign.status === 'rejected') return 'campaign rejected'
  if (!video) return 'no video metadata'
  if (video.status !== 'ready') return `video status is ${String(video.status || 'missing')}`
  if (!video.url) return 'base video url missing'
  const createdAt = campaign.created_at ? Date.parse(campaign.created_at) : 0
  if (!createdAt || createdAt < Date.parse(BACKLOG_CUTOFF)) return 'before COS_BRAND_SINCE cutoff'
  const brandedLangs = video.brandedLangs || {}
  const unbranded = video.unbrandedVoiced || {}
  const missing = campaignLangs(campaign).filter((lang) => !brandedLangs[lang] && !unbranded[lang])
  if (!missing.length) return needsBrand(campaign) ? 'voice done; branding needed' : 'all campaign languages already have branded or unbranded voice artifact'
  return null
}

function needsVoice(campaign: any) {
  return voiceSkipReason(campaign) === null
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
  const patch = { ...video, status: 'ready', unbrandedVoiced, voiceLock: null, voiceStatus: voice.fallback ? 'COMPLETED_FALLBACK' : 'COMPLETED', voiceFallback: Boolean(voice.fallback), voiceError: voice.fallback ? (voice.fallbackReason || 'COMPLETED_FALLBACK: fallback voice/video artifact created.') : null }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
  campaign.metadata = { ...(campaign.metadata || {}), video: patch }
  return { id: campaign.id, ok: true, lang, fallback: Boolean(voice.fallback) }
}

async function dispatchBrand() {
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) return { ok: false, error: 'missing GitHub Actions token' }
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
    cache: 'no-store',
  })
  if (res.status === 204) return { ok: true, status: res.status }
  return { ok: false, status: res.status, error: (await res.text()).slice(0, 700) }
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
  const rows = data || []
  const candidates = rows.filter(needsVoice).slice(0, 5)
  const results = []
  for (const campaign of candidates) results.push(await runVoice(sb, campaign))
  const brandCandidates = rows.filter(needsBrand)
  const brandDispatch = brandCandidates.length ? await dispatchBrand() : { ok: true, skipped: true, reason: 'no branding candidates found' }
  const skipped = rows.slice(0, 20).filter((row: any) => !needsVoice(row)).map((row: any) => ({ id: row.id, status: row.status, title: String(row.title || '').slice(0, 60), reason: voiceSkipReason(row) }))
  return NextResponse.json({ ok: true, scanned: rows.length, processed: results.length, results, brandCandidates: brandCandidates.length, brandDispatch, skipped })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
