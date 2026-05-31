export type SignalBoostModule = {
  key: 'promote' | 'reviews' | 'calendar' | 'spreadsheets' | 'outreach' | 'assistant'
  label: string
  labelKey: string
  href: string
  icon: string
  description: string
  descriptionKey: string
  telemetryEvent: string
  cockpitRole: string
  cockpitRoleKey: string
  signals: string[]
}

export const signalBoostModules: SignalBoostModule[] = [
  { key: 'promote', label: 'Promote Business', labelKey: 'module.promote.label', href: '/dashboard/promote', icon: '🚀', description: 'Plan multilingual campaigns, launch offers, and connect promotions to Marketplace demand signals.', descriptionKey: 'module.promote.description', telemetryEvent: 'saas.promote_business.viewed', cockpitRole: 'Growth launch control', cockpitRoleKey: 'module.promote.role', signals: ['Campaign objective', 'Audience language', 'Marketplace category', 'Launch readiness'] },
  { key: 'reviews', label: 'Reviews', labelKey: 'module.reviews.label', href: '/dashboard/reviews', icon: '⭐', description: 'Collect, triage, translate, and reuse customer proof inside brand and Marketplace workflows.', descriptionKey: 'module.reviews.description', telemetryEvent: 'saas.reviews.viewed', cockpitRole: 'Trust and reputation desk', cockpitRoleKey: 'module.reviews.role', signals: ['Review velocity', 'Sentiment', 'Response status', 'Reusable proof'] },
  { key: 'calendar', label: 'Calendar', labelKey: 'module.calendar.label', href: '/dashboard/calendar', icon: '📅', description: 'Schedule SaaS launches, outreach windows, local holidays, review asks, and Marketplace booking moments.', descriptionKey: 'module.calendar.description', telemetryEvent: 'saas.calendar.viewed', cockpitRole: 'Mission timeline', cockpitRoleKey: 'module.calendar.role', signals: ['7-day plan', 'Cultural timing', 'Booked moments', 'Follow-up windows'] },
  { key: 'spreadsheets', label: 'Spreadsheets', labelKey: 'module.spreadsheets.label', href: '/dashboard/spreadsheets', icon: '📊', description: 'Import CSV lists, normalize contacts, track KPIs, and route spreadsheet rows into Outreach.', descriptionKey: 'module.spreadsheets.description', telemetryEvent: 'saas.spreadsheets.viewed', cockpitRole: 'Data operations grid', cockpitRoleKey: 'module.spreadsheets.role', signals: ['CSV readiness', 'Column mapping', 'Lead status', 'KPI rollups'] },
  { key: 'outreach', label: 'Outreach', labelKey: 'module.outreach.label', href: '/dashboard/outreach', icon: '📡', description: 'Coordinate email, partner notifications, social prompts, and review follow-ups from one cockpit.', descriptionKey: 'module.outreach.description', telemetryEvent: 'saas.outreach.viewed', cockpitRole: 'Communications console', cockpitRoleKey: 'module.outreach.role', signals: ['Queue health', 'Approval status', 'Channel mix', 'Response trend'] },
  { key: 'assistant', label: 'Personal Assistant', labelKey: 'module.assistant.label', href: '/dashboard/assistant', icon: '🤖', description: 'Use one Concierge AI layer to route questions across Marketplace, SaaS modules, pricing, and next actions.', descriptionKey: 'module.assistant.description', telemetryEvent: 'saas.assistant.viewed', cockpitRole: 'Concierge AI automations', cockpitRoleKey: 'module.assistant.role', signals: ['Intent', 'Context source', 'Recommended module', 'Next action'] },
]

export const activeCockpitModules = signalBoostModules
export const marketingNavModules = signalBoostModules.filter((module) => ['promote', 'reviews', 'assistant'].includes(module.key))
export const getModuleByKey = (key: SignalBoostModule['key']) => signalBoostModules.find((module) => module.key === key)

export const marketplaceSignals = ['travel bookings', 'creator tools', 'local services', 'commerce stack', 'customer proof']

export const cockpitWireframe = [
  { key: 'cockpit.wireframe.missionSignal', fallback: 'Mission signal summary across Marketplace and SaaS modules' },
  { key: 'cockpit.wireframe.coreSystems', fallback: 'Core systems: Reviews, Promote Business, Calendar, Spreadsheets, Outreach, Assistant' },
  { key: 'cockpit.wireframe.conciergeBand', fallback: 'Concierge band routes questions to the best module and next action' },
]
