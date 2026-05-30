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

export type ExecutiveTelemetryCard = {
  label: string
  value: string
  trend: string
  status: 'nominal' | 'watch' | 'accelerating'
}

export type ExecutiveForecast = {
  segment: string
  prediction: string
  confidence: string
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

export const executiveTelemetry = {
  financials: [
    { label: 'ARR signal', value: '$1.24M', trend: '+18% QoQ', status: 'accelerating' },
    { label: 'Marketplace GMV', value: '$418K', trend: '+11% MoM', status: 'nominal' },
    { label: 'SaaS credits used', value: '72%', trend: '+9% adoption', status: 'nominal' },
  ] satisfies ExecutiveTelemetryCard[],
  kpis: [
    { label: 'Activation', value: '64%', trend: '+7 pts', status: 'accelerating' },
    { label: 'Review velocity', value: '1.8K', trend: '+22%', status: 'accelerating' },
    { label: 'Concierge resolution', value: '91%', trend: '+5 pts', status: 'nominal' },
  ] satisfies ExecutiveTelemetryCard[],
  crmPipeline: [
    { label: 'Qualified partners', value: '286', trend: '+34 this week', status: 'accelerating' },
    { label: 'At-risk accounts', value: '19', trend: 'needs owner review', status: 'watch' },
    { label: 'Renewal cockpit', value: '82%', trend: 'on track', status: 'nominal' },
  ] satisfies ExecutiveTelemetryCard[],
  outreach: [
    { label: 'Queued sends', value: '4.6K', trend: 'healthy throttle', status: 'nominal' },
    { label: 'Approval SLA', value: '2h 14m', trend: '-18%', status: 'accelerating' },
    { label: 'Reply trend', value: '12.4%', trend: '+2.1 pts', status: 'accelerating' },
  ] satisfies ExecutiveTelemetryCard[],
  forecasts: [
    { segment: 'Revenue', prediction: 'Next 30 days forecast +14% with Marketplace booking lift.', confidence: '89%' },
    { segment: 'CRM', prediction: 'Partner churn risk concentrates in 19 accounts without review follow-up.', confidence: '84%' },
    { segment: 'Outreach', prediction: 'Localized campaigns should outperform generic sends by 1.6x.', confidence: '91%' },
  ] satisfies ExecutiveForecast[],
}

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
