// saas/lib/hub/console-catalog.ts
// Hub Command Console — Complete Tier and Provider Orchestration Register.

export type ConsoleTierId = 'core' | 'utility' | string

export const CONSOLE_TIERS = [
  { id: 'core', index: '1', label: 'Core', sidebarTitle: 'Tier 1 Providers', blurb: 'Primary infrastructure: cloud, payments, data, hosting, and source control.' },
  { id: 'tier2', index: '2', label: 'Scale', sidebarTitle: 'Tier 2 Providers', blurb: 'Scaling infrastructure and integrations.' },
  { id: 'tier3', index: '3', label: 'Enterprise', sidebarTitle: 'Tier 3 Providers', blurb: 'Enterprise security and data systems.' },
  { id: 'tier4', index: '4', label: 'Internal', sidebarTitle: 'Tier 4 Tools', blurb: 'Internal tooling and operational hooks.' }
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
  sections: {
    title: string
    templateIds: string[]
  }[]
}

export const CONSOLE_PROVIDERS: ConsoleProvider[] = [
  {
    id: 'aws',
    name: 'AWS',
    subtitle: 'CLOUD INFRASTRUCTURE',
    accent: '#ff9900',
    sections: [
      { title: 'Storage', templateIds: ['aws.create_s3_bucket'] },
      { title: 'IAM', templateIds: ['aws.list_iam_users', 'aws.disable_iam_user'] }
    ]
  },
  {
    id: 'gcp',
    name: 'GCP',
    subtitle: 'CLOUD PLATFORM',
    accent: '#4285f4',
    sections: [
      { title: 'IAM', templateIds: ['gcp.list_service_accounts'] }
    ]
  },
  {
    id: 'azure',
    name: 'Azure',
    subtitle: 'MICROSOFT CLOUD',
    accent: '#0078d4',
    sections: []
  },
  {
    id: 'stripe',
    name: 'Stripe',
    subtitle: 'PAYMENTS & BILLING',
    accent: '#635bff',
    sections: [
      { title: 'Catalog', templateIds: ['stripe.create_product', 'stripe.edit_product', 'stripe.view_products', 'stripe.delete_product', 'stripe.archive_product'] },
      { title: 'Prices & Tiers', templateIds: ['stripe.create_price', 'stripe.view_prices', 'stripe.edit_price', 'stripe.apply_tier_template'] },
      { title: 'Customers', templateIds: ['stripe.list_customers', 'stripe.adjust_balance', 'stripe.issue_refund'] }
    ]
  },
  {
    id: 'supabase',
    name: 'Supabase',
    subtitle: 'DATABASE & AUTHENTICATION',
    accent: '#3ecf8e',
    sections: [
      { title: 'SQL Engine', templateIds: ['supabase.sql_editor', 'supabase.run_migration'] },
      { title: 'Data CRUD', templateIds: ['supabase.insert_row', 'supabase.archive_row', 'supabase.delete_row'] },
      { title: 'Access & Auth', templateIds: ['supabase.manage_user', 'supabase.rotate_service_key'] },
      { title: 'Storage Buckets', templateIds: ['supabase.create_bucket', 'supabase.empty_bucket'] }
    ]
  },
  {
    id: 'vercel',
    name: 'Vercel',
    subtitle: 'DEPLOYMENTS & NETWORKING',
    accent: '#fff',
    sections: [
      { title: 'Deployments', templateIds: ['vercel.list_deployments', 'vercel.trigger_rollback', 'vercel.cancel_build'] },
      { title: 'Configuration', templateIds: ['vercel.add_env_var', 'vercel.delete_env_var', 'vercel.sync_dns_domain'] }
    ]
  },
  {
    id: 'github',
    name: 'GitHub',
    subtitle: 'SOURCE CONTROL',
    accent: '#24292e',
    sections: []
  },
  {
    id: 'openai',
    name: 'OpenAI',
    subtitle: 'AI & MODELS',
    accent: '#10a37f',
    sections: []
  },
  {
    id: 'keyvault',
    name: 'Key Vault',
    subtitle: 'ENCRYPTED SECRET VAULT',
    accent: '#eab308',
    sections: [
      { title: 'Security', templateIds: ['vault.unlock_vault', 'vault.seal_vault'] },
      { title: 'Secrets Storage', templateIds: ['vault.add_secret', 'vault.delete_secret', 'vault.view_keys'] }
    ]
  },
  {
    id: 'governance',
    name: 'Governance',
    subtitle: 'TEAM ACCESS & COMPLIANCE',
    accent: '#f43f5e',
    sections: [
      { title: 'Team Access', templateIds: ['gov.assign_role', 'gov.deactivate_member'] },
      { title: 'Audit Traces', templateIds: ['gov.view_timeline', 'gov.clear_stale_sessions'] }
    ]
  }
]

export function getConsoleTier(id: ConsoleTierId) {
  return CONSOLE_TIERS.find(t => t.id === id) || CONSOLE_TIERS[0]
}

export function getConsoleProvider(id: string) {
  return CONSOLE_PROVIDERS.find(p => p.id === id) || null
}

export function getTierProviders(tierId: ConsoleTierId) {
  if (tierId === 'core') {
    return CONSOLE_PROVIDERS.filter(p => ['aws', 'gcp', 'azure', 'stripe', 'supabase', 'vercel', 'github', 'openai', 'keyvault', 'governance'].includes(p.id))
  }
  return CONSOLE_PROVIDERS.filter(p => !['aws', 'gcp', 'azure', 'stripe', 'supabase', 'vercel', 'github', 'openai', 'keyvault', 'governance'].includes(p.id))
}

export function isDestructiveTemplate(id: string): boolean {
  const norm = id.toLowerCase()
  return norm.includes('delete') || norm.includes('remove') || norm.includes('ban') || norm.includes('deactivate') || norm.includes('cancel') || norm.includes('empty') || norm.includes('seal')
}
