// saas/lib/hub/console-catalog.ts
// Hub Command Console — Presentation catalog.
//
// Separation of concerns:
//   provider-templates.ts  -> WHAT each action is (executable registry + fields)
//   action-policy.ts       -> HOW dangerous it is (auth/approval/audit gate)
//   console-catalog.ts      -> WHERE actions appear (tiers, provider cards, sections)
//
// This file is pure data + selectors. It references template ids from
// provider-templates.ts and is consumed by the console UI components.
// A provider may intentionally appear in more than one tier (e.g. Vercel in
// Core and DevOps, OpenAI in Core and AI) — tiers are navigation lenses, not
// exclusive partitions.

export type ConsoleTierId = 'core' | 'common' | 'ai' | 'devops'
export type ProviderStatus = 'live' | 'ready' | 'beta' | 'inactive'

export type ConsoleTier = {
  id: ConsoleTierId
  index: number
  label: string
  sidebarTitle: string
  blurb: string
  providerIds: string[]
}

export type ProviderSection = {
  title: string
  templateIds: string[]
}

export type ConsoleProvider = {
  id: string
  name: string
  subtitle: string
  accent: string
  mark: string
  status: ProviderStatus
  sections: ProviderSection[]
}

export type UtilityPage = {
  id: string
  label: string
  icon: string
}

// ---------------------------------------------------------------------------
// Tiers (sidebar groups). Two providers render per page within a tier.
// ---------------------------------------------------------------------------

export const CONSOLE_TIERS: ConsoleTier[] = [
  {
    id: 'core',
    index: 1,
    label: 'Core',
    sidebarTitle: 'Tier 1 Providers',
    blurb: 'Primary infrastructure: cloud, payments, data, hosting, and source control.',
    providerIds: ['aws', 'google-cloud', 'azure', 'stripe', 'supabase', 'vercel', 'github', 'openai', 'vault'],
  },
  {
    id: 'common',
    index: 2,
    label: 'Common',
    sidebarTitle: 'Tier 2 Providers',
    blurb: 'Messaging, email, edge, app backend, and identity services.',
    providerIds: ['twilio', 'sendgrid', 'cloudflare', 'firebase', 'mongodb', 'digitalocean', 'auth0'],
  },
  {
    id: 'ai',
    index: 3,
    label: 'AI',
    sidebarTitle: 'Tier 3 Providers',
    blurb: 'Model providers and inference platforms.',
    providerIds: ['openai', 'anthropic', 'hugging-face', 'replicate'],
  },
  {
    id: 'devops',
    index: 4,
    label: 'DevOps',
    sidebarTitle: 'Tier 4 Providers',
    blurb: 'Monitoring, error tracking, incident response, and governance.',
    providerIds: ['datadog', 'sentry', 'pagerduty', 'vercel', 'supabase', 'github', 'compliance'],
  },
]

// ---------------------------------------------------------------------------
// Utility pages — lower sidebar section (render existing console pages).
// ---------------------------------------------------------------------------

