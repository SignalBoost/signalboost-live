import type { NicheVideoConcept, NicheVideoStrategyInput, VideoDistributionChannel, VideoDistributionVariant } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function evidenceSummary(input: NicheVideoStrategyInput) {
  const evidence = input.signals.flatMap((signal) => signal.evidence || [])
  return evidence.length ? evidence.slice(0, 3) : [`COSA identified ${input.niche} as a niche worth testing.`]
}

function defaultChannels(input: NicheVideoStrategyInput): VideoDistributionChannel[] {
  if (input.preferred_channels?.length) return input.preferred_channels
  return ['long_form_video', 'short_vertical_video', 'professional_feed', 'community_feed', 'website_embed']
}

function variantsFor(channels: VideoDistributionChannel[]): VideoDistributionVariant[] {
  return channels.map((channel) => {
    switch (channel) {
      case 'long_form_video':
        return { channel, format: 'long_form', duration_seconds: 300, adaptation_note: 'Use the full education story, proof points, demo flow, and CTA.' }
      case 'short_vertical_video':
        return { channel, format: 'vertical', duration_seconds: 45, adaptation_note: 'Use one pain point, one proof point, and one direct CTA.' }
      case 'professional_feed':
        return { channel, format: 'square', duration_seconds: 75, adaptation_note: 'Use business outcome language, concise captions, and a credibility-focused CTA.' }
      case 'community_feed':
        return { channel, format: 'short_form', duration_seconds: 60, adaptation_note: 'Use conversational tone and focus on the owner/operator problem.' }
      case 'email_embed':
        return { channel, format: 'email_embed', duration_seconds: 90, adaptation_note: 'Use a compact version that supports a follow-up email or newsletter.' }
      default:
        return { channel, format: 'embed', duration_seconds: 120, adaptation_note: 'Use a website-friendly product education cut.' }
    }
  })
}

export function buildNicheVideoConcept(input: NicheVideoStrategyInput): NicheVideoConcept {
  const proofPoints = evidenceSummary(input)
  const title = `${input.product_or_service} for ${input.niche}: solve ${input.primary_pain}`
  const channels = defaultChannels(input)

  return {
    id: id('niche_video'),
    title,
    niche: input.niche,
    audience: input.target_audience,
    product_or_service: input.product_or_service,
    objective: input.objective,
    angle: `Position ${input.product_or_service} as the practical solution for ${input.target_audience} who are dealing with ${input.primary_pain}.`,
    hook: `If you operate in ${input.niche}, your growth problem is probably not effort. It is coordination, timing, and knowing what to do next.`,
    promise: `Show how ${input.company_name} can help the audience move from scattered work to a clearer growth system.`,
    proof_points: proofPoints,
    scenes: [
      {
        label: 'Niche pain',
        purpose: 'Make the audience feel understood.',
        narration_direction: `Describe the specific pain: ${input.primary_pain}.`,
        visual_direction: `Show ${input.target_audience} handling repetitive work, missed follow-ups, or unclear promotion decisions.`,
      },
      {
        label: 'Signal insight',
        purpose: 'Explain why this campaign exists now.',
        narration_direction: `Reference the predicted need: ${input.predicted_need}.`,
        visual_direction: 'Show market signals, trend cards, or campaign opportunity indicators.',
      },
      {
        label: 'Product solution',
        purpose: 'Connect the service to the problem.',
        narration_direction: `Introduce ${input.product_or_service} as the solution without sounding like a generic ad.`,
        visual_direction: `Show the product/service solving one concrete workflow for ${input.niche}.`,
      },
      {
        label: 'Outcome',
        purpose: 'Make the business value measurable.',
        narration_direction: 'Describe the business outcome the viewer should expect: more leads, less manual work, or better decisions.',
        visual_direction: 'Show before/after metrics, campaign queue, approvals, and results.',
      },
      {
        label: 'Call to action',
        purpose: 'Convert interest into action.',
        narration_direction: `Ask the viewer to ${input.desired_action}.`,
        visual_direction: 'Show clear CTA, website, product screenshot, or booking step.',
      },
    ],
    call_to_action: input.desired_action,
    recommended_channels: channels,
    channel_variants: variantsFor(channels),
    approval_gates: [
      'Approve niche and target audience',
      'Approve channel mix and creative angle',
      'Approve script and storyboard',
      'Approve final rendered video',
      'Approve distribution or scheduled release',
    ],
    signals_used: input.signals,
    created_at: new Date().toISOString(),
  }
}

export function defaultSignalBoostNicheVideoInput(): NicheVideoStrategyInput {
  const observedAt = new Date().toISOString()
  return {
    company_name: 'SignalBoost',
    product_or_service: 'COSA Marketing and Sales Command Console',
    niche: 'small businesses that need marketing and sales execution without hiring a full team',
    target_audience: 'owners, solo founders, agencies, and operators who need growth capacity',
    objective: 'lead_generation',
    predicted_need: 'The audience needs a practical way to convert recommendations into approved campaigns and follow-up work.',
    primary_pain: 'too many growth tasks and not enough time or staff to coordinate them',
    desired_action: 'visit SignalBoost and review how COSA can prepare campaigns for approval',
    languages: ['en', 'es', 'pt'],
    preferred_channels: ['long_form_video', 'short_vertical_video', 'professional_feed'],
    signals: [
      {
        source: 'cos_strategy',
        metric: 'niche_video_needed',
        value: 'marketing_sales_command_console',
        confidence: 78,
        evidence: [
          'SignalBoost needs reusable education content that explains COSA as an AI-operated marketing and sales department.',
          'Video is appropriate because the product is easier to understand when shown as a workflow.',
        ],
        observed_at: observedAt,
      },
    ],
  }
}
