// saas/app/api/admin/setup/env-vars/route.ts
// Owner/admin setup checklist for provider environment variables.
// This helps operators see what the platform needs without hunting through
// provider dashboards. It never returns raw private secrets.

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

type EnvVisibility = 'public_value' | 'masked_secret' | 'presence_only'
type EnvProvider =
  | 'supabase'
  | 'vercel'
  | 'signalboost'
  | 'ai_models'
  | 'email'
  | 'payments'
  | 'github'
  | 'media'
  | 'cloud'
  | 'monitoring'
  | 'sms'
  | 'identity'

type EnvChecklistItem = {
  key: string
  provider: EnvProvider
  required: boolean
  recommended: boolean
  visibility: EnvVisibility
  present: boolean
  safeValue: string | null
  copyValue: string | null
  whereItIsUsed: string
  operatorNote: string
  vercelEnvironment: 'Production' | 'Preview' | 'Development' | 'All'
}

function isAdminAccess(): Promise<boolean> {
  return getAccess()
    .then(access => access.isAdmin)
    .catch(() => false)
}

function maskSecret(value: string | undefined): string | null {
  if (!value) return null
  if (value.length <= 12) return '••••'
  return `${value.slice(0, 6)}••••${value.slice(-4)}`
}

function publicValue(value: string | undefined): string | null {
  return value && value.trim() ? value.trim().replace(/\/$/, '') : null
}

function envItem(input: {
  key: string
  provider: EnvProvider
  required?: boolean
  recommended?: boolean
  visibility?: EnvVisibility
  whereItIsUsed: string
  operatorNote: string
  vercelEnvironment?: 'Production' | 'Preview' | 'Development' | 'All'
}): EnvChecklistItem {
  const raw = process.env[input.key]
  const present = Boolean(raw && raw.trim())
  const visibility = input.visibility || 'masked_secret'
  const safeValue = visibility === 'public_value'
    ? publicValue(raw)
    : visibility === 'masked_secret'
      ? maskSecret(raw)
      : null

  return {
    key: input.key,
    provider: input.provider,
    required: input.required === true,
    recommended: input.recommended !== false,
    visibility,
    present,
    safeValue,
    copyValue: visibility === 'public_value' ? publicValue(raw) : null,
    whereItIsUsed: input.whereItIsUsed,
    operatorNote: input.operatorNote,
    vercelEnvironment: input.vercelEnvironment || 'Production',
  }
}

