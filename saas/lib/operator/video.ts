// saas/lib/operator/video.ts
// Reusable server-side helper for generating website background/hero videos
// via fal.ai — reusing the exact pattern proven in the Lab's video-generate /
// video-status routes.
//
// This module is SELF-CONTAINED and side-effect free at import time. It does
// not touch the live publish flow yet; the website publish/finishing steps will
// call these functions in a later step.
//
// Flow (async, the correct pattern for slow renders):
//   1. startSiteVideo(prompt) -> submits to fal queue, returns { requestId, model }
//   2. (store requestId + model against the site/section)
//   3. fetchSiteVideo(requestId, model) -> poll; returns 'rendering' | 'done'(+url) | 'failed'
//
// Note: site videos are not tied to a user's monthly video credits here — they
// are part of website generation, so we do NOT spend/refund Lab credits in this
// module. (If you later want site video to consume credits, wire that in the
// caller, not here.)

import { fal } from '@fal-ai/client'

// Same text-to-video model the Lab uses.
const SITE_VIDEO_MODEL = 'fal-ai/kling-video/v3/standard/text-to-video'

let configured = false
function ensureConfigured() {
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY })
    configured = true
  }
}

export type StartVideoResult =
  | { ok: true; requestId: string; model: string }
  | { ok: false; error: string }

export type FetchVideoResult =
  | { status: 'rendering' }
  | { status: 'done'; videoUrl: string }
  | { status: 'failed'; error?: string }

// Build a concise, cinematic prompt for a website hero/background clip.
export function buildSiteVideoPrompt(opts: { businessName?: string; description?: string; mood?: string }): string {
  const name = (opts.businessName || '').trim()
  const desc = (opts.description || '').trim()
  const mood = (opts.mood || 'cinematic, premium, smooth motion').trim()
  const subject = desc || name || 'a modern business'
  // Short, concrete prompt works best for Kling.
  return `A short, looping cinematic background video for ${name ? name + ', ' : ''}${subject}. ${mood}. No text, no logos, no captions. Elegant, atmospheric, gentle camera movement.`
}

// Kick off a render. Returns a requestId + model to poll later.
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
    const message = err instanceof Error ? err.message : 'Could not start video generation.'
    console.error('startSiteVideo error:', message)
    return { ok: false, error: message }
  }
}

// Poll a render once. 'rendering' if still working; 'done' with a url; 'failed' otherwise.
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
    // Transient status-check error — treat as still rendering so the caller retries.
    const message = err instanceof Error ? err.message : 'status check failed'
    console.error('fetchSiteVideo transient error:', message)
    return { status: 'rendering' }
  }
}
