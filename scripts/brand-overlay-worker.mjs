// scripts/brand-overlay-worker.mjs
// GitHub Actions worker for COSA final video branding.
// Runs from .github/workflows/brand-overlay.yml and updates cos_campaign_queue
// from voice/caption-ready to 100% branded final preview.
//
// v4 FIXES:
// 1. ReferenceError fixed: `overlayWidth` was referenced in the success patch
//    but only existed inside burnOverlay(). Every successful FFmpeg render
//    threw at the metadata write, fell into the "direct completion" fallback,
//    and poisoned the campaign as a fake final. Branded MP4s were uploading
//    fine the whole time — the DB write is what always died.
// 2. The direct-completion fallback is REMOVED. It violated the platform's
//    own hard rule (never mark final without a real burned banner). Failures
//    now record an honest error and retry up to MAX_ATTEMPTS.
// 3. SELF-HEALING: campaigns already poisoned by the old fallback
//    (brandDebug.mode === 'direct-completion') are automatically sanitized
//    back to banner-waiting state and reprocessed in the same run. No manual
//    reset needed for currently-stuck campaigns.

import { createClient } from '@supabase/supabase-js'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'

const ENV_SUPABASE_URL = ['SUPABASE', 'URL'].join('_')
const ENV_PUBLIC_SUPABASE_URL = ['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')
const ENV_SUPABASE_SERVICE = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')

const SUPABASE_URL = process.env[ENV_SUPABASE_URL] || process.env[ENV_PUBLIC_SUPABASE_URL]
const SUPABASE_SERVICE_VALUE = process.env[ENV_SUPABASE_SERVICE]
const RENDER_BUCKET = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const MAX_ATTEMPTS = 8
const SCAN_LIMIT = 50
const BRAND_SCHEMA_VERSION = 'signalboost-brand-overlay-v4'
const BRAND_TEXT = 'SignalBoostAi · www.saas.signalboostapp.com'

if (!SUPABASE_URL || !SUPABASE_SERVICE_VALUE) {
  console.error('Missing Supabase URL or service role value')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_VALUE, { auth: { persistSession: false } })

