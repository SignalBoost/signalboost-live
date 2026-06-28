#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.argv.includes('--help')) {
  console.log('Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cos-video-production-worker.mjs')
  console.log('Optional: COS_VIDEO_RENDER_WEBHOOK_URL=... for an external renderer, or use local FFmpeg fallback when no webhook is configured.')
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

const renderUrl = process.env.COS_VIDEO_RENDER_WEBHOOK_URL
const renderToken = process.env.COS_VIDEO_RENDER_WEBHOOK_TOKEN
const pollMs = Number(process.env.COS_VIDEO_WORKER_POLL_MS || 6000)
const renderBucket = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function claimJob() {
  const { data: jobs, error } = await supabase
    .from('cos_video_production_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error
  const job = jobs?.[0]
  if (!job) return null

  const { data: claimed, error: claimError } = await supabase
    .from('cos_video_production_jobs')
    .update({ status: 'rendering', error: null, updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()

  if (claimError) throw claimError
  return claimed
}

async function callWebhookRenderer(job) {
  const res = await fetch(renderUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(renderToken ? { Authorization: `Bearer ${renderToken}` } : {}),
    },
    body: JSON.stringify({
      job_id: job.id,
      title: job.title,
      hook: job.hook,
      audience: job.audience,
      production_tier: job.production_tier,
      platforms: job.platforms,
      render_spec: job.render_spec,
      search_package: job.search_package,
      approval_state: job.approval_state,
    }),
  })

  if (!res.ok) throw new Error(`renderer returned ${res.status}`)
  const json = await res.json()
  if (!json.output_url) throw new Error('renderer did not return output_url')

  return {
    output_url: String(json.output_url),
    thumbnail_url: json.thumbnail_url ? String(json.thumbnail_url) : null,
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))
  })
}

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
}

function wrapText(value, max = 42) {
  const words = cleanText(value).split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max) {
      if (current) lines.push(current)
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4).join('\\n')
}

function escapeDrawtext(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
}

function drawText({ text, x = '(w-text_w)/2', y, size = 54, color = 'white', start = 0, end = 30 }) {
  return `drawtext=text='${escapeDrawtext(text)}':fontcolor=${color}:fontsize=${size}:line_spacing=12:x=${x}:y=${y}:enable='between(t\\,${start}\\,${end})'`
}

function buildFilters(job, duration) {
  const title = wrapText(job.title || 'SignalBoost video', 36)
  const hook = wrapText(job.hook || 'SignalBoost turns scattered work into approved action.', 34)
  const audience = wrapText(job.audience || 'business operators', 44)
  const destination = cleanText(job.search_package?.destination_url || 'www.saas.signalboostapp.com')
  const transcript = job.search_package?.captions_required ? 'Captions and transcript required' : 'Captions planned'
  const segment = Math.max(4, Math.floor(duration / 4))
  const filters = [
    drawText({ text: 'SIGNALBOOST', x: '80', y: '60', size: 46, color: '0xffc300', start: 0, end: duration }),
    drawText({ text: 'COSA PRODUCTION DRAFT', x: '80', y: '118', size: 28, color: '0x1af0ff', start: 0, end: duration }),
    drawText({ text: title, y: '(h-text_h)/2-160', size: 68, color: 'white', start: 0, end: segment + 1 }),
    drawText({ text: hook, y: '(h-text_h)/2-120', size: 72, color: 'white', start: segment, end: segment * 2 + 1 }),
    drawText({ text: `For ${audience}`, y: '(h-text_h)/2-80', size: 54, color: '0xffffff', start: segment * 2, end: segment * 3 + 1 }),
    drawText({ text: transcript, y: '(h-text_h)/2-80', size: 54, color: '0xffc300', start: segment * 3, end: duration }),
    drawText({ text: destination, y: 'h-150', size: 44, color: '0xffc300', start: 0, end: duration }),
  ]
  return filters.join(',')
}

async function renderLocalMp4(job) {
  const dir = await mkdtemp(join(tmpdir(), 'signalboost-cos-video-'))
  const output = join(dir, 'final.mp4')
  try {
    const duration = Math.max(12, Math.min(60, Number(job.render_spec?.duration_seconds || 24)))
    const filter = buildFilters(job, duration)
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', `color=c=0x020617:s=1920x1080:d=${duration}`,
      '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}`,
      '-vf', filter,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-shortest', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      output,
    ])

    const bytes = await readFile(output)
    const resultPath = `cos-video-production/${job.id}/final.mp4`
    const { error: uploadError } = await supabase.storage.from(renderBucket).upload(resultPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw uploadError
    return { output_url: resultPath, thumbnail_url: null }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function renderJob(job) {
  if (renderUrl) return callWebhookRenderer(job)
  return renderLocalMp4(job)
}

async function processJob(job) {
  try {
    const result = await renderJob(job)
    await supabase
      .from('cos_video_production_jobs')
      .update({
        status: 'rendered',
        output_url: result.output_url,
        thumbnail_url: result.thumbnail_url,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
  } catch (error) {
    await supabase
      .from('cos_video_production_jobs')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
  }
}

while (true) {
  const job = await claimJob()
  if (job) await processJob(job)
  else await new Promise(resolve => setTimeout(resolve, pollMs))
}
