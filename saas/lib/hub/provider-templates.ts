// saas/lib/hub/provider-templates.ts
// Hub Console — Complete universal action form templates synchronized with backend policy dictionaries.

export interface ProviderFormField {
  id: string
  label: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'number' | 'currency_cents' | 'secret' | 'select' | 'toggle'
  required?: boolean
  placeholder?: string
  maxLength?: number
  min?: number
  max?: number
  step?: number
  defaultValue?: any
  help?: string
  options?: { label: string; value: string }[]
}

export interface ProviderTemplate {
  id: string
  label: string
  description: string
  icon: string
  requiresConfirm?: boolean
  previewBeforeSubmit?: boolean
  policyActionId?: string
  api: {
    service: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    endpoint: string
  }
  fields: ProviderFormField[]
}

export const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  // === AWS ===
  'aws.create_s3_bucket': {
    id: 'aws.create_s3_bucket',
    label: 'Create S3 Bucket',
    description: 'Create a new globally unique S3 bucket container.',
    icon: '🪣',
    api: { service: 'AWS', method: 'POST', endpoint: '/v1/s3/buckets' },
    fields: [{ id: 'bucketName', label: 'Bucket Name', type: 'text', required: true }]
  },
  'aws.list_iam_users': {
    id: 'aws.list_iam_users',
    label: 'List IAM Users',
    description: 'Fetch all current identity directory users.',
    icon: '👥',
    api: { service: 'AWS', method: 'GET', endpoint: '/v1/iam/users' },
    fields: []
  },
  'aws.disable_iam_user': {
    id: 'aws.disable_iam_user',
    label: 'Disable IAM User',
    description: 'Deactivate user keys and credentials immediately.',
    icon: '🚫',
    requiresConfirm: true,
    api: { service: 'AWS', method: 'POST', endpoint: '/v1/iam/users/disable' },
    fields: [{ id: 'username', label: 'Username', type: 'text', required: true }]
  },

  // === GCP ===
  'gcp.list_service_accounts': {
    id: 'gcp.list_service_accounts',
    label: 'List Service Accounts',
    description: 'Fetch all system identity service accounts.',
    icon: '🔑',
    api: { service: 'GCP', method: 'GET', endpoint: '/v1/iam/service-accounts' },
    fields: []
  },

  // === STRIPE ===
  'stripe.create_product': {
    id: 'stripe.create_product',
    label: 'Create Product',
    description: 'Create a new Stripe product and its first recurring price.',
    icon: '💳',
    policyActionId: 'view_products',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/products' },
    fields: [
      { id: 'name', label: 'Product Name', type: 'text', required: true, placeholder: 'Standard SaaS' },
      { id: 'description', label: 'Description', type: 'textarea' }
    ]
  },
  'stripe.edit_product': {
    id: 'stripe.edit_product',
    label: 'Edit Product',
    description: 'Update a Stripe product name, description, or active state.',
    icon: '✏️',
    policyActionId: 'view_products',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/products/update' },
    fields: [
      { id: 'id', label: 'Product ID', type: 'text', required: true, placeholder: 'prod_...' },
      { id: 'name', label: 'New Product Name', type: 'text', required: true }
    ]
  },
  'stripe.view_products': {
    id: 'stripe.view_products',
    label: 'View Products',
    description: 'List live Stripe products and their identifiers.',
    icon: '📦',
    policyActionId: 'view_products',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/products' },
    fields: []
  },
  'stripe.delete_product': {
    id: 'stripe.delete_product',
    label: 'Delete Product',
    description: 'Permanently delete a Stripe product. Only products with no active prices can be deleted.',
    icon: '🗑️',
    requiresConfirm: true,
    policyActionId: 'view_products',
    api: { service: 'stripe', method: 'DELETE', endpoint: '/v1/products' },
    fields: [{ id: 'id', label: 'Product ID', type: 'text', required: true }]
  },
  'stripe.archive_product': {
    id: 'stripe.archive_product',
    label: 'Archive Product',
    description: 'Archive a Stripe product (sets it inactive — recoverable by editing it active again).',
    icon: '🗄️',
    policyActionId: 'view_products',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/products/archive' },
    fields: [{ id: 'id', label: 'Product ID', type: 'text', required: true }]
  },
  'stripe.create_price': {
    id: 'stripe.create_price',
    label: 'Create Price',
    description: 'Attach a new recurring or one-time price to an existing Stripe product.',
    icon: '🏷️',
    policyActionId: 'manage_prices',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/prices' },
    fields: [
      { id: 'product', label: 'Product ID', type: 'text', required: true, placeholder: 'prod_...' },
      { id: 'amount', label: 'Amount (USD)', type: 'number', required: true, placeholder: '29' }
    ]
  },
  'stripe.view_prices': {
    id: 'stripe.view_prices',
    label: 'View Prices',
    description: 'List Stripe prices, optionally filtered by product.',
    icon: '🏷️',
    policyActionId: 'manage_prices',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/prices' },
    fields: []
  },
  'stripe.edit_price': {
    id: 'stripe.edit_price',
    label: 'Edit Price',
    description: 'Update a price nickname or activate/deactivate it (amounts are immutable in Stripe).',
    icon: '✏️',
    policyActionId: 'manage_prices',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/prices/update' },
    fields: [{ id: 'id', label: 'Price ID', type: 'text', required: true }]
  },
  'stripe.apply_tier_template': {
    id: 'stripe.apply_tier_template',
    label: 'Plan Templates',
    description: 'Instantly build out standardized Indie, Pro, or Growth checkout tracks.',
    icon: '📋',
    policyActionId: 'manage_prices',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/plans/template' },
    fields: [
      { id: 'tier', label: 'Subscription Tier', type: 'select', required: true, options: [
        { label: 'Indie Tier ($9/mo)', value: 'indie' },
        { label: 'Pro Tier ($29/mo)', value: 'pro' },
        { label: 'Growth Tier ($79/mo)', value: 'growth' }
      ]}
    ]
  },
  'stripe.list_customers': {
    id: 'stripe.list_customers',
    label: 'Customer View',
    description: 'List customers, invoices, and active recurring payment metrics.',
    icon: '👥',
    policyActionId: 'view_products',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/customers' },
    fields: []
  },
  'stripe.adjust_balance': {
    id: 'stripe.adjust_balance',
    label: 'Adjust Balance',
    description: 'Apply manual customer balance ledger modifications or transaction adjustments.',
    icon: '⚖️',
    policyActionId: 'refunds',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/customers/balance' },
    fields: [
      { id: 'customerId', label: 'Customer ID', type: 'text', required: true },
      { id: 'amount_cents', label: 'Amount (Cents)', type: 'number', required: true }
    ]
  },
  'stripe.issue_refund': {
    id: 'stripe.issue_refund',
    label: 'Refund/Adjustments',
    description: 'Revert a processed transaction balance or apply a manual service credit charge.',
    icon: '💸',
    requiresConfirm: true,
    policyActionId: 'refunds',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/refunds' },
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
    policyActionId: 'sql_editor',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/rpc/execute_sql' },
    fields: [
      { id: 'query', label: 'SQL Raw Statement', type: 'textarea', required: true, defaultValue: 'SELECT * FROM users LIMIT 10;' }
    ]
  },
  'supabase.run_migration': {
    id: 'supabase.run_migration',
    label: 'Run Migration',
    description: 'Execute compiled data definition schema migrations over the query bridge.',
    icon: '🚀',
    requiresConfirm: true,
    policyActionId: 'sql_editor',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/db/migrate' },
    fields: [{ id: 'migration', label: 'Migration Payload', type: 'textarea', required: true }]
  },
  'supabase.insert_row': {
    id: 'supabase.insert_row',
    label: 'Insert Row',
    description: 'Directly inject structured row data records into an existing schema.',
    icon: '➕',
    policyActionId: 'table_crud',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/db/insert' },
    fields: [
      { id: 'table', label: 'Table Name', type: 'text', required: true },
      { id: 'data', label: 'JSON Row Object', type: 'textarea', required: true }
    ]
  },
  'supabase.archive_row': {
    id: 'supabase.archive_row',
    label: 'Archive Rows',
    description: 'Flip active visibility flags on a specific database item record.',
    icon: '🗄️',
    policyActionId: 'table_crud',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/db/archive' },
    fields: [
      { id: 'table', label: 'Target Table Name', type: 'text', required: true, placeholder: 'profiles' },
      { id: 'rowId', label: 'Target Row UUID', type: 'text', required: true, placeholder: 'uuid-string' }
    ]
  },
  'supabase.delete_row': {
    id: 'supabase.delete_row',
    label: 'Delete Row',
    description: 'Hard purge row records out of the storage layer completely.',
    icon: '🗑️',
    requiresConfirm: true,
    policyActionId: 'table_crud',
    api: { service: 'supabase', method: 'DELETE', endpoint: '/v1/db/row' },
    fields: [
      { id: 'table', label: 'Table Name', type: 'text', required: true },
      { id: 'rowId', label: 'Row Primary Key ID', type: 'text', required: true }
    ]
  },
  'supabase.manage_user': {
    id: 'supabase.manage_user',
    label: 'Auth Management',
    description: 'Directly alter raw metadata configurations or update confirmation state metrics.',
    icon: '👤',
    policyActionId: 'auth_management',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/auth/manage' },
    fields: [
      { id: 'email', label: 'User Email Address', type: 'email', required: true, placeholder: 'name@domain.com' },
      { id: 'action', label: 'Administrative Action', type: 'select', required: true, options: [
        { label: 'Force Confirm Email', value: 'confirm' },
        { label: 'Reset Password Link', value: 'reset' },
        { label: 'Ban Account Record', value: 'ban' }
      ]}
    ]
  },
  'supabase.rotate_service_key': {
    id: 'supabase.rotate_service_key',
    label: 'Rotate Keys',
    description: 'Invalidate current service_role JSON tokens and issue fresh credentials.',
    icon: '🔄',
    requiresConfirm: true,
    policyActionId: 'auth_management',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/auth/keys/rotate' },
    fields: []
  },
  'supabase.create_bucket': {
    id: 'supabase.create_bucket',
    label: 'Create Bucket',
    description: 'Instantiate a fresh media or binary object storage file container.',
    icon: '🪣',
    policyActionId: 'storage_panel',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/storage/buckets' },
    fields: [{ id: 'name', label: 'Bucket Identifier', type: 'text', required: true }]
  },
  'supabase.empty_bucket': {
    id: 'supabase.empty_bucket',
    label: 'Empty Bucket',
    description: 'Purge all nested objects and binary layout leaves without dropping the core asset container.',
    icon: '💥',
    requiresConfirm: true,
    policyActionId: 'storage_panel',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/storage/buckets/empty' },
    fields: [{ id: 'name', label: 'Bucket Identifier', type: 'text', required: true }]
  },

  // === VERCEL ===
  'vercel.list_deployments': {
    id: 'vercel.list_deployments',
    label: 'Deployments Panel',
    description: 'Inspect running build tracks, commit records, and production target assignments.',
    icon: '🚀',
    policyActionId: 'deployments_panel',
    api: { service: 'vercel', method: 'GET', endpoint: '/v1/deployments' },
    fields: []
  },
  'vercel.view_env': {
    id: 'vercel.view_env',
    label: 'View Env Vars',
    description: 'List all active environment variable configurations on this project tracking ring.',
    icon: '🔑',
    policyActionId: 'view_env_vars',
    api: { service: 'vercel', method: 'GET', endpoint: '/v9/projects/{projectId}/env' },
    fields: []
  },
  'vercel.trigger_rollback': {
    id: 'vercel.trigger_rollback',
    label: 'Rollback Deploy',
    description: 'Instantly point production edge domain targets back to a historical deployment hash.',
    icon: '↩️',
    requiresConfirm: true,
    policyActionId: 'rollback_deploy',
    api: { service: 'vercel', method: 'POST', endpoint: '/v1/projects/rollback' },
    fields: [
      { id: 'deploymentId', label: 'Deployment ID', type: 'text', required: true, placeholder: 'dpl_...' }
    ]
  },
  'vercel.cancel_build': {
    id: 'vercel.cancel_build',
    label: 'Cancel Build',
    description: 'Abort an active compiling orchestration queue element directly at the gateway.',
    icon: '🛑',
    policyActionId: 'cancel_build',
    api: { service: 'vercel', method: 'POST', endpoint: '/v1/builds/cancel' },
    fields: [{ id: 'buildId', label: 'Build ID', type: 'text', required: true }]
  },
  'vercel.add_env_var': {
    id: 'vercel.add_env_var',
    label: 'Environment Variables',
    description: 'Inject variables globally across Production, Preview, or Staging development paths.',
    icon: '➕',
    policyActionId: 'view_env_vars',
    api: { service: 'vercel', method: 'POST', endpoint: '/v1/projects/env' },
    fields: [
      { id: 'key', label: 'Variable Key String', type: 'text', required: true, placeholder: 'NEXT_PUBLIC_API_URL' },
      { id: 'value', label: 'Variable Raw Secret Value', type: 'secret', required: true },
      { id: 'target', label: 'Environment Deployment Ring', type: 'select', required: true, options: [
        { label: 'Production Only', value: 'production' },
        { label: 'All Environments (Prod/Preview/Dev)', value: 'all' }
      ]}
    ]
  },
  'vercel.delete_env': {
    id: 'vercel.delete_env',
    label: 'Delete Env Var',
    description: 'Wipe environment variable keys completely off the active build pipeline.',
    icon: '🗑️',
    requiresConfirm: true,
    policyActionId: 'view_env_vars',
    api: { service: 'vercel', method: 'DELETE', endpoint: '/v9/projects/{projectId}/env' },
    fields: [{ id: 'id', label: 'Env Variable Key Reference', type: 'text', required: true }]
  },
  'vercel.sync_dns_domain': {
    id: 'vercel.sync_dns_domain',
    label: 'Domains/DNS',
    description: 'Configure canonical configurations, alias paths, or trigger edge SSL certification rules.',
    icon: '🌐',
    policyActionId: 'deployments_panel',
    api: { service: 'vercel', method: 'POST', endpoint: '/v1/domains/sync' },
    fields: [{ id: 'domain', label: 'Domain Address string', type: 'text', required: true, placeholder: 'app.domain.com' }]
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
  'gov.deactivate_member': {
    id: 'gov.deactivate_member',
    label: 'Archive Member',
    description: 'Suspend org permissions and turn off account access parameters globally.',
    icon: '🚫',
    requiresConfirm: true,
    api: { service: 'Governance', method: 'POST', endpoint: '/v1/team/members/deactivate' },
    fields: [{ id: 'memberId', label: 'Team Member ID', type: 'text', required: true }]
  },
  'gov.view_timeline': {
    id: 'gov.view_timeline',
    label: 'Activity Timeline',
    description: 'Audit trace lines tracking all recent cluster execution contexts.',
    icon: '📊',
    api: { service: 'Governance', method: 'GET', endpoint: '/v1/audit/timeline' },
    fields: []
  },
  'gov.clear_stale_sessions': {
    id: 'gov.clear_stale_sessions',
    label: 'Clear Sessions',
    description: 'Force log out inactive tokens and refresh authorization parameters.',
    icon: '🧹',
    api: { service: 'Governance', method: 'POST', endpoint: '/v1/audit/sessions/purge' },
    fields: []
  },

  // === KEY VAULT ===
  'vault.unlock_vault': {
    id: 'vault.unlock_vault',
    label: 'Unlock Vault',
    description: 'Supply your system-wide Master Passphrase to load sensitive key vectors.',
    icon: '🔓',
    policyActionId: 'unlock_form',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/unlock' },
    fields: [
      { id: 'passphrase', label: 'Master Passphrase', type: 'secret', required: true }
    ]
  },
  'vault.seal_vault': {
    id: 'vault.seal_vault',
    label: 'Seal Vault',
    description: 'Instantly purge decrypted memory layers and lock all core operations back down.',
    icon: '🔒',
    policyActionId: 'unlock_form',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/seal' },
    fields: []
  },
  'vault.add_secret': {
    id: 'vault.add_secret',
    label: 'Add Secret',
    description: 'Inject highly secure, encrypted variable storage strings.',
    icon: '➕',
    policyActionId: 'crud_actions',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/secrets' },
    fields: [
      { id: 'key', label: 'Secret Key Reference', type: 'text', required: true },
      { id: 'value', label: 'Encrypted Value', type: 'secret', required: true }
    ]
  },
  'vault.delete_secret': {
    id: 'vault.delete_secret',
    label: 'Delete Secret',
    description: 'Permanently scrub key reference objects from storage blocks.',
    icon: '🗑️',
    requiresConfirm: true,
    policyActionId: 'crud_actions',
    api: { service: 'Vault', method: 'DELETE', endpoint: '/v1/vault/secrets' },
    fields: [{ id: 'key', label: 'Secret Key Reference', type: 'text', required: true }]
  },
  'vault.view_keys': {
    id: 'vault.view_keys',
    label: 'Audit Log Keys',
    description: 'Inspect compliance trail paths mapping recent decryption events.',
    icon: '📜',
    policyActionId: 'audit_log',
    api: { service: 'Vault', method: 'GET', endpoint: '/v1/vault/audit' },
    fields: []
  }
}

export function getTemplate(id: string): ProviderTemplate | null {
  return PROVIDER_TEMPLATES[id] || null
}

export function getProviderTemplates(providerId?: string): ProviderTemplate[] {
  const templates = Object.values(PROVIDER_TEMPLATES)
  if (!providerId) return templates
  return templates.filter(t => t.id.startsWith(providerId + '.'))
}

export function validateTemplatePayload(templateId: string, payload: Record<string, any>) {
  const template = getTemplate(templateId)
  if (!template) return { ok: false, missing: [], error: 'Template layout not registered' }

  const missing: string[] = []
  template.fields.forEach(field => {
    if (field.required && (payload[field.id] === undefined || payload[field.id] === null || payload[field.id] === '')) {
      missing.push(field.id)
    }
  })

  return {
    ok: missing.length === 0,
    missing,
    error: missing.length > 0 ? `Missing required parameters: ${missing.join(', ')}` : undefined
  }
}
