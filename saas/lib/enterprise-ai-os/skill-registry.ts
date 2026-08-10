import type { EnterpriseSkill } from './types.ts'

const SKILLS: readonly EnterpriseSkill[] = [
  {
    skillId: 'find_decision_makers',
    title: 'Find Decision Makers',
    description: 'Discover and enrich target stakeholders for qualified organizations.',
    capabilityIds: ['prospect.search', 'prospect.enrich'],
    hubIds: ['prospect'],
    requiredApproval: false,
    mutating: false,
    inputs: ['organization', 'persona'],
    outputs: ['contacts', 'evidence'],
    tags: ['prospecting', 'sales'],
  },
  {
    skillId: 'generate_outreach',
    title: 'Generate Outreach',
    description: 'Prepare governed outreach using buyer context and learned performance signals.',
    capabilityIds: ['communication.compose'],
    hubIds: ['communication'],
    requiredApproval: true,
    mutating: false,
    inputs: ['contact', 'campaign', 'knowledge'],
    outputs: ['message'],
    tags: ['outreach', 'sales', 'marketing'],
  },
  {
    skillId: 'send_approved_outreach',
    title: 'Send Approved Outreach',
    description: 'Send only outreach that has passed the configured approval policy.',
    capabilityIds: ['communication.send'],
    hubIds: ['communication'],
    requiredApproval: true,
    mutating: true,
    inputs: ['approved_message', 'recipient'],
    outputs: ['delivery_receipt', 'revenue_event'],
    tags: ['outreach', 'execution'],
  },
  {
    skillId: 'book_meeting',
    title: 'Book Meeting',
    description: 'Coordinate a qualified meeting through configured communication and calendar capabilities.',
    capabilityIds: ['communication.reply', 'calendar.schedule'],
    hubIds: ['communication', 'universal_adapter'],
    requiredApproval: true,
    mutating: true,
    inputs: ['qualified_reply', 'availability'],
    outputs: ['meeting', 'revenue_event'],
    tags: ['sales', 'meeting'],
  },
  {
    skillId: 'create_opportunity',
    title: 'Create Opportunity',
    description: 'Create or synchronize a qualified opportunity in the buyer CRM.',
    capabilityIds: ['crm.opportunity.create', 'crm.activity.log'],
    hubIds: ['crm'],
    requiredApproval: true,
    mutating: true,
    inputs: ['qualified_prospect', 'meeting'],
    outputs: ['opportunity', 'revenue_event'],
    tags: ['crm', 'sales'],
  },
  {
    skillId: 'forecast_revenue',
    title: 'Forecast Revenue',
    description: 'Produce deterministic forecasts from canonical Revenue Intelligence.',
    capabilityIds: ['revenue.forecast', 'revenue.metrics'],
    hubIds: ['revenue'],
    requiredApproval: false,
    mutating: false,
    inputs: ['revenue_snapshot'],
    outputs: ['forecast', 'optimization_signals'],
    tags: ['revenue', 'forecast'],
  },
  {
    skillId: 'optimize_revenue',
    title: 'Optimize Revenue',
    description: 'Recommend changes to audience, messaging, timing, pipeline and cost using business outcomes.',
    capabilityIds: ['revenue.optimize', 'decision.rank'],
    hubIds: ['revenue', 'crm', 'communication', 'prospect'],
    requiredApproval: true,
    mutating: false,
    inputs: ['optimization_signals', 'goals'],
    outputs: ['recommendations'],
    tags: ['revenue', 'optimization'],
  },
  {
    skillId: 'manage_pipeline',
    title: 'Manage Pipeline',
    description: 'Inspect and prioritize pipeline actions using CRM state and Revenue Intelligence.',
    capabilityIds: ['crm.pipeline.read', 'revenue.metrics', 'decision.rank'],
    hubIds: ['crm', 'revenue'],
    requiredApproval: false,
    mutating: false,
    inputs: ['pipeline', 'goals'],
    outputs: ['priorities'],
    tags: ['pipeline', 'sales'],
  },
  {
    skillId: 'retain_customer',
    title: 'Retain Customer',
    description: 'Identify renewal and customer-success actions using outcome and communication signals.',
    capabilityIds: ['revenue.metrics', 'communication.compose', 'crm.activity.log'],
    hubIds: ['revenue', 'communication', 'crm'],
    requiredApproval: true,
    mutating: false,
    inputs: ['customer', 'revenue_history'],
    outputs: ['retention_plan'],
    tags: ['customer_success', 'renewal'],
  },
] as const

const registry = new Map(SKILLS.map(skill => [skill.skillId, skill]))

export function listEnterpriseSkills(): readonly EnterpriseSkill[] {
  return SKILLS
}

export function getEnterpriseSkill(skillId: string): EnterpriseSkill | null {
  return registry.get(skillId) || null
}

export function resolveEnterpriseSkills(skillIds: readonly string[]): readonly EnterpriseSkill[] {
  const seen = new Set<string>()
  return skillIds.map(skillId => {
    if (seen.has(skillId)) throw new Error('duplicate_skill_id')
    seen.add(skillId)
    const skill = getEnterpriseSkill(skillId)
    if (!skill) throw new Error(`unknown_skill:${skillId}`)
    return skill
  })
}
