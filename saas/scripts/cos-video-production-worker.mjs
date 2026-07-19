#!/usr/bin/env node

// COSA Step 1 worker: create a clean, text-free base video only.
// Voice, customer-facing captions, and the final brand banner belong to later
// stages. Owner instructions, goals, prompts, and URLs must never be burned into
// this base artifact.

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const renderBucket = String(process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders').trim()
const renderUrl = String(process.env.COS_VIDEO_RENDER_WEBHOOK_URL || '').trim()
const renderToken = String(process.env.COS_VIDEO_RENDER_WEBHOOK_TOKEN || '').trim()
const staleMs = Math.max(60_000, Number(process.env.COS_VIDEO_STALE_MS || 10 * 60 * 1000))
const maxJobs = Math.max(1, Math.min(10, Number(process.env.COS_VIDEO_MAX_JOBS_PER_RUN || 5)))
const BASE_VISUAL_SCHEMA_VERSION = 'signalboost-base-v2-clean-background'

if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

function errorText(error) {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-1600)}`))
    })
  })
}

async function ensureBucket() {
  const listed = await supabase.storage.listBuckets()
  if (listed.error) throw new Error(`Could not list Supabase Storage buckets: ${listed.error.message}`)
  if ((listed.data || []).some(bucket => bucket?.name === renderBucket || bucket?.id === renderBucket)) return
  const created = await supabase.storage.createBucket(renderBucket, { public: false })
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already')) {
    throw new Error(`Could not create Supabase Storage bucket ${renderBucket}: ${created.error.message}`)
  }
}

async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - staleMs).toISOString()
  const { data, error } = await supabase
    .from('cos_video_production_jobs')
    .select('id, watchdog_signal')
    .eq('status', 'rendering')
    .lt('updated_at', cutoff)
    .limit(10)

  if (error) {
    console.error('Stale-job scan failed:', error.message)
    return
  }

  for (const job of data || []) {
    const requeues = Number(job?.watchdog_signal?.requeues || 0)
    const now = new Date().toISOString()
    const nextSignal = {
      ...(job.watchdog_signal || {}),
      requeues: requeues + 1,
      lastRequeueAt: now,
      reason: 'stale Step 1 worker claim recovered',
    }
    await supabase
      .from('cos_video_production_jobs')
      .update({ status: 'queued', error: null, watchdog_signal: nextSignal, updated_at: now })
      .eq('id', job.id)
      .eq('status', 'rendering')
  }
}

async function claimJob() {
  const { data: jobs, error } = await supabase
    .from('cos_video_production_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error
  const job = jobs?.[0]
  if (!job) return null

  const now = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabase
    .from('cos_video_production_jobs')
    .update({ status: 'rendering', lifecycle_state: 'rendering', error: null, last_heartbeat_at: now, updated_at: now })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()

  if (claimError) throw claimError
  return claimed
}

async function callWebhook(job) {
  const response = await fetch(renderUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(renderToken ? { Authorization: `Bearer ${renderToken}` } : {}) },
    body: JSON.stringify({
      job_id: job.id,
      production_tier: job.production_tier,
      platforms: job.platforms,
      render_spec: {
        ...(job.render_spec || {}),
        base_video_only: true,
        audio: false,
        captions: false,
        on_screen_text: false,
        prompt_text_allowed: false,
        visual_schema_version: BASE_VISUAL_SCHEMA_VERSION,
      },
    }),
  })

  if (!response.ok) throw new Error(`Renderer returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
  const json = await response.json()
  if (!json?.output_url) throw new Error('Renderer did not return output_url')
  return { outputUrl: String(json.output_url), thumbnailUrl: json.thumbnail_url ? String(json.thumbnail_url) : null }
}

async function renderLocal(job) {
  const ratio = String(job?.render_spec?.aspect_ratios?.[0] || '16:9')
  const vertical = ratio === '9:16'
  const size = vertical ? '1080x1920' : '1920x1080'
  const duration = Math.max(8, Math.min(45, Number(job?.render_spec?.duration_seconds || 24)))
  const bandOne = vertical ? 420 : 720
  const bandTwo = vertical ? 330 : 560
  const dir = await mkdtemp(join(tmpdir(), 'signalboost-base-video-'))
  const output = join(dir, 'base.mp4')

  try {
    const filter = [
      'format=yuv420p',
      `drawbox=x='mod(t*52,iw+${bandOne})-${bandOne}':y=0:w=${bandOne}:h=ih:color=0x12446d@0.30:t=fill`,
      `drawbox=x='iw-mod(t*39,iw+${bandTwo})':y=0:w=${bandTwo}:h=ih:color=0x8a6900@0.14:t=fill`,
      'vignette=PI/5',
    ].join(',')

    await run(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=0x050b18:s=${size}:r=30:d=${duration}`,
      '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
    ])

    const bytes = await readFile(output)
    const objectPath = `cos-video-production/${job.id}/base.mp4`
    const { error: uploadError } = await supabase.storage.from(renderBucket).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw new Error(`Supabase Storage upload failed: ${uploadError.message}`)
    return { outputUrl: objectPath, thumbnailUrl: null }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function renderJob(job) {
  return renderUrl ? callWebhook(job) : renderLocal(job)
}

async function processJob(job) {
  try {
    const result = await renderJob(job)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('cos_video_production_jobs')
      .update({
        status: 'rendered', lifecycle_state: 'rendered', output_url: result.outputUrl,
        thumbnail_url: result.thumbnailUrl, completed_at: now, last_heartbeat_at: now, error: null,
        watchdog_signal: {
          ...(job.watchdog_signal || {}),
          stage: 'base_video_complete', baseVideoOnly: true, onScreenText: false,
          visualSchemaVersion: BASE_VISUAL_SCHEMA_VERSION, renderedAt: now,
        },
        updated_at: now,
      })
      .eq('id', job.id)
    if (error) throw error
    console.log(`Rendered clean text-free base video for job ${job.id}`)
  } catch (error) {
    const message = errorText(error)
    console.error(`Job ${job.id} failed:`, message)
    await supabase
      .from('cos_video_production_jobs')
      .update({ status: 'failed', lifecycle_state: 'failed', error: message.slice(0, 1800), updated_at: new Date().toISOString() })
      .eq('id', job.id)
  }
}

await ensureBucket()
await recoverStaleJobs()

let processed = 0
while (processed < maxJobs) {
  const job = await claimJob()
  if (!job) break
  await processJob(job)
  processed += 1
}

console.log(`COSA Step 1 worker complete. Processed ${processed} job(s); exiting immediately.`)
