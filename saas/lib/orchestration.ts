import { SERVICES, type ServiceKey } from '@/lib/services/catalog'

export type OrchestrationIntent =
  | ServiceKey
  | 'outreach'
  | 'pricing'
  | 'support'
  | 'general'

export type AiMode =
  | 'business-growth'
  | 'website-builder'
  | 'review-trust'
  | 'audio-studio'
  | 'video-studio'
  | 'website-optimization'
  | 'podcast-optimization'
  | 'lab-experiment'
  | 'guided-learning'
  | 'operator'

export type WorkflowStage = 'capture' | 'suggest' | 'generate' | 'approve' | 'launch'

export type OrchestrationRoute = {
  intent: OrchestrationIntent
  mode: AiMode
  href: string
  confidence: number
  reason: string
}

export type WorkflowStep = {
  stage: WorkflowStage
  title: string
  description: string
  telemetryEvent: string
}

export type MemoryRecord = {
  key: string
  value: string
  scope: 'session' | 'brand' | 'workflow'
}

export type TelemetryEvent = {
  event: string
  intent: OrchestrationIntent
  mode: AiMode
  at: string
  metadata?: Record<string, string | number | boolean>
}

export type OrchestrationPlan = {
  route: OrchestrationRoute
  workflow: WorkflowStep[]
  memory: MemoryRecord[]
  operatorFallback: {
    enabled: boolean
    trigger: string
    message: string
  }
  api: {
    endpoint: string
    method: 'POST'
    payload: string[]
  }
  telemetry: TelemetryEvent[]
}

const serviceMatchers: Array<{ key: ServiceKey; mode: AiMode; terms: string[] }> = [
  { key: 'promote', mode: 'business-growth', terms: ['promote', 'campaign', 'ad', 'ads', 'marketing', 'offer', 'business'] },
  { key: 'builder', mode: 'website-builder', terms: ['build website', 'new site', 'landing page', 'homepage', 'website builder'] },
  { key: 'reviews', mode: 'review-trust', terms: ['review', 'reviews', 'testimonial', 'feedback', 'stars'] },
  { key: 'audio', mode: 'audio-studio', terms: ['audio', 'voice', 'voiceover', 'tts', 'script', 'narration'] },
  { key: 'video', mode: 'video-studio', terms: ['video', 'reel', 'shorts', 'tiktok', 'caption', 'clip'] },
  { key: 'improve', mode: 'website-optimization', terms: ['improve website', 'optimize website', 'seo', 'speed', 'accessibility', 'conversion', 'audit'] },
  { key: 'podcastStudio', mode: 'podcast-optimization', terms: ['podcast studio', 'podcast optimization', 'episode', 'transcript', 'metadata', 'show notes'] },
  { key: 'lab', mode: 'lab-experiment', terms: ['lab', 'experiment', 'prototype', 'test idea', 'research'] },
  { key: 'apprentice', mode: 'guided-learning', terms: ['apprentice', 'tutorial', 'learn', 'walkthrough', 'guide', 'training'] },
]

const fallbackRoute: OrchestrationRoute = {
  intent: 'general',
  mode: 'operator',
  href: '/dashboard',
  confidence: 0.42,
  reason: 'fallback_operator_triage',
}

export function routeIntent(input: string): OrchestrationRoute {
  const normalized = input.toLowerCase()
  const match = serviceMatchers
    .map((candidate) => ({
      ...candidate,
      score: candidate.terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]

  if (match?.score > 0) {
    const service = SERVICES.find((item) => item.key === match.key)!
    return {
      intent: match.key,
      mode: match.mode,
      href: service.dashboardHref,
      confidence: Math.min(0.98, 0.68 + match.score * 0.1),
      reason: `matched_${match.key}_service_terms`,
    }
  }

  if (normalized.includes('outreach') || normalized.includes('lead') || normalized.includes('sales')) {
    return { intent: 'outreach', mode: 'business-growth', href: '/dashboard/outreach/discovery', confidence: 0.82, reason: 'matched_outreach_terms' }
  }

  if (normalized.includes('price') || normalized.includes('pricing') || normalized.includes('plan')) {
    return { intent: 'pricing', mode: 'operator', href: '/pricing', confidence: 0.78, reason: 'matched_pricing_terms' }
  }

  if (normalized.includes('help') || normalized.includes('support')) {
    return { intent: 'support', mode: 'operator', href: '/support', confidence: 0.76, reason: 'matched_support_terms' }
  }

  return fallbackRoute
}

export function selectAiMode(intent: OrchestrationIntent): AiMode {
  return serviceMatchers.find((item) => item.key === intent)?.mode ?? (intent === 'outreach' ? 'business-growth' : 'operator')
}

export function buildWorkflow(route: OrchestrationRoute): WorkflowStep[] {
  const prefix = route.intent
  return [
    { stage: 'capture', title: 'Capture inputs', description: 'Collect URL, upload, free-text brief, language, audience, and goal.', telemetryEvent: `${prefix}.capture` },
    { stage: 'suggest', title: 'AI suggestions', description: 'Generate focused recommendations before producing final assets.', telemetryEvent: `${prefix}.suggest` },
    { stage: 'generate', title: 'Generate results', description: 'Create localized outputs, checklist items, and next-step actions.', telemetryEvent: `${prefix}.generate` },
    { stage: 'approve', title: 'Human approval', description: 'Require review before publishing, sending, or changing customer-facing assets.', telemetryEvent: `${prefix}.approve` },
    { stage: 'launch', title: 'Launch or hand off', description: 'Open the correct module, API route, or operator fallback with full context.', telemetryEvent: `${prefix}.launch` },
  ]
}

export function buildMemoryLayer(input: string, route: OrchestrationRoute): MemoryRecord[] {
  return [
    { key: 'last_intent', value: route.intent, scope: 'session' },
    { key: 'last_ai_mode', value: route.mode, scope: 'session' },
    { key: 'latest_brief', value: input.slice(0, 240), scope: 'workflow' },
  ]
}

export function createTelemetry(route: OrchestrationRoute, metadata: Record<string, string | number | boolean> = {}): TelemetryEvent[] {
  return [
    { event: 'orchestration.intent_routed', intent: route.intent, mode: route.mode, at: new Date().toISOString(), metadata: { confidence: route.confidence, ...metadata } },
    { event: 'orchestration.workflow_started', intent: route.intent, mode: route.mode, at: new Date().toISOString(), metadata },
  ]
}

export function orchestrate(input: string, metadata: Record<string, string | number | boolean> = {}): OrchestrationPlan {
  const route = routeIntent(input)
  const mode = selectAiMode(route.intent)
  const normalizedRoute = { ...route, mode }

  return {
    route: normalizedRoute,
    workflow: buildWorkflow(normalizedRoute),
    memory: buildMemoryLayer(input, normalizedRoute),
    operatorFallback: {
      enabled: normalizedRoute.confidence < 0.6 || normalizedRoute.mode === 'operator',
      trigger: 'low_confidence_or_operator_mode',
      message: 'If automation cannot complete the task, preserve context and route the user to Operator for safe handoff.',
    },
    api: {
      endpoint: '/api/orchestration',
      method: 'POST',
      payload: ['input', 'locale', 'module', 'url', 'uploadId', 'freeText'],
    },
    telemetry: createTelemetry(normalizedRoute, metadata),
  }
}
