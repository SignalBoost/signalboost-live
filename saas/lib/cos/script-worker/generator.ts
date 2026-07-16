import type { CosContentWorkerInput, CosContentWorkerOutput } from './types'

// Human-prepared (non-AI) outreach generator. Free, deterministic, never fails,
// no API key. Upgraded July 2026 to be DYNAMIC: each generation picks different
// scene phrasings from variant pools so users don't all get an identical script,
// and the copy centers the USER'S business (via {angle}), not SignalBoost.
//
// This is the "template" mode of the hybrid script generator. The "ai" mode
// (aiGenerator.ts) writes a bespoke script through the model layer and charges.

const SIGNALBOOST_URL = 'www.' + 'saas.signalboostapp.com'

function productAngle(input: CosContentWorkerInput): string {
  const explicit = `${input.title} ${input.brief}`.trim()
  if (explicit.length > 3) return explicit.length > 80 ? explicit.slice(0, 80).trim() : explicit
  const text = `${input.title} ${input.objective} ${input.brief}`.toLowerCase()
  if (text.includes('outreach')) return 'your outreach and sales follow-up'
  if (text.includes('website')) return 'your website and content'
  if (text.includes('review')) return 'your customer reviews and reputation'
  return 'your business'
}

function wantsPlatformTour(input: CosContentWorkerInput): boolean {
  const text = `${input.title} ${input.objective} ${input.brief}`.toLowerCase()
  return text.includes('pr cockpit') || text.includes('vercel') || text.includes('provider tour') || text.includes('platform tour')
}

function seedFrom(input: CosContentWorkerInput): number {
  const basis = `${input.campaign_id}:${input.title}:${Date.now()}`
  let h = 0
  for (let i = 0; i < basis.length; i++) h = (h * 31 + basis.charCodeAt(i)) >>> 0
  return h
}

function pick<T>(pool: T[], seed: number, salt: number): T {
  return pool[(seed + salt) % pool.length]
}

const OPENINGS = (angle: string, channel: string): string[] => [
  `Most owners do not have a marketing team, a sales team, and a content team. They have a product, a few hours, and too many tasks. Here is how ${angle} can turn scattered effort into an organized system.`,
  `Every business owner knows the feeling: too much to promote, too little time to do it well. This ${channel === 'youtube' ? 'video' : 'message'} shows how ${angle} can grow without adding more manual work.`,
  `Growth rarely fails from lack of effort. It fails from lack of coordination. Here is a simple, repeatable way to put ${angle} in front of the right people.`,
  `If you have ever started a campaign and then lost momentum halfway through, this is for you. A clear, short path to promote ${angle} without burning out.`,
]

const PROBLEM = (angle: string): { narration: string; visual_direction: string }[] => [
  { narration: `Reaching the right customers for ${angle} means juggling email, social posts, follow-ups, and content - usually all at once.`, visual_direction: 'Show a busy owner switching between inbox, social apps, and a to-do list.' },
  { narration: `The hardest part of promoting ${angle} is not the work itself - it is deciding what to do next and staying consistent.`, visual_direction: 'Show scattered sticky notes and half-finished tasks piling up.' },
  { narration: `Small teams lose hours every week trying to keep outreach for ${angle} organized across too many tools.`, visual_direction: 'Show multiple browser tabs and apps competing for attention.' },
]

const INSIGHT = (angle: string): { narration: string; visual_direction: string }[] => [
  { narration: `The fix is not more effort. It is a clear next step: one message, one audience, one call to action for ${angle}.`, visual_direction: 'Show chaos resolving into a single clean checklist.' },
  { narration: `Consistency beats intensity. A steady, simple outreach rhythm for ${angle} outperforms occasional big pushes.`, visual_direction: 'Show a calm repeating weekly rhythm on a calendar.' },
  { narration: `When the next action is obvious, outreach for ${angle} actually gets done - and gets done well.`, visual_direction: 'Show a single highlighted "do this next" card.' },
]

const SOLUTION = (angle: string): { narration: string; visual_direction: string }[] => [
  { narration: `Prepare one focused piece of outreach for ${angle}: who it is for, what it offers, and the single action you want them to take.`, visual_direction: 'Show a clean outreach draft forming: audience, offer, one clear button.' },
  { narration: `Package ${angle} into a short, specific message that speaks to one audience and asks for one thing.`, visual_direction: 'Show a message being shaped and tightened to a single ask.' },
  { narration: `Turn ${angle} into a repeatable outreach template you can reuse and adjust each week.`, visual_direction: 'Show a reusable template being duplicated and lightly edited.' },
]

