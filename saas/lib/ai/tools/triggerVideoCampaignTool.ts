// saas/lib/ai/tools/triggerVideoCampaignTool.ts
// Exports the OpenAI-shaped tool definition and the handler function for the
// triggerVideoCampaign tool so they can be imported into support/route.ts
// without modifying the (very large) route file beyond two lines:
//   import { TOOL_TRIGGER_VIDEO_CAMPAIGN, handleTriggerVideoCampaign } from '@/lib/ai/tools/triggerVideoCampaignTool'
// Then add TOOL_TRIGGER_VIDEO_CAMPAIGN to the ownerTools array and add a case
// for 'triggerVideoCampaign' in the tool-call switch.

import { triggerVideoCampaign, formatTriggerVideoForAI } from '@/lib/ai/tools/triggerVideoCampaign'

// OpenAI-shaped tool definition (converted to Anthropic shape by toAnthropicTools in support/route.ts)
export const TOOL_TRIGGER_VIDEO_CAMPAIGN = {
  type: 'function' as const,
  function: {
    name: 'triggerVideoCampaign',
    description: [
      'Create a video campaign in the COS campaign queue and immediately start a fal.ai / Kling AI video render.',
      'Use this when the owner asks to make, create, generate, or produce a video or ad about SignalBoost or saas.signalboostapp.com.',
      'The rendered footage goes through voice-over and brand-overlay steps before the owner can publish.',
      'Publishing is ALWAYS owner-gated — this tool only starts the render.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short punchy on-screen hook title for the video, e.g. "SignalBoost — Build smarter, grow faster".',
        },
        objective: {
          type: 'string',
          description: 'What the video should achieve and what it is about, e.g. "Promote saas.signalboostapp.com to small business owners showing the AI website builder and branded content tools."',
        },
        channel: {
          type: 'string',
          enum: ['youtube', 'short_video'],
          description: '"youtube" for a 16:9 landscape video, "short_video" for a 9:16 vertical (TikTok/Reels/Shorts). Defaults to "youtube".',
        },
        audience: {
          type: 'string',
          description: 'Target audience description, e.g. "Small business owners, hotels, restaurants, and agencies."',
        },
        language: {
          type: 'string',
          description: 'ISO language code for the voiceover, e.g. "en", "es", "pt", "pl", "ru". Defaults to "en".',
        },
      },
      required: ['title', 'objective'],
    },
  },
}

// Handler — call this inside the tool-call switch in support/route.ts
// Pass the tool input plus the actorUserId and adminToken from the request context.
export async function handleTriggerVideoCampaign(
  input: { title: string; objective: string; channel?: string; audience?: string; language?: string },
  actorUserId: string,
  adminToken: string,
): Promise<string> {
  const params = {
    title: input.title,
    objective: input.objective,
    channel: (input.channel === 'short_video' ? 'short_video' : 'youtube') as 'youtube' | 'short_video',
    audience: input.audience,
    language: input.language,
    actorUserId,
    adminToken,
  }
  const result = await triggerVideoCampaign(params)
  return formatTriggerVideoForAI(params, result)
}