function buildChecklist(): EnvChecklistItem[] {
  return [
    // Core Supabase
    envItem({
      key: 'NEXT_PUBLIC_SUPABASE_URL',
      provider: 'supabase',
      required: true,
      visibility: 'public_value',
      vercelEnvironment: 'All',
      whereItIsUsed: 'Browser and server Supabase client connection.',
      operatorNote: 'Safe to display. This is the Supabase project URL, for example https://<project-ref>.supabase.co. Use the value without a trailing slash.',
    }),
    envItem({
      key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      provider: 'supabase',
      required: true,
      visibility: 'masked_secret',
      vercelEnvironment: 'All',
      whereItIsUsed: 'Browser Supabase auth and public client operations.',
      operatorNote: 'Supabase anon/public key. It is browser-usable, but this setup endpoint still masks it to avoid accidental copy into logs or chat.',
    }),
    envItem({
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      provider: 'supabase',
      required: true,
      visibility: 'masked_secret',
      whereItIsUsed: 'Server-only admin database actions, Hub Console, audits, vault, and infrastructure PR storage.',
      operatorNote: 'Private server key. It cannot be safely recovered from Vercel or exposed by this app. Paste it once into Vercel or a vault; after that the platform can confirm presence only.',
    }),

    // Optional secondary/marketing Supabase
    envItem({
      key: 'SECONDARY_SUPABASE_URL',
      provider: 'supabase',
      required: false,
      visibility: 'public_value',
      vercelEnvironment: 'All',
      whereItIsUsed: 'Optional secondary Supabase project / marketing database connection.',
      operatorNote: 'Only needed if this deployment uses a separate secondary Supabase project.',
    }),
    envItem({
      key: 'SECONDARY_SUPABASE_SERVICE_ROLE_KEY',
      provider: 'supabase',
      required: false,
      whereItIsUsed: 'Server-only service role for the optional secondary Supabase project.',
      operatorNote: 'Private key. Required only when SECONDARY_SUPABASE_URL is configured.',
    }),
    envItem({
      key: 'MARKETING_SUPABASE_URL',
      provider: 'supabase',
      required: false,
      visibility: 'public_value',
      vercelEnvironment: 'All',
      whereItIsUsed: 'Optional marketing Supabase project connection.',
      operatorNote: 'Only needed if marketing/outreach data is stored in a separate Supabase project.',
    }),
    envItem({
      key: 'MARKETING_SUPABASE_SERVICE_ROLE_KEY',
      provider: 'supabase',
      required: false,
      whereItIsUsed: 'Server-only service role for the optional marketing Supabase project.',
      operatorNote: 'Private key. Required only when MARKETING_SUPABASE_URL is configured.',
    }),

    // Vercel control plane
    envItem({
      key: 'VERCEL_TOKEN',
      provider: 'vercel',
      required: true,
      whereItIsUsed: 'Hub Console Vercel provider actions such as listing env vars, adding env vars, domains, deployments, and project checks.',
      operatorNote: 'Private Vercel token. Required before the platform can manage Vercel from inside SignalBoostAi.',
    }),
    envItem({
      key: 'VERCEL_HUB_PROJECT',
      provider: 'vercel',
      required: true,
      whereItIsUsed: 'Identifies the Vercel project used by Hub Console provider actions.',
      operatorNote: 'Project identifier/name used by the Vercel provider templates. Masked because project identifiers can be operationally sensitive.',
    }),
    envItem({
      key: 'VERCEL_PROJECT_ID',
      provider: 'vercel',
      required: false,
      whereItIsUsed: 'Optional Vercel project id fallback for redeploy and project-level operations.',
      operatorNote: 'Use when a Vercel API path requires the project id rather than the project name.',
    }),
    envItem({
      key: 'VERCEL_DEPLOY_HOOK_URL',
      provider: 'vercel',
      required: false,
      whereItIsUsed: 'Optional production redeploy hook used by infrastructure PR merge flows.',
      operatorNote: 'Recommended for the portable infrastructure cockpit so approved infra changes can trigger a deployment without exposing the hook URL.',
    }),

    // AI/model providers
    envItem({
      key: 'ANTHROPIC_API_KEY',
      provider: 'ai_models',
      required: true,
      whereItIsUsed: 'Primary Concierge / Chief of Staff chat backend.',
      operatorNote: 'Required for the AI chat route when using Anthropic models.',
    }),
    envItem({
      key: 'OPENAI_API_KEY',
      provider: 'ai_models',
      required: false,
      whereItIsUsed: 'Audit engine, OpenAI-powered generation, model fallback, and provider hub checks.',
      operatorNote: 'Recommended if this deployment uses OpenAI audit, image, or text workflows.',
    }),
    envItem({
      key: 'GEMINI_API_KEY',
      provider: 'ai_models',
      required: false,
      whereItIsUsed: 'Optional Gemini model/provider workflows.',
      operatorNote: 'Only needed when Gemini actions are enabled.',
    }),

    // Email/outreach
    envItem({
      key: 'RESEND_API_KEY',
      provider: 'email',
      required: false,
      whereItIsUsed: 'Transactional email and governed outreach sending through Resend.',
      operatorNote: 'Required if outreach/email sending uses Resend.',
    }),
    envItem({
      key: 'RESEND_WEBHOOK_SECRET',
      provider: 'email',
      required: false,
      whereItIsUsed: 'Verifies Resend delivery webhooks.',
      operatorNote: 'Recommended when delivery status, bounced, complained, open, or clicked events are tracked.',
    }),
    envItem({
      key: 'RESEND_AUDIENCE_ID',
      provider: 'email',
      required: false,
      whereItIsUsed: 'Optional Resend audience/contact list operations.',
      operatorNote: 'Only needed if this deployment syncs contacts to a Resend audience.',
    }),
    envItem({
      key: 'SENDGRID_API_KEY',
      provider: 'email',
      required: false,
      whereItIsUsed: 'Optional SendGrid provider actions.',
      operatorNote: 'Only needed if SendGrid is enabled as a provider.',
    }),

    // Payments
    envItem({
      key: 'STRIPE_SECRET_KEY',
      provider: 'payments',
      required: false,
      whereItIsUsed: 'Stripe products, prices, subscriptions, checkout, billing, and Hub Console Stripe actions.',
      operatorNote: 'Required if the SaaS sells plans or uses Stripe provider actions.',
    }),
    envItem({
      key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      provider: 'payments',
      required: false,
      visibility: 'public_value',
      vercelEnvironment: 'All',
      whereItIsUsed: 'Browser-side Stripe checkout initialization.',
      operatorNote: 'Public Stripe publishable key. Safe to display, but still environment-specific.',
    }),
    envItem({
      key: 'STRIPE_WEBHOOK_SECRET',
      provider: 'payments',
      required: false,
      whereItIsUsed: 'Verifies Stripe webhook events for subscriptions, payments, and credits.',
      operatorNote: 'Recommended for billing/subscription reliability.',
    }),

    // GitHub/repository automation
    envItem({
      key: 'GITHUB_WRITE_TOKEN',
      provider: 'github',
      required: false,
      whereItIsUsed: 'AI code commits, branch proposals, repo reads/writes, and GitHub provider actions.',
      operatorNote: 'Required if the COS will create ai/* branches or manage GitHub through the Hub Console.',
    }),

    // Media and content generation
    envItem({
      key: 'ELEVENLABS_API_KEY',
      provider: 'media',
      required: false,
      whereItIsUsed: 'Text-to-speech, audio studio, and voice generation workflows.',
      operatorNote: 'Required only when ElevenLabs voice/audio features are enabled.',
    }),
    envItem({
      key: 'ASSEMBLYAI_API_KEY',
      provider: 'media',
      required: false,
      whereItIsUsed: 'Speech transcription and audio/video analysis workflows.',
      operatorNote: 'Required only when AssemblyAI transcription features are enabled.',
    }),
    envItem({
      key: 'REPLICATE_API_TOKEN',
      provider: 'media',
      required: false,
      whereItIsUsed: 'Optional media/model generation provider.',
      operatorNote: 'Only needed if Replicate actions are enabled.',
    }),
    envItem({
      key: 'YOUTUBE_API_KEY',
      provider: 'media',
      required: false,
      whereItIsUsed: 'Video search, campaign video discovery, and YouTube data lookups.',
      operatorNote: 'Only needed if YouTube search/discovery or publishing support is enabled.',
    }),

    // Internal safety / vault
    envItem({
      key: 'VAULT_MASTER_KEY',
      provider: 'signalboost',
      required: false,
      whereItIsUsed: 'Optional internal vault encryption for provider secrets and governed setup workflows.',
      operatorNote: 'Recommended for portable/provider setup flows that store secrets instead of pasting them directly into Vercel.',
    }),
    envItem({
      key: 'AUDIT_SECRET',
      provider: 'signalboost',
      required: false,
      whereItIsUsed: 'Optional cryptographic audit ledger signing.',
      operatorNote: 'Recommended for portable infrastructure PR audit-chain verification.',
    }),

    // Cloud/provider integrations
    envItem({
      key: 'AWS_ACCESS_KEY_ID',
      provider: 'cloud',
      required: false,
      whereItIsUsed: 'AWS provider actions and scans.',
      operatorNote: 'Only needed if AWS actions are enabled.',
    }),
    envItem({
      key: 'AWS_SECRET_ACCESS_KEY',
      provider: 'cloud',
      required: false,
      whereItIsUsed: 'AWS provider actions and scans.',
      operatorNote: 'Private AWS key. Only needed if AWS actions are enabled.',
    }),
    envItem({
      key: 'AWS_REGION',
      provider: 'cloud',
      required: false,
      visibility: 'public_value',
      whereItIsUsed: 'AWS SDK default region.',
      operatorNote: 'Example: us-east-1. Not a secret.',
    }),
    envItem({
      key: 'GOOGLE_APPLICATION_CREDENTIALS',
      provider: 'cloud',
      required: false,
      whereItIsUsed: 'GCP provider actions and service-account scans.',
      operatorNote: 'Usually a JSON credential or path/value depending on deployment strategy. Treat as private.',
    }),
    envItem({
      key: 'CLOUDFLARE_API_TOKEN',
      provider: 'cloud',
      required: false,
      whereItIsUsed: 'Cloudflare DNS/security provider actions.',
      operatorNote: 'Only needed if Cloudflare actions are enabled.',
    }),
    envItem({
      key: 'CLOUDFLARE_ZONE_ID',
      provider: 'cloud',
      required: false,
      whereItIsUsed: 'Cloudflare zone-scoped actions.',
      operatorNote: 'Only needed if Cloudflare actions are enabled.',
    }),
    envItem({
      key: 'DIGITALOCEAN_TOKEN',
      provider: 'cloud',
      required: false,
      whereItIsUsed: 'DigitalOcean provider actions.',
      operatorNote: 'Only needed if DigitalOcean actions are enabled.',
    }),

    // Monitoring / incident providers
    envItem({
      key: 'SENTRY_AUTH_TOKEN',
      provider: 'monitoring',
      required: false,
      whereItIsUsed: 'Sentry provider actions and monitoring checks.',
      operatorNote: 'Only needed if Sentry actions are enabled.',
    }),
    envItem({
      key: 'DATADOG_API_KEY',
      provider: 'monitoring',
      required: false,
      whereItIsUsed: 'Datadog provider actions and monitoring checks.',
      operatorNote: 'Only needed if Datadog actions are enabled.',
    }),
    envItem({
      key: 'DATADOG_API_URL',
      provider: 'monitoring',
      required: false,
      visibility: 'public_value',
      whereItIsUsed: 'Datadog API region URL.',
      operatorNote: 'Example: https://api.datadoghq.com. Not a secret by itself.',
    }),
    envItem({
      key: 'PAGERDUTY_API_KEY',
      provider: 'monitoring',
      required: false,
      whereItIsUsed: 'PagerDuty provider actions.',
      operatorNote: 'Only needed if PagerDuty actions are enabled.',
    }),

    // SMS / identity providers
    envItem({
      key: 'TWILIO_ACCOUNT_SID',
      provider: 'sms',
      required: false,
      whereItIsUsed: 'Twilio provider actions.',
      operatorNote: 'Only needed if Twilio actions are enabled.',
    }),
    envItem({
      key: 'TWILIO_AUTH_TOKEN',
      provider: 'sms',
      required: false,
      whereItIsUsed: 'Twilio provider actions.',
      operatorNote: 'Private Twilio token. Only needed if Twilio actions are enabled.',
    }),
    envItem({
      key: 'AUTH0_MANAGEMENT_API_TOKEN',
      provider: 'identity',
      required: false,
      whereItIsUsed: 'Auth0 management provider actions.',
      operatorNote: 'Only needed if Auth0 actions are enabled.',
    }),
    envItem({
      key: 'AUTH0_DOMAIN',
      provider: 'identity',
      required: false,
      visibility: 'public_value',
      whereItIsUsed: 'Auth0 tenant domain.',
      operatorNote: 'Only needed if Auth0 actions are enabled. Domain is not a secret.',
    }),
  ]
}

