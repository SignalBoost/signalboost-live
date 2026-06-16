import { localizeProvider, cHub } from '@/lib/i18n/consoleCopy'
import type { Dict } from '@/lib/i18n/loadLanguage'
// saas/lib/hub/console-catalog.ts
// Hub Command Console — Complete Tier and Provider Orchestration Register.
//
// Cards render straight from this file: each provider's `sections[].templateIds`
// become the buttons shown on its card and workspace. Every id here resolves via
// getTemplate() (provider-templates.ts + provider-templates-extra.ts). Tier
// placement is data-driven via the `tier` field below.

export type ConsoleTierId = 'core' | 'tier2' | 'tier3' | 'tier4' | string

export const CONSOLE_TIERS = [
  { id: 'core', index: '1', label: 'Core', sidebarTitle: 'Tier 1 Providers', blurb: 'Primary infrastructure: cloud, payments, data, hosting, and source control.' },
  { id: 'tier2', index: '2', label: 'Scale', sidebarTitle: 'Tier 2 Providers', blurb: 'Messaging, email, edge networking, and compute integrations.' },
  { id: 'tier3', index: '3', label: 'Enterprise', sidebarTitle: 'Tier 3 Providers', blurb: 'App platform, observability, error tracking, and incident response.' },
  { id: 'tier4', index: '4', label: 'Internal', sidebarTitle: 'Tier 4 Tools', blurb: 'Encrypted secrets vault and team governance.' }
]

