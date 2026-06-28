import type { PresenterTone, PresenterVideoDraft, PresenterVideoInput } from './types'

const DEFAULT_URL = 'www.' + 'saas.signalboostapp.com'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function toneFor(input?: PresenterTone): PresenterTone {
  return input || 'professional_friendly'
}

export function buildPresenterVideoDraft(input: PresenterVideoInput = {}): PresenterVideoDraft {
  const destination = input.destination_url || DEFAULT_URL
  const product = input.product_or_service || 'SignalBoost platform'
  const audience = input.audience || 'your company'
  const tone = toneFor(input.tone)
  const duration = Math.max(15, Math.min(45, Number(input.duration_seconds || 25)))

  const scenes = [
    {
      label: 'Presenter intro',
      presenter_line: `Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help ${audience}.`,
      caption: 'Meet SignalBoost AI',
      visual_direction: 'Show the presenter with a friendly wave and branded glow.',
      goal: 'Create attention in the first three seconds.',
    },
    {
      label: 'Business pain',
      presenter_line: 'Many companies lose time switching between dashboards, reviews, content tools, and approval steps.',
      caption: 'Too many tools. Not enough clarity.',
      visual_direction: 'Show scattered product cards moving into one clean console.',
      goal: 'Make the viewer recognize the problem quickly.',
    },
    {
      label: 'Platform tour',
      presenter_line: `${product} brings the work into one place so you can see what needs attention and what action should happen next.`,
      caption: 'One console for the next action',
      visual_direction: 'Zoom into the platform console and highlight recommendations, approvals, provider data, and content tools.',
      goal: 'Show product value visually.',
    },
    {
      label: 'Approval moment',
      presenter_line: 'COSA can prepare the recommendation, draft the campaign, and organize the work while you stay in control of approval.',
      caption: 'AI operates. Humans approve.',
      visual_direction: 'Animate approve, reject, queue, and ready cards moving through a clean workflow.',
      goal: 'Build trust by showing control.',
    },
    {
      label: 'CTA',
      presenter_line: `Visit ${destination} and see how SignalBoost can help your company turn scattered work into approved action.`,
      caption: `Visit ${destination}`,
      visual_direction: 'End with the presenter beside the branded URL, CTA button, and final product screen.',
      goal: 'Drive traffic to the SaaS platform.',
    },
  ]

  return {
    id: id('presenter_video'),
    presenter_name: 'SignalBoost AI',
    presenter_role: 'official platform guide',
    tone,
    title: 'SignalBoost AI guided platform tour',
    duration_seconds: duration,
    opening_hook: scenes[0].presenter_line,
    scenes,
    cta: `Visit ${destination}`,
    destination_url: destination,
    approval_gates: ['Approve presenter style.', 'Approve opening hook.', 'Approve product tour flow.', 'Approve final video before release.'],
    created_at: new Date().toISOString(),
  }
}
