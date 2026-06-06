#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.argv.includes('--help')) {
  console.log('Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/video-render-worker.mjs')
  console.log('Polls queued video_jobs, downloads source media, burns caption overlays with FFmpeg, and uploads final MP4 renders.')
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
const supabase = createClient(url, key, { auth: { persistSession: false } })
const pollMs = Number(process.env.VIDEO_WORKER_POLL_MS || 5000)

async function claimJob() {
  const { data: jobs, error } = await supabase.from('video_jobs').select('*').eq('status', 'queued').in('job_type', ['caption_burn', 'export']).order('created_at', { ascending: true }).limit(1)
  if (error) throw error
  const job = jobs?.[0]
  if (!job) return null
  const { data: claimed, error: claimError } = await supabase.from('video_jobs').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'queued').select('*').maybeSingle()
  if (claimError) throw claimError
  return claimed
}

async function downloadStorage(bucket, path, localPath) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  await writeFile(localPath, Buffer.from(await data.arrayBuffer()))
}

async function downloadUrl(remoteUrl, localPath) {
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error(`Caption download failed: ${res.status}`)
  await writeFile(localPath, Buffer.from(await res.arrayBuffer()))
}

function assColor(hex) {
  const clean = String(hex || '#ffffff').replace('#', '')
  const r = clean.slice(0, 2), g = clean.slice(2, 4), b = clean.slice(4, 6)
  return `&H00${b}${g}${r}`.toUpperCase()
}

async function makeAss(cues, style, localPath) {
  const font = String(style.fontFamily || 'Arial').replace(/,/g, ' ')
  const size = Number(style.fontSize || 44)
  const primary = assColor(style.color)
  const back = assColor(style.backgroundColor)
  const marginV = Math.max(20, Math.round((100 - Number(style.y || 72)) * 10.8))
  const body = cues.map(c => `Dialogue: 0,${toAss(c.start)},${toAss(c.end)},Default,,0,0,${marginV},,${escapeAss(c.text)}`).join('\n')
  await writeFile(localPath, `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${size},${primary},&H000000FF,&H00000000,${back},-1,0,0,0,100,100,0,0,3,2,0,2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${body}
`)
}
function toAss(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), cs = Math.floor((sec % 1) * 100); return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}` }
function escapeAss(text) { return String(text || '').replace(/[{}]/g, '').replace(/\n/g, '\\N') }

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))
  })
}

async function processJob(job) {
  const payload = job.queue_payload || {}
  const dir = await mkdtemp(join(tmpdir(), 'signalboost-video-'))
  try {
    await mkdir(dir, { recursive: true })
    const source = join(dir, 'source')
    const ass = join(dir, 'captions.ass')
    const output = join(dir, 'final.mp4')
    await downloadStorage(payload.sourceBucket || 'video-jobs', payload.sourcePath || job.source_video, source)
    if (Array.isArray(payload.overlays) && payload.overlays.length) await makeAss(payload.overlays, payload.style || {}, ass)
    else { const caption = join(dir, 'captions.vtt'); await downloadUrl(payload.captionUrl, caption); await runFfmpeg(['-y', '-i', source, '-i', caption, '-c:s', 'ass', ass]) }
    await runFfmpeg(['-y', '-i', source, '-vf', `ass=${ass.replace(/:/g, '\\:')}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output])
    const resultPath = payload.resultPath || `${job.user_id}/${job.id}/final.mp4`
    const bytes = await readFile(output)
    const { error: uploadError } = await supabase.storage.from(payload.renderBucket || 'video-renders').upload(resultPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw uploadError
    await supabase.from('video_storage').insert({ account_id: job.account_id, user_id: job.user_id, filename: 'final.mp4', size_mb: Math.ceil(bytes.length / (1024 * 1024)), duration_sec: Math.round(Number(payload.durationSec || 0)), transcoded: true, captions: payload.overlays || null, render_path: resultPath })
    await supabase.from('video_jobs').update({ status: 'completed', result_path: resultPath, result_url: resultPath, updated_at: new Date().toISOString() }).eq('id', job.id)
  } catch (error) {
    await supabase.from('video_jobs').update({ status: 'failed', error: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString() }).eq('id', job.id)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

while (true) {
  const job = await claimJob()
  if (job) await processJob(job)
  else await new Promise(resolve => setTimeout(resolve, pollMs))
}
