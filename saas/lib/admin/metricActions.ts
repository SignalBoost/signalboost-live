import { ADMIN_SECTIONS } from '@/lib/admin/sections'

export type AdminMetricAction = {
  href: string
  label: string
  external?: boolean
  priority?: 'normal' | 'warning' | 'danger' | 'healthy'
}

type ActionInput = { href: string; label?: string; external?: boolean; priority?: AdminMetricAction['priority'] }

const ACTIONS: Record<string, ActionInput> = {
  'overview.total users': { href: '/admin/accounts' },
  'overview.new users today': { href: '/admin/accounts?range=today' },
  'overview.new users this week': { href: '/admin/accounts?range=7d' },
  'overview.new users this month': { href: '/admin/accounts?range=30d' },
  'overview.active users': { href: '/admin/accounts?status=active' },
  'overview.total projects created': { href: '/admin/projects' },
  'overview.total websites created': { href: '/admin/sites' },
  'overview.total podcasts/audio jobs': { href: '/admin/audio/jobs' },
  'overview.total videos/captions': { href: '/admin/video/jobs' },
  'overview.total reviews collected': { href: '/admin/reviews' },
  'overview.total ai requests': { href: '/admin/ai/requests' },
  'overview.total failed ai requests': { href: '/admin/ai/errors', priority: 'danger' },
  'overview.total emails drafted/sent': { href: '/admin/email/logs' },
  'overview.total leads discovered': { href: '/admin/prospects' },
  'overview.total sales pipeline value': { href: '/admin/sales/pipeline' },

  'adm.concierge sessions': { href: '/admin/concierge/sessions' },
  'adm.marketplace queries': { href: '/admin/concierge?area=marketplace' },
  'adm.saas module queries': { href: '/admin/concierge?area=saas' },
  'adm.partner intents': { href: '/admin/concierge/intents?type=partner' },
  'adm.business owner intents': { href: '/admin/concierge/intents?type=business-owner' },
  'adm.customer intents': { href: '/admin/concierge/intents?type=customer' },
  'adm.hmi steps completed': { href: '/admin/concierge/hmi' },
  'adm.telemetry events logged': { href: '/admin/telemetry' },
  'adm.proactive recommendations': { href: '/admin/concierge/recommendations' },

  'signalboost.visitors': { href: '/admin/analytics/traffic' },
  'signalboost.searches': { href: '/admin/marketplace/searches' },
  'signalboost.concierge queries': { href: '/admin/concierge?source=marketplace' },
  'signalboost.partner clicks': { href: '/admin/partners/clicks' },
  'signalboost.top partner categories': { href: '/admin/partners/categories' },
  'signalboost.top regions/countries': { href: '/admin/analytics/regions' },
  'signalboost.returning visitors': { href: '/admin/analytics/retention' },
  'signalboost.popular search terms': { href: '/admin/analytics/search-terms' },
  'signalboost.partner conversion clicks': { href: '/admin/partners/conversions' },

  'saas.signups': { href: '/admin/accounts?source=saas' },
  'saas.active users': { href: '/admin/accounts?status=active&source=saas' },
  'saas.projects per user': { href: '/admin/projects' },
  'saas.website builder usage': { href: '/admin/sites' },
  'saas.audio usage': { href: '/admin/audio/jobs' },
  'saas.video usage': { href: '/admin/video/jobs' },
  'saas.review collector usage': { href: '/admin/reviews' },
  'saas.ai assistant usage': { href: '/admin/ai/usage' },
  'saas.language usage': { href: '/admin/analytics/languages' },
  'saas.plan distribution': { href: '/admin/billing/plans' },

  'sales.prospects discovered': { href: '/admin/prospects?status=discovered' },
  'sales.prospects approved': { href: '/admin/prospects?status=approved' },
  'sales.sketches generated': { href: '/admin/outreach/sketches' },
  'sales.emails drafted': { href: '/admin/outreach/emails?status=drafted' },
  'sales.emails sent': { href: '/admin/outreach/emails?status=sent' },
  'sales.replies received': { href: '/admin/outreach/replies' },
  'sales.meetings booked': { href: '/admin/sales/meetings' },
  'sales.clients won': { href: '/admin/sales/clients?status=won' },
  'sales.daily outreach count': { href: '/admin/outreach/runs?range=today' },
  'sales.response rate': { href: '/admin/outreach/performance' },
  'sales.conversion rate': { href: '/admin/sales/conversions' },
  'sales.top industries': { href: '/admin/prospects/industries' },
  'sales.top countries': { href: '/admin/prospects/countries' },
  'sales.next follow-ups': { href: '/admin/sales/follow-ups' },

  'revenue.free users': { href: '/admin/accounts?plan=free' },
  'revenue.paid users': { href: '/admin/accounts?plan=paid' },
  'revenue.mrr': { href: '/admin/billing/mrr' },
  'revenue.plan upgrades': { href: '/admin/billing/upgrades' },
  'revenue.cancellations': { href: '/admin/billing/cancellations', priority: 'warning' },
  'revenue.trial users': { href: '/admin/accounts?plan=trial' },
  'revenue.estimated monthly value': { href: '/admin/revenue/forecast' },
  'revenue.revenue by plan': { href: '/admin/revenue/plans' },
  'revenue.revenue by country': { href: '/admin/revenue/countries' },

  'ai.ai requests by provider': { href: '/admin/ai/providers' },
  'ai.openai usage': { href: '/admin/ai/providers/openai' },
  'ai.anthropic usage': { href: '/admin/ai/providers/anthropic' },
  'ai.failed ai calls': { href: '/admin/ai/errors', priority: 'danger' },
  'ai.average response time': { href: '/admin/ai/latency' },
  'ai.most common user intents': { href: '/admin/ai/intents' },
  'ai.prompt intelligence results': { href: '/admin/ai/prompt-intelligence' },
  'ai.action router intents': { href: '/admin/ai/action-router' },
  'ai.culture engine usage': { href: '/admin/ai/culture-engine' },
  'ai.cost estimate': { href: '/admin/ai/costs' },

  'email.marketing emails drafted': { href: '/admin/email/drafts?type=marketing' },
  'email.sales emails drafted': { href: '/admin/email/drafts?type=sales' },
  'email.emails sent': { href: '/admin/email/sent' },
  'email.bounce/failure counts': { href: '/admin/email/bounces', priority: 'warning' },
  'email.reply counts': { href: '/admin/email/replies' },
  'email.campaign performance': { href: '/admin/email/campaigns' },
  'email.best performing subject lines': { href: '/admin/email/subject-lines' },
  'email.unsubscribe/opt-out count': { href: '/admin/email/unsubscribes', priority: 'warning' },

  'partners.partner list': { href: '/admin/partners' },
  'partners.active partners': { href: '/admin/partners?status=active' },
  'partners.partner clicks': { href: '/admin/partners/clicks' },
  'partners.best performing partners': { href: '/admin/partners/performance' },
  'partners.categories with most demand': { href: '/admin/partners/categories?sort=demand' },
  'partners.countries with most partner activity': { href: '/admin/partners/countries' },
  'partners.missing partner categories': { href: '/admin/partners/gaps', priority: 'warning' },

  'system.api errors': { href: '/admin/logs?type=api-errors', priority: 'danger' },
  'system.failed builds/deployments': { href: '/admin/deployments?status=failed', priority: 'danger' },
  'system.supabase connection status': { href: '/admin/integrations/supabase', label: 'Open dashboard →', priority: 'healthy' },
  'system.vercel/deployment status': { href: '/admin/integrations/vercel', label: 'Open dashboard →', priority: 'healthy' },
  'system.cron job status': { href: '/admin/jobs/cron', priority: 'warning' },
  'system.daily job results': { href: '/admin/jobs/daily' },
  'system.last successful outreach run': { href: '/admin/outreach/runs/latest' },
  'system.last successful prospect discovery run': { href: '/admin/prospects-discovery/discovery/latest' },

  'settings.admin users': { href: '/admin/settings/admin-users', label: 'Manage →' },
  'settings.email sending controls': { href: '/admin/settings/email-sending', label: 'Manage →' },
  'settings.daily outreach limits': { href: '/admin/settings/outreach-limits', label: 'Manage →' },
  'settings.ai provider preferences': { href: '/admin/settings/ai-providers', label: 'Manage →' },
  'settings.safety controls': { href: '/admin/settings/safety', label: 'Manage →' },
  'settings.manual approval required toggle': { href: '/admin/settings/approvals', label: 'Manage →' },
  'settings.competitor recommendation blocking': { href: '/admin/settings/competitor-blocking', label: 'Manage →' },
  'settings.culture engine rules': { href: '/admin/settings/culture-engine', label: 'Manage →' },
}