export const CONSOLE_UTILITY_PAGES: UtilityPage[] = [
  { id: 'domains', label: 'Domains/DNS', icon: '🌐' },
  { id: 'deployments', label: 'Deployments', icon: '🚀' },
  { id: 'logs', label: 'Logs', icon: '🗒️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

// ---------------------------------------------------------------------------
// Destructive template ids — rendered with a red accent and require confirm.
// ---------------------------------------------------------------------------

export const DESTRUCTIVE_TEMPLATE_IDS: Set<string> = new Set([
  'stripe.delete_product',
  'supabase.delete_user',
  'vercel.delete_env',
  'aws.disable_iam_user',
  'vault.delete_key',
])

export function isDestructiveTemplate(templateId: string): boolean {
  return DESTRUCTIVE_TEMPLATE_IDS.has(templateId)
}

// ---------------------------------------------------------------------------
// Provider cards — branding + ordered sections matching the console mock.
// Section template ids must exist in provider-templates.ts.
// ---------------------------------------------------------------------------

export const CONSOLE_PROVIDERS: Record<string, ConsoleProvider> = {
  // ---- Tier 1 · Core ----
  aws: {
    id: 'aws', name: 'AWS', subtitle: 'CLOUD INFRASTRUCTURE', accent: '#ff9900', mark: 'AWS', status: 'ready',
    sections: [
      { title: 'Storage', templateIds: ['aws.create_bucket'] },
      { title: 'IAM', templateIds: ['aws.list_iam_users', 'aws.disable_iam_user'] },
    ],
  },
  'google-cloud': {
    id: 'google-cloud', name: 'GCP', subtitle: 'CLOUD PLATFORM', accent: '#4285f4', mark: 'GCP', status: 'ready',
    sections: [
      { title: 'IAM', templateIds: ['google-cloud.list_service_accounts'] },
    ],
  },
  azure: {
    id: 'azure', name: 'Azure', subtitle: 'CLOUD PLATFORM', accent: '#2f80ed', mark: 'Az', status: 'ready',
    sections: [
      { title: 'Resources', templateIds: ['azure.list_resources', 'azure.test_connection'] },
    ],
  },
  stripe: {
    id: 'stripe', name: 'Stripe', subtitle: 'PAYMENTS & BILLING', accent: '#635bff', mark: 'S', status: 'live',
    sections: [
      { title: 'Catalog', templateIds: ['stripe.create_product', 'stripe.create_price', 'stripe.view_products', 'stripe.delete_product'] },
      { title: 'API Keys', templateIds: ['stripe.add_api_key', 'stripe.rotate_key'] },
    ],
  },
  supabase: {
    id: 'supabase', name: 'Supabase', subtitle: 'DATABASE & AUTHENTICATION', accent: '#3ecf8e', mark: '◓', status: 'live',
    sections: [
      { title: 'Users', templateIds: ['supabase.invite_user', 'supabase.delete_user', 'supabase.view_users', 'supabase.reset_password'] },
      { title: 'Project Settings', templateIds: ['vercel.set_env', 'vercel.delete_env', 'vercel.view_env'] },
    ],
  },
  vercel: {
    id: 'vercel', name: 'Vercel', subtitle: 'HOSTING & DEPLOYMENT', accent: '#e5e7eb', mark: '▲', status: 'live',
    sections: [
      { title: 'Environment', templateIds: ['vercel.set_env', 'vercel.delete_env', 'vercel.view_env'] },
      { title: 'Tokens', templateIds: ['vercel.rotate_token'] },
    ],
  },
  github: {
    id: 'github', name: 'GitHub', subtitle: 'SOURCE CONTROL', accent: '#c9d1d9', mark: 'GH', status: 'live',
    sections: [
      { title: 'Repository', templateIds: ['github.open_issue', 'github.view_repos'] },
      { title: 'Tokens', templateIds: ['github.rotate_token'] },
    ],
  },
  openai: {
    id: 'openai', name: 'OpenAI', subtitle: 'AI PLATFORM', accent: '#10a37f', mark: 'AI', status: 'live',
    sections: [
      { title: 'Models', templateIds: ['openai.test_key'] },
    ],
  },
  vault: {
    id: 'vault', name: 'Key Vault', subtitle: 'SECRETS & API KEYS', accent: '#ffc300', mark: '🔐', status: 'live',
    sections: [
      { title: 'Keys', templateIds: ['vault.view_keys', 'vault.add_key', 'vault.reveal_key', 'vault.edit_key'] },
      { title: 'Lifecycle', templateIds: ['vault.archive_key', 'vault.delete_key'] },
    ],
  },

  // ---- Tier 2 · Common ----
  twilio: {
    id: 'twilio', name: 'Twilio', subtitle: 'MESSAGING', accent: '#f22f46', mark: 'Tw', status: 'ready',
    sections: [
      { title: 'Messaging', templateIds: ['twilio.send_sms', 'twilio.verify_number'] },
    ],
  },
  sendgrid: {
    id: 'sendgrid', name: 'SendGrid', subtitle: 'TRANSACTIONAL EMAIL', accent: '#1a82e2', mark: 'SG', status: 'ready',
    sections: [
      { title: 'Email', templateIds: ['sendgrid.send_email', 'sendgrid.check_domain'] },
    ],
  },
  cloudflare: {
    id: 'cloudflare', name: 'Cloudflare', subtitle: 'EDGE & DNS', accent: '#f38020', mark: 'CF', status: 'ready',
    sections: [
      { title: 'DNS', templateIds: ['cloudflare.add_dns', 'cloudflare.toggle_proxy'] },
      { title: 'Cache', templateIds: ['cloudflare.purge_cache'] },
    ],
  },
  firebase: {
    id: 'firebase', name: 'Firebase', subtitle: 'APP BACKEND', accent: '#ffca28', mark: 'Fb', status: 'ready',
    sections: [
      { title: 'Security Rules', templateIds: ['firebase.upload_rules', 'firebase.view_rules'] },
      { title: 'Messaging', templateIds: ['firebase.send_notification'] },
    ],
  },
  mongodb: {
    id: 'mongodb', name: 'MongoDB', subtitle: 'DATABASE', accent: '#00ed64', mark: 'M', status: 'ready',
    sections: [
      { title: 'Clusters', templateIds: ['mongodb.list_clusters', 'mongodb.list_databases'] },
    ],
  },
  digitalocean: {
    id: 'digitalocean', name: 'DigitalOcean', subtitle: 'CLOUD INFRASTRUCTURE', accent: '#0080ff', mark: 'DO', status: 'ready',
    sections: [
      { title: 'Compute', templateIds: ['digitalocean.create_droplet', 'digitalocean.list_droplets'] },
      { title: 'Apps', templateIds: ['digitalocean.list_apps'] },
    ],
  },
  auth0: {
    id: 'auth0', name: 'Auth0', subtitle: 'IDENTITY', accent: '#eb5424', mark: 'A0', status: 'ready',
    sections: [
      { title: 'Applications', templateIds: ['auth0.list_clients'] },
    ],
  },

  // ---- Tier 3 · AI ----
  anthropic: {
    id: 'anthropic', name: 'Anthropic', subtitle: 'AI PLATFORM', accent: '#d97757', mark: 'An', status: 'live',
    sections: [
      { title: 'Models', templateIds: ['anthropic.test_key'] },
    ],
  },
  'hugging-face': {
    id: 'hugging-face', name: 'Hugging Face', subtitle: 'AI MODELS', accent: '#ffbf00', mark: 'HF', status: 'ready',
    sections: [
      { title: 'Inference', templateIds: ['hugging-face.test_key', 'hugging-face.run_inference'] },
    ],
  },
  replicate: {
    id: 'replicate', name: 'Replicate', subtitle: 'AI INFERENCE', accent: '#e5e7eb', mark: 'Re', status: 'ready',
    sections: [
      { title: 'Predictions', templateIds: ['replicate.run_model'] },
    ],
  },

  // ---- Tier 4 · DevOps ----
  datadog: {
    id: 'datadog', name: 'Datadog', subtitle: 'MONITORING', accent: '#632ca6', mark: 'DD', status: 'ready',
    sections: [
      { title: 'Observability', templateIds: ['datadog.check_metrics', 'datadog.create_monitor'] },
    ],
  },
  sentry: {
    id: 'sentry', name: 'Sentry', subtitle: 'ERROR MONITORING', accent: '#fb4226', mark: 'Se', status: 'ready',
    sections: [
      { title: 'Issues', templateIds: ['sentry.list_issues', 'sentry.resolve_issue'] },
    ],
  },
  pagerduty: {
    id: 'pagerduty', name: 'PagerDuty', subtitle: 'INCIDENT RESPONSE', accent: '#06ac38', mark: 'PD', status: 'ready',
    sections: [
      { title: 'Incidents', templateIds: ['pagerduty.list_incidents', 'pagerduty.trigger_incident'] },
      { title: 'On-call', templateIds: ['pagerduty.list_oncall'] },
    ],
  },
  compliance: {
    id: 'compliance', name: 'Compliance', subtitle: 'GOVERNANCE & AUDIT', accent: '#1af0ff', mark: '✓', status: 'live',
    sections: [
      { title: 'Audit', templateIds: ['compliance.run_audit', 'compliance.list_findings'] },
    ],
  },
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getConsoleTier(tierId: ConsoleTierId): ConsoleTier | undefined {
  return CONSOLE_TIERS.find(t => t.id === tierId)
}

export function getConsoleProvider(providerId: string): ConsoleProvider | undefined {
  return CONSOLE_PROVIDERS[providerId]
}

// Providers for a tier, in declared order, skipping any without a card.
export function getTierProviders(tierId: ConsoleTierId): ConsoleProvider[] {
  const tier = getConsoleTier(tierId)
  if (!tier) return []
  const out: ConsoleProvider[] = []
  for (const id of tier.providerIds) {
    const p = CONSOLE_PROVIDERS[id]
    if (p) out.push(p)
  }
  return out
}

// Total template count for a provider card (used for layout hints).
export function providerActionCount(providerId: string): number {
  const p = CONSOLE_PROVIDERS[providerId]
  if (!p) return 0
  return p.sections.reduce((n, s) => n + s.templateIds.length, 0)
}

export const STATUS_LABEL: Record<ProviderStatus, string> = {
  live: 'Live',
  ready: 'Ready',
  beta: 'Beta',
  inactive: 'Inactive',
}

export const STATUS_COLOR: Record<ProviderStatus, string> = {
  live: '#22c55e',
  ready: '#ffc300',
  beta: '#1af0ff',
  inactive: '#64748b',
}
