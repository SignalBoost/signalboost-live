// saas/lib/hub/console-catalog.ts

export const CONSOLE_PROVIDERS = [
  // ... (Keep AWS, GCP, Azure as they are)

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
    id: 'governance',
    name: 'Governance',
    subtitle: 'TEAM ACCESS & COMPLIANCE',
    accent: '#f43f5e',
    sections: [
      { title: 'Team Access', templateIds: ['gov.assign_role', 'gov.deactivate_member'] },
      { title: 'Audit Traces', templateIds: ['gov.view_timeline', 'gov.clear_stale_sessions'] }
    ]
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
  }
]