export const CONSOLE_UTILITY_PAGES = [
  { id: 'domains', label: 'Domains/DNS', icon: '🌐' },
  { id: 'deployments', label: 'Deployments', icon: '🚀' },
  { id: 'logs', label: 'Logs', icon: '📝' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

export interface ConsoleProvider {
  id: string
  name: string
  subtitle: string
  accent: string
  tier: ConsoleTierId
  sections: {
    title: string
    templateIds: string[]
  }[]
}

export const CONSOLE_PROVIDERS: ConsoleProvider[] = [
  // ============================ TIER 1 · CORE ============================
  {
    id: 'aws',
    name: 'AWS',
    subtitle: 'CLOUD INFRASTRUCTURE',
    accent: '#ff9900',
    tier: 'core',
    sections: [
      { title: 'Storage', templateIds: ['aws.create_s3_bucket'] },
      { title: 'IAM', templateIds: ['aws.list_iam_users', 'aws.disable_iam_user'] },
      { title: 'Credentials', templateIds: ['aws.rotate_credential'] }
    ]
  },
  {
    id: 'gcp',
    name: 'GCP',
    subtitle: 'CLOUD PLATFORM',
    accent: '#4285f4',
    tier: 'core',
    sections: [
      { title: 'IAM', templateIds: ['gcp.list_service_accounts'] }
    ]
  },
  {
    id: 'azure',
    name: 'Azure',
    subtitle: 'MICROSOFT CLOUD',
    accent: '#0078d4',
    tier: 'core',
    sections: []
  },
  {
    id: 'stripe',
    name: 'Stripe',
    subtitle: 'PAYMENTS & BILLING',
    accent: '#635bff',
    tier: 'core',
    sections: [
      { title: 'Catalog', templateIds: ['stripe.create_product', 'stripe.edit_product', 'stripe.view_products', 'stripe.archive_product', 'stripe.delete_product'] },
      { title: 'Prices & Tiers', templateIds: ['stripe.create_price', 'stripe.view_prices', 'stripe.edit_price', 'stripe.archive_price', 'stripe.apply_tier_template'] },
      { title: 'Customers', templateIds: ['stripe.list_customers', 'stripe.adjust_balance', 'stripe.issue_refund'] }
    ]
  },
  {
    id: 'supabase',
    name: 'Supabase',
    subtitle: 'DATABASE & AUTHENTICATION',
    accent: '#3ecf8e',
    tier: 'core',
    sections: [
      { title: 'SQL Engine', templateIds: ['supabase.sql_editor', 'supabase.run_migration'] },
      { title: 'Table CRUD', templateIds: ['supabase.insert_row', 'supabase.edit_row', 'supabase.archive_row', 'supabase.delete_row'] },
      { title: 'Users & Access', templateIds: ['supabase.invite_user', 'supabase.edit_user', 'supabase.delete_user', 'supabase.reset_password', 'supabase.rotate_service_key'] },
      { title: 'Storage', templateIds: ['supabase.storage_panel', 'supabase.create_bucket', 'supabase.empty_bucket'] }
    ]
  },
  {
    id: 'vercel',
    name: 'Vercel',
    subtitle: 'DEPLOYMENTS & NETWORKING',
    accent: '#fff',
    tier: 'core',
    sections: [
      // Buttons open real, live workspace panels (see CommandConsole VERCEL_PANEL_ROUTER).
      { title: 'Deployments', templateIds: ['vercel.list_deployments', 'vercel.trigger_rollback', 'vercel.cancel_build'] },
      { title: 'Environment Variables', templateIds: ['vercel.view_env', 'vercel.edit_env', 'vercel.delete_env'] },
      { title: 'Networking & Logs', templateIds: ['vercel.sync_dns_domain', 'vercel.logs'] }
    ]
  },
  {
    id: 'github',
    name: 'GitHub',
    subtitle: 'SOURCE CONTROL',
    accent: '#8b949e',
    tier: 'core',
    sections: [
      { title: 'Repositories', templateIds: ['github.list_repos'] },
      { title: 'Pull Requests', templateIds: ['github.list_prs', 'github.view_pr_files', 'github.merge_pr', 'github.close_pr'] },
      { title: 'Branches', templateIds: ['github.list_branches', 'github.delete_branch'] },
      { title: 'Issues', templateIds: ['github.list_issues', 'github.open_issue', 'github.edit_issue', 'github.close_issue'] },
      { title: 'Activity', templateIds: ['github.list_commits'] },
      { title: 'Secrets & Tokens', templateIds: ['github.rotate_token', 'github.manage_secrets'] }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    subtitle: 'AI & MODELS',
    accent: '#10a37f',
    tier: 'core',
    sections: [
      { title: 'Models', templateIds: ['openai.list_models', 'openai.retrieve_model'] },
      { title: 'Files', templateIds: ['openai.list_files'] },
      { title: 'Jobs', templateIds: ['openai.list_fine_tunes', 'openai.list_batches'] }
    ]
  },

  // ============================ TIER 2 · SCALE ============================
  {
    id: 'twilio',
    name: 'Twilio',
    subtitle: 'MESSAGING & SMS',
    accent: '#f22f46',
    tier: 'tier2',
    sections: [
      { title: 'Messaging', templateIds: ['twilio.send_sms', 'twilio.verify_number'] }
    ]
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    subtitle: 'TRANSACTIONAL EMAIL',
    accent: '#1a82e2',
    tier: 'tier2',
    sections: [
      { title: 'Email', templateIds: ['sendgrid.send_email', 'sendgrid.check_domain_auth'] }
    ]
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    subtitle: 'DNS, CDN & EDGE',
    accent: '#f38020',
    tier: 'tier2',
    sections: [
      { title: 'DNS', templateIds: ['cloudflare.add_dns_record', 'cloudflare.toggle_proxy'] },
      { title: 'Cache', templateIds: ['cloudflare.purge_cache'] }
    ]
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    subtitle: 'CLOUD COMPUTE',
    accent: '#0080ff',
    tier: 'tier2',
    sections: [
      { title: 'Compute', templateIds: ['digitalocean.create_droplet', 'digitalocean.view_droplets'] }
    ]
  },

  // ========================== TIER 3 · ENTERPRISE =========================
  {
    id: 'firebase',
    name: 'Firebase',
    subtitle: 'APP PLATFORM',
    accent: '#ffca28',
    tier: 'tier3',
    sections: [
      { title: 'Security Rules', templateIds: ['firebase.upload_rules', 'firebase.view_rules'] }
    ]
  },
  {
    id: 'datadog',
    name: 'Datadog',
    subtitle: 'OBSERVABILITY',
    accent: '#632ca6',
    tier: 'tier3',
    sections: [
      { title: 'Monitoring', templateIds: ['datadog.create_monitor', 'datadog.check_metrics'] }
    ]
  },
  {
    id: 'sentry',
    name: 'Sentry',
    subtitle: 'ERROR MONITORING',
    accent: '#b39ddb',
    tier: 'tier3',
    sections: [
      { title: 'Issues', templateIds: ['sentry.list_issues', 'sentry.resolve_issue'] }
    ]
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    subtitle: 'INCIDENT RESPONSE',
    accent: '#06ac38',
    tier: 'tier3',
    sections: [
      { title: 'Incidents', templateIds: ['pagerduty.list_incidents', 'pagerduty.trigger_incident'] }
    ]
  },

  // =========================== TIER 4 · INTERNAL ==========================
  {
    id: 'keyvault',
    name: 'Key Vault',
    subtitle: 'ENCRYPTED SECRET VAULT',
    accent: '#eab308',
    tier: 'tier4',
    sections: [
      { title: 'Security', templateIds: ['vault.unlock_vault', 'vault.seal_vault'] },
      { title: 'Secrets Storage', templateIds: ['vault.add_secret', 'vault.edit_secret', 'vault.reveal_secret', 'vault.archive_secret', 'vault.delete_secret', 'vault.view_keys'] },
      { title: 'Audit', templateIds: ['vault.audit_log'] }
    ]
  },
  {
    id: 'governance',
    name: 'Governance',
    subtitle: 'TEAM ACCESS & COMPLIANCE',
    accent: '#f43f5e',
    tier: 'tier4',
    sections: [
      { title: 'Team Access', templateIds: ['gov.assign_role', 'gov.change_permissions', 'gov.deactivate_member'] },
      { title: 'Compliance & Audit', templateIds: ['gov.view_timeline', 'gov.run_compliance_audit', 'gov.clear_stale_sessions'] }
    ]
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    subtitle: 'VOICE & AUDIO',
    accent: '#a78bfa',
    tier: 'tier2',
    sections: [
      { title: 'Voices', templateIds: ['elevenlabs.list_voices', 'elevenlabs.voice_details'] },
      { title: 'Models', templateIds: ['elevenlabs.list_models'] },
      { title: 'Account', templateIds: ['elevenlabs.subscription'] },
      { title: 'History', templateIds: ['elevenlabs.list_history'] }
    ]
  },
  {
    id: 'anthropic', name: 'Anthropic', subtitle: 'AI & MODELS', accent: '#d97757', tier: 'core',
    sections: [
      { title: 'Models', templateIds: ['anthropic.list_models', 'anthropic.retrieve_model'] }
    ]
  },
  {
    id: 'gemini', name: 'Google Gemini', subtitle: 'AI & MODELS', accent: '#4285f4', tier: 'core',
    sections: [
      { title: 'Models', templateIds: ['gemini.list_models', 'gemini.model_details'] }
    ]
  },
  {
    id: 'resend', name: 'Resend', subtitle: 'EMAIL', accent: '#e879f9', tier: 'tier2',
    sections: [
      { title: 'Domains', templateIds: ['resend.list_domains'] },
      { title: 'Audiences', templateIds: ['resend.list_audiences'] },
      { title: 'Broadcasts', templateIds: ['resend.list_broadcasts'] },
      { title: 'API Keys', templateIds: ['resend.list_api_keys'] }
    ]
  },
  {
    id: 'assemblyai', name: 'AssemblyAI', subtitle: 'TRANSCRIPTION', accent: '#6366f1', tier: 'tier2',
    sections: [
      { title: 'Transcripts', templateIds: ['assemblyai.list_transcripts', 'assemblyai.transcript_details'] }
    ]
  },
  {
    id: 'supabase_mkt', name: 'Supabase — Marketing', subtitle: 'MARKETING DB', accent: '#3ecf8e', tier: 'core',
    sections: [
      { title: 'Data', templateIds: ['supabase_mkt.list_tables', 'supabase_mkt.list_rows'] },
      { title: 'Auth', templateIds: ['supabase_mkt.list_users'] },
      { title: 'Storage', templateIds: ['supabase_mkt.list_buckets'] }
    ]
  }
]

export function getConsoleTier(id: ConsoleTierId, dict?: Dict | null) {
  const tier = CONSOLE_TIERS.find(t => t.id === id) || CONSOLE_TIERS[0]
  if (!dict) return tier
  return { ...tier, label: cHub(dict, `console.tier.${tier.id}`, tier.label), sidebarTitle: cHub(dict, `console.tier.sidebar.${tier.id}`, tier.sidebarTitle), blurb: cHub(dict, `console.tier.blurb.${tier.id}`, (tier as any).blurb || '') }
}

export function getConsoleProvider(id: string, dict?: Dict | null) {
  const p = CONSOLE_PROVIDERS.find(p => p.id === id) || null
  return p && dict ? localizeProvider(p, dict) : p
}

export function getTierProviders(tierId: ConsoleTierId, dict?: Dict | null) {
  const known = CONSOLE_TIERS.some(t => t.id === tierId)
  // Unknown/legacy tier ids fall back to Core so nothing ever renders empty.
  const target = known ? tierId : 'core'
  const list = CONSOLE_PROVIDERS.filter(p => p.tier === target)
  return dict ? list.map(p => localizeProvider(p, dict)) : list
}

export function isDestructiveTemplate(id: string): boolean {
  const norm = id.toLowerCase()
  return norm.includes('delete') || norm.includes('remove') || norm.includes('ban') || norm.includes('deactivate') || norm.includes('cancel') || norm.includes('empty') || norm.includes('seal') || norm.includes('purge') || norm.includes('disable')
}
