#!/usr/bin/env node
// saas/scripts/cos-video-production-worker.mjs
// v2 FIXES:
// 1. ORPHANED JOB RECOVERY: the workflow has timeout-minutes: 20 but this
//    worker looped forever, so GitHub SIGKILLed every run. Any job claimed
//    (queued -> rendering) at the moment of the kill stayed 'rendering'
//    forever — claimJob only picks 'queued' and nothing requeued stale jobs.
//    Campaigns then showed "render in progress" eternally. Now: on every
//    cycle, 'rendering' jobs untouched for STALE_MS are requeued (up to
//    MAX_REQUEUES, tracked in watchdog_signal), then failed honestly.
// 2. GRACEFUL SHUTDOWN: the worker now exits cleanly after RUN_BUDGET_MS
//    (default 14 min), before GitHub's 20-min SIGKILL. No more orphaned
//    claims, and Actions runs show green instead of a wall of timeouts.
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
const renderBucket = String(process.env.COS_VIDEO_RENDER_BUCKET || '').trim()
if (!renderBucket) throw new Error('COS_VIDEO_RENDER_BUCKET is required for the COSA video production worker. Expected Supabase Storage bucket name, for example "video-renders".')
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Exit cleanly well before the workflow's timeout-minutes: 20 SIGKILL.
const RUN_BUDGET_MS = Number(process.env.COS_VIDEO_RUN_BUDGET_MS || 14 * 60 * 1000)
// A 'rendering' job untouched this long is orphaned (renders take seconds).
const STALE_MS = Number(process.env.COS_VIDEO_STALE_MS || 10 * 60 * 1000)
const MAX_REQUEUES = 3
const startedAt = Date.now()

function storageErrorMessage(error) { return error?.message || error?.error || String(error || 'unknown storage error') }

async function ensureRenderBucket() {
  const listed = await supabase.storage.listBuckets()
  if (listed.error) throw new Error(`Supabase Storage bucket check failed for bucket "${renderBucket}": ${storageErrorMessage(listed.error)}`)
  const exists = Boolean((listed.data || []).some(b => b?.name === renderBucket || b?.id === renderBucket))
  if (exists) return { provider: 'supabase-storage', bucket: renderBucket, bucketExists: true }
  const created = await supabase.storage.createBucket(renderBucket, { public: false })
  if (!created.error) return { provider: 'supabase-storage', bucket: renderBucket, bucketExists: true }
  const refreshed = await supabase.storage.listBuckets()
  const nowExists = Boolean((refreshed.data || []).some(b => b?.name === renderBucket || b?.id === renderBucket))
  if (nowExists) return { provider: 'supabase-storage', bucket: renderBucket, bucketExists: true }
  throw new Error(`Supabase Storage bucket "${renderBucket}" does not exist and automatic creation failed: ${storageErrorMessage(created.error)}`)
}

function logStorageFailure({ stage, job, objectPath, bucketExists, error }) {
  console.error('COSA video storage failure', {
    stage,
    campaignId: job?.campaign_id || job?.metadata?.campaignId || null,
    requestId: job?.id || null,
    storageProvider: 'supabase-storage',
    bucket: renderBucket,
    objectPath: objectPath || null,
    bucketExists: bucketExists ?? null,
    storageSdkError: storageErrorMessage(error),
  })
}

