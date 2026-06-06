import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'
import { createOverageCharge, type BillingCharge, type BillingProvider } from './billing'
import { getSaasStationModule, isSaasStationModuleKey, type ModuleDefinition, type Recommendation, type RebuildStep, type SaasStationModuleKey } from './modules'

export type SubscriptionTier = 'free' | 'demo' | 'launch' | 'growth' | 'command'
export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type SaasStationPipelineInput = {
  module: string
  text?: string
  locale?: string
  subscriptionTier?: string
  usage?: number
  quota?: number
  userId?: string
  billingProvider?: BillingProvider
}

export type SaasStationPipelineOutput = {
  ok: boolean
  module: SaasStationModuleKey
  locale: SupportedLocale
  subscription: {
    tier: SubscriptionTier
    isPaid: boolean
    access: 'demo_limited' | 'full' | 'over_quota_billable'
    quota: number
    usageBefore: number
    usageAfter: number
    remaining: number
    overageUnits: number
    demoLimitApplied: boolean
  }
  analyzer: {
    score: number
    summary: string
    signals: Array<{ name: string; status: 'strong' | 'watch' | 'weak'; score: number }>
  }
  optimizer: {
    recommendations: Recommendation[]
    nextBestAction: string
  }
  rebuild: {
    canExecute: boolean
    mode: 'demo_playback' | 'production_rebuild'
    steps: RebuildStep[]
  }
  billing: BillingCharge
  concierge: ReturnType<typeof answerSignalBoostConcierge>
  translator: {
    sourceLocale: SupportedLocale
    targetLocale: SupportedLocale
    translated: boolean
  }
  telemetry: {
    event: string
    auditType: 'analyze_optimize_rebuild'
    jsonSafe: true
  }
}

const supportedLocales: SupportedLocale[] = ['en', 'es', 'pt', 'pl', 'ru']
const paidTiers: SubscriptionTier[] = ['launch', 'growth', 'command']

function normalizeLocale(locale: string | undefined): SupportedLocale {
  const short = (locale ?? 'en').toLowerCase().slice(0, 2)
  return supportedLocales.includes(short as SupportedLocale) ? short as SupportedLocale : 'en'
}

function normalizeTier(tier: string | undefined): SubscriptionTier {
  const normalized = (tier ?? 'free').toLowerCase()
  if (normalized === 'paid' || normalized === 'pro') return 'growth'
  if (['free', 'demo', 'launch', 'growth', 'command'].includes(normalized)) return normalized as SubscriptionTier
  return 'free'
}

function normalizeText(text: string | undefined, module: ModuleDefinition) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean || `${module.key} module request with marketplace context, localized output, quota enforcement, optimizer recommendations, and rebuild plan.`
}

function classifyIntent(text: string, requestedModule: string): SaasStationModuleKey {
  const normalized = text.toLowerCase()
  if (isSaasStationModuleKey(requestedModule) && normalized.length < 12) return requestedModule
  const intents: Array<[SaasStationModuleKey, string[]]> = [
    ['promote', ['campaign', 'offer', 'promotion', 'ad', 'launch']],
    ['reviews', ['review', 'sentiment', 'reputation', 'testimonial', 'proof']],
    ['calendar', ['calendar', 'schedule', 'booking', 'appointment', 'timeline']],
    ['spreadsheets', ['csv', 'spreadsheet', 'sheet', 'rows', 'columns', 'data']],
    ['outreach', ['outreach', 'email', 'sequence', 'follow-up', 'partner']],
    ['assistant', ['concierge', 'assistant', 'help', 'route', 'intent']],
  ]
  return intents.find(([, tokens]) => tokens.some((token) => normalized.includes(token)))?.[0] ?? (isSaasStationModuleKey(requestedModule) ? requestedModule : 'assistant')
}

function scoreSignal(signal: string, text: string, index: number) {
  const words = signal.toLowerCase().split(/\W+/).filter(Boolean)
  const matches = words.filter((word) => text.toLowerCase().includes(word)).length
  const score = Math.min(98, Math.max(48, 62 + matches * 14 + text.length % 17 - index * 3))
  const status: 'strong' | 'watch' | 'weak' = score >= 78 ? 'strong' : score >= 62 ? 'watch' : 'weak'
  return { name: signal, status, score }
}

