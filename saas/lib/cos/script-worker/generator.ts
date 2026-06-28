import type { CosContentWorkerInput, CosContentWorkerOutput } from './types'

function productAngle(input: CosContentWorkerInput) {
  const text = `${input.title} ${input.objective} ${input.brief}`.toLowerCase()
  if (text.includes('console') || text.includes('cosa') || text.includes('cos')) return 'AI-operated business command center'
  if (text.includes('outreach')) return 'AI-assisted outreach and sales follow-up'
  if (text.includes('website')) return 'fast website and content improvement'
  if (text.includes('review')) return 'customer reviews and trust building'
  return 'SignalBoost growth tools for small business operators'
}

export function generateContentDraft(input: CosContentWorkerInput): CosContentWorkerOutput {
  const angle = productAngle(input)
  const createdAt = new Date().toISOString()

  const title = input.channel === 'youtube'
    ? `How ${angle} helps small businesses grow without adding more manual work`
    : input.title

  const opening = `Most business owners do not have a marketing department, a sales department, and a content team. They have a product, a few hours, and too many tasks. This episode explains how ${angle} can turn scattered work into an organized growth system.`

  const scenes = [
    {
      label: 'Problem',
      narration: 'Small businesses lose time switching between tools, writing content, following up with leads, and trying to decide what to promote next.',
      visual_direction: 'Show a busy owner moving between email, website, analytics, and social media screens.',
    },
    {
      label: 'Insight',
      narration: 'The real problem is not lack of effort. The problem is lack of a coordinated operating system that knows what should happen next.',
      visual_direction: 'Show disconnected tasks becoming one clean command dashboard.',
    },
    {
      label: 'Solution',
      narration: `SignalBoost uses COSA to organize recommendations, campaigns, approvals, and worker tasks so the owner can govern instead of manually managing every step.`,
      visual_direction: 'Show COSA creating a recommendation, converting it into a campaign, and waiting for approval.',
    },
    {
      label: 'Benefit',
      narration: 'The owner stays in control. The AI prepares the work. Campaigns are reviewed before publishing, sending, or spending money.',
      visual_direction: 'Show approve, reject, and queue buttons with clear safety labels.',
    },
    {
      label: 'Next step',
      narration: 'Start with one approved campaign, measure the result, and let the system learn from what worked.',
      visual_direction: 'Show campaign results flowing back into corporate memory and future recommendations.',
    },
  ]

  const draft = [
    `Title: ${title}`,
    '',
    'Opening:',
    opening,
    '',
    'Main flow:',
    ...scenes.map((scene, index) => `${index + 1}. ${scene.label}: ${scene.narration}`),
    '',
    'Close:',
    'If you want your company to grow without manually coordinating every marketing and sales task, SignalBoost is building the command system for that future.',
  ].join('\n')

  return {
    title,
    opening,
    draft,
    scenes,
    call_to_action: 'Visit SignalBoost and start turning recommendations into approved growth campaigns.',
    estimated_duration_minutes: 5,
    created_at: createdAt,
  }
}
