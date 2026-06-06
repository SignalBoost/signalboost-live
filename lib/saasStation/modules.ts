export type SaasStationModuleKey = 'promote' | 'reviews' | 'calendar' | 'spreadsheets' | 'outreach' | 'assistant'

export type Recommendation = {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  rationale: string
  impactScore: number
}

export type RebuildStep = {
  id: string
  title: string
  owner: 'concierge' | 'user' | 'system'
  status: 'ready' | 'queued' | 'blocked'
  estimatedMinutes: number
}

export type ModuleDefinition = {
  key: SaasStationModuleKey
  labelKey: string
  titleKey: string
  descriptionKey: string
  icon: string
  telemetryEvent: string
  analyzerSignals: string[]
  optimizerLevers: string[]
  rebuildBlueprint: string[]
  freeQuota: number
  paidQuota: number
  overageUnitCents: number
  demoFeatures: string[]
  paidFeatures: string[]
}

export const saasStationModules: ModuleDefinition[] = [
  {
    key: 'promote',
    labelKey: 'saas.module.promote.label',
    titleKey: 'saas.module.promote.title',
    descriptionKey: 'saas.module.promote.description',
    icon: '🚀',
    telemetryEvent: 'saas_station.promote.pipeline.completed',
    analyzerSignals: ['Campaign objective clarity', 'Audience-language fit', 'Marketplace category demand', 'Offer proof strength'],
    optimizerLevers: ['Localized value proposition', 'Budget pacing', 'Channel mix', 'Review proof placement'],
    rebuildBlueprint: ['Rewrite offer promise', 'Rebuild campaign sequence', 'Attach proof blocks', 'Prepare launch telemetry'],
    freeQuota: 3,
    paidQuota: 250,
    overageUnitCents: 35,
    demoFeatures: ['Campaign playback preview', 'One localized offer summary', 'Read-only launch checklist'],
    paidFeatures: ['Full campaign analyzer', 'Optimizer scoring', 'Launch rebuild plan', 'Concierge routing', 'Billing-safe overage execution'],
  },
  {
    key: 'reviews',
    labelKey: 'saas.module.reviews.label',
    titleKey: 'saas.module.reviews.title',
    descriptionKey: 'saas.module.reviews.description',
    icon: '⭐',
    telemetryEvent: 'saas_station.reviews.pipeline.completed',
    analyzerSignals: ['Sentiment trend', 'Response latency', 'Proof reuse quality', 'Locale coverage'],
    optimizerLevers: ['Response tone', 'Translation fidelity', 'Proof extraction', 'Escalation routing'],
    rebuildBlueprint: ['Cluster review themes', 'Draft response bank', 'Publish proof snippets', 'Queue reputation follow-ups'],
    freeQuota: 3,
    paidQuota: 300,
    overageUnitCents: 25,
    demoFeatures: ['Sentiment demo playback', 'One response preview', 'Read-only proof checklist'],
    paidFeatures: ['Full review analyzer', 'Multilingual response optimizer', 'Proof rebuild engine', 'Concierge escalations', 'Billing-safe overage execution'],
  },
  {
    key: 'calendar',
    labelKey: 'saas.module.calendar.label',
    titleKey: 'saas.module.calendar.title',
    descriptionKey: 'saas.module.calendar.description',
    icon: '📅',
    telemetryEvent: 'saas_station.calendar.pipeline.completed',
    analyzerSignals: ['Launch window density', 'Local holiday fit', 'Follow-up spacing', 'Booking urgency'],
    optimizerLevers: ['Time-zone routing', 'Reminder cadence', 'Cultural timing', 'Capacity balance'],
    rebuildBlueprint: ['Rebuild seven-day schedule', 'Assign follow-up windows', 'Insert cultural holds', 'Publish booking timeline'],
    freeQuota: 3,
    paidQuota: 200,
    overageUnitCents: 20,
    demoFeatures: ['Schedule playback preview', 'One launch-day recommendation', 'Read-only calendar checklist'],
    paidFeatures: ['Full schedule analyzer', 'Timing optimizer', 'Calendar rebuild plan', 'Concierge booking context', 'Billing-safe overage execution'],
  },
  {
    key: 'spreadsheets',
    labelKey: 'saas.module.spreadsheets.label',
    titleKey: 'saas.module.spreadsheets.title',
    descriptionKey: 'saas.module.spreadsheets.description',
    icon: '📊',
    telemetryEvent: 'saas_station.spreadsheets.pipeline.completed',
    analyzerSignals: ['Column completeness', 'Duplicate risk', 'Lead freshness', 'KPI readiness'],
    optimizerLevers: ['Schema mapping', 'Deduplication', 'Lead scoring', 'Outreach handoff'],
    rebuildBlueprint: ['Normalize columns', 'Merge duplicates', 'Score rows', 'Export outreach-ready segments'],
    freeQuota: 3,
    paidQuota: 500,
    overageUnitCents: 10,
    demoFeatures: ['CSV health playback', 'One schema recommendation', 'Read-only cleanup checklist'],
    paidFeatures: ['Full spreadsheet analyzer', 'Data optimizer', 'Rebuild-ready normalized plan', 'Concierge handoff', 'Billing-safe overage execution'],
  },
  {
    key: 'outreach',
    labelKey: 'saas.module.outreach.label',
    titleKey: 'saas.module.outreach.title',
    descriptionKey: 'saas.module.outreach.description',
    icon: '📡',
    telemetryEvent: 'saas_station.outreach.pipeline.completed',
    analyzerSignals: ['Queue health', 'Approval status', 'Channel mix', 'Reply trend'],
    optimizerLevers: ['Send pacing', 'Personalization depth', 'Channel routing', 'Follow-up timing'],
    rebuildBlueprint: ['Prioritize queue', 'Rewrite message variants', 'Route channels', 'Schedule follow-up ladder'],
    freeQuota: 3,
    paidQuota: 400,
    overageUnitCents: 30,
    demoFeatures: ['Outreach playback preview', 'One message recommendation', 'Read-only send checklist'],
    paidFeatures: ['Full outreach analyzer', 'Sequence optimizer', 'Rebuild send ladder', 'Concierge intent routing', 'Billing-safe overage execution'],
  },
  {
    key: 'assistant',
    labelKey: 'saas.module.assistant.label',
    titleKey: 'saas.module.assistant.title',
    descriptionKey: 'saas.module.assistant.description',
    icon: '🤖',
    telemetryEvent: 'saas_station.assistant.pipeline.completed',
    analyzerSignals: ['Intent clarity', 'Marketplace context', 'Module match', 'Telemetry trail'],
    optimizerLevers: ['Prompt focus', 'Next-action ranking', 'Locale routing', 'Context compression'],
    rebuildBlueprint: ['Normalize request', 'Classify module intent', 'Assemble context', 'Return validated translated output'],
    freeQuota: 5,
    paidQuota: 600,
    overageUnitCents: 15,
    demoFeatures: ['Concierge playback preview', 'One next-action recommendation', 'Read-only routing trace'],
    paidFeatures: ['Full Concierge analyzer', 'Intent optimizer', 'Context rebuild engine', 'JSON-safe translated output', 'Billing-safe overage execution'],
  },
]

export function getSaasStationModule(key: string | undefined) {
  return saasStationModules.find((module) => module.key === key)
}

export function isSaasStationModuleKey(value: string): value is SaasStationModuleKey {
  return saasStationModules.some((module) => module.key === value)
}
