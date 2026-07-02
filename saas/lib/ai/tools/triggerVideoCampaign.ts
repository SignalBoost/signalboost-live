// saas/lib/ai/tools/triggerVideoCampaign.ts
// COS tool: queue a video campaign through the existing proposeCampaign pipeline.
// The campaign enters as 'needs_approval' — the owner must approve it in the
// Marketing/Sales console before any video is rendered or published.

import { proposeCampaign } from '@/lib/ai/proposeCampaign'

export type TriggerVideoCampaignParams = {
  title: string
  objective: string
  body: string
  channel?: string
  lang?: string
  actorUserId: string
}

export type TriggerVideoCampaignResult = {
  ok: boolean
  campaignId?: string
  status?: string
  error?: string
}

const VALID_CHANNELS = ['video', 'social', 'blog', 'email', 'case-study', 'feature'] as const

export async function triggerVideoCampaign(
  params: TriggerVideoCampaignParams,
): Promise<TriggerVideoCampaignResult> {
  const title = String(params.title || '').trim()
  const objective = String(params.objective || '').trim()
  const body = String(params.body || '').trim()
  const channel = String(params.channel || 'video').trim().toLowerCase()
  const lang = String(params.lang || 'en').trim().toLowerCase()
  const actorUserId = String(params.actorUserId || '').trim()

  if (!title || title.length < 5) {
    return { ok: false, error: 'title must be at least 5 characters — use a punchy on-screen hook line.' }
  }
  if (!objective || objective.length < 10) {
    return { ok: false, error: 'objective is required (at least 10 characters).' }
  }
  if (!body || body.length < 20) {
    return { ok: false, error: 'body must describe the voiceover/content in at least 20 characters.' }
  }
  if (!VALID_CHANNELS.includes(channel as typeof VALID_CHANNELS[number])) {
    return { ok: false, error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` }
  }
  if (!actorUserId) {
    return { ok: false, error: 'actorUserId is required.' }
  }

  return proposeCampaign({ title, objective, body, channel, lang, actorUserId })
}

export function formatTriggerVideoCampaignForAI(result: TriggerVideoCampaignResult): string {
  if (!result.ok) {
    return `Campaign queuing failed: ${result.error} — nothing was created. Correct the issue and try again.`
  }
  return [
    `Campaign queued successfully (id: ${result.campaignId}).`,
    `Status: ${result.status} — the owner must approve it in the Marketing/Sales console before any video is rendered or published.`,
    `Nothing has been sent, rendered, or published yet.`,
  ].join(' ')
}
