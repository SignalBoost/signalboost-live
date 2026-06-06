#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { createWriteStream, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'

const VIDEO_BUCKET = process.env.VIDEO_BUCKET || 'video-jobs'
const POLL_MS = Number(process.env.VIDEO_WORKER_POLL_MS || 5000)
const SIGNED_URL_TTL = 60 * 60 * 24

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function downloadToFile(url, filePath) {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)
  await fs.mkdir(dirname(filePath), { recursive: true })
  await pipeline(response.body, createWriteStream(filePath))
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)))
  })
}

async function signedStorageUrl(path) {
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) throw new Error(`Could not sign ${path}: ${error?.message || 'unknown'}`)
  return data.signedUrl
}

async function ffmpegRender(job) {
  const base = join(tmpdir(), `signalboost-${job.id}`)
  await fs.rm(base, { recursive: true, force: true })
  await fs.mkdir(base, { recursive: true })

  const sourceUrl = await signedStorageUrl(job.source_video)
  const inputPath = join(base, 'source')
  const outputPath = join(base, 'rendered.mp4')
  await downloadToFile(sourceUrl, inputPath)

  const args = ['-y', '-i', inputPath]
  if (job.captions_path) {
    const captionsUrl = await signedStorageUrl(job.captions_path)
    const captionsPath = join(base, 'captions.srt')
    await downloadToFile(captionsUrl, captionsPath)
    args.push('-vf', `subtitles=${captionsPath.replace(/'/g, "'\\''")}`)
  }
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath)

  await run(process.env.FFMPEG_PATH || 'ffmpeg', args)

  const renderedPath = `${job.account_id || job.user_id}/${job.id}/rendered.mp4`
  const bytes = await fs.readFile(outputPath)
  const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(renderedPath, bytes, {
    contentType: 'video/mp4',
    upsert: true,
  })
  if (uploadError) throw new Error(`Upload rendered MP4 failed: ${uploadError.message}`)

  const resultUrl = await signedStorageUrl(renderedPath)
  await fs.rm(base, { recursive: true, force: true })
  return { renderedPath, resultUrl, provider: 'ffmpeg' }
}

async function cloudFallback(job, error) {
  const providers = [
    ['mux', process.env.MUX_RENDER_WEBHOOK_URL],
    ['shotstack', process.env.SHOTSTACK_RENDER_WEBHOOK_URL],
    ['creatomate', process.env.CREATOMATE_RENDER_WEBHOOK_URL],
    ['remotion_lambda', process.env.REMOTION_LAMBDA_RENDER_WEBHOOK_URL],
  ]
  const selected = providers.find(([, url]) => Boolean(url))
  if (!selected) throw error

  const [provider, url] = selected
  const sourceUrl = await signedStorageUrl(job.source_video)
  const captionsUrl = job.captions_path ? await signedStorageUrl(job.captions_path) : null
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId: job.id, provider, sourceUrl, captionsUrl, callbackTable: 'video_jobs' }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${provider} fallback failed (${response.status})`)
  return { renderedPath: data.renderedPath || null, resultUrl: data.resultUrl || data.url || null, provider }
}

async function claimJob() {
  const { data: jobs, error } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('status', 'queued')
    .in('job_type', ['transcode', 'caption_burn', 'export'])
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw new Error(error.message)
  const job = jobs?.[0]
  if (!job) return null

  const { data: claimed, error: claimError } = await supabase
    .from('video_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()

  if (claimError) throw new Error(claimError.message)
  return claimed
}

async function processJob(job) {
  try {
    let render
    try {
      render = await ffmpegRender(job)
    } catch (error) {
      render = await cloudFallback(job, error)
    }

    await supabase.from('video_jobs').update({
      status: 'completed',
      result_url: render.resultUrl,
      rendered_path: render.renderedPath,
      transcode_provider: render.provider,
      error: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    console.log(`completed ${job.id} via ${render.provider}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('video_jobs').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', job.id)
    console.error(`failed ${job.id}: ${message}`)
  }
}

async function main() {
  console.log('SignalBoost video transcoder worker started')
  while (true) {
    const job = await claimJob()
    if (job) await processJob(job)
    else await sleep(POLL_MS)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
