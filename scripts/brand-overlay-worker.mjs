#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const VIDEO_CHANNELS = ['youtube', 'short_video']
const MAX_ATTEMPTS = 5
const MAX_PER_RUN = Number(process.env.COS_BRAND_MAX_PER_RUN || 3)
const RENDER_BUCKET = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
const BRAND_SCHEMA_VERSION = 7
const BRAND_TEXT = { name: 'SignalBoostAi', url: 'www.saas.signalboostapp.com' }

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}
function bannerAssetPath() { return process.env.COS_BRAND_BANNER_PATH || path.join(process.cwd(), 'saas', 'public', 'assets', 'banner.svg') }
async function assertBannerAsset() {
  const p = bannerAssetPath()
  try { const s = await stat(p); if (!s.isFile() || s.size < 100) throw new Error('not usable'); return p }
  catch { console.error(`BANNER ASSET MISSING AT PATH: ${p}`); throw new Error(`BANNER ASSET MISSING AT PATH: ${p}`) }
}
function keys(obj) { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function pickJob(campaign) {
  const video = campaign?.metadata?.video || {}
  if (video.status !== 'ready') return null
  if (video.branded === true && video.voicedUrl && video.brandDebug?.mode !== 'direct-completion') return null
  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : keys(video.unbrandedVoiced)
  for (const lang of langs) {
    if (video.brandedLangs?.[lang]) continue
    if (!video.unbrandedVoiced?.[lang]) continue
    if (Number(video.ghOverlayAttempts?.[lang] || 0) >= MAX_ATTEMPTS) continue
    return { lang, primary: langs[0] || lang, sourceUrl: String(video.unbrandedVoiced[lang]) }
  }
  return null
}
async function download(url, dest) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`Could not download source video: ${res.status}`)
  await pipeline(res.body, createWriteStream(dest))
}
function runFfmpeg(args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`)) }, timeoutMs)
    child.stderr.on('data', c => { stderr += c.toString() })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited with ${code}`)) })
  })
}
async function burn(input, banner, output, aspect) {
  const widthExpr = aspect === '9:16' ? 'min(iw*0.86,900)' : 'min(iw*0.58,1000)'
  const marginY = aspect === '9:16' ? '110' : '60'
  await runFfmpeg(['-y', '-i', input, '-i', banner, '-filter_complex', `[1:v]scale=${widthExpr}:-1[brand];[0:v][brand]overlay=(W-w)/2:${marginY}:format=auto`, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output])
}
async function processCampaign(sb, campaign) {
  const banner = await assertBannerAsset()
  const video = campaign.metadata?.video || {}
  const job = pickJob(campaign)
  if (!job) return { id: campaign.id, skipped: true }
  const attempts = { ...(video.ghOverlayAttempts || {}), [job.lang]: Number(video.ghOverlayAttempts?.[job.lang] || 0) + 1 }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...video, ghOverlayAttempts: attempts, brandAttempts: { ...(video.brandAttempts || {}), [job.lang]: attempts[job.lang] }, brandingLock: { lang: job.lang, at: new Date().toISOString(), worker: 'github-actions-ffmpeg' }, brandingExhausted: false } } }).eq('id', campaign.id)
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sb-brand-'))
  const input = path.join(tmp, 'source.mp4'); const output = path.join(tmp, 'branded.mp4')
  try {
    await download(job.sourceUrl, input)
    let last
    for (let i = 1; i <= 2; i++) { try { await burn(input, banner, output, video.aspect === '9:16' ? '9:16' : '16:9'); last = null; break } catch (e) { last = e; console.error('FFmpeg brand overlay attempt failed', { id: campaign.id, lang: job.lang, attempt: i, error: e.message }) } }
    if (last) throw last
    const bytes = await readFile(output)
    const objectPath = `cos-brand/${campaign.id}/${job.lang}-${Date.now()}.mp4`
    const up = await sb.storage.from(RENDER_BUCKET).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (up.error) throw new Error(up.error.message)
    const signed = await sb.storage.from(RENDER_BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Could not sign branded video')
    const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }; delete unbrandedVoiced[job.lang]
    const brandedLangs = { ...(video.brandedLangs || {}), [job.lang]: true }
    const voiced = { ...(video.voiced || {}), [job.lang]: signed.data.signedUrl }
    const patched = { ...video, status: 'ready', voiced, unbrandedVoiced, brandedLangs, voicedUrl: job.lang === job.primary ? signed.data.signedUrl : (video.voicedUrl || signed.data.signedUrl), branded: Boolean(brandedLangs[job.primary]), brandSchemaVersion: brandedLangs[job.primary] ? BRAND_SCHEMA_VERSION : video.brandSchemaVersion || null, brandText: brandedLangs[job.primary] ? BRAND_TEXT : video.brandText || null, brandedAt: brandedLangs[job.primary] ? new Date().toISOString() : video.brandedAt || null, brandingLock: null, brandingExhausted: false, voiceError: null, brandDebug: { mode: 'github-actions-ffmpeg', bannerAssetPath: banner, objectPath } }
    const db = await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patched } }).eq('id', campaign.id)
    if (db.error) throw new Error(db.error.message)
    return { id: campaign.id, lang: job.lang, ok: true, objectPath }
  } catch (e) {
    const exhausted = attempts[job.lang] >= MAX_ATTEMPTS
    await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...video, ghOverlayAttempts: attempts, brandingLock: null, brandingExhausted: exhausted, voiceError: `brand overlay FFmpeg failed [${job.lang}] attempt ${attempts[job.lang]}/${MAX_ATTEMPTS}: ${e.message}` } } }).eq('id', campaign.id)
    return { id: campaign.id, lang: job.lang, ok: false, error: e.message }
  }
}

const sb = db()
const { data, error } = await sb.from('cos_campaign_queue').select('*').in('channel', VIDEO_CHANNELS).neq('status', 'rejected').filter('metadata->video->>status', 'eq', 'ready').order('created_at', { ascending: false }).limit(40)
if (error) throw new Error(error.message)
const results = []
for (const c of data || []) {
  if (results.filter(r => r.ok).length >= MAX_PER_RUN) break
  if (!pickJob(c)) continue
  results.push(await processCampaign(sb, c))
}
console.log(JSON.stringify({ ok: true, scanned: data?.length || 0, results }, null, 2))
