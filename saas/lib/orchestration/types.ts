export const ORCHESTRATION_MODULES = [
  'promote_business',
  'build_website',
  'collect_reviews',
  'generate_audio',
  'create_videos',
  'improve_website',
  'optimize_podcast_studio',
  'lab',
  'workshop_apprentice',
] as const

export type OrchestrationModule = typeof ORCHESTRATION_MODULES[number]

export const AI_MODES = [
  'copywriting',
  'seo',
  'audio_enhancement',
  'video_clipping',
  'website_audit',
  'podcast_optimization',
  'outreach_generation',
  'review_collection',
  'translation_i18n',
] as const

export type AIMode = typeof AI_MODES[number]
export type WorkflowStatus = 'pending' | 'running' | 'validated' | 'retrying' | 'fallback' | 'completed' | 'operator_required'

export type OrchestrationMemory = {
  language: string
  tone: string
  brand?: string
  projectContext: Record<string, unknown>
  lastActions: string[]
}

export type IntentRoute = {
  module: OrchestrationModule
  confidence: number
  reason: string
  href: string
}

export type ModeSelection = {
  mode: AIMode
  fallbackMode?: AIMode
  confidence: number
  reason: string
}

export type WorkflowStep = {
  id: string
  label: string
  module: OrchestrationModule
  mode: AIMode
  status: WorkflowStatus
  attempts: number
  maxRetries: number
  validate: string
  output?: unknown
  error?: string
}

export type OperatorFallback = {
  required: boolean
  summary: string
  recommendedNextSteps: string[]
}

export type OrchestrationRequest = {
  input: string
  userId?: string
  language?: string
  tone?: string
  brand?: string
  projectContext?: Record<string, unknown>
}

export type OrchestrationResult = {
  intent: IntentRoute
  mode: ModeSelection
  memory: OrchestrationMemory
  steps: WorkflowStep[]
  output: Record<string, unknown>
  fallback: OperatorFallback
  telemetry: Array<Record<string, unknown>>
}
