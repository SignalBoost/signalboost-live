// saas/lib/hub/provider-matrix-policy.ts
// Safe Provider Matrix helpers for Console Hub.
//
// The Provider Matrix UI must stay display-only in the browser. Real actions
// continue through ProviderActionLauncher, /api/hub/action, /api/hub/action/engine,
// and Infrastructure PR approval paths.

export type ProviderMatrixCategory =
  | 'auth'
  | 'database'
  | 'payments'
  | 'infrastructure'
  | 'source_control'
  | 'ai'
  | 'communications'
  | 'observability'
  | 'security'
  | 'other'

export type ProviderMatrixRisk = 'read_only' | 'standard' | 'sensitive'

const CATEGORY_BY_PROVIDER: Record<string, ProviderMatrixCategory> = {
  auth0: 'auth',
  okta: 'auth',
  supabase: 'database',
  firebase: 'database',
  mongodb: 'database',
  'mongodb-atlas': 'database',
  redis: 'database',
  stripe: 'payments',
  aws: 'infrastructure',
  gcp: 'infrastructure',
  'google-cloud': 'infrastructure',
  azure: 'infrastructure',
  vercel: 'infrastructure',
  cloudflare: 'infrastructure',
  digitalocean: 'infrastructure',
  railway: 'infrastructure',
  netlify: 'infrastructure',
  github: 'source_control',
  openai: 'ai',
  anthropic: 'ai',
  gemini: 'ai',
  replicate: 'ai',
  elevenlabs: 'ai',
  'hugging-face': 'ai',
  resend: 'communications',
  sendgrid: 'communications',
  twilio: 'communications',
  postmark: 'communications',
  mailgun: 'communications',
  sentry: 'observability',
  datadog: 'observability',
  pagerduty: 'observability',
  'new-relic': 'observability',
}

const SENSITIVE_WORDS = [
  'add',
  'archive',
  'cancel',
  'create',
  'delete',
  'disable',
  'edit',
  'env',
  'migration',
  'promote',
  'purge',
  'refund',
  'release',
  'remove',
  'reset',
  'rollback',
  'rotate',
  'sql',
  'sync',
  'trigger',
  'update',
]

const READ_ONLY_WORDS = [
  'check',
  'get',
  'list',
  'view',
  'search',
]

export const PROVIDER_MATRIX_BROWSER_RULES = {
  mode: 'catalog_display_only',
  providerActions: 'use_existing_hub_action_routes',
  sensitiveChanges: 'stage_infrastructure_pr_before_execution',
  browserCredentialPolicy: 'show_presence_only_never_values',
  auditPolicy: 'use_existing_hub_audit_layer',
} as const

export function providerMatrixCategory(providerId: string): ProviderMatrixCategory {
  return CATEGORY_BY_PROVIDER[String(providerId || '').toLowerCase()] || 'other'
}

export function providerMatrixRisk(templateId: string): ProviderMatrixRisk {
  const action = String(templateId || '').split('.').slice(1).join('_').toLowerCase()
  if (!action) return 'standard'
  if (SENSITIVE_WORDS.some(word => action.includes(word))) return 'sensitive'
  if (READ_ONLY_WORDS.some(word => action.includes(word))) return 'read_only'
  return 'standard'
}

export function providerMatrixRequiresApproval(templateId: string): boolean {
  return providerMatrixRisk(templateId) === 'sensitive'
}

export function providerMatrixDisplayLabel(value: string): string {
  return String(value || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