const KEY_ACTIONS: Record<string, ActionInput> = Object.fromEntries(
  Object.values(ADMIN_SECTIONS).flatMap(section =>
    section.metrics.map(metric => [`${section.key}.${metric.key}` as string, ACTIONS[`${section.key}.${normalize(metric.label)}`]] as const),
  ).filter((entry): entry is readonly [string, ActionInput] => Boolean(entry[1])),
)

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

function fallbackHref(sectionKey: string, label: string): string {
  const slug = normalize(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'metric'
  return `/admin/${encodeURIComponent(sectionKey)}/${slug}`
}

function actionLabel(action: ActionInput): string {
  if (action.label) return action.label
  if (action.priority === 'danger' || action.priority === 'warning') return 'Investigate →'
  return 'View details →'
}

export function getAdminMetricAction(params: { sectionKey: string; metricKey: string; label: string }): AdminMetricAction {
  const sectionKey = normalize(params.sectionKey)
  const metricKey = normalize(params.metricKey)
  const label = normalize(params.label)
  const action = KEY_ACTIONS[`${sectionKey}.${metricKey}`] ?? ACTIONS[`${sectionKey}.${label}`] ?? { href: fallbackHref(sectionKey, label) }

  return {
    href: action.href,
    label: actionLabel(action),
    external: action.external,
    priority: action.priority ?? 'normal',
  }
}