export async function GET() {
  if (!(await isAdminAccess())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const items = buildChecklist()
  const required = items.filter(item => item.required)
  const recommended = items.filter(item => item.recommended)
  const missingRequired = required.filter(item => !item.present).map(item => item.key)
  const missingRecommended = recommended.filter(item => !item.present).map(item => item.key)

  const byProvider = items.reduce<Record<string, EnvChecklistItem[]>>((acc, item) => {
    if (!acc[item.provider]) acc[item.provider] = []
    acc[item.provider].push(item)
    return acc
  }, {})

  return NextResponse.json({
    ok: true,
    url: '/api/admin/setup/env-vars',
    vercelSetupDestination: 'Vercel → Project → Settings → Environment Variables',
    safety: {
      rawSecretsReturned: false,
      privateSecretRule: 'Private keys are never returned raw. This endpoint shows presence and masked values only.',
      serviceRoleRule: 'SUPABASE_SERVICE_ROLE_KEY must be supplied once from the owner/provider account or vault. The app can verify it exists but must not reveal it.',
      anonKeyRule: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is browser-usable, but this endpoint still masks it to avoid accidentally leaking it into logs or chat.',
    },
    summary: {
      totalCount: items.length,
      requiredCount: required.length,
      recommendedCount: recommended.length,
      presentRequiredCount: required.length - missingRequired.length,
      missingRequired,
      missingRecommended,
      ready: missingRequired.length === 0,
    },
    copyPasteKeys: items.map(item => item.key),
    byProvider,
    items,
  })
}
