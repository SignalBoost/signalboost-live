import { createWriteStream } from 'node:fs'
import { mkdtemp, stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { BRAND_SCHEMA_VERSION, BRAND_TEXT } from './brand-schema'

const RENDER_BUCKET = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
const MAX_ATTEMPTS = 5

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function repoRoot() { return process.cwd().endsWith('/saas') ? process.cwd() : path.join(process.cwd(), 'saas') }

export function bannerAssetPath(): string {
  return process.env.COS_BRAND_BANNER_PATH || path.join(repoRoot(), 'public', 'assets', 'banner.svg')
}

async function assertBannerAsset(): Promise<string> {
  const p = bannerAssetPath()
  try {
    const s = await stat(p)
    if (!s.isFile() || s.size < 100) throw new Error('not a usable file')
    return p
  } catch {
    console.error(`BANNER ASSET MISSING AT PATH: ${p}`)
    throw new Error(`BANNER ASSET MISSING AT PATH: ${p}`)
  }
}

async function download(url: string, dest: string) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`Could not download source video: ${res.status}`)
  await pipeline(res.body as any, createWriteStream(dest))
}

function runFfmpeg(args: string[], timeoutMs = 240_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`)) }, timeoutMs)
    child.stderr.on('data', (c) => { stderr += c.toString() })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited with ${code}`)) })
  })
}

async function burnOnce(input: string, banner: string, output: string, aspect: '16:9' | '9:16') {
  const widthExpr = aspect === '9:16' ? 'min(iw*0.86,900)' : 'min(iw*0.58,1000)'
  const marginY = aspect === '9:16' ? '110' : '60'
  await runFfmpeg([
    '-y', '-i', input, '-i', banner,
    '-filter_complex', `[1:v]scale=${widthExpr}:-1[brand];[0:v][brand]overlay=(W-w)/2:${marginY}:format=auto`,
    '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output,
  ])
}

export async function runLocalBrandOverlay(opts: { campaign: any; lang: string; sourceUrl: string; aspect: '16:9' | '9:16' }) {
  const banner = await assertBannerAsset()
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sb-brand-'))
  const input = path.join(tmp, 'source.mp4')
  const output = path.join(tmp, 'branded.mp4')
  await download(opts.sourceUrl, input)
  let last: any = null
  for (let i = 1; i <= 2; i++) {
    try { await burnOnce(input, banner, output, opts.aspect); last = null; break } catch (e) { last = e; console.error('local FFmpeg brand overlay attempt failed', { attempt: i, error: e instanceof Error ? e.message : String(e) }) }
  }
  if (last) throw last
  const sb = adminDb()
  const bytes = await readFile(output)
  const objectPath = `cos-brand/${opts.campaign.id}/${opts.lang}-${Date.now()}.mp4`
  const up = await sb.storage.from(RENDER_BUCKET).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
  if (up.error) throw new Error(up.error.message)
  const signed = await sb.storage.from(RENDER_BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
  if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Could not sign branded video')
  const video = opts.campaign.metadata?.video || {}
  const primary = Array.isArray(opts.campaign.languages) && opts.campaign.languages.length ? opts.campaign.languages[0] : opts.lang
  const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }; delete unbrandedVoiced[opts.lang]
  const brandedLangs = { ...(video.brandedLangs || {}), [opts.lang]: true }
  const voiced = { ...(video.voiced || {}), [opts.lang]: signed.data.signedUrl }
  const finalUrl = opts.lang === primary ? signed.data.signedUrl : (video.finalUrl || video.previewUrl || video.voicedUrl || signed.data.signedUrl)
  const patch = {
    ...video,
    status: 'ready',
    voiced,
    unbrandedVoiced,
    brandedLangs,
    voicedUrl: opts.lang === primary ? signed.data.signedUrl : (video.voicedUrl || signed.data.signedUrl),
    finalUrl,
    previewUrl: finalUrl,
    previewKind: 'branded final',
    branded: Boolean(brandedLangs[primary]) || opts.lang === primary,
    brandSchemaVersion: BRAND_SCHEMA_VERSION,
    brandText: BRAND_TEXT,
    brandedAt: new Date().toISOString(),
    brandingLock: null,
    brandingExhausted: false,
    voiceError: null,
    renderError: null,
    brandDebug: { mode: 'local-ffmpeg-emergency', bannerAssetPath: banner, objectPath },
  }
  const db = await sb.from('cos_campaign_queue').update({ metadata: { ...(opts.campaign.metadata || {}), video: patch } }).eq('id', opts.campaign.id)
  if (db.error) throw new Error(db.error.message)
  return { ok: true, url: signed.data.signedUrl, objectPath, bannerAssetPath: banner }
}

export function firstBrandJob(campaign: any) {
  const video = campaign?.metadata?.video || {}
  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : Object.keys(video.unbrandedVoiced || {})
  const attempts = video.ghOverlayAttempts || {}
  for (const lang of langs) if (video.unbrandedVoiced?.[lang] && !video.brandedLangs?.[lang] && Number(attempts[lang] || 0) < MAX_ATTEMPTS) return { lang, sourceUrl: String(video.unbrandedVoiced[lang]) }
  return null
}
