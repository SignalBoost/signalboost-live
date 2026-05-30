import { signalBoostModules } from '@/lib/platform/unifiedPlatform'

export type SaasTelemetryEvent = {
  id: string
  module: string
  event: string
  area: 'Marketplace' | 'SaaS' | 'Unified cockpit'
  audience: string
  detail: string
  status: 'logged' | 'routing' | 'attention'
}

export const saasTelemetryEvents: SaasTelemetryEvent[] = signalBoostModules.map((module, index) => ({
  id: `sb-telemetry-${module.key}`,
  module: module.label,
  event: module.telemetryEvent,
  area: index % 2 === 0 ? 'Unified cockpit' : 'SaaS',
  audience: module.key === 'assistant' ? 'All roles' : 'Business owner',
  detail: `${module.cockpitRole} usage is logged inside SignalBoost with Marketplace context.`,
  status: module.key === 'spreadsheets' ? 'routing' : 'logged',
}))

export const adminTelemetrySummary = {
  title: 'SignalBoost Admin Console telemetry',
  description:
    'SaaS usage is logged in the SignalBoost repo and correlated with Marketplace partner, category, booking, and Concierge activity.',
  metrics: [
    { label: 'SaaS modules monitored', value: String(signalBoostModules.length) },
    { label: 'Marketplace context', value: 'Partners + bookings' },
    { label: 'Concierge coverage', value: 'Marketplace + SaaS' },
    { label: 'Telemetry stream', value: 'Unified cockpit' },
  ],
}
