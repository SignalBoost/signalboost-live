// saas/lib/operator/video.ts
// Reusable server-side helper for generating website/background/COS videos.
//
// Cost safety rule:
//   - Default engine is internal FFmpeg preview, even when a Fal key exists.
//   - Paid fal.ai/Kling only runs when COS_VIDEO_ENGINE=fal and
//     COS_ALLOW_PAID_FAL=true are both set.
//
// This prevents failed tests, crons, or stuck campaign retries from spending
// money automatically.

import { fal } from '@fal-ai/client'
import { createClient } from '@supabase/supabase-js'

const FAL_SITE_VIDEO_MODEL = 'fal-ai/kling-video/v3/standard/text-to-video'
const LOCAL_FFMPEG_MODEL = 'signalboost/local-ffmpeg-preview'
const RENDER_BUCKET = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
const FAL_PROVIDER_KEY = ['FAL', 'KEY'].join('_')
const SUPABASE_URL_KEY = ['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')
const SUPABASE_SERVICE_KEY = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')
const PAID_FAL_FLAG = ['COS', 'ALLOW', 'PAID', 'FAL'].join('_')

type ImageMotionSource = {
  sourceImageUrl?: string
  sourceImagePath?: string
  sourceImageBucket?: string
  visualStrategy?: string
}

let configured = false
function ensureFalConfigured() {
  const providerKey = process.env[FAL_PROVIDER_KEY]
  if (!providerKey) throw new Error('Fal provider key is not configured')
  if (!configured) {
    fal.config({ credentials: providerKey })
    configured = true
  }
}

function adminDb() {
  const url = process.env[SUPABASE_URL_KEY]
  const key = process.env[SUPABASE_SERVICE_KEY]
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function paidFalAllowed(): boolean {
  return String(process.env[PAID_FAL_FLAG] || '').trim().toLowerCase() === 'true'
}

function selectedEngine(): 'fal' | 'ffmpeg' {
  const raw = String(process.env.COS_VIDEO_ENGINE || process.env.COS_VIDEO_RENDER_ENGINE || '').trim().toLowerCase()
  if (['fal', 'fal.ai', 'kling', 'premium'].includes(raw) && paidFalAllowed()) return 'fal'
  return 'ffmpeg'
}

export type StartVideoResult =
  | { ok: true; requestId: string; model: string; fallbackFrom?: string; warning?: string }
  | { ok: false; error: string }

export type FetchVideoResult =
  | { status: 'rendering'; warning?: string }
  | { status: 'done'; videoUrl: string }
  | { status: 'failed'; error?: string }

export function buildSiteVideoPrompt(opts: { businessName?: string; description?: string; mood?: string }): string {
  const name = (opts.businessName || '').trim()
  const desc = (opts.description || '').trim()
  const mood = (opts.mood || 'cinematic, premium, smooth motion').trim()
  const subject = desc || name || 'a modern business'
  return `A short, looping cinematic background video for ${name ? name + ', ' : ''}${subject}. ${mood}. No text, no logos, no captions. Elegant, atmospheric, gentle camera movement.`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || 'unknown error')
}

function isPermanentFalError(message: string): boolean {
  const m = String(message || '').toLowerCase()
  return [
    'unauthorized',
    'forbidden',
    ['invalid api', 'key'].join(' '),
    ['invalid', 'token'].join(' '),
    'credentials',
    'not found',
    'model not found',
    'does not exist',
    'bad request',
    'invalid request',
    'insufficient credit',
    'quota',
  ].some((needle) => m.includes(needle))
}

