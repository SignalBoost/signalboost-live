import type { CosHeroArchetype, CosHeroStrategy, CosHeroStrategyInput } from './types'

const FIVE_LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru'] as const
const DESTINATION_URL = 'www.' + 'saas.signalboostapp.com'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function chooseHero(input: CosHeroStrategyInput): CosHeroArchetype {
  const text = `${input.niche || ''} ${input.audience || ''} ${input.pain || ''}`.toLowerCase()
  if (text.includes('agency')) return 'agency_builder'
  if (text.includes('consult')) return 'field_consultant'
  if (text.includes('growth') || text.includes('marketing') || text.includes('sales')) return 'growth_manager'
  if (text.includes('technical') || text.includes('provider') || text.includes('setup')) return 'nontechnical_operator'
  return 'overwhelmed_owner'
}

function heroName(hero: CosHeroArchetype) {
  switch (hero) {
    case 'agency_builder': return 'The agency owner who cannot add another tool'
    case 'field_consultant': return 'The consultant who needs proof before the client meeting'
    case 'growth_manager': return 'The growth manager with too many campaigns to coordinate'
    case 'nontechnical_operator': return 'The operator who needs simple answers from complex systems'
    default: return 'The business owner trying to do everything alone'
  }
}

export function buildCosHeroStrategy(input: CosHeroStrategyInput): CosHeroStrategy {
  const hero = chooseHero(input)
  const niche = input.niche || 'small companies that need practical AI help without hiring a full team'
  const audience = input.audience || 'owners, operators, consultants, and small teams'
  const pain = input.pain || 'too much scattered work and not enough time to turn information into action'
  const trafficGoal = input.traffic_goal || 'site_visit'

  return {
    id: id('hero_strategy'),
    niche,
    hero_archetype: hero,
    hero_name: heroName(hero),
    hero_problem: `${audience} are dealing with ${pain}.`,
    emotional_hook: 'Show a real person under pressure, then show the moment the work becomes clear inside one console.',
    opening_line: `What if ${audience} could stop chasing scattered tasks and see the next business action in one place?`,
    story_arc: [
      'Open with the hero overwhelmed by disconnected work.',
      'Show the viewer the exact problem in one simple sentence.',
      'Move into the SignalBoost console and show one clear workflow.',
      'Show the system turning data into a recommended action.',
      'End with the hero staying in control while the system prepares the next step.',
    ],
    proof_moment: `Show ${input.product_or_service} turning one confusing workflow into one visible recommendation, approval, or next action.`,
    traffic_goal: trafficGoal,
    destination_url: DESTINATION_URL,
    monetization_paths: ['platform_signup', 'partner_referral', 'newsletter_capture', 'short_video_revenue'],
    short_video_angles: [
      'Before and after: scattered work becomes one console.',
      'One-minute guided tour: the hero finds the next action.',
      'Problem-first demo: the viewer sees themselves in the hero.',
      'Traffic hook: watch the console solve one business task.',
    ],
    approval_gates: [
      'Approve niche',
      'Approve hero story',
      'Approve hook and opening line',
      'Approve monetization path',
      'Approve final video before release',
    ],
    languages: [...FIVE_LANGUAGES],
    created_at: new Date().toISOString(),
  }
}

export function defaultCosHeroStrategyInput(): CosHeroStrategyInput {
  return {
    company_name: 'SignalBoost',
    product_or_service: 'SignalBoost SaaS console',
    niche: 'small companies that need AI help to manage growth, provider data, reviews, and approvals',
    audience: 'busy business owners and operators',
    pain: 'they have too many dashboards, too many decisions, and no clear operating system',
    traffic_goal: 'site_visit',
    languages: [...FIVE_LANGUAGES],
  }
}
