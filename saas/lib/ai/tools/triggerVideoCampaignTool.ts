// saas/lib/ai/tools/triggerVideoCampaignTool.ts
// Exports the OpenAI-shaped tool definition and the handler function for the
// triggerVideoCampaign tool so they can be imported into support/route.ts
// without modifying the (very large) route file beyond two lines:
//   import { TOOL_TRIGGER_VIDEO_CAMPAIGN, handleTriggerVideoCampaign } from '@/lib/ai/tools/triggerVideoCampaignTool'
// Then add TOOL_TRIGGER_VIDEO_CAMPAIGN to the ownerTools array and add a case
// for 'triggerVideoCampaign' in the tool-call switch.

import {
  triggerVideoCampaign,
  formatTriggerVideoCampaignForAI,
  type TriggerVideoCampaignParams,
} from '@/lib/ai/tools/triggerVideoCampaign'

// OpenAI-shaped tool definition (converted to Anthropic shape by toAnthropicTools in support/route.ts)
export const TOOL_TRIGGER_VIDEO_CAMPAIGN = {
  type: 'function' as const,
  function: {
    name: 'triggerVideoCampaign',
    description: [
      'Create a video campaign in the COS campaign queue using the existing SignalBoost marketing campaign pipeline.',
      'Use this when the owner asks to make, create, generate, or produce a video or ad about SignalBoost or saas.signalboostapp.com.',
      'The campaign is queued as a video campaign and remains owner-gated.',
      'Publishing is ALWAYS owner-gated — this tool only queues the campaign for owner approval.',
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
          description: 'Creative format hint: "youtube" for 16:9 landscape, "short_video" for 9:16 vertical. The campaign pipeline stores this as a video campaign.',
        },
        audience: {
          type: 'string',
          description: 'Target audience description, e.g. "Small business owners, hotels, restaurants, and agencies."',
        },
        language: {
          type: 'string',
          description: 'ISO language code for the voiceover/content draft, e.g. "en", "es", "pt", "pl", "ru". Defaults to "en".',
        },
      },
      required: ['title', 'objective'],
    },
  },
}

// Handler — call this inside the tool-call switch in support/route.ts.
// Pass the tool input plus the actorUserId and adminToken from the request context.
export async function handleTriggerVideoCampaign(
  input: { title: string; objective: string; channel?: string; audience?: string; language?: string },
  actorUserId: string,
  _adminToken: string,
): Promise<string> {
  const title = String(input.title || '').trim()
  const objective = String(input.objective || '').trim()
  const language = String(input.language || 'en').trim().toLowerCase() || 'en'
  const requestedFormat = input.channel === 'short_video' ? '9:16 short-form video' : '16:9 YouTube-style video'
  const audience = String(input.audience || '').trim()

  const body = [
    `Create a ${requestedFormat} marketing video for SignalBoost.`,
    `Objective: ${objective}`,
    audience ? `Target audience: ${audience}` : '',
    `Voiceover/content language: ${language}`,
    `Use "${title}" as the main on-screen hook.`,
    'Keep the script professional, direct, brand-safe, and conversion-focused.',
  ]
    .filter(Boolean)
    .join('\n')

  const params: TriggerVideoCampaignParams = {
    title,
    objective,
    body,
    channel: 'video',
    lang: language,
    actorUserId,
  }

  const result = await triggerVideoCampaign(params)
  return formatTriggerVideoCampaignForAI(result)
}
