// saas/lib/operator/video.ts
// Reusable server-side helper for generating website/background/COS videos.
//
// COST SAFETY MODE:
// Automatic COS/video retries must not spend money on paid media providers.
// This helper now always queues the internal FFmpeg preview path for new video
// work. Paid external rendering can be reintroduced later behind a separate,
// explicit owner approval flow.

import { createClient } from '@supabase/supabase-js'
import { COS_VIDEO_QUEUE_SQL } from '@/lib/operator/videoQueueSchema'

const LOCAL_FFMPEG_MODEL = 'signalboost/local-ffmpeg-preview'
const RENDER_BUCKET = process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
const SUPABASE_URL_KEY = ['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')
const SUPABASE_SERVICE_KEY = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')

const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.COS_VIDEO_MAX_ATTEMPTS || 5))
const AUTO_APPLY_DEFAULT = process.env.COS_VIDEO_AUTO_APPLY === 'false' ? false : true

type ImageMotionSource = {
  sourceImageUrl?: string
  sourceImagePath?: string
  sourceImageBucket?: string
  visualStrategy?: string
}

function adminDb() {
  const url = process.env[SUPABASE_URL_KEY]
  const key = process.env[SUPABASE_SERVICE_KEY]
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return createClient(url, key, { auth: { persistSession: false } })
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

function needsQueueSetup(message: string): boolean {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('cos_video_production_jobs') ||
    m.includes('cos_video_lifecycle_events') ||
    m.includes('cos_video_escalation_tickets') ||
    m.includes('lifecycle_state') ||
    m.includes('warning_level') ||
    m.includes('attempt_count') ||
    m.includes('reroute_count') ||
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('not find')
  )
}

async function ensureJobsTable(sb: any) {
  const rpc = await sb.rpc('hub_exec_sql', { query: COS_VIDEO_QUEUE_SQL })
  if (rpc.error) throw new Error('Could not create video jobs table: ' + rpc.error.message)
  const check = await sb.from('cos_video_production_jobs').select('id').limit(1)
  if (check.error) throw new Error('Video jobs table still unavailable after setup: ' + check.error.message)
}

async function insertJob(sb: any, row: Record<string, unknown>) {
  return await sb.from('cos_video_production_jobs').insert(row).select('id').single()
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
    lifecycle_state: 'incoming',
    warning_level: 'green',
    pool: 'primary',
    fallback_pool: 'secondary',
    attempt_count: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    reroute_count: 0,
    auto_apply: AUTO_APPLY_DEFAULT,
    priority: 100,
    machine_id: null,
    provider_ref: LOCAL_FFMPEG_MODEL,
    vercel_environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
    last_heartbeat_at: null,
    reroute_reason: null,
    queue_drop_reason: null,
    cockpit_ticket_id: null,
    escalated_at: null,
    completed_at: null,
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
    telemetry: {
      request_type: 'incoming_video_request',
      source: 'operator_video_helper',
      aspect_ratio: aspectRatio,
      provider: LOCAL_FFMPEG_MODEL,
    },
    watchdog_signal: {},
    audit_trail: [{ event: 'incoming_video_request', at: now, actor: 'system', provider: LOCAL_FFMPEG_MODEL }],
    created_at: now,
    updated_at: now,
  }

  let inserted = await insertJob(sb, row)
  if (inserted.error || !inserted.data?.id) {
    const message = inserted.error?.message || ''
    if (needsQueueSetup(message)) {
      await ensureJobsTable(sb)
      inserted = await insertJob(sb, row)
    }
  }
  if (inserted.error || !inserted.data?.id) return { ok: false, error: inserted.error?.message || 'Could not queue internal FFmpeg preview render.' }
  return { ok: true, requestId: String(inserted.data.id), model: LOCAL_FFMPEG_MODEL }
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
  try {
    return await startFfmpegPreview(prompt, aspectRatio)
  } catch (err: unknown) {
    const message = errorMessage(err)
    console.error('startSiteVideo internal FFmpeg error:', message)
    return { ok: false, error: message }
  }
}

async function fetchFfmpegPreview(requestId: string): Promise<FetchVideoResult> {
  const sb = adminDb()
  let query = await sb
    .from('cos_video_production_jobs')
    .select('status, output_url, error, lifecycle_state, warning_level, pool, queue_drop_reason, cockpit_ticket_id')
    .eq('id', requestId)
    .single()

  if (query.error && needsQueueSetup(query.error.message || '')) {
    try {
      await ensureJobsTable(sb)
      query = await sb
        .from('cos_video_production_jobs')
        .select('status, output_url, error, lifecycle_state, warning_level, pool, queue_drop_reason, cockpit_ticket_id')
        .eq('id', requestId)
        .single()
    } catch {
      query = await sb.from('cos_video_production_jobs').select('status, output_url, error').eq('id', requestId).single()
    }
  }

  const { data, error } = query
  if (error || !data) return { status: 'failed', error: error?.message || 'Internal FFmpeg preview job not found.' }

  const status = String(data.status || '')
  const queueDropReason = String((data as any).queue_drop_reason || '').trim()
  const cockpitTicketId = String((data as any).cockpit_ticket_id || '').trim()
  if (status === 'failed') return { status: 'failed', error: data.error || 'Internal FFmpeg preview render failed.' }
  if (status === 'escalated') return { status: 'failed', error: data.error || `Video render escalated to Cockpit${cockpitTicketId ? ` ticket ${cockpitTicketId}` : ''}.` }
  if (status === 'dlq') return { status: 'failed', error: queueDropReason || data.error || 'Video render was moved out of the primary stream for operator review.' }
  if (status === 'rendered' || status === 'completed') {
    const output = String(data.output_url || '').trim()
    if (!output) return { status: 'failed', error: 'Internal FFmpeg preview rendered but no output URL was saved.' }
    if (output.startsWith('http')) return { status: 'done', videoUrl: output }

    const { data: signed, error: signError } = await sb.storage.from(RENDER_BUCKET).createSignedUrl(output, 60 * 60 * 24 * 7)
    if (signError || !signed?.signedUrl) return { status: 'failed', error: signError?.message || 'Could not sign internal FFmpeg preview output.' }
    return { status: 'done', videoUrl: signed.signedUrl }
  }

  const warning = (data as any).warning_level && (data as any).warning_level !== 'green'
    ? `Internal FFmpeg preview job is ${status || 'queued'} in ${(data as any).pool || 'primary'} pool (${(data as any).warning_level}).`
    : `Internal FFmpeg preview job is ${status || 'queued'}.`
  return { status: 'rendering', warning }
}

export async function fetchSiteVideo(requestId: string, model: string): Promise<FetchVideoResult> {
  if (model !== LOCAL_FFMPEG_MODEL) {
    return { status: 'failed', error: 'Paid external video provider fetch is disabled in cost-safety mode. Re-render with the internal FFmpeg provider.' }
  }
  return fetchFfmpegPreview(requestId)
}
