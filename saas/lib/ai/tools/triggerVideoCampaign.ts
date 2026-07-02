// saas/lib/ai/tools/triggerVideoCampaign.ts
// AI tool that lets the Chief of Staff create a video campaign in the
// cos_campaign_queue and immediately kick off a fal.ai / Kling render.
// The rendered video goes through the existing voice + brand-overlay pipeline
// before the owner can publish it. Publishing is ALWAYS owner-gated.
//
// Flow:
//   1. POST /api/cos/campaign-queue  → creates the queue row (status: draft)
//   2. PATCH /api/cos/campaign-queue → sets status to approved (so render is allowed)
//   3. POST /api/cos/campaign-queue/render-video → starts the fal.ai render
//
// All three calls are internal server-to-server fetches using the absolute
// NEXT_PUBLIC_APP_URL base, so they go through the same auth + audit path as
// the dashboard UI.

export interface TriggerVideoCampaignParams {
  /** Short punchy title / on-screen hook for the campaign */
  title: string
  /** What the video should achieve — used as the objective and visual theme */
  objective: string
  /** 'youtube' (16:9) or 'short_video' (9:16). Defaults to 'youtube'. */
  channel?: 'youtube' | 'short_video'
  /** Target audience description */
  audience?: string
  /** ISO language code, e.g. 'en', 'es'. Defaults to 'en'. */
  language?: string
  /** Admin user id — required for the audit trail */
  actorUserId: string
  /** Raw admin JWT to forward to the internal API routes */
  adminToken: string
}

export interface TriggerVideoCampaignResult {
  ok: boolean
  campaignId?: string
  requestId?: string
  status?: string
  error?: string
}

const VALID_CHANNELS = ['youtube', 'short_video'] as const

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://saas.signalboostapp.com').replace(/\/$/, '')
}

async function internalPost(path: string, body: unknown, token: string): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  try { return await res.json() } catch { return { ok: false, error: `HTTP ${res.status}` } }
}

async function internalPatch(path: string, body: unknown, token: string): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  try { return await res.json() } catch { return { ok: false, error: `HTTP ${res.status}` } }
}

export async function triggerVideoCampaign(p: TriggerVideoCampaignParams): Promise<TriggerVideoCampaignResult> {
  const title = String(p.title || '').trim()
  const objective = String(p.objective || '').trim()
  const channel = VALID_CHANNELS.includes(p.channel as any) ? (p.channel as 'youtube' | 'short_video') : 'youtube'
  const audience = String(p.audience || 'Business owners, operators, and entrepreneurs looking for AI-powered growth tools.').trim()
  const language = String(p.language || 'en').trim() || 'en'

  if (!title || title.length < 5) return { ok: false, error: 'title must be at least 5 characters' }
  if (!objective || objective.length < 10) return { ok: false, error: 'objective must be at least 10 characters' }
  if (!p.adminToken) return { ok: false, error: 'adminToken is required' }

  // Step 1 — create the campaign queue row
  const createRes = await internalPost('/api/cos/campaign-queue', {
    request: {
      title,
      objective,
      channel,
      audience,
      language,
      department: 'marketing',
      priority: 'high',
      estimatedCostUsd: channel === 'youtube' ? 12 : 8,
      signal: `COS AI triggered video campaign. Objective: ${objective}`,
    },
  }, p.adminToken)

  if (!createRes?.ok || !createRes?.campaign?.id) {
    return { ok: false, error: createRes?.error || 'Failed to create campaign queue entry.' }
  }

  const campaignId: string = createRes.campaign.id

  // Step 2 — approve the campaign so the render endpoint accepts it
  const approveRes = await internalPatch('/api/cos/campaign-queue', {
    id: campaignId,
    status: 'approved',
  }, p.adminToken)

  if (!approveRes?.ok) {
    return { ok: false, error: approveRes?.error || 'Failed to approve campaign for rendering.' }
  }

  // Step 3 — kick off the fal.ai / Kling render
  const renderRes = await internalPost('/api/cos/campaign-queue/render-video', {
    id: campaignId,
  }, p.adminToken)

  if (!renderRes?.ok) {
    return { ok: false, error: renderRes?.error || 'Failed to start video render.' }
  }

  return {
    ok: true,
    campaignId,
    requestId: renderRes.requestId,
    status: 'rendering',
  }
}

export function formatTriggerVideoForAI(params: TriggerVideoCampaignParams, result: TriggerVideoCampaignResult): string {
  if (!result.ok) {
    return `Video campaign trigger failed: ${result.error} The campaign was NOT created. Tell the owner plainly and suggest they check the Campaign Queue dashboard.`
  }
  return [
    `Video campaign queued and render started successfully.`,
    `Campaign ID: ${result.campaignId}`,
    `Render request ID: ${result.requestId}`,
    `Status: rendering (fal.ai / Kling is generating the footage now)`,
    ``,
    `The render typically takes 2-5 minutes. Once complete, the cron job (cos-video-poll) advances it to ready.`,
    `Next steps (owner-gated):`,
    `1. Go to the Campaign Queue dashboard to monitor render progress.`,
    `2. Once ready, trigger voice + brand overlay from the dashboard.`,
    `3. Review the final branded video and approve publishing.`,
    ``,
    `Nothing has been published. Publishing requires your explicit approval in the dashboard.`,
  ].join('\n')
}
