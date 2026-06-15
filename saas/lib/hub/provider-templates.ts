// saas/lib/hub/provider-templates.ts

export const PROVIDER_TEMPLATES: Record<string, any> = {
  // === STRIPE (Keep your existing templates here + add these updates) ===
  'stripe.apply_tier_template': {
    id: 'stripe.apply_tier_template',
    label: 'Plan Templates',
    description: 'Instantly build out standardized Indie, Pro, or Growth checkout tracks.',
    icon: '📋',
    api: { service: 'Stripe', method: 'POST', endpoint: '/v1/plans/template' },
    fields: [
      { id: 'tier', label: 'Subscription Tier', type: 'select', required: true, options: [
        { label: 'Indie Tier ($9/mo)', value: 'indie' },
        { label: 'Pro Tier ($29/mo)', value: 'pro' },
        { label: 'Growth Tier ($79/mo)', value: 'growth' }
      ]}
    ]
  },
  'stripe.issue_refund': {
    id: 'stripe.issue_refund',
    label: 'Refund/Adjustments',
    description: 'Revert a processed transaction balance or apply a manual service credit charge.',
    icon: '💸',
    requiresConfirm: true,
    api: { service: 'Stripe', method: 'POST', endpoint: '/v1/refunds' },
    fields: [
      { id: 'chargeId', label: 'Charge ID (ch_...)', type: 'text', required: true, placeholder: 'ch_3M...' },
      { id: 'amount_cents', label: 'Amount (in Cents)', type: 'number', required: true, placeholder: '1000' }
    ]
  },

  // === SUPABASE ===
  'supabase.sql_editor': {
    id: 'supabase.sql_editor',
    label: 'SQL Editor',
    description: 'Run arbitrary raw queries directly against your data tables.',
    icon: '⚡',
    previewBeforeSubmit: true,
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/rpc/execute_sql' },
    fields: [
      { id: 'query', label: 'SQL Raw Statement', type: 'textarea', required: true, defaultValue: 'SELECT * FROM users LIMIT 10;' }
    ]
  },
  'supabase.archive_row': {
    id: 'supabase.archive_row',
    label: 'Archive Rows',
    description: 'Flip active visibility flags on a specific database item record.',
    icon: '🗄️',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/db/archive' },
    fields: [
      { id: 'table', label: 'Target Table Name', type: 'text', required: true, placeholder: 'profiles' },
      { id: 'rowId', label: 'Target Row UUID', type: 'text', required: true, placeholder: 'uuid-string' }
    ]
  },
  'supabase.manage_user': {
    id: 'supabase.manage_user',
    label: 'Auth Management',
    description: 'Directly alter raw metadata configurations or update confirmation state metrics.',
    icon: '👤',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/auth/manage' },
    fields: [
      { id: 'email', label: 'User Email Address', type: 'email', required: true, placeholder: 'name@domain.com' },
      { id: 'action', label: 'Administrative Action', type: 'select', required: true, options: [
        { label: 'Force Confirm Email', value: 'confirm' },
        { label: 'Reset Password Link', value: 'reset' },
        { label: 'Ban Account Record', value: 'ban' }
      ]}
    ]
  },

  // === VERCEL ===
  'vercel.trigger_rollback': {
    id: 'vercel.trigger_rollback',
    label: 'Rollback Deploy',
    description: 'Instantly point production edge domain targets back to a historical deployment hash.',
    icon: '↩️',
    requiresConfirm: true,
    api: { service: 'Vercel', method: 'POST', endpoint: '/v1/projects/rollback' },
    fields: [
      { id: 'deploymentId', label: 'Deployment ID', type: 'text', required: true, placeholder: 'dpl_...' }
    ]
  },
  'vercel.add_env_var': {
    id: 'vercel.add_env_var',
    label: 'Environment Variables',
    description: 'Inject variables globally across Production, Preview, or Staging development paths.',
    icon: '🔑',
    api: { service: 'Vercel', method: 'POST', endpoint: '/v1/projects/env' },
    fields: [
      { id: 'key', label: 'Variable Key String', type: 'text', required: true, placeholder: 'NEXT_PUBLIC_API_URL' },
      { id: 'value', label: 'Variable Raw Secret Value', type: 'secret', required: true },
      { id: 'target', label: 'Environment Deployment Ring', type: 'select', required: true, options: [
        { label: 'Production Only', value: 'production' },
        { label: 'All Environments (Prod/Preview/Dev)', value: 'all' }
      ]}
    ]
  },

  // === GOVERNANCE ===
  'gov.assign_role': {
    id: 'gov.assign_role',
    label: 'Role Assignment',
    description: 'Provision platform access parameters across specific organizational personnel tracks.',
    icon: '🛡️',
    api: { service: 'Governance', method: 'POST', endpoint: '/v1/team/roles' },
    fields: [
      { id: 'memberId', label: 'Team Member ID', type: 'text', required: true },
      { id: 'role', label: 'Target Privilege Domain Access Tier', type: 'select', required: true, options: [
        { label: 'Billing Administrator', value: 'billing_admin' },
        { label: 'Platform Core Developer', value: 'developer' },
        { label: 'Standard Team Member', value: 'member' }
      ]}
    ]
  },

  // === KEY VAULT ===
  'vault.unlock_vault': {
    id: 'vault.unlock_vault',
    label: 'Unlock Vault',
    description: 'Supply your system-wide Master Passphrase to load sensitive key vectors.',
    icon: '🔓',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/unlock' },
    fields: [
      { id: 'passphrase', label: 'Master Passphrase', type: 'secret', required: true }
    ]
  }
}
