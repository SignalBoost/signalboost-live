import { marketplaceSignals, signalBoostModules } from '@/lib/platform/unifiedPlatform'

const moduleMatcher = signalBoostModules.map((module) => ({
  module,
  tokens: [module.key, module.label.toLowerCase(), ...module.signals.map((signal) => signal.toLowerCase())],
}))

export function answerSignalBoostConcierge(query: string, locale = 'en') {
  const normalized = query.toLowerCase()
  const matches = moduleMatcher
    .filter(({ tokens }) => tokens.some((token) => normalized.includes(token)))
    .map(({ module }) => module)

  const selected = matches.length > 0 ? matches : signalBoostModules
  const modules = selected.slice(0, 3).map((module) => `${module.icon} ${module.label}`).join(', ')
  const marketplace = marketplaceSignals.filter((signal) => normalized.includes(signal.split(' ')[0]))

  return {
    locale,
    scope: 'SignalBoost Marketplace + SaaS',
    telemetryEvent: 'concierge.unified_query.logged',
    reply:
      `SignalBoost Concierge can help across Marketplace and SaaS. Start with ${modules}; ` +
      `then connect the work to Marketplace signals like ${marketplace.length ? marketplace.join(', ') : marketplaceSignals.slice(0, 3).join(', ')}. ` +
      'I will log the module intent, recommended next action, and Marketplace context in Admin Console telemetry.',
    nextActions: selected.slice(0, 4).map((module) => ({ label: module.label, href: module.href })),
  }
}
