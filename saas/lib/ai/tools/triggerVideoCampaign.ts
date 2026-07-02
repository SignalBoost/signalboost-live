// saas/lib/ai/tools/triggerVideoCampaign.ts
// Gives the COS AI the ability to kick off a full video campaign render
// directly from chat — no manual dashboard steps required.
//
// Pipeline it triggers (in order):
//   1. POST /api/cos/campaign-queue        → create campaign record
//   2. POST /api/cos/campaign-queue/render-video  → start Kling b-roll render
//   3. Cron (cos-video-poll) polls until render is ready
//   4. POST /api/cos/campaign-queue/voice-video   → ElevenLabs TTS + fal compose
//                                                    + auto-subtitle captions
//                                                    + JSON2Video brand overlay
//   5. Publish stays owner-gated (human approves in the campaign dashboard)
//
// Steps 1 and 2 are triggered synchronously here. Steps 3-4 run asynchronously
// via the existing cron jobs. The tool returns the campaign id and a status URL
// so the owner can track progress in the dashboard.
//
// tsconfig non-strict: flat { ok, error? } results throughout.

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://saas.signalboostapp.com'

export interface TriggerVideoCampaignParams {
  /** Short punchy title / hook line shown on screen */
  title: string
  /** One-sentence campaign objective */
  objective: string
  /** Target audience description */
  audience: string
  /** 'youtube' for landscape 16:9, 'short_video' for vertical 9:16 */
  channel: 'youtube' | 'short_video'
  /** Voiceover / narration body — what the AI will say */
  body: string
  /** Language code: en | es | pt | pl | ru */
  language?: string
  /** Internal actor user id (injected by the support route, not from the AI) */
  actorUserId: string
  /** Service-role key for server-side Supabase calls */
  serviceRoleKey: string
}

export interface TriggerVideoCampaignResult {
  ok: boolean
  campaignId?: string
  renderRequestId?: string
  status?: string
  dashboardUrl?: string
  error?: string
}

async function internalPost(path: string, body: unknown, serviceRoleKey: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Internal service-to-service call — the requireAdmin middleware accepts
      // the service-role key as a bearer token for server-side tool calls.
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  })
  try { return await res.json() } catch { return { ok: false, error: `HTTP ${res.status}` } }
}

export async function triggerVideoCampaign(
  p: TriggerVideoCampaignParams
): Promise<TriggerVideoCampaignResult> {
  const title = String(p.title || '').trim()
  const objective = String(p.objective || '').trim()
  const audience = String(p.audience || '').trim()
  const channel = p.channel === 'short_video' ? 'short_video' : 'youtube'
  const body = String(p.body || '').trim()
  const language = String(p.language || 'en').trim()

  if (!title) return { ok: false, error: 'title is required' }
  if (!objective) return { ok: false, error: 'objective is required' }
  if (!body || body.length < 20) return { ok: false, error: 'body (voiceover narration) must be at least 20 characters' }
  if (!p.serviceRoleKey) return { ok: false, error: 'serviceRoleKey not available — check SUPABASE_SERVICE_ROLE_KEY env var' }

  // ── Step 1: Create the campaign record ──────────────────────────────────────
  const campaignRes = await internalPost(
    '/api/cos/campaign-queue',
    {
      request: {
        title,
        objective: `${objective} Feature www.saas.signalboostapp.com.`,
        channel,
        audience,
        language,
        priority: 'high',
        estimatedCostUsd: channel === 'short_video' ? 12 : 15,
        signal: `COS AI direct video campaign request. Narration: ${body.slice(0, 300)}`,
      },
    },
    p.serviceRoleKey
  )

  if (!campaignRes?.ok || !campaignRes?.campaign?.id) {
    return { ok: false, error: campaignRes?.error || 'Could not create campaign record.' }
  }

  const campaignId = String(campaignRes.campaign.id)

  // Inject the narration body into the campaign work_items so the voice step
  // can pick it up. We patch the work_items with a pre-built draft output so
  // the narrationFor() function in video-voice.ts finds real content.
  // (The campaign queue route stores work_items from the recommendation engine;
  // we supplement with the COS-authored narration here.)
  const workItemPatch = {
    id: campaignId,
    work_items: [
      {
        input: { language },
        output: {
          title,
          opening: objective,
          draft: body,
          call_to_action: `Visit www.saas.signalboostapp.com`,
        },
      },
    ],
  }

  // PATCH the campaign to inject the narration (status stays 'draft' — no approval yet).
  await internalPost('/api/cos/campaign-queue', { ...workItemPatch, _patch: true }, p.serviceRoleKey)

  // ── Step 2: Start the Kling b-roll render ───────────────────────────────────
  const renderRes = await internalPost(
    '/api/cos/campaign-queue/render-video',
    { id: campaignId },
    p.serviceRoleKey
  )

  if (!renderRes?.ok) {
    // Campaign was created but render failed to start — return partial success
    // so the owner can retry from the dashboard.
    return {
      ok: true,
      campaignId,
      status: 'campaign_created_render_failed',
      dashboardUrl: `${BASE}/dashboard/campaigns`,
      error: `Campaign created (id: ${campaignId}) but video render failed to start: ${renderRes?.error || 'unknown'}. You can retry the render from the Campaigns dashboard.`,
    }
  }

  const renderRequestId = String(renderRes?.requestId || '')

  // ── Steps 3-4 run automatically via cron ────────────────────────────────────
  // cos-video-poll cron fires every few minutes, detects status=rendering,
  // polls fal.ai until the clip is ready, then triggers voice-video automatically.
  // The owner sees the campaign progress in real time at /dashboard/campaigns.

  return {
    ok: true,
    campaignId,
    renderRequestId,
    status: 'rendering',
    dashboardUrl: `${BASE}/dashboard/campaigns`,
  }
}

export function formatTriggerVideoResultForAI(result: TriggerVideoCampaignResult): string {
  if (!result.ok && !result.campaignId) {
    return `VIDEO CAMPAIGN TRIGGER FAILED: ${result.error || 'unknown error'}`
  }
  if (result.status === 'campaign_created_render_failed') {
    return [
      `VIDEO CAMPAIGN CREATED — render failed to start.`,
      `Campaign id: ${result.campaignId}`,
      `Error: ${result.error}`,
      `The owner can retry the render from: ${result.dashboardUrl}`,
    ].join('\n')
  }
  return [
    `VIDEO CAMPAIGN TRIGGERED SUCCESSFULLY.`,
    `Campaign id: ${result.campaignId}`,
    `Render request id: ${result.renderRequestId || 'n/a'}`,
    `Status: rendering (Kling b-roll render started)`,
    `Next: the cron job will poll fal.ai, add ElevenLabs voiceover + captions, burn the brand overlay, then await owner approval before publishing.`,
    `Track progress at: ${result.dashboardUrl}`,
  ].join('\n')
}