// ORPHAN RECOVERY: requeue 'rendering' jobs whose updated_at is stale. Each
// requeue is counted in watchdog_signal.requeues; past MAX_REQUEUES the job
// is failed honestly so the campaign poll surfaces a real error instead of
// spinning forever.
async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString()
  const { data: stale, error } = await supabase
    .from('cos_video_production_jobs')
    .select('id, watchdog_signal, updated_at')
    .eq('status', 'rendering')
    .lt('updated_at', cutoff)
    .limit(10)
  if (error) { console.error('stale job scan failed:', error.message); return }
  for (const job of stale || []) {
    const requeues = Number(job?.watchdog_signal?.requeues || 0)
    if (requeues >= MAX_REQUEUES) {
      await supabase.from('cos_video_production_jobs').update({
        status: 'failed',
        error: `Render orphaned ${requeues + 1} times (worker killed mid-render). Giving up after ${MAX_REQUEUES} requeues — press "Reset and kick" on the campaign to start over.`,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('status', 'rendering')
      console.log(`stale job ${job.id}: failed after ${requeues} requeues`)
    } else {
      await supabase.from('cos_video_production_jobs').update({
        status: 'queued',
        error: null,
        watchdog_signal: { ...(job.watchdog_signal || {}), requeues: requeues + 1, lastRequeueAt: new Date().toISOString(), reason: 'stale rendering claim recovered' },
        updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('status', 'rendering')
      console.log(`stale job ${job.id}: requeued (requeue ${requeues + 1}/${MAX_REQUEUES})`)
    }
  }
}

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

// FIVE-LANGUAGE LOCALIZATION (EN/ES/PT/PL/RU).
// The job's language arrives in render_spec.language (set by
// lib/operator/video.ts from the campaign). Voice, captions, and every
// on-screen string follow it. Previous versions hardcoded a PT/EN mix.
const L10N = {
  en: {
    espeak: 'en-us',
    forAudience: a => `For ${a}`,
    audienceDefault: 'business owners, agencies, consultants, and operators',
    visit: u => `Visit ${u}.`,
    meet: 'Meet SignalBoostAi.',
    scriptDefault: 'Meet SignalBoostAi and turn campaigns into approved results.',
    captionsRequired: 'Captions and transcript required',
    captionsPlanned: 'Captions planned',
    brandLine: a => `SignalBoostAi for ${a}`,
  },
  es: {
    espeak: 'es',
    forAudience: a => `Para ${a}`,
    audienceDefault: 'dueños de negocios, agencias, consultores y operadores',
    visit: u => `Visita ${u}.`,
    meet: 'Conoce SignalBoostAi.',
    scriptDefault: 'Conoce SignalBoostAi y convierte campañas en resultados aprobados.',
    captionsRequired: 'Se requieren subtítulos y transcripción',
    captionsPlanned: 'Subtítulos planificados',
    brandLine: a => `SignalBoostAi para ${a}`,
  },
  pt: {
    espeak: 'pt-br',
    forAudience: a => `Para ${a}`,
    audienceDefault: 'donos de negócios, agências, consultores e operadores',
    visit: u => `Acesse ${u}.`,
    meet: 'Conheça a SignalBoostAi.',
    scriptDefault: 'Conheça a SignalBoostAi e transforme campanhas em resultados aprovados.',
    captionsRequired: 'Legendas e transcrição obrigatórias',
    captionsPlanned: 'Legendas planejadas',
    brandLine: a => `SignalBoostAi para ${a}`,
  },
  pl: {
    espeak: 'pl',
    forAudience: a => `Dla: ${a}`,
    audienceDefault: 'właściciele firm, agencje, konsultanci i operatorzy',
    visit: u => `Odwiedź ${u}.`,
    meet: 'Poznaj SignalBoostAi.',
    scriptDefault: 'Poznaj SignalBoostAi i zamień kampanie w zatwierdzone rezultaty.',
    captionsRequired: 'Wymagane napisy i transkrypcja',
    captionsPlanned: 'Napisy zaplanowane',
    brandLine: a => `SignalBoostAi — ${a}`,
  },
  ru: {
    espeak: 'ru',
    forAudience: a => `Для: ${a}`,
    audienceDefault: 'владельцы бизнеса, агентства, консультанты и операторы',
    visit: u => `Зайдите на ${u}.`,
    meet: 'Познакомьтесь с SignalBoostAi.',
    scriptDefault: 'Познакомьтесь с SignalBoostAi и превратите кампании в утверждённые результаты.',
    captionsRequired: 'Требуются субтитры и транскрипция',
    captionsPlanned: 'Субтитры запланированы',
    brandLine: a => `SignalBoostAi — ${a}`,
  },
}

function jobLang(job) {
  const raw = String(job?.render_spec?.language || 'en').toLowerCase().trim().split(/[-_]/)[0]
  return L10N[raw] ? raw : 'en'
}
function t(job) { return L10N[jobLang(job)] }
function jobAudience(job) {
  const a = cleanText(job?.audience || '')
  return a || t(job).audienceDefault
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
  const loc = t(job)
  const parts = [
    job.hook,
    job.title,
    `${loc.forAudience(jobAudience(job))}.`,
    job.search_package?.destination_url ? loc.visit(job.search_package.destination_url) : loc.meet,
  ]
  return cleanText(parts.filter(Boolean).join(' '), loc.scriptDefault)
}

function buildCaptionCues(job, duration) {
  const source = Array.isArray(job.render_spec?.captions) && job.render_spec.captions.length
    ? job.render_spec.captions
    : [job.hook, job.title, t(job).brandLine(jobAudience(job)), job.search_package?.destination_url || 'www.saas.signalboostapp.com']
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
    const lang = jobLang(job)
    const voice = espeak === 'espeak-ng' ? t(job).espeak : lang
    try {
      await runCommand(espeak, ['-v', voice, '-s', '150', '-f', textPath, '-w', wav])
    } catch {
      // Voice pack missing for this language on the runner — fall back to
      // English rather than failing the whole render.
      await runCommand(espeak, ['-v', espeak === 'espeak-ng' ? 'en-us' : 'en', '-s', '150', '-f', textPath, '-w', wav])
    }
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
  const loc = t(job)
  const title = wrapText(job.title || 'SignalBoost video', 36)
  const hook = wrapText(job.hook || loc.scriptDefault, 34)
  const audience = wrapText(jobAudience(job), 44)
  const destination = cleanText(job.search_package?.destination_url || 'www.saas.signalboostapp.com')
  const transcript = job.search_package?.captions_required ? loc.captionsRequired : loc.captionsPlanned
  const segment = Math.max(4, Math.floor(duration / 4))
  const filters = [
    drawText({ text: 'SignalBoostAi', x: 'w-text_w-80', y: '60', size: 52, color: '0xffc300', start: 0, end: duration }),
    drawText({ text: 'www.saas.signalboostapp.com', x: 'w-text_w-80', y: '124', size: 28, color: '0x1af0ff', start: 0, end: duration }),
    drawText({ text: title, y: '(h-text_h)/2-160', size: 68, color: 'white', start: 0, end: segment + 1 }),
    drawText({ text: hook, y: '(h-text_h)/2-120', size: 72, color: 'white', start: segment, end: segment * 2 + 1 }),
    drawText({ text: loc.forAudience(audience), y: '(h-text_h)/2-80', size: 54, color: '0xffffff', start: segment * 2, end: segment * 3 + 1 }),
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
    const storage = await ensureRenderBucket()
    const { error: uploadError } = await supabase.storage.from(renderBucket).upload(resultPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (uploadError) {
      logStorageFailure({ stage: 'raw-base-render-upload', job, objectPath: resultPath, bucketExists: storage.bucketExists, error: uploadError })
      throw new Error(`Supabase Storage upload failed for bucket "${renderBucket}" object "${resultPath}": ${storageErrorMessage(uploadError)}`)
    }
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

await ensureRenderBucket()
await recoverStaleJobs()

let cycles = 0
while (Date.now() - startedAt < RUN_BUDGET_MS) {
  const job = await claimJob()
  if (job) {
    await processJob(job)
  } else {
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  // Re-scan for orphans periodically so recovery happens even in long runs.
  cycles++
  if (cycles % 20 === 0) await recoverStaleJobs()
}
console.log(`run budget reached (${Math.round(RUN_BUDGET_MS / 60000)} min) — exiting cleanly before workflow timeout; next scheduled run continues.`)
process.exit(0)
