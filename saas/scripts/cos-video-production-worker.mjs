#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}: ${stderr.slice(-1200)}`)))
  })
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg'
}

async function hasCommand(command) {
  try {
    await runCommand(process.platform === 'win32' ? 'where' : 'which', [command])
    return true
  } catch {
    return false
  }
}

function runFfmpeg(args) {
  return runCommand(ffmpegPath(), args)
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
  return lines.slice(0, 4).join('\n')
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

function assTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = Math.floor(safe % 60)
  const c = Math.floor((safe - Math.floor(safe)) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

function scriptText(job) {
  const parts = [job.hook, job.title, job.audience ? `Para ${job.audience}.` : '', job.search_package?.destination_url ? `Acesse ${job.search_package.destination_url}.` : 'Conheça a SignalBoostAi.']
  return cleanText(parts.filter(Boolean).join(' '), 'Conheça a SignalBoostAi e transforme campanhas em resultados aprovados.')
}

function buildCaptionCues(job, duration) {
  const source = Array.isArray(job.render_spec?.captions) && job.render_spec.captions.length
    ? job.render_spec.captions
    : [job.hook, job.title, `SignalBoostAi para ${job.audience || 'negócios'}`, job.search_package?.destination_url || 'www.saas.signalboostapp.com']
  const lines = source.map(item => cleanText(typeof item === 'string' ? item : item?.text)).filter(Boolean)
  const cues = lines.length ? lines : [scriptText(job)]
  const segment = duration / cues.length
  return cues.map((text, index) => ({ start: index * segment, end: Math.min(duration, (index + 1) * segment + 0.25), text }))
}

function buildAss(job, duration) {
  const cues = buildCaptionCues(job, duration)
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,Arial,56,&H00FFFFFF,&H000000FF,&HCC000000,&HAA020617,1,0,0,0,100,100,0,0,3,3,0,2,80,80,110,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${cues.map(cue => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,${String(cue.text).replace(/[{}]/g, '').replace(/\n/g, '\\N')}`).join('\n')}\n`
}

async function synthesizeLocalVoice(job, dir, duration) {
  const wav = join(dir, 'voice.wav')
  const textPath = join(dir, 'voice.txt')
  await writeFile(textPath, scriptText(job), 'utf8')
  const espeak = await hasCommand('espeak-ng') ? 'espeak-ng' : (await hasCommand('espeak') ? 'espeak' : null)
  if (espeak) {
    const voice = espeak === 'espeak-ng' ? 'pt-br' : 'pt'
    await runCommand(espeak, ['-v', voice, '-s', '150', '-f', textPath, '-w', wav])
    return wav
  }

  await runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=44100:d=${duration}`, '-af', 'volume=0.08', wav])
  return wav
}

function escapeAssFilterPath(value) {
  // Use the local POSIX path directly. Do not pass a file:// URL here:
  // the FFmpeg ass filter parses the colon in file:///tmp/... as the
  // separator for original_size, which caused "Unable to parse option value
  // ///tmp/.../captions.ass as image size" and froze COSA renders.
  return String(value || '').replace(/\\/g, '/').replace(/'/g, "\\'")
}

function buildFilters(job, duration) {
  const title = wrapText(job.title || 'SignalBoost video', 36)
  const hook = wrapText(job.hook || 'SignalBoost turns scattered work into approved action.', 34)
  const audience = wrapText(job.audience || 'business operators', 44)
  const destination = cleanText(job.search_package?.destination_url || 'www.saas.signalboostapp.com')
  const transcript = job.search_package?.captions_required ? 'Captions and transcript required' : 'Captions planned'
  const segment = Math.max(4, Math.floor(duration / 4))
  const filters = [
    drawText({ text: 'SignalBoostAi', x: 'w-text_w-80', y: '60', size: 52, color: '0xffc300', start: 0, end: duration }),
    drawText({ text: 'www.saas.signalboostapp.com', x: 'w-text_w-80', y: '124', size: 28, color: '0x1af0ff', start: 0, end: duration }),
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
    const assPath = join(dir, 'captions.ass')
    const audioPath = await synthesizeLocalVoice(job, dir, duration)
    await writeFile(assPath, buildAss(job, duration), 'utf8')

    const visualFilter = `${buildFilters(job, duration)},ass='${escapeAssFilterPath(assPath)}'`
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', `color=c=0x020617:s=1920x1080:d=${duration}`,
      '-i', audioPath,
      '-vf', visualFilter,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
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
