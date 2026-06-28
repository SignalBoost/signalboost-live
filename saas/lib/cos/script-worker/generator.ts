import type { CosContentWorkerInput, CosContentWorkerOutput } from './types'

const SIGNALBOOST_URL = 'signalboostapp.com'

function productAngle(input: CosContentWorkerInput) {
  const text = `${input.title} ${input.objective} ${input.brief}`.toLowerCase()
  if (text.includes('pr cockpit') || text.includes('vercel') || text.includes('provider') || text.includes('platform tour')) return 'SignalBoost platform tour'
  if (text.includes('console') || text.includes('cosa') || text.includes('cos')) return 'AI-operated business command center'
  if (text.includes('outreach')) return 'AI-assisted outreach and sales follow-up'
  if (text.includes('website')) return 'fast website and content improvement'
  if (text.includes('review')) return 'customer reviews and trust building'
  return 'SignalBoost growth tools for small business operators'
}

function wantsPlatformTour(input: CosContentWorkerInput) {
  const text = `${input.title} ${input.objective} ${input.brief}`.toLowerCase()
  return text.includes('pr cockpit') || text.includes('vercel') || text.includes('provider') || text.includes('platform tour') || text.includes('tour')
}

function platformTourScenes() {
  return [
    {
      label: 'Start here',
      narration: `Go to ${SIGNALBOOST_URL}. The goal is simple: bring business tools, provider status, approvals, and guided action into one console.`,
      visual_direction: 'Show the SignalBoost URL as a persistent lower-third, then zoom into the main console dashboard.',
    },
    {
      label: 'Console tour',
      narration: 'From the dashboard, the user can see where work is happening: campaigns, approvals, infrastructure checks, metrics, and connected services.',
      visual_direction: 'Animate the navigation opening and highlight Dashboard, Owner Hub, Metrics, Data Connectors, and Infrastructure PRs.',
    },
    {
      label: 'PR Cockpit',
      narration: 'The PR cockpit helps users review proposed platform changes before those changes affect the business. The owner can inspect, approve, or reject work instead of guessing what changed.',
      visual_direction: 'Show a pull request card, changed files, risk summary, approval button, and deployment readiness indicator.',
    },
    {
      label: 'Provider data',
      narration: 'Connected providers can feed live status back into the console. For example, Vercel deployment data can show what is live, what failed, and what needs attention.',
      visual_direction: 'Show Vercel-style deployment cards, live status, last build, environment checks, and a clear recommended action.',
    },
    {
      label: 'Human approval',
      narration: 'The system prepares the work, explains the risk, and recommends the next step. The human stays in control and approves important actions before release.',
      visual_direction: 'Show approve, reject, queue, and release gates with animated signal lines flowing into corporate memory.',
    },
  ]
}

function standardScenes() {
  return [
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
      narration: 'SignalBoost uses COSA to organize recommendations, campaigns, approvals, and worker tasks so the owner can govern instead of manually managing every step.',
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
}

export function generateContentDraft(input: CosContentWorkerInput): CosContentWorkerOutput {
  const angle = productAngle(input)
  const createdAt = new Date().toISOString()
  const isTour = wantsPlatformTour(input)

  const title = isTour
    ? 'SignalBoost platform tour: console, PR cockpit, provider data, and approvals'
    : input.channel === 'youtube'
      ? `How ${angle} helps small businesses grow without adding more manual work`
      : input.title

  const opening = isTour
    ? `This walkthrough shows how a company can use SignalBoost from ${SIGNALBOOST_URL}: start in the console, review the PR cockpit, inspect provider data such as Vercel status, and keep human approval before important action.`
    : `Most business owners do not have a marketing department, a sales department, and a content team. They have a product, a few hours, and too many tasks. This episode explains how ${angle} can turn scattered work into an organized growth system.`

  const scenes = isTour ? platformTourScenes() : standardScenes()

  const draft = [
    `Title: ${title}`,
    '',
    `URL on screen: ${SIGNALBOOST_URL}`,
    '',
    'Opening:',
    opening,
    '',
    'Main flow:',
    ...scenes.map((scene, index) => `${index + 1}. ${scene.label}: ${scene.narration}`),
    '',
    'Close:',
    isTour
      ? `Visit ${SIGNALBOOST_URL} to see how SignalBoost can turn platform work, provider data, and approvals into one guided workflow.`
      : `Visit ${SIGNALBOOST_URL} and start turning recommendations into approved growth campaigns.`,
  ].join('\n')

  return {
    title,
    opening,
    draft,
    scenes,
    call_to_action: isTour
      ? `Visit ${SIGNALBOOST_URL} and explore the SignalBoost console.`
      : `Visit ${SIGNALBOOST_URL} and start turning recommendations into approved growth campaigns.`,
    estimated_duration_minutes: isTour ? 4 : 5,
    created_at: createdAt,
  }
}