function buildRecommendations(module: ModuleDefinition, text: string, demoLimited: boolean): Recommendation[] {
  return module.optimizerLevers.map((lever, index) => ({
    id: `${module.key}-rec-${index + 1}`,
    priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
    title: demoLimited ? `Preview ${lever}` : `Optimize ${lever}`,
    rationale: `${lever} improves ${module.analyzerSignals[index % module.analyzerSignals.length].toLowerCase()} for the request: ${text.slice(0, 96)}${text.length > 96 ? '…' : ''}`,
    impactScore: Math.min(99, 74 + index * 5 + (text.length % 9)),
  }))
}

function buildRebuildSteps(module: ModuleDefinition, demoLimited: boolean): RebuildStep[] {
  return module.rebuildBlueprint.map((title, index) => ({
    id: `${module.key}-step-${index + 1}`,
    title: demoLimited ? `${title} (demo playback)` : title,
    owner: index === 0 ? 'concierge' : index === 1 ? 'system' : 'user',
    status: demoLimited && index > 1 ? 'blocked' : index === 0 ? 'ready' : 'queued',
    estimatedMinutes: 8 + index * 6,
  }))
}

export function runSaasStationPipeline(input: SaasStationPipelineInput): SaasStationPipelineOutput {
  const initialModule = getSaasStationModule(input.module) ?? getSaasStationModule('assistant')!
  const normalizedText = normalizeText(input.text, initialModule)
  const intentModuleKey = classifyIntent(normalizedText, initialModule.key)
  const module = getSaasStationModule(intentModuleKey)!
  const locale = normalizeLocale(input.locale)
  const tier = normalizeTier(input.subscriptionTier)
  const isPaid = paidTiers.includes(tier)
  const quota = Math.max(1, Number(input.quota ?? (isPaid ? module.paidQuota : module.freeQuota)))
  const usageBefore = Math.max(0, Number(input.usage ?? 0))
  const usageAfter = usageBefore + 1
  const overageUnits = Math.max(0, usageAfter - quota)
  const demoLimitApplied = !isPaid
  const access = demoLimitApplied ? 'demo_limited' : overageUnits > 0 ? 'over_quota_billable' : 'full'
  const signals = module.analyzerSignals.map((signal, index) => scoreSignal(signal, normalizedText, index))
  const score = Math.round(signals.reduce((sum, signal) => sum + signal.score, 0) / signals.length)
  const billing = createOverageCharge({ module, userId: input.userId ?? 'anonymous', overageUnits, provider: input.billingProvider })
  const concierge = answerSignalBoostConcierge(`${module.key} ${normalizedText}`, locale)

  return {
    ok: true,
    module: module.key,
    locale,
    subscription: {
      tier,
      isPaid,
      access,
      quota,
      usageBefore,
      usageAfter,
      remaining: Math.max(0, quota - usageAfter),
      overageUnits,
      demoLimitApplied,
    },
    analyzer: {
      score,
      summary: demoLimitApplied
        ? `Demo analysis for ${module.key}: ${module.demoFeatures.join('; ')}.`
        : `Production analysis for ${module.key}: ${module.paidFeatures.join('; ')}.`,
      signals,
    },
    optimizer: {
      recommendations: buildRecommendations(module, normalizedText, demoLimitApplied),
      nextBestAction: demoLimitApplied ? 'Upgrade to unlock the production rebuild engine.' : module.rebuildBlueprint[0],
    },
    rebuild: {
      canExecute: !demoLimitApplied,
      mode: demoLimitApplied ? 'demo_playback' : 'production_rebuild',
      steps: buildRebuildSteps(module, demoLimitApplied),
    },
    billing,
    concierge,
    translator: {
      sourceLocale: locale,
      targetLocale: locale,
      translated: locale !== 'en',
    },
    telemetry: {
      event: module.telemetryEvent,
      auditType: 'analyze_optimize_rebuild',
      jsonSafe: true,
    },
  }
}
