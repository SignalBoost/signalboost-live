// saas/marketing-sales-host/video.ts
// SignalBoost-coupled video production: wires the portable orchestration to the
// real fal/Kling text-to-video queue (the same models the Video Studio uses) and
// rehosts finished renders into our own public Supabase bucket so the URL stays
// alive between approval and publish. Swap THIS file to run elsewhere.
import { fal } from '@fal-ai/client'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSignalBoostMarketingHost } from './signalboostHost'
import type { Actor, MarketingHost } from '@/marketing-sales-core/types'
import {
  requestVideoForDraft,
  pollVideoForDraft,
  pendingVideoDrafts,
  autoStartVideoDrafts,
  type VideoSubmit,
  type VideoPoll,
  type VideoRehost,
} from '@/marketing-sales-core/video'

const ORG = 'signalboost'
const TEXT_MODEL = 'fal-ai/kling-video/v3/standard/text-to-video'
const VIDEO_BUCKET = 'marketing-sales-video'

fal.config({ credentials: process.env.FAL_KEY })

// ---- injected provider: real fal/Kling queue ----
const submit: VideoSubmit = async (prompt, opts) => {
  try {
    if (!process.env.FAL_KEY) return { ok: false, error: 'FAL_KEY not configured' }
    const input: Record<string, unknown> = {
      prompt,
      duration: '5',
      aspect_ratio: opts.aspectRatio || '9:16',
    }
    const submitted = await fal.queue.submit(TEXT_MODEL, { input })
    const requestId = (submitted as { request_id?: string }).request_id
    if (!requestId) return { ok: false, error: 'no request_id from provider' }
    return { ok: true, requestId, model: TEXT_MODEL }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'submit error' }
  }
}

const poll: VideoPoll = async (model, requestId) => {
  try {
    const status = await fal.queue.status(model, { requestId, logs: false })
    const state = (status as { status?: string }).status
    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') return { ok: true, status: 'pending' }
    if (state === 'COMPLETED') {
      const result = await fal.queue.result(model, { requestId })
      const url = (result as { data?: { video?: { url?: string } } }).data?.video?.url
      if (!url) return { ok: true, status: 'failed' }
      return { ok: true, status: 'done', videoUrl: url }
    }
    return { ok: true, status: 'failed' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'poll error' }
  }
}

// ---- injected rehost: copy the provider MP4 into our own public bucket ----
const rehost: VideoRehost = async (videoUrl, draftId) => {
  try {
    const sb: any = getAdminSupabase()
    try { await sb.storage.createBucket(VIDEO_BUCKET, { public: true }) } catch { /* already exists */ }
    const res = await fetch(videoUrl)
    if (!res.ok) return { ok: false, error: `source fetch ${res.status}` }
    const bytes = Buffer.from(await res.arrayBuffer())
    const path = `${draftId}/${Date.now()}.mp4`
    const up = await sb.storage.from(VIDEO_BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: true })
    if (up.error) return { ok: false, error: up.error.message }
    const pub = sb.storage.from(VIDEO_BUCKET).getPublicUrl(path)
    const url = pub?.data?.publicUrl
    if (!url) return { ok: false, error: 'no public url' }
    return { ok: true, url }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'rehost error' }
  }
}

// ---- owner-triggered: produce a video for one draft now ----
export async function requestDraftVideo(
  host: MarketingHost,
  draftId: string,
  opts: { aspectRatio?: string; prompt?: string } = {},
) {
  return requestVideoForDraft(host.store, submit, draftId, opts)
}

// ---- cron entry: auto-start approved video drafts, then advance pending renders ----
export async function runVideoCron(host: MarketingHost): Promise<{ ok: boolean; data?: { started: number; ready: number; failed: number; advanced: number }; error?: string }> {
  try {
    const actor = await host.auth.getCurrentActor()
    const orgId = actor.orgId
    const auto = await autoStartVideoDrafts(host.store, submit, orgId, { aspectRatio: '9:16', max: 2 })
    const pending = await pendingVideoDrafts(host.store, orgId)
    let ready = 0, failed = 0, advanced = 0
    for (const d of pending) {
      const r = await pollVideoForDraft(host.store, poll, rehost, d.id)
      advanced++
      if (r.status === 'ready') ready++
      else if (r.status === 'failed') failed++
    }
    return { ok: true, data: { started: auto.started, ready, failed, advanced } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'video cron failed' }
  }
}

// ---- service-role entry used by the Vercel cron (no user session) ----
export async function runSignalBoostVideoCron() {
  const admin = getAdminSupabase()
  const actor: Actor = { id: 'cos-video', role: 'operator', orgId: ORG }
  const host = createSignalBoostMarketingHost(admin, actor)
  return runVideoCron(host)
}
