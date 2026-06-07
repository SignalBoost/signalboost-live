import { signalBoostModules } from '@/lib/platform/unifiedPlatform'

export type SaasTelemetryEvent = {
  id: string
  moduleKey: string
  event: string
  areaKey: string
  audienceKey: string
  detailKey: string
  detailRoleKey: string
  statusKey: string
}

export const saasTelemetryEvents: SaasTelemetryEvent[] = signalBoostModules.map((module, index) => ({
  id: `sb-telemetry-${module.key}`,
  moduleKey: module.labelKey,
  event: module.telemetryEvent,
  areaKey: index % 2 === 0 ? 'admin.area.unified' : 'admin.area.saas',
  audienceKey: module.key === 'assistant' ? 'admin.audience.allRoles' : 'admin.audience.businessOwner',
  detailKey: 'admin.detail.moduleUsage',
  detailRoleKey: module.cockpitRoleKey,
  statusKey: module.key === 'spreadsheets' ? 'admin.status.routing' : 'admin.status.logged',
}))

export const adminTelemetryMetricKeys = [
  { labelKey: 'admin.metrics.modules', value: String(signalBoostModules.length) },
  { labelKey: 'admin.metrics.marketplace', valueKey: 'admin.metrics.marketplaceValue' },
  { labelKey: 'admin.metrics.concierge', valueKey: 'admin.metrics.conciergeValue' },
  { labelKey: 'admin.metrics.telemetry', valueKey: 'admin.metrics.telemetryValue' },
]

export const adminTelemetrySummary = {
  titleKey: 'admin.summary.title',
  descriptionKey: 'admin.summary.description',
  metrics: adminTelemetryMetricKeys,
}