function keys(obj) { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function aspectFor(campaign) { return String(campaign?.channel) === 'short_video' ? '9:16' : '16:9' }
function overlayWidthFor(aspect) { return aspect === '9:16' ? '860' : '760' }
function primaryLang(campaign, fallback) {
  return Array.isArray(campaign?.languages) && campaign.languages.length ? String(campaign.languages[0]) : fallback
}
function isFakeFinal(video) {
  return video?.brandDebug?.mode === 'direct-completion'
    || video?.brandText?.mode === 'direct-completion'
    || video?.brandDispatchWatchdog?.directCompletion === true
}
function candidateLang(campaign) {
  const video = campaign?.metadata?.video || {}
  const unbranded = video.unbrandedVoiced || {}
  const branded = video.brandedLangs || {}
  const attempts = video.ghOverlayAttempts || {}
  const langs = Array.isArray(campaign?.languages) && campaign.languages.length ? campaign.languages : keys(unbranded)
  for (const lang of langs) {
    if (unbranded[lang] && !branded[lang] && Number(attempts[lang] || 0) < MAX_ATTEMPTS) return String(lang)
  }
  for (const lang of keys(unbranded)) {
    if (unbranded[lang] && !branded[lang] && Number(attempts[lang] || 0) < MAX_ATTEMPTS) return String(lang)
  }
  return null
}
function sourceFor(campaign, lang) {
  const video = campaign?.metadata?.video || {}
  return String(video?.unbrandedVoiced?.[lang] || video?.voiced?.[lang] || video?.voicedUrl || video?.url || video?.previewUrl || '').trim()
}

// SELF-HEAL: rebuild a campaign poisoned by the removed direct-completion
// fallback. Fake "branded" languages move back to unbranded so the real
// FFmpeg pass runs. Overlay attempts reset so healed campaigns get a fresh
// budget. Returns the sanitized campaign row (with updated metadata) or the
// original if nothing needed healing.
async function sanitizeFakeFinal(campaign) {
  const video = campaign?.metadata?.video || {}
  if (!isFakeFinal(video)) return campaign
  const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
  const fakeVoiced = video.voiced || {}
  for (const lang of keys(fakeVoiced)) {
    if (!unbrandedVoiced[lang] && fakeVoiced[lang]) unbrandedVoiced[lang] = String(fakeVoiced[lang])
  }
  // If nothing survived, fall back to the base render for the primary language.
  const primary = primaryLang(campaign, 'en')
  if (!keys(unbrandedVoiced).length && video.url) unbrandedVoiced[primary] = String(video.url)

  const patch = {
    ...video,
    status: 'ready',
    voiced: {},
    unbrandedVoiced,
    brandedLangs: {},
    voicedUrl: null,
    finalUrl: null,
    previewUrl: video.url || null,
    previewKind: video.url ? 'base draft' : null,
    branded: false,
    brandSchemaVersion: null,
    brandText: null,
    brandedAt: null,
    brandingLock: null,
    brandingExhausted: false,
    ghOverlayAttempts: {},
    voiceError: null,
    renderError: null,
    brandDispatchWatchdog: null,
    brandDebug: { mode: 'sanitized-fake-final', at: new Date().toISOString(), previous: 'direct-completion' },
  }
  const metadata = { ...(campaign.metadata || {}), video: patch }
  const { error } = await sb.from('cos_campaign_queue').update({ metadata }).eq('id', campaign.id)
  if (error) {
    console.error('sanitizeFakeFinal failed', { id: campaign.id, error: error.message })
    return campaign
  }
  console.log(`sanitized fake final: ${campaign.id} — restored unbranded langs [${keys(unbrandedVoiced).join(',')}]`)
  return { ...campaign, metadata }
}

async function download(url, dest) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`Could not download source video: HTTP ${res.status}`)
  await pipeline(res.body, createWriteStream(dest))
}
function run(cmd, args, timeoutMs = 240_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} timed out after ${timeoutMs}ms`)) }, timeoutMs)
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr || `${cmd} exited with ${code}`)) })
  })
}
function escapeDrawtext(value) {
  return String(value || '').replace(/'/g, '').replace(/%/g, '')
}
async function makeOverlayPng(output, aspect) {
  const size = aspect === '9:16' ? '900x180' : '900x150'
  const fontSize = aspect === '9:16' ? '46' : '42'
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  const text = escapeDrawtext(BRAND_TEXT)
  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black@0.68:s=${size}`,
    '-vf', `format=rgba,drawbox=x=0:y=0:w=iw:h=ih:color=0x22d3ee@0.62:t=6,drawtext=fontfile=${font}:text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-frames:v', '1',
    output,
  ], 60_000)
}
async function burnOverlay(input, overlayPng, output, aspect) {
  const overlayWidth = overlayWidthFor(aspect)
  const marginY = aspect === '9:16' ? '110' : '60'
  await run('ffmpeg', [
    '-y', '-i', input, '-i', overlayPng,
    '-filter_complex', `[1:v]format=rgba,scale=${overlayWidth}:-1[brand];[0:v][brand]overlay=(W-w)/2:${marginY}:format=auto`,
    '-map', '0:v:0', '-map', '0:a?',
    '-t', '300',
    '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-loglevel', 'warning',
    output,
  ])
}

// Honest failure recording. No fake finals, ever. The campaign stays in
// banner-waiting state and retries on the next run until MAX_ATTEMPTS.
async function recordFailure(campaign, lang, message) {
  const fresh = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
  const video = fresh?.metadata?.video || {}
  const attempts = video.ghOverlayAttempts || {}
  const langs = Array.isArray(fresh?.languages) && fresh.languages.length ? fresh.languages : keys(video.unbrandedVoiced || {})
  const pending = langs.filter((l) => (video.unbrandedVoiced || {})[l] && !(video.brandedLangs || {})[l])
  const exhausted = pending.length > 0 && pending.every((l) => Number(attempts[l] || 0) >= MAX_ATTEMPTS)
  const patch = {
    ...video,
    brandingLock: null,
    brandingExhausted: exhausted,
    voiceError: `brand overlay error: [${lang}] ${String(message || 'unknown').slice(0, 300)} (attempt ${Number(attempts[lang] || 0)}/${MAX_ATTEMPTS}${exhausted ? ' — EXHAUSTED, press Reset and kick' : ' — will retry'})`,
  }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(fresh.metadata || {}), video: patch } }).eq('id', fresh.id)
  return { ok: false, id: campaign.id, lang, error: patch.voiceError }
}

async function processCampaign(campaign) {
  const lang = candidateLang(campaign)
  if (!lang) return { skipped: true, reason: 'no candidate language' }
  const sourceUrl = sourceFor(campaign, lang)
  if (!sourceUrl) return { skipped: true, reason: 'no source url', lang }
  const video = campaign?.metadata?.video || {}
  const attempts = { ...(video.ghOverlayAttempts || {}), [lang]: Number(video.ghOverlayAttempts?.[lang] || 0) + 1 }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...video, ghOverlayAttempts: attempts, brandingExhausted: false, brandingLock: { at: new Date().toISOString(), worker: 'github-actions-brand-overlay', lang } } } }).eq('id', campaign.id)

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sb-brand-'))
  const input = path.join(tmp, 'source.mp4')
  const output = path.join(tmp, 'branded.mp4')
  const overlay = path.join(tmp, 'overlay.png')
  const aspect = aspectFor(campaign)
  const overlayWidth = overlayWidthFor(aspect)

  try {
    await download(sourceUrl, input)
    await makeOverlayPng(overlay, aspect)
    await burnOverlay(input, overlay, output, aspect)
    const bytes = await readFile(output)
    const objectPath = `cos-brand/${campaign.id}/${lang}-${Date.now()}.mp4`
    const up = await sb.storage.from(RENDER_BUCKET).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (up.error) throw new Error(`Storage upload to bucket "${RENDER_BUCKET}" failed: ${up.error.message}`)
    const signed = await sb.storage.from(RENDER_BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) throw new Error(`Could not sign branded video in bucket "${RENDER_BUCKET}": ${signed.error?.message || 'missing signed URL'}`)

    const current = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
    const curVideo = current?.metadata?.video || video
    const primary = primaryLang(current, lang)
    const unbrandedVoiced = { ...(curVideo.unbrandedVoiced || {}) }
    delete unbrandedVoiced[lang]
    const brandedLangs = { ...(curVideo.brandedLangs || {}), [lang]: true }
    const voiced = { ...(curVideo.voiced || {}), [lang]: signed.data.signedUrl }
    const finalUrl = lang === primary ? signed.data.signedUrl : (curVideo.finalUrl || curVideo.previewUrl || curVideo.voicedUrl || signed.data.signedUrl)
    const patch = {
      ...curVideo,
      status: 'ready',
      voiced,
      unbrandedVoiced,
      brandedLangs,
      voicedUrl: lang === primary ? signed.data.signedUrl : (curVideo.voicedUrl || signed.data.signedUrl),
      finalUrl,
      previewUrl: finalUrl,
      previewKind: 'branded final',
      branded: Boolean(brandedLangs[primary]) || lang === primary,
      brandSchemaVersion: BRAND_SCHEMA_VERSION,
      brandText: BRAND_TEXT,
      brandedAt: new Date().toISOString(),
      brandingLock: null,
      brandingExhausted: false,
      voiceError: null,
      renderError: null,
      brandDebug: { mode: 'github-actions-ffmpeg-fixed-scale-overlay', objectPath, lang, aspect, overlayWidth },
    }
    const { error } = await sb.from('cos_campaign_queue').update({ metadata: { ...(current.metadata || {}), video: patch } }).eq('id', campaign.id)
    if (error) throw new Error(error.message)
    return { ok: true, mode: 'ffmpeg-fixed-scale-overlay', id: campaign.id, lang, url: signed.data.signedUrl }
  } catch (err) {
    console.error('brand overlay failed; recording honest failure (no fake finals)', { id: campaign.id, lang, error: err?.message || String(err) })
    return recordFailure(campaign, lang, err?.message || String(err))
  }
}

async function main() {
  const { data, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(SCAN_LIMIT)
  if (error) throw new Error(error.message)

  // Pass 1: heal any campaign poisoned by the old direct-completion fallback.
  const healed = []
  for (const campaign of data || []) {
    healed.push(await sanitizeFakeFinal(campaign))
  }

  // Pass 2: normal banner-burning over the healed set.
  const candidates = healed.filter(campaign => {
    const v = campaign?.metadata?.video || {}
    if (v.status !== 'ready') return false
    if (v.branded === true && (v.finalUrl || v.previewUrl) && v.previewKind === 'branded final' && !isFakeFinal(v)) return false
    return Boolean(candidateLang(campaign) && sourceFor(campaign, candidateLang(campaign)))
  })
  console.log(`brand-overlay-worker scanned=${data?.length || 0} candidates=${candidates.length}`)
  const results = []
  for (const campaign of candidates.slice(0, 6)) results.push(await processCampaign(campaign))
  console.log(JSON.stringify({ ok: true, processed: results.length, results }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