const BENEFIT = (angle: string): { narration: string; visual_direction: string }[] => [
  { narration: `You stay in control. The draft is prepared for you, and nothing is sent until you review and approve it.`, visual_direction: 'Show review, edit, and approve controls with clear safety labels.' },
  { narration: `Less guesswork, more momentum. Each piece of outreach for ${angle} builds on the last.`, visual_direction: 'Show steady upward progress from repeated small wins.' },
  { narration: `Your time goes to decisions, not busywork - you approve, adjust, and send when it is ready.`, visual_direction: 'Show the owner reviewing rather than typing from scratch.' },
]

const NEXT_STEP = (angle: string): { narration: string; visual_direction: string }[] => [
  { narration: `Start with one piece of outreach for ${angle}. Measure the response, then repeat what worked.`, visual_direction: 'Show results feeding back into the next campaign.' },
  { narration: `Send one message this week for ${angle}, see who responds, and refine from there.`, visual_direction: 'Show a single send, then replies coming in.' },
  { narration: `Pick one audience for ${angle}, reach out, and let the results guide the next step.`, visual_direction: 'Show one audience selected and a clear outcome measured.' },
]

const CLOSINGS = (angle: string): string[] => [
  `Prepare your outreach for ${angle}, review it, and send when you are ready.`,
  `Get one clear message for ${angle} ready this week - you stay in control of when it goes out.`,
  `Turn ${angle} into steady, organized outreach - one approved step at a time.`,
]

function platformTourScenes() {
  return [
    { label: 'Start here', narration: `Go to ${SIGNALBOOST_URL}. Bring business tools, provider status, approvals, and guided action into one console.`, visual_direction: 'Show the platform address as a lower-third, then the console dashboard.' },
    { label: 'Console tour', narration: 'See where work is happening: campaigns, approvals, infrastructure checks, metrics, and connected services.', visual_direction: 'Animate the navigation and highlight the main areas.' },
    { label: 'PR Cockpit', narration: 'Review proposed platform changes before they affect the business - inspect, approve, or reject.', visual_direction: 'Show a pull request card with risk summary and approval button.' },
    { label: 'Provider data', narration: 'Connected providers feed live status back into the console, such as deployment health.', visual_direction: 'Show deployment cards with live status and a recommended action.' },
    { label: 'Human approval', narration: 'The system prepares the work and recommends the next step. The human approves important actions before release.', visual_direction: 'Show approve, reject, and release gates.' },
  ]
}

export function generateContentDraft(input: CosContentWorkerInput): CosContentWorkerOutput {
  const createdAt = new Date().toISOString()
  const angle = productAngle(input)
  const isTour = wantsPlatformTour(input)
  const seed = seedFrom(input)

  const title = isTour
    ? 'SignalBoost platform tour: console, PR cockpit, provider data, and approvals'
    : input.channel === 'youtube'
      ? pick([
          `How ${angle} can grow without adding more manual work`,
          `A simple way to promote ${angle} and stay consistent`,
          `Turn ${angle} into steady, organized outreach`,
        ], seed, 1)
      : (input.title || `Outreach for ${angle}`)

  const opening = isTour
    ? `This walkthrough shows how a company can use SignalBoost from ${SIGNALBOOST_URL}: start in the console, review the PR cockpit, inspect provider data, and keep human approval before important action.`
    : pick(OPENINGS(angle, input.channel), seed, 2)

  const scenes = isTour ? platformTourScenes() : [
    { label: 'Problem', ...pick(PROBLEM(angle), seed, 3) },
    { label: 'Insight', ...pick(INSIGHT(angle), seed, 5) },
    { label: 'Solution', ...pick(SOLUTION(angle), seed, 7) },
    { label: 'Benefit', ...pick(BENEFIT(angle), seed, 11) },
    { label: 'Next step', ...pick(NEXT_STEP(angle), seed, 13) },
  ]

  const closing = isTour
    ? `Visit ${SIGNALBOOST_URL} to see how SignalBoost turns platform work, provider data, and approvals into one guided workflow.`
    : pick(CLOSINGS(angle), seed, 17)

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
    closing,
  ].join('\n')

  return {
    title,
    opening,
    draft,
    scenes,
    call_to_action: closing,
    estimated_duration_minutes: isTour ? 4 : 5,
    created_at: createdAt,
  }
}
