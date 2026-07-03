// saas/lib/operator/video.ts
// Reusable server-side helper for generating website/background/COS videos
// via fal.ai.
//
// Flow:
//   1. startSiteVideo(prompt) -> submits to fal queue, returns { requestId, model }.
//   2. Caller stores requestId + model.
//   3. fetchSiteVideo(requestId, model) -> polls once and returns rendering/done/failed.
//
// Critical reliability rule: transient network/provider polling errors may retry,
// but auth/model/not-found errors must surface as failed. Otherwise campaigns can
// sit in metadata.video.status = 'rendering' forever with no visible diagnosis.

import { fal } from '@fal-ai/client'

const SITE_VIDEO_MODEL = 'fal-ai/kling-video/v3/standard/text-to-video'

let configured = false
function ensureConfigured() {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY is not configured')
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY })
    configured = true
  }
}

export type StartVideoResult =
  | { ok: true; requestId: string; model: string }
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
    'invalid api key',
    'invalid token',
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

export async function startSiteVideo(
  prompt: string,
  aspectRatio: '9:16' | '16:9' | '1:1' = '16:9'
): Promise<StartVideoResult> {
  try {
    ensureConfigured()
    const input = {
      prompt: prompt.trim(),
      duration: '5' as const,
      aspect_ratio: aspectRatio,
    }
    const submitted = await fal.queue.submit(SITE_VIDEO_MODEL, { input })
    const requestId = (submitted as { request_id?: string }).request_id
    if (!requestId) return { ok: false, error: 'No request id returned from fal.' }
    return { ok: true, requestId, model: SITE_VIDEO_MODEL }
  } catch (err: unknown) {
    const message = errorMessage(err)
    console.error('startSiteVideo error:', message)
    return { ok: false, error: message }
  }
}

export async function fetchSiteVideo(requestId: string, model: string): Promise<FetchVideoResult> {
  try {
    ensureConfigured()
    const status = await fal.queue.status(model, { requestId, logs: false })
    const state = (status as { status?: string }).status

    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') {
      return { status: 'rendering' }
    }

    if (state === 'COMPLETED') {
      const result = await fal.queue.result(model, { requestId })
      const data = (result as { data?: { video?: { url?: string } } }).data
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