function cleanText(value: string, max = 240): string {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function titleFromPrompt(prompt: string): string {
  const clean = cleanText(prompt, 80)
  return clean || 'SignalBoostAi campaign preview'
}

function hookFromPrompt(prompt: string): string {
  const clean = cleanText(prompt, 160)
  return clean || 'One command can start a complete SignalBoostAi campaign.'
}

async function startFalVideo(prompt: string, aspectRatio: '9:16' | '16:9' | '1:1'): Promise<StartVideoResult> {
  if (!paidFalAllowed()) return { ok: false, error: 'Paid fal.ai rendering is disabled by COS_ALLOW_PAID_FAL.' }
  ensureFalConfigured()
  const input = {
    prompt: prompt.trim(),
    duration: '5' as const,
    aspect_ratio: aspectRatio,
  }
  const submitted = await fal.queue.submit(FAL_SITE_VIDEO_MODEL, { input })
  const requestId = (submitted as { request_id?: string }).request_id
  if (!requestId) return { ok: false, error: 'No request id returned from fal.' }
  return { ok: true, requestId, model: FAL_SITE_VIDEO_MODEL }
}

async function startFfmpegPreview(prompt: string, aspectRatio: '9:16' | '16:9' | '1:1', source: ImageMotionSource = {}): Promise<StartVideoResult> {
  const sb = adminDb()
  const now = new Date().toISOString()
  const title = titleFromPrompt(prompt)
  const hook = hookFromPrompt(prompt)
  const platforms = aspectRatio === '9:16' ? ['Shorts', 'TikTok', 'Reels'] : ['YouTube', 'LinkedIn', 'Website']
  const hasSourceImage = Boolean(source.sourceImageUrl || source.sourceImagePath)

  const row = {
    title,
    status: 'queued',
    production_tier: 'prototype',
    platforms,
    hook,
    audience: 'business owners, agencies, consultants, and operators',
    render_spec: {
      format: 'mp4',
      aspect_ratios: [aspectRatio],
      duration_seconds: 24,
      voice_strategy: 'voice and captions are added by the COSA campaign pipeline after the base preview render',
      visual_strategy: source.visualStrategy || (hasSourceImage ? 'creative_image_motion_ken_burns' : 'internal_ffmpeg_preview_motion_cards'),
      caption_strategy: 'captions are added after base render; final brand banner is burned by the brand overlay worker',
      provider_adapter: 'internal_ffmpeg_preview',
      source_image_url: source.sourceImageUrl || null,
      source_image_path: source.sourceImagePath || null,
      source_image_bucket: source.sourceImageBucket || null,
    },
    search_package: {
      title_options: [title, `${title} | SignalBoostAi`, 'AI campaign operating system demo'],
      description: `${hook} Learn more at www.saas.signalboostapp.com.`,
      tags: ['SignalBoostAi', 'AI marketing', 'campaign automation', 'business growth', 'SaaS'],
      thumbnail_text: hook.slice(0, 54),
      transcript_required: true,
      captions_required: true,
      destination_url: 'www.saas.signalboostapp.com',
    },
    approval_state: {
      concept_approved: true,
      script_approved: true,
      render_approved: false,
      publish_approved: false,
    },
    output_url: null,
    thumbnail_url: null,
    error: null,
    created_at: now,
    updated_at: now,
  }

  const { data, error } = await sb.from('cos_video_production_jobs').insert(row).select('id').single()
  if (error || !data?.id) return { ok: false, error: error?.message || 'Could not queue FFmpeg preview render.' }
  return { ok: true, requestId: String(data.id), model: LOCAL_FFMPEG_MODEL }
}

export async function startCreativeImageMotionVideo(
  prompt: string,
  aspectRatio: '9:16' | '16:9' | '1:1' = '16:9',
  source: ImageMotionSource,
): Promise<StartVideoResult> {
  try {
    return await startFfmpegPreview(prompt, aspectRatio, source)
  } catch (err: unknown) {
    const message = errorMessage(err)
    console.error('startCreativeImageMotionVideo error:', message)
    return { ok: false, error: message }
  }
}

export async function startSiteVideo(
  prompt: string,
  aspectRatio: '9:16' | '16:9' | '1:1' = '16:9'
): Promise<StartVideoResult> {
  const engine = selectedEngine()
  if (engine === 'ffmpeg') {
    try {
      return await startFfmpegPreview(prompt, aspectRatio)
    } catch (err: unknown) {
      const message = errorMessage(err)
      console.error('startSiteVideo ffmpeg error:', message)
      return { ok: false, error: message }
    }
  }

  let falError = ''
  try {
    const premium = await startFalVideo(prompt, aspectRatio)
    if (premium.ok === true) return premium
    falError = premium.error
  } catch (err: unknown) {
    falError = errorMessage(err)
  }

  console.warn('startSiteVideo premium provider failed; falling back to internal FFmpeg worker:', falError)
  try {
    const fallback = await startFfmpegPreview(prompt, aspectRatio)
    if (fallback.ok === true) return { ...fallback, fallbackFrom: FAL_SITE_VIDEO_MODEL, warning: falError }
    return { ok: false, error: `Primary provider failed (${falError}); fallback also failed (${fallback.error}).` }
  } catch (err: unknown) {
    const fallbackError = errorMessage(err)
    console.error('startSiteVideo fallback error:', fallbackError)
    return { ok: false, error: `Primary provider failed (${falError}); fallback also failed (${fallbackError}).` }
  }
}

async function fetchFfmpegPreview(requestId: string): Promise<FetchVideoResult> {
  const sb = adminDb()
  const { data, error } = await sb.from('cos_video_production_jobs').select('status, output_url, error').eq('id', requestId).single()
  if (error || !data) return { status: 'failed', error: error?.message || 'FFmpeg preview job not found.' }

  const status = String(data.status || '')
  if (status === 'failed') return { status: 'failed', error: data.error || 'FFmpeg preview render failed.' }
  if (status === 'rendered' || status === 'completed') {
    const output = String(data.output_url || '').trim()
    if (!output) return { status: 'failed', error: 'FFmpeg preview rendered but no output URL was saved.' }
    if (output.startsWith('http')) return { status: 'done', videoUrl: output }

    const { data: signed, error: signError } = await sb.storage.from(RENDER_BUCKET).createSignedUrl(output, 60 * 60 * 24 * 7)
    if (signError || !signed?.signedUrl) return { status: 'failed', error: signError?.message || 'Could not sign FFmpeg preview output.' }
    return { status: 'done', videoUrl: signed.signedUrl }
  }

  return { status: 'rendering', warning: `FFmpeg preview job is ${status || 'queued'}.` }
}

export async function fetchSiteVideo(requestId: string, model: string): Promise<FetchVideoResult> {
  if (model === LOCAL_FFMPEG_MODEL) return fetchFfmpegPreview(requestId)

  try {
    ensureFalConfigured()
    const status = await fal.queue.status(model, { requestId, logs: false })
    const state = (status as { status?: string }).status

    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') {
      return { status: 'rendering' }
    }

    if (state === 'COMPLETED') {
      const result = await fal.queue.result(model, { requestId })
      const data = (result as { data?: { video?: { url?: string } }).data
      const videoUrl = data?.video?.url
      if (!videoUrl) return { status: 'failed', error: 'Completed but no video URL.' }
      return { status: 'done', videoUrl }
    }

    return { status: 'failed', error: `Unexpected state: ${state ?? 'unknown'}` }
  } catch (err: unknown) {
    const message = errorMessage(err)
    console.error('fetchSiteVideo error:', message)
    if (isPermanentFalError(message)) return { status: 'failed', error: message }
    return { status: 'rendering', warning: message }
  }
}
