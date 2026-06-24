import { marketplaceSignals, signalBoostModules } from '@/lib/platform/unifiedPlatform'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { SupportedVideoLocale } from '@/lib/video/types'

const supportedLocales = ['en', 'es', 'pt', 'pl', 'ru'] as const
const moduleMatcher = signalBoostModules.map((module) => ({
  module,
  tokens: [module.key, module.label.toLowerCase(), ...module.signals.map((signal) => signal.toLowerCase())],
}))
const videoIntentTokens = {
  video_edit: ['video edit', 'editor', 'canvas', 'trim', 'timeline', 'studio'],
  caption_overlay: ['caption', 'subtitle', 'srt', 'vtt', 'overlay', 'burn'],
  video_export: ['export', 'render', 'mp4', 'download', 'ffmpeg', 'transcode'],
}

type ConciergeOptions = {
  tier?: string
  usedMinutes?: number
  billingProvider?: 'stripe' | 'paypal'
  // True when the caller could not determine real usage (e.g. a transient usage-
  // query failure). When set, overage/quota guidance is presented as unverified
  // rather than asserting a (possibly understated) 0-used position.
  usageUnavailable?: boolean
}

function normalizeLocale(locale: string): SupportedVideoLocale {
  const short = locale.toLowerCase().slice(0, 2)
  return supportedLocales.includes(short as SupportedVideoLocale) ? short as SupportedVideoLocale : 'en'
}

export function classifyConciergeIntent(query: string) {
  const normalized = query.toLowerCase()
  const intents = Object.entries(videoIntentTokens)
    .filter(([, tokens]) => tokens.some((token) => normalized.includes(token)))
    .map(([intent]) => intent)
  return intents.length ? intents : ['general_saas']
}

export function answerSignalBoostConcierge(query: string, locale = 'en', options: ConciergeOptions = {}) {
  const safeLocale = normalizeLocale(locale)
  const normalized = query.toLowerCase()
  const intents = classifyConciergeIntent(query)
  const matches = moduleMatcher
    .filter(({ tokens }) => tokens.some((token) => normalized.includes(token)))
    .map(({ module }) => module)
  const videoRequested = intents.some((intent) => intent.startsWith('video_'))
  const selected = videoRequested
    ? signalBoostModules.filter((module) => module.key === 'video')
    : matches.length > 0 ? matches : signalBoostModules
  const modules = selected.slice(0, 3).map((module) => `${module.icon} ${module.label}`).join(', ')
  const marketplace = marketplaceSignals.filter((signal) => normalized.includes(signal.split(' ')[0]))
  const quota = calculateVideoQuota(options.tier, Number(options.usedMinutes || 0), options.billingProvider || 'stripe')
  const exportGate = assertCanExport(quota)
  // Tier-based gating (exportEnabled / demoOnly) is valid regardless of usage;
  // only the overage portion depends on the consumed-minutes figure, so we gate
  // overage claims on whether usage was actually verified.
  const usageKnown = options.usageUnavailable !== true
  const overageRequired = usageKnown ? quota.requiresOverageCharge : null
  const pipeline = videoRequested ? {
    IntentClassifier: intents,
    SubscriptionChecker: { tier: quota.tier, exportEnabled: quota.exportEnabled, demoOnly: quota.demoOnly, decision: exportGate.reason },
    JobQueueController: { endpoint: '/api/video/export', worker: 'npm run worker:video', jobTypes: ['transcode', 'caption_burn', 'export'] },
    StorageController: { uploadEndpoint: '/api/video/upload', renderBucket: 'public/video-renders' },
    BillingHandler: { provider: quota.overageProvider, overageRequired, rateUsd: quota.overageRateUsd, usageKnown },
    OutputValidator: { jsonSafe: true, schema: 'JsonSafeVideoResponse<T>' },
    Translator: { locale: safeLocale, supportedLocales },
  } : null

  return {
    locale: safeLocale,
    scope: 'SignalBoost Marketplace + SaaS',
    telemetryEvent: videoRequested ? 'concierge.video_pipeline.logged' : 'concierge.unified_query.logged',
    intents,
    pipeline,
    reply:
      videoRequested
        ? `SignalBoost Video Studio is ready for ${intents.join(', ')}. Use the canvas editor for synced draggable captions, enqueue FFmpeg exports through /api/video/export, and ${quota.demoOnly ? 'upgrade from free/demo for full-length export.' : !usageKnown ? 'confirm your remaining minutes in the dashboard before exporting, since overage charges may apply.' : quota.requiresOverageCharge ? `approve the ${quota.overageProvider} overage charge before rendering.` : 'render the downloadable MP4 from the worker queue.'}`
        : `SignalBoost Concierge can help across Marketplace and SaaS. Start with ${modules}; then connect the work to Marketplace signals like ${marketplace.length ? marketplace.join(', ') : marketplaceSignals.slice(0, 3).join(', ')}. I will log the module intent, recommended next action, and Marketplace context in Admin Console telemetry.`,
    nextActions: selected.slice(0, 4).map((module) => ({ label: module.label, href: module.href })),
  }
}
