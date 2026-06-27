// saas/lib/hub/provider-credentials.ts
//
// Maps each Hub Console provider to the env vars its executor needs to function
// (CORE auth only — per-action extras like TWILIO_FROM_NUMBER are validated at
// run time by the executor itself). The status route
// (/api/hub/providers/status) checks presence server-side so a provider card
// reflects REAL connection state ("Live" / "Connect keys") instead of a static
// flag. Env var NAMES are not secrets; their VALUES are never read client-side.

export type ProviderLiveStatus = {
  hasBackend: boolean
  configured: boolean
  missing: string[]
}

export const PROVIDER_REQUIRED_ENV: Record<string, string[]> = {
  // ── Core infrastructure ───────────────────────────────────────────────────
  stripe: ['STRIPE_SECRET_KEY'],
  supabase: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  supabase_mkt: ['MARKETING_SUPABASE_URL', 'MARKETING_SUPABASE_SERVICE_ROLE_KEY'],
  vercel: ['VERCEL_TOKEN'],
  github: ['GITHUB_WRITE_TOKEN'],
  keyvault: ['VAULT_MASTER_KEY'],
  // ── AI & models ───────────────────────────────────────────────────────────
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  assemblyai: ['ASSEMBLYAI_API_KEY'],
  // ── Email ─────────────────────────────────────────────────────────────────
  resend: ['RESEND_API_KEY'],
  sendgrid: ['SENDGRID_API_KEY'],
  // ── Messaging / edge / observability (executors already wired) ────────────
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  cloudflare: ['CLOUDFLARE_API_TOKEN'],
  digitalocean: ['DIGITALOCEAN_TOKEN'],
  datadog: ['DATADOG_API_KEY'],
  sentry: ['SENTRY_AUTH_TOKEN'],
  pagerduty: ['PAGERDUTY_API_KEY'],
  // ── Open Banking (tokens are vaulted; per-institution API keys are optional
  //    until each aggregator app is registered, so only the vault key is a hard
  //    requirement for the provider to be considered "configured") ───────────
  bank: ['VAULT_MASTER_KEY'],
}

// Providers whose actions have a real executor wired into /api/hub/action.
// Anything not in this set renders as a roadmap preview ("Coming soon").
export const PROVIDER_HAS_BACKEND = new Set<string>([
  'stripe', 'supabase', 'supabase_mkt', 'vercel', 'github', 'keyvault',
  'openai', 'anthropic', 'gemini', 'elevenlabs', 'assemblyai', 'resend',
  'sendgrid', 'twilio', 'cloudflare', 'digitalocean', 'datadog', 'sentry', 'pagerduty',
  'bank',
])
