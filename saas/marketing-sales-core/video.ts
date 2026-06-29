// saas/marketing-sales-core/video.ts
// Portable video-production orchestration for the marketing-sales department.
// Zero host imports: the actual render provider (fal/Kling), the durable rehost,
// and the storage all arrive INJECTED from the host. The core only sequences the
// lifecycle over ms_drafts and is honest by construction — asset_url is filled
// ONLY when a real finished video URL comes back. Swap the host, keep this file.
import type { MarketingStore } from './types'

// A render provider the host injects (real one wraps fal.queue.submit/status/result).
export type VideoSubmit = (
  prompt: string,
  opts: { aspectRatio?: string },
) => Promise<{ ok: boolean; requestId?: string; model?: string; error?: string }>

export type VideoPoll = (
  model: string,
  requestId: string,
) => Promise<{ ok: boolean; status: 'pending' | 'done' | 'failed'; videoUrl?: string; error?: string }>

// Durable rehost: copy a provider URL into storage we control, return a stable URL.
export type VideoRehost = (
  videoUrl: string,
  draftId: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>

// We read ms_drafts with a tolerant row shape (asset_status is free text at the DB
// level; the narrow core Draft union never has to admit our bookkeeping values).
export interface VideoDraftRow {
  id: string
  org_id: string
  campaign_id: string
  lang: string
  title: string | null
  body: string | null
  asset_url: string | null
  asset_status: string
  video_request_id?: string | null
  video_model?: string | null
}

// Deterministic prompt from the draft's own copy — no host knowledge required.
export function videoPromptFromDraft(d: { title?: string | null; body?: string | null }): string {
  return [d.title, d.body].filter(Boolean).join('. ').slice(0, 500).trim()
}

// Phase A — submit a render for one draft.
// Proceeds only from 'none' or 'failed'; 'pending'/'ready' are left untouched.
export async function requestVideoForDraft(
  store: MarketingStore,
  submit: VideoSubmit,
  draftId: string,
  opts: { aspectRatio?: string; prompt?: string } = {},
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const rows = await store.select<VideoDraftRow>('ms_drafts', { id: draftId })
  const draft = rows[0]
  if (!draft) return { ok: false, error: 'draft not found' }
  if (draft.asset_status === 'pending') return { ok: true, status: 'pending' }
  if (draft.asset_url && draft.asset_status === 'ready') return { ok: true, status: 'ready' }

  const prompt = (opts.prompt || videoPromptFromDraft(draft)).trim()
  if (!prompt) return { ok: false, error: 'empty prompt' }

  const r = await submit(prompt, { aspectRatio: opts.aspectRatio })
  if (!r.ok || !r.requestId || !r.model) return { ok: false, error: r.error || 'submit failed' }

  await store.update('ms_drafts', draftId, {
    asset_status: 'pending',
    video_request_id: r.requestId,
    video_model: r.model,
  })
  return { ok: true, status: 'pending' }
}

// Phase B — advance one pending draft.
// done -> rehost (fall back to source URL if rehost is unavailable) -> asset_url + 'ready'.
// failed -> 'failed' (terminal; a human/route can re-request). pending -> no-op.
export async function pollVideoForDraft(
  store: MarketingStore,
  poll: VideoPoll,
  rehost: VideoRehost,
  draftId: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const rows = await store.select<VideoDraftRow>('ms_drafts', { id: draftId })
  const draft = rows[0]
  if (!draft) return { ok: false, error: 'draft not found' }
  if (draft.asset_status !== 'pending' || !draft.video_request_id || !draft.video_model) {
    return { ok: true, status: draft.asset_status }
  }

  const r = await poll(draft.video_model, draft.video_request_id)
  if (!r.ok) return { ok: false, error: r.error || 'poll failed' }
  if (r.status === 'pending') return { ok: true, status: 'pending' }
  if (r.status === 'failed' || !r.videoUrl) {
    await store.update('ms_drafts', draftId, { asset_status: 'failed' })
    return { ok: true, status: 'failed' }
  }

  const rh = await rehost(r.videoUrl, draftId)
  const finalUrl = rh.ok && rh.url ? rh.url : r.videoUrl
  await store.update('ms_drafts', draftId, { asset_url: finalUrl, asset_status: 'ready' })
  return { ok: true, status: 'ready' }
}

// Drafts currently rendering (so a cron can advance them).
export async function pendingVideoDrafts(store: MarketingStore, orgId: string): Promise<VideoDraftRow[]> {
  return store.select<VideoDraftRow>('ms_drafts', { org_id: orgId, asset_status: 'pending' })
}

// Auto-start renders for APPROVED video-channel campaigns whose chosen-language
// draft has no asset yet. Gating on 'approved' means a render only ever fires for
// a concept a human already accepted — no wasted credits on rejected drafts.
export async function autoStartVideoDrafts(
  store: MarketingStore,
  submit: VideoSubmit,
  orgId: string,
  opts: { channel?: string; lang?: string; aspectRatio?: string; max?: number } = {},
): Promise<{ started: number }> {
  const channel = opts.channel || 'video'
  const lang = opts.lang || 'en'
  const max = opts.max ?? 2

  const camps = await store.select<{ id: string }>('ms_campaigns', { org_id: orgId, channel, status: 'approved' })
  let started = 0
  for (const c of camps) {
    if (started >= max) break
    const drafts = await store.select<VideoDraftRow>('ms_drafts', { campaign_id: c.id, lang })
    for (const d of drafts) {
      if (started >= max) break
      if ((d.asset_status === 'none' || !d.asset_status) && !d.asset_url) {
        const r = await requestVideoForDraft(store, submit, d.id, { aspectRatio: opts.aspectRatio })
        if (r.ok && r.status === 'pending') started++
      }
    }
  }
  return { started }
}
