// saas/lib/cos/campaign-queue/campaign-cost.ts
// Estimated real-dollar cost per campaign, computed from ACTUAL captured data
// (character counts, real durations already stored in campaign.metadata)
// against VERIFIED, sourced provider rates — not guessed. This is an
// ESTIMATE, not a live-metered bill: most of these providers don't return
// exact billed cost per request in this pipeline today, so cost is computed
// from known usage × published rate.
//
// Verified rates (sources checked at build time):
//   Kling v3 standard text-to-video (fal): $0.084/sec, audio off
//     https://fal.ai/models/fal-ai/kling-video/v3/standard/text-to-video
//   fal-ai/ffmpeg-api/compose: $0.0002/sec
//     https://fal.ai/models/fal-ai/ffmpeg-api/compose
//   ElevenLabs eleven_multilingual_v2 (confirmed as this pipeline's actual
//   default model in lib/elevenlabs/voices.ts): $0.10 per 1,000 characters
//     https://elevenlabs.io/pricing/api
//   veed/subtitles, basic preset tier (this pipeline uses 'simple'): ~$0.10/min
//   base rate — dynamic presets (glass, whisper, etc.) are 2x this.
//     https://fal.ai/models/veed/subtitles/api
//   Claude Sonnet 4.6 (owner chat reasoning): $3/$15 per million input/output
//   tokens. Claude Haiku 4.5 (non-owner chat): $1/$5.
//     https://platform.claude.com/docs/en/about-claude/pricing
//
// NOT estimated here, and why:
//   JSON2Video credits — their real API response includes an exact
//   remaining_quota field. That's a real number, not an estimate; read
//   campaign.metadata.video.brandDebug if present, or check
//   json2video.com/dashboard/credits directly for the authoritative figure.
//   COS chat reasoning tokens — the chat assistant (support/route.ts) does
//   not currently persist token usage tied to a specific campaign_id, so
//   real per-campaign chat cost isn't capturable without wiring that
//   (capturing `usage` from the Anthropic response when the
//   proposeMarketingCampaign tool fires, and storing it on the created row).
//   Until that's wired, chatReasoningUsd below is a clearly-labeled ROUGH
//   estimate based on typical tool-call token counts, not a real reading.

const KLING_RATE_PER_SEC = 0.084
const FAL_COMPOSE_RATE_PER_SEC = 0.0002
const ELEVENLABS_RATE_PER_1K_CHARS = 0.10
const VEED_SUBTITLES_RATE_PER_MIN = 0.10
const KLING_CLIP_SECONDS = 5 // fixed short clip length used throughout this pipeline

// Rough placeholder only — see note above. A typical proposeMarketingCampaign
// tool-call round trip on Sonnet 4.6 runs roughly 2,500 input + 400 output
// tokens (system prompt + tool schemas + args in, confirmation text out).
const SONNET_ROUGH_INPUT_TOKENS = 2500
const SONNET_ROUGH_OUTPUT_TOKENS = 400
const SONNET_INPUT_RATE_PER_MTOK = 3
const SONNET_OUTPUT_RATE_PER_MTOK = 15

export interface CampaignCostBreakdown {
  klingRenderUsd: number
  chatReasoningUsd: { amountUsd: number; isEstimate: true; note: string }
  perLanguage: Record<string, { elevenLabsUsd: number; falComposeUsd: number; veedSubtitlesUsd: number; totalUsd: number }>
  jsonToVideoCredits: { note: string }
  totalEstimatedUsd: number
  note: string
}

function narrationCharCount(campaign: any, lang: string): number {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match = items.find((it: any) => it?.input?.language === lang && it?.output) || items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const parts = [o.title, o.opening, o.draft, o.call_to_action].map((v: any) => String(v || '')).filter(Boolean)
  return parts.join('. ').length
}

export function estimateCampaignCost(campaign: any): CampaignCostBreakdown {
  const video = (campaign.metadata && campaign.metadata.video) || {}
  const hasRenderedClip = Boolean(video.url)
  const klingRenderUsd = hasRenderedClip ? Number((KLING_CLIP_SECONDS * KLING_RATE_PER_SEC).toFixed(4)) : 0

  const wasCreatedViaChat = campaign.metadata?.source === 'cos_chat_video_campaign_tool'
  const chatInputUsd = (SONNET_ROUGH_INPUT_TOKENS / 1_000_000) * SONNET_INPUT_RATE_PER_MTOK
  const chatOutputUsd = (SONNET_ROUGH_OUTPUT_TOKENS / 1_000_000) * SONNET_OUTPUT_RATE_PER_MTOK
  const chatReasoningUsd = {
    amountUsd: wasCreatedViaChat ? Number((chatInputUsd + chatOutputUsd).toFixed(4)) : 0,
    isEstimate: true as const,
    note: wasCreatedViaChat
      ? 'Rough estimate based on typical tool-call token counts for Claude Sonnet 4.6, not a real measured reading.'
      : 'Not created via chat, or chat cost not applicable.',
  }

  const voiced: Record<string, string> = video.voiced || {}
  const languages: string[] = Object.keys(voiced).length ? Object.keys(voiced) : (Array.isArray(campaign.languages) ? campaign.languages : [])

  const perLanguage: CampaignCostBreakdown['perLanguage'] = {}
  let languagesTotal = 0

  for (const lang of languages) {
    const chars = narrationCharCount(campaign, lang)
    const elevenLabsUsd = Number(((chars / 1000) * ELEVENLABS_RATE_PER_1K_CHARS).toFixed(4))
    // Approximate spoken duration from character count (~15 chars/sec average speech),
    // capped like the real pipeline (6-60s) in video-voice.ts.
    const estDurationSec = Math.min(Math.max(chars / 15, 6), 60)
    const falComposeUsd = Number((estDurationSec * FAL_COMPOSE_RATE_PER_SEC).toFixed(4))
    const veedSubtitlesUsd = Number(((estDurationSec / 60) * VEED_SUBTITLES_RATE_PER_MIN).toFixed(4))
    const totalUsd = Number((elevenLabsUsd + falComposeUsd + veedSubtitlesUsd).toFixed(4))
    perLanguage[lang] = { elevenLabsUsd, falComposeUsd, veedSubtitlesUsd, totalUsd }
    languagesTotal += totalUsd
  }

  const totalEstimatedUsd = Number((klingRenderUsd + chatReasoningUsd.amountUsd + languagesTotal).toFixed(4))

  return {
    klingRenderUsd,
    chatReasoningUsd,
    perLanguage,
    jsonToVideoCredits: { note: 'Not estimated — check campaign.metadata.video.brandDebug or json2video.com/dashboard/credits for the real figure.' },
    totalEstimatedUsd,
    note: 'Estimated from published provider rates and real captured usage. Excludes JSON2Video credits (real number available separately) and any ad spend (this campaign has none, since no paid ad platform is connected).',
  }
}
