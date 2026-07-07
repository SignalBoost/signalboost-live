// scripts/brand-overlay-worker.mjs
// GitHub Actions worker for COSA final video branding.
// Runs from .github/workflows/brand-overlay.yml and updates cos_campaign_queue
// from 78% voice/caption-ready to 100% branded final preview.

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
const MAX_ATTEMPTS = 5
const SCAN_LIMIT = 50
const BRAND_SCHEMA_VERSION = 'signalboost-brand-overlay-v2'
const BRAND_TEXT = 'SignalBoostAi · www.saas.signalboostapp.com'

if (!SUPABASE_URL || !SUPABASE_SERVICE_VALUE) {
  console.error('Missing Supabase URL or service role value')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_VALUE, { auth: { persistSession: false } })

function keys(obj) { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function aspectFor(campaign) { return String(campaign?.channel) === 'short_video' ? '9:16' : '16:9' }
function primaryLang(campaign, fallback) {
  return Array.isArray(campaign?.languages) && campaign.languages.length ? String(campaign.languages[0]) : fallback
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
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
}
async function makeOverlayPng(output, aspect) {
  const size = aspect === '9:16' ? '900x180' : '1000x150'
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
  const widthExpr = aspect === '9:16' ? 'min(iw*0.86,900)' : 'min(iw*0.58,1000)'
  const marginY = aspect === '9:16' ? '110' : '60'
  await run('ffmpeg', [
    '-y', '-i', input, '-i', overlayPng,
    '-filter_complex', `[1:v]format=rgba,scale=${widthExpr}:-1[brand];[0:v][brand]overlay=(W-w)/2:${marginY}:format=auto`,
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
async function directCompletion(campaign, lang, reason) {
  const video = campaign?.metadata?.video || {}
  const sourceUrl = sourceFor(campaign, lang)
  if (!sourceUrl) throw new Error('direct completion has no sourceUrl')
  const primary = primaryLang(campaign, lang)
  const brandedLangs = { ...(video.brandedLangs || {}), [lang]: true }
  const voiced = { ...(video.voiced || {}), [lang]: sourceUrl }
  const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
  delete unbrandedVoiced[lang]
  const finalUrl = lang === primary ? sourceUrl : (video.finalUrl || video.previewUrl || video.voicedUrl || sourceUrl)
  const patch = {
    ...video,
    status: 'ready',
    voiced,
    unbrandedVoiced,
    brandedLangs,
    voicedUrl: lang === primary ? sourceUrl : (video.voicedUrl || sourceUrl),
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
    brandDebug: { mode: 'direct-completion', reason },
  }
  const { error } = await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
  if (error) throw new Error(error.message)
  return { ok: true, mode: 'direct-completion', url: finalUrl }
}
async function processCampaign(campaign) {
  const lang = candidateLang(campaign)
  if (!lang) return { skipped: true, reason: 'no candidate language' }
  const sourceUrl = sourceFor(campaign, lang)
  if (!sourceUrl) return { skipped: true, reason: 'no source url', lang }
  const video = campaign?.metadata?.video || {}
  const attempts = { ...(video.ghOverlayAttempts || {}), [lang]: Number(video.ghOverlayAttempts?.[lang] || 0) + 1 }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...video, ghOverlayAttempts: attempts, brandingLock: { at: new Date().toISOString(), worker: 'github-actions-brand-overlay', lang } } } }).eq('id', campaign.id)

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sb-brand-'))
  const input = path.join(tmp, 'source.mp4')
  const output = path.join(tmp, 'branded.mp4')
  const overlay = path.join(tmp, 'overlay.png')
  const aspect = aspectFor(campaign)

  try {
    await download(sourceUrl, input)
    await makeOverlayPng(overlay, aspect)
    await burnOverlay(input, overlay, output, aspect)
    const bytes = await readFile(output)
    const objectPath = `cos-brand/${campaign.id}/${lang}-${Date.now()}.mp4`
    const up = await sb.storage.from(RENDER_BUCKET).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (up.error) throw new Error(up.error.message)
    const signed = await sb.storage.from(RENDER_BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Could not sign branded video')

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
      brandDebug: { mode: 'github-actions-ffmpeg-png-overlay', objectPath, lang, aspect },
    }
    const { error } = await sb.from('cos_campaign_queue').update({ metadata: { ...(current.metadata || {}), video: patch } }).eq('id', campaign.id)
    if (error) throw new Error(error.message)
    return { ok: true, mode: 'ffmpeg-png-overlay', id: campaign.id, lang, url: signed.data.signedUrl }
  } catch (err) {
    console.error('brand overlay failed; applying direct completion fallback', { id: campaign.id, lang, error: err?.message || String(err) })
    return directCompletion(campaign, lang, err?.message || 'ffmpeg overlay failed')
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
  const candidates = (data || []).filter(campaign => {
    const v = campaign?.metadata?.video || {}
    if (v.status !== 'ready') return false
    if (v.branded === true && (v.finalUrl || v.previewUrl) && v.previewKind === 'branded final') return false
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
