import { ADMIN_SECTIONS } from '@/lib/admin/sections'

export type AdminMetricTone = 'danger' | 'warning' | 'healthy' | 'neutral'

export type AdminMetricAction = {
  href: string
  actionLabel: string
  tone?: AdminMetricTone
}

const fallbackAction = (sectionKey: string, metricKey: string): AdminMetricAction => {
  if (sectionKey === 'overview') return { href: `/admin?metric=${encodeURIComponent(metricKey)}`, actionLabel: 'Open metric →' }
  if (sectionKey === 'settings') return { href: `/admin/settings?metric=${encodeURIComponent(metricKey)}`, actionLabel: 'Open metric →' }
  return { href: `/admin/${sectionKey}?metric=${encodeURIComponent(metricKey)}`, actionLabel: 'Open metric →' }
}

const route = (href: string, actionLabel = 'View details →', tone?: AdminMetricTone): AdminMetricAction => ({ href, actionLabel, tone })

const ADMIN_METRIC_ACTIONS: Record<string, Partial<Record<string, AdminMetricAction>>> = {
  overview: {
    'overview-0': route('/admin/accounts'),
    'overview-1': route('/admin/accounts?range=today'),
    'overview-2': route('/admin/accounts?range=7d'),
    'overview-3': route('/admin/accounts?range=30d'),
    'overview-4': route('/admin/accounts?status=active'),
    'overview-5': route('/admin/saas?metric=saas-2'),
    'overview-6': route('/admin/saas?metric=saas-3'),
    'overview-7': route('/admin/saas?metric=saas-4'),
    'overview-8': route('/admin/saas?metric=saas-5'),
    'overview-9': route('/admin/saas?metric=saas-6'),
    'overview-10': route('/admin/ai?metric=ai-0'),
    'overview-11': route('/admin/ai?metric=ai-3', 'Investigate →', 'danger'),
    'overview-12': route('/admin/email?metric=email-2'),
    'overview-13': route('/admin/prospects'),
    'overview-14': route('/admin/revenue'),
  },
  adm: Object.fromEntries(ADMIN_SECTIONS.adm.metrics.map(metric => [metric.key, route(`/admin/adm?metric=${metric.key}`)])),
  signalboost: {
    'sb-0': route('/admin/partners?metric=traffic'),
    'sb-1': route('/admin/partners?metric=searches'),
    'sb-2': route('/admin/adm?metric=adm-1'),
    'sb-3': route('/admin/partners?metric=partner-clicks'),
    'sb-4': route('/admin/partners?metric=categories'),
    'sb-5': route('/admin/partners?metric=regions'),
    'sb-6': route('/admin/partners?metric=returning-visitors'),
    'sb-7': route('/admin/partners?metric=search-terms'),
    'sb-8': route('/admin/partners?metric=conversion-clicks'),
  },
  saas: Object.fromEntries(ADMIN_SECTIONS.saas.metrics.map(metric => [metric.key, route(`/admin/saas?metric=${metric.key}`)])),
  sales: {
    'sales-0': route('/admin/prospects'),
    'sales-1': route('/admin/prospects?status=approved'),
    'sales-2': route('/admin/sales?metric=sales-2'),
    'sales-3': route('/admin/email?metric=email-1'),
    'sales-4': route('/admin/email?metric=email-2'),
    'sales-5': route('/admin/email?metric=email-4'),
    'sales-6': route('/admin/sales?metric=sales-6'),
    'sales-7': route('/admin/revenue?metric=clients-won'),
    'sales-8': route('/admin/outreach/runs/latest'),
    'sales-9': route('/admin/sales?metric=sales-9'),
    'sales-10': route('/admin/sales?metric=sales-10'),
    'sales-11': route('/admin/prospects?group=industries'),
    'sales-12': route('/admin/prospects?group=countries'),
    'sales-13': route('/admin/sales?metric=sales-13'),
  },
  revenue: Object.fromEntries(ADMIN_SECTIONS.revenue.metrics.map(metric => [metric.key, route(`/admin/revenue?metric=${metric.key}`)])),
  ai: Object.fromEntries(ADMIN_SECTIONS.ai.metrics.map(metric => [metric.key, route(`/admin/ai?metric=${metric.key}`)])),
  email: Object.fromEntries(ADMIN_SECTIONS.email.metrics.map(metric => [metric.key, route(`/admin/email?metric=${metric.key}`)])),
  partners: Object.fromEntries(ADMIN_SECTIONS.partners.metrics.map(metric => [metric.key, route(`/admin/partners?metric=${metric.key}`)])),
  system: {
    'sys-0': route('/admin/logs?type=api-errors', 'Investigate →', 'danger'),
    'sys-1': route('/admin/deployments?status=failed', 'Investigate →', 'danger'),
    'sys-2': route('/admin/integrations/supabase', 'Open Supabase →', 'healthy'),
    'sys-3': route('/admin/integrations/vercel', 'Open Vercel →', 'healthy'),
    'sys-4': route('/admin/jobs/cron', 'View details →', 'warning'),
    'sys-5': route('/admin/jobs/daily', 'View details →', 'warning'),
    'sys-6': route('/admin/outreach/runs/latest'),
    'sys-7': route('/admin/prospects/discovery/latest'),
  },
  settings: Object.fromEntries(ADMIN_SECTIONS.settings.metrics.map(metric => [metric.key, route(`/admin/settings?metric=${metric.key}`)])),
}

export function getAdminMetricAction(sectionKey: string, metricKey: string): AdminMetricAction {
  const knownMetric = ADMIN_SECTIONS[sectionKey]?.metrics.some(metric => metric.key === metricKey)
  if (!knownMetric) return fallbackAction(sectionKey, metricKey)
  return ADMIN_METRIC_ACTIONS[sectionKey]?.[metricKey] ?? fallbackAction(sectionKey, metricKey)
}
