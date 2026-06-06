import { marketplaceSignals, signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { saasStationModules } from '@/lib/saasStation/modules'

const moduleMatcher = signalBoostModules.map((module) => ({
  module,
  tokens: [module.key, module.label.toLowerCase(), ...module.signals.map((signal) => signal.toLowerCase())],
}))

const conciergeStages = [
  'Preprocessor',
  'IntentClassifier',
  'SubscriptionChecker',
  'UsageController',
  'BillingHandler',
  'ModelCaller',
  'OutputValidator',
  'Translator',
] as const

function normalizeQuery(query: string) {
  return query.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function answerSignalBoostConcierge(query: string, locale = 'en') {
  const normalized = normalizeQuery(query)
  const matches = moduleMatcher
    .filter(({ tokens }) => tokens.some((token) => normalized.includes(token)))
    .map(({ module }) => module)

  const stationMatch = saasStationModules.find((module) => normalized.includes(module.key))
  const selected = matches.length > 0 ? matches : signalBoostModules
  const modules = selected.slice(0, 3).map((module) => `${module.icon} ${module.label}`).join(', ')
  const marketplace = marketplaceSignals.filter((signal) => normalized.includes(signal.split(' ')[0]))
  const routedModule = stationMatch?.key ?? selected[0]?.key ?? 'assistant'

  return {
    locale,
    scope: 'SignalBoost Marketplace + SaaS Station',
    telemetryEvent: 'concierge.unified_query.logged',
    pipeline: conciergeStages.map((stage, index) => ({
      stage,
      status: 'complete' as const,
      order: index + 1,
    })),
    routing: {
      module: routedModule,
      href: `/saas-station/${routedModule}`,
      subscriptionEnforced: true,
      quotaEnforced: true,
      billingEnabled: true,
      outputSchema: 'SaasStationPipelineOutput',
    },
    reply:
      `SignalBoost Concierge can help across Marketplace and SaaS Station. Start with ${modules}; ` +
      `then connect the work to Marketplace signals like ${marketplace.length ? marketplace.join(', ') : marketplaceSignals.slice(0, 3).join(', ')}. ` +
      `I routed this request through ${conciergeStages.join(' → ')} and selected /saas-station/${routedModule}.`,
    nextActions: selected.slice(0, 4).map((module) => ({ label: module.label, href: `/saas-station/${module.key}` })),
  }
}
