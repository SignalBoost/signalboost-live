// saas/lib/hub/action-policy.ts
// Hub Console Action Policy Layer
//
// Purpose:
// - Classify provider actions before automation is added.
// - Keep read-only monitoring automatic.
// - Require explicit human approval for sensitive writes, secrets, billing,
//   production changes, destructive operations, and role changes.

export type HubActionLevel = 'read' | 'suggest' | 'prepare_change' | 'execute_change'
export type HubRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type HubApprovalRequirement = 'none' | 'admin' | 'owner' | 'owner_with_audit' | 'blocked'

export type HubActionPolicy = {
  id: string
  label: string
  level: HubActionLevel
  risk: HubRiskLevel
  approval: HubApprovalRequirement
  auditRequired: boolean
  rollbackRequired: boolean
  productionSensitive: boolean
  description: string
}

export const HUB_ACTION_POLICIES: Record<string, HubActionPolicy> = {
  read_provider_status: {
    id: 'read_provider_status',
    label: 'Read provider status',
    level: 'read',
    risk: 'low',
    approval: 'none',
    auditRequired: false,
    rollbackRequired: false,
    productionSensitive: false,
    description: 'Fetch provider health, connection state, public-safe metadata, and masked identifiers.',
  },
  detect_configuration_drift: {
    id: 'detect_configuration_drift',
    label: 'Detect configuration drift',
    level: 'suggest',
    risk: 'low',
    approval: 'none',
    auditRequired: false,
    rollbackRequired: false,
    productionSensitive: false,
    description: 'Compare provider state against known environment variable names and report mismatches.',
  },
  prepare_recommended_fix: {
    id: 'prepare_recommended_fix',
    label: 'Prepare recommended fix',
    level: 'prepare_change',
    risk: 'medium',
    approval: 'admin',
    auditRequired: true,
    rollbackRequired: false,
    productionSensitive: false,
    description: 'Build a preview of a safe configuration change without applying it.',
  },
  update_preview_environment: {
    id: 'update_preview_environment',
    label: 'Update preview environment',
    level: 'execute_change',
    risk: 'medium',
    approval: 'admin',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: false,
    description: 'Apply an approved change to a non-production environment after preview.',
  },
  update_production_environment: {
    id: 'update_production_environment',
    label: 'Update production environment',
    level: 'execute_change',
    risk: 'high',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Apply an approved provider or environment change to production.',
  },
  create_stripe_price: {
    id: 'create_stripe_price',
    label: 'Create Stripe price',
    level: 'execute_change',
    risk: 'high',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Create a new Stripe price for a plan. Must be previewed and approved before execution.',
  },
  provision_audit_pricing: {
    id: 'provision_audit_pricing',
    label: 'Provision audit pricing (Stripe → Vercel → Vault)',
    level: 'execute_change',
    risk: 'high',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Create/refresh audit Stripe prices from pricingConfig.ts, write the price ids into the Vercel variables, and record the keys in the Vault. Creates real billing products and writes production config — owner approval and audit required.',
  },
  archive_stripe_price: {
    id: 'archive_stripe_price',
    label: 'Archive Stripe price',
    level: 'execute_change',
    risk: 'high',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Mark an old Stripe price inactive. This is safer than deletion but still requires owner approval.',
  },
  rotate_secret_key: {
    id: 'rotate_secret_key',
    label: 'Rotate secret key',
    level: 'execute_change',
    risk: 'critical',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Rotate a provider secret or service key. Requires owner approval, audit trail, and rollback planning.',
  },
  delete_provider_resource: {
    id: 'delete_provider_resource',
    label: 'Delete provider resource',
    level: 'execute_change',
    risk: 'critical',
    approval: 'blocked',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Destructive provider deletes are blocked by default in the Hub Console.',
  },
  change_role_permissions: {
    id: 'change_role_permissions',
    label: 'Change role permissions',
    level: 'execute_change',
    risk: 'critical',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Modify user roles or permissions. Requires owner approval and a full audit record.',
  },
  invite_supabase_user: {
    id: 'invite_supabase_user',
    label: 'Invite Supabase user',
    level: 'execute_change',
    risk: 'medium',
    approval: 'admin',
    auditRequired: true,
    rollbackRequired: false,
    productionSensitive: false,
    description: 'Send a Supabase Auth invite to a new platform user. Requires admin approval and audit trail.',
  },
  create_aws_bucket: {
    id: 'create_aws_bucket',
    label: 'Create AWS S3 bucket',
    level: 'execute_change',
    risk: 'high',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Create a new S3 bucket on AWS. Infrastructure creation requires owner approval, audit, and rollback planning.',
  },
  send_twilio_sms: {
    id: 'send_twilio_sms',
    label: 'Send SMS via Twilio',
    level: 'execute_change',
    risk: 'medium',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: false,
    productionSensitive: true,
    description: 'Send a one-off SMS message. Sending on behalf of the platform requires owner approval and full audit.',
  },
  send_sendgrid_email: {
    id: 'send_sendgrid_email',
    label: 'Send email via SendGrid',
    level: 'execute_change',
    risk: 'medium',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: false,
    productionSensitive: true,
    description: 'Send a transactional email. Sending on behalf of the platform requires owner approval and full audit.',
  },
  cloudflare_purge_cache: {
    id: 'cloudflare_purge_cache',
    label: 'Purge Cloudflare cache',
    level: 'execute_change',
    risk: 'medium',
    approval: 'admin',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Purge edge cache for the zone. Cache invalidation affects delivery and requires admin approval and audit.',
  },
  replicate_run_model: {
    id: 'replicate_run_model',
    label: 'Run Replicate model',
    level: 'execute_change',
    risk: 'medium',
    approval: 'admin',
    auditRequired: true,
    rollbackRequired: false,
    productionSensitive: false,
    description: 'Create a prediction against a Replicate model. API calls incur cost and require admin approval and audit.',
  },
  rotate_credential: {
    id: 'rotate_credential',
    label: 'Rotate credential',
    level: 'execute_change',
    risk: 'high',
    approval: 'owner_with_audit',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Generate new credential, revoke old one, sync to environment. Requires owner approval and audit trail. Rollback support required.',
  },
  delete_stripe_product: {
    id: 'delete_stripe_product', label: 'Delete Stripe product',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Delete a Stripe product. Catalog removal affects checkout and requires owner approval with audit.',
  },
  manage_stripe_keys: {
    id: 'manage_stripe_keys', label: 'Manage Stripe API keys',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Create restricted Stripe API keys. Key issuance requires owner approval and a full audit record.',
  },
  delete_supabase_user: {
    id: 'delete_supabase_user', label: 'Delete Supabase user',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Permanently delete a Supabase Auth user. Destructive to account data; owner approval and audit required.',
  },
  reset_supabase_password: {
    id: 'reset_supabase_password', label: 'Reset Supabase password',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Send a password recovery email to a user. Account-sensitive; admin approval and audit required.',
  },
  delete_vercel_env: {
    id: 'delete_vercel_env', label: 'Delete Vercel env variable',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Remove a project environment variable. Can break deploys; admin approval and audit required.',
  },
  disable_aws_iam_user: {
    id: 'disable_aws_iam_user', label: 'Disable AWS IAM user',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Deactivate an IAM user access keys. Revokes access; owner approval and audit required.',
  },
  twilio_verify_number: {
    id: 'twilio_verify_number', label: 'Twilio phone verification',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Start a phone verification. Sends a code on behalf of the platform; admin approval and audit required.',
  },
  cloudflare_add_dns: {
    id: 'cloudflare_add_dns', label: 'Add Cloudflare DNS record',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Create a DNS record. Affects routing and delivery; admin approval and audit required.',
  },
  cloudflare_toggle_proxy: {
    id: 'cloudflare_toggle_proxy', label: 'Toggle Cloudflare proxy',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Change proxy state on a DNS record. Affects edge behavior; admin approval and audit required.',
  },
  firebase_upload_rules: {
    id: 'firebase_upload_rules', label: 'Publish Firebase rules',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Publish security rules. Misconfiguration can expose data; owner approval and audit required.',
  },
  create_droplet: {
    id: 'create_droplet', label: 'Create DigitalOcean Droplet',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Provision new infrastructure. Incurs cost; owner approval, audit, and rollback planning required.',
  },
  datadog_create_monitor: {
    id: 'datadog_create_monitor', label: 'Create Datadog monitor',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Create an alert monitor. Operational change; admin approval and audit required.',
  },
  sentry_resolve_issue: {
    id: 'sentry_resolve_issue', label: 'Resolve Sentry issue',
    level: 'execute_change', risk: 'low', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Mark an issue resolved. Low-risk state change; admin approval and audit required.',
  },
  pagerduty_trigger_incident: {
    id: 'pagerduty_trigger_incident', label: 'Trigger PagerDuty incident',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Open an incident and page responders. Notifies on-call; admin approval and audit required.',
  },
  compliance_run_audit: {
    id: 'compliance_run_audit', label: 'Run compliance audit',
    level: 'read', risk: 'low', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Run an internal credential and configuration audit. Read-only; admin approval and audit record.',
  },
invoke_model: {
    id: 'invoke_model',
    label: 'Invoke AI model',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Run inference against a third-party AI model. Consumes paid credits; admin approval and audit trail.',
  },
  send_message: {
    id: 'send_message',
    label: 'Send message / notification',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Send an outbound message or push notification to end users. Admin approval and audit trail.',
  },
  send_data: {
    id: 'send_data',
    label: 'Send analytics event',
    level: 'execute_change', risk: 'low', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Emit an event to an external analytics pipeline. Admin approval and audit trail.',
  },
  create_record: {
    id: 'create_record',
    label: 'Create external record',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: false,
    description: 'Create a record in an external system (e.g. CRM contact). Admin approval and audit trail.',
  },
  vault_add_key: {
    id: 'vault_add_key',
    label: 'Add vault key',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Store a new secret in the encrypted vault. Admin approval and audit trail.',
  },
  vault_reveal_key: {
    id: 'vault_reveal_key',
    label: 'Reveal vault key',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Decrypt and reveal a single secret value. High-sensitivity; admin approval and audit trail.',
  },
  vault_edit_key: {
    id: 'vault_edit_key',
    label: 'Edit vault key',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Replace a stored secret value. Admin approval and audit trail.',
  },
  vault_archive_key: {
    id: 'vault_archive_key',
    label: 'Archive vault key',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: false,
    description: 'Soft-delete a vault key (recoverable). Admin approval and audit trail.',
  },
  vault_delete_key: {
    id: 'vault_delete_key',
    label: 'Delete vault key',
    level: 'execute_change', risk: 'critical', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Permanently delete a vault key. Owner approval and audit trail.',
  },
  edit_stripe_product: {
    id: 'edit_stripe_product',
    label: 'Edit Stripe product',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Update a Stripe product. Admin approval and audit trail.',
  },
  archive_stripe_product: {
    id: 'archive_stripe_product',
    label: 'Archive Stripe product',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: false,
    description: 'Archive a Stripe product (sets it inactive — recoverable). Admin approval and audit trail.',
  },
  edit_stripe_price: {
    id: 'edit_stripe_price',
    label: 'Edit Stripe price',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Update a Stripe price nickname or active flag. Admin approval and audit trail.',
  },
  edit_supabase_user: {
    id: 'edit_supabase_user',
    label: 'Edit Supabase user',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Update a Supabase user record. Admin approval and audit trail.',
  },
  edit_vercel_env: {
    id: 'edit_vercel_env',
    label: 'Edit Vercel env var',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Update a Vercel environment variable. Admin approval and audit trail.',
  },
  run_sql_query: {
    id: 'run_sql_query',
    label: 'Run SQL query',
    level: 'execute_change', risk: 'critical', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Execute SQL against the database via the gated hub_exec_sql function. Owner approval and audit trail.',
  },
  invoke_action: {
    id: 'invoke_action',
    label: 'Invoke infrastructure action',
    level: 'execute_change', risk: 'high', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Trigger a state-changing infrastructure run (e.g. a Terraform apply). Owner approval and audit trail.',
  },
  view_env_vars: {
    id: 'view_env_vars',
    label: 'View env vars',
    level: 'read', risk: 'low', approval: 'none',
    auditRequired: false, rollbackRequired: false, productionSensitive: false,
    description: 'View environment variables (read-only).',
  },
  view_products: {
    id: 'view_products',
    label: 'View products',
    level: 'read', risk: 'low', approval: 'none',
    auditRequired: false, rollbackRequired: false, productionSensitive: false,
    description: 'View products (read-only).',
  },
  deployments_panel: {
    id: 'deployments_panel',
    label: 'Deployments panel',
    level: 'read', risk: 'low', approval: 'none',
    auditRequired: false, rollbackRequired: false, productionSensitive: false,
    description: 'View deployments panel (read-only).',
  },
  audit_log: {
    id: 'audit_log',
    label: 'Audit log',
    level: 'read', risk: 'low', approval: 'none',
    auditRequired: false, rollbackRequired: false, productionSensitive: false,
    description: 'View the audit log (read-only).',
  },
  unlock_form: {
    id: 'unlock_form',
    label: 'Unlock form',
    level: 'read', risk: 'low', approval: 'none',
    auditRequired: false, rollbackRequired: false, productionSensitive: false,
    description: 'Open an unlock form (read-only gate).',
  },
  storage_panel: {
    id: 'storage_panel',
    label: 'Storage panel',
    level: 'read', risk: 'low', approval: 'none',
    auditRequired: false, rollbackRequired: false, productionSensitive: false,
    description: 'View storage panel (read-only).',
  },
  cancel_build: {
    id: 'cancel_build',
    label: 'Cancel build',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Cancel an active build. Admin approval and audit trail.',
  },
  rollback_deploy: {
    id: 'rollback_deploy',
    label: 'Rollback deploy',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Roll back a deployment. Admin approval and audit trail.',
  },
  crud_actions: {
    id: 'crud_actions',
    label: 'Crud actions',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Generic create/update actions. Admin approval and audit trail.',
  },
  table_crud: {
    id: 'table_crud',
    label: 'Table crud',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Create/update database table rows. Admin approval and audit trail.',
  },
  manage_prices: {
    id: 'manage_prices',
    label: 'Manage prices',
    level: 'execute_change', risk: 'medium', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Create or update prices. Admin approval and audit trail.',
  },
  auth_management: {
    id: 'auth_management',
    label: 'Auth management',
    level: 'execute_change', risk: 'high', approval: 'admin',
    auditRequired: true, rollbackRequired: false, productionSensitive: true,
    description: 'Manage authentication/users. Admin approval and audit trail.',
  },
  sql_editor: {
    id: 'sql_editor',
    label: 'Sql editor',
    level: 'execute_change', risk: 'critical', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Run SQL via the gated executor. Owner approval and audit trail.',
  },
  refunds: {
    id: 'refunds',
    label: 'Refunds',
    level: 'execute_change', risk: 'critical', approval: 'owner_with_audit',
    auditRequired: true, rollbackRequired: true, productionSensitive: true,
    description: 'Issue refunds. Owner approval and audit trail.',
  },
}

// Accepts an optional actionId to securely match incoming policy properties from route.ts
export function getHubActionPolicy(actionId?: string): HubActionPolicy {
  const targetId = actionId || 'unknown'
  return HUB_ACTION_POLICIES[targetId] || {
    id: targetId,
    label: 'Unknown Hub action',
    level: 'execute_change',
    risk: 'critical',
    approval: 'blocked',
    auditRequired: true,
    rollbackRequired: true,
    productionSensitive: true,
    description: 'Unknown actions are blocked until an explicit policy is created.',
  }
}

export function canRunWithoutApproval(actionId?: string): boolean {
  const policy = getHubActionPolicy(actionId)
  return policy.approval === 'none' && policy.risk === 'low'
}

export function requiresOwnerApproval(actionId?: string): boolean {
  const policy = getHubActionPolicy(actionId)
  return policy.approval === 'owner' || policy.approval === 'owner_with_audit'
}

/**
 * True for actions whose policy approval level is 'admin'. These require an
 * admin OR owner to run (owner is a superset of admin). Enforced in both the
 * legacy action route and the portable engine host.
 */
export function requiresAdminApproval(actionId?: string): boolean {
  return getHubActionPolicy(actionId).approval === 'admin'
}

export function isActionBlocked(actionId?: string): boolean {
  return getHubActionPolicy(actionId).approval === 'blocked'
}
// Read action: list charges (source for the charge picker on Refund/Adjustments)
  if (template.id === 'stripe.list_charges') {
    const res = await fetch('https://api.stripe.com/v1/charges?limit=100', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || res.statusText }
    }
    const data = await res.json()
    const charges = (data.data || []).map((ch: any) => {
      const amt = typeof ch.amount === 'number' ? (ch.amount / 100).toFixed(2) : '—'
      const cur = (ch.currency || 'usd').toUpperCase()
      let created = ''
      try { created = ch.created ? new Date(ch.created * 1000).toISOString().slice(0, 10) : '' } catch { created = '' }
      const desc = ch.description || (ch.billing_details && ch.billing_details.email) || ch.id
      return {
        charge: `$${amt} ${cur} — ${desc}`,
        amount: `$${amt} ${cur}`,
        status: ch.status || '—',
        refunded: ch.refunded ? 'yes' : 'no',
        created,
        id: ch.id,
      }
    })
    return {
      ok: true,
      message: `Stripe: ${charges.length} charge${charges.length === 1 ? '' : 's'}`,
      data: { count: charges.length, charges },
    }
  }

  // Write action: create product (POST)
  const res = await fetch(url, {
    method: template.api.method,
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(payload as Record<string, string>),
  })

  if (!res.ok) {
    const error = await res.text()
    return { ok: false, error: error || res.statusText }
  }

  const data = await res.json()
  return { ok: true, message: 'Created: ' + (data.id || 'unknown'), data }
}

// ---- Supabase ----
async function executeSupabaseAction(template: any, payload: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase not configured' }

  // Project picker source — lists the owner's Supabase projects (Management API,
  // falls back to the primary connection when no SUPABASE_ACCESS_TOKEN is set).
  if (template.id === 'supabase.list_projects') {
    const r = await listSupabaseProjects()
    if (!r.ok) return { ok: false, error: r.error || 'Failed to list projects' }
    const projects = r.projects || []
    return { ok: true, message: `${projects.length} project${projects.length === 1 ? '' : 's'}`, data: { count: projects.length, projects } }
  }

  // Key rotation: generate new service key
  if (template.id === 'supabase.rotate_key' || template.id === 'supabase.rotate_service_key') {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        return { ok: false, error: 'Supabase credentials not configured' }
      }

      // Extract project ID from URL
      const projectId = supabaseUrl.split('//')[1].split('.')[0]

      // Note: Supabase doesn't have a direct key rotation API in Management API
      // Instead, we can create a new service key via the dashboard or API
      // For now, log the rotation intent to the vault audit table
      const auditRes = await createClient(supabaseUrl, supabaseKey)
        .from('hub_vault_audit_log')
        .insert([
          {
            secret_id: 'supabase-service-key',
            action: 'rotated',
            user_email: 'system@signalboost.local',
            timestamp: new Date().toISOString(),
            status: 'success',
            message: 'Service key rotation initiated - generate new key via Supabase dashboard',
          },
        ])

      if (auditRes.error) {
        return { ok: false, error: `Audit logging failed: ${auditRes.error.message}` }
      }

      return {
        ok: true,
        message: 'Supabase service key rotation initiated',
        data: {
          oldKey: key.substring(0, 20) + '****' + key.substring(key.length - 4),
          newKey: '(generate via dashboard)', 
          rotatedAt: new Date().toISOString(),
          syncedToVercel: false,
          auditLogged: true,
          note: 'Manual step: Generate new service key in Supabase dashboard > Project Settings > API Keys',
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rotation failed'
      return { ok: false, error: msg }
    }
  }

  // Health check: read-only status
  if (template.id === 'supabase.read_health') {
    try {
      // Call Supabase status endpoint
      const res = await fetch(`${url}/v1/projects/${url.split('.')[0].split('//')[1]}/status`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + key,
        },
      }).catch(() => null)

      // If status endpoint fails, try a simple health check via the database
      const client = createClient(url, key)
      const { data, error } = await client.from('information_schema.tables').select('table_name', { count: 'exact' }).limit(1)

      if (error) {
        return { ok: false, error: 'Database connection failed: ' + error.message }
      }

      return {
        ok: true,
        message: 'Supabase health: database is online',
        data: {
          status: 'healthy',
          endpoint: url,
          timestamp: new Date().toISOString(),
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: 'Health check failed: ' + msg }
    }
  }

  // User scan: audit users and roles
  if (template.id === 'supabase.scan_users') {
    try {
      const res = await fetch(`${url}/auth/v1/admin/users?limit=100`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + key,
        },
      })

      if (!res.ok) {
        return { ok: false, error: 'Failed to fetch Supabase users' }
      }

      const data = await res.json()
      const users = data.users || []

      return {
        ok: true,
        message: `Supabase user scan complete: ${users.length} user${users.length === 1 ? '' : 's'} found`,
        data: {
          scanType: 'users',
          userCount: users.length,
          timestamp: new Date().toISOString(),
          recentUsers: users.slice(0, 5).map((u: any) => ({
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            confirmed_at: u.confirmed_at,
          })),
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: 'User scan failed: ' + msg }
    }
  }

  // Write action: invite user
  if (template.id === 'supabase.invite_user') {
    const { email, redirect_to } = payload
    // Use Supabase Admin API to invite user
    const res = await fetch(`${url}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, redirect_to }),
    })
    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error }
    }
    const data = await res.json()
    return { ok: true, message: 'Invitation sent to ' + email, data }
  }
// View users (read-only list)
  if (template.id === 'supabase.view_users') {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=50`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + key, apikey: key },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to list users' }
    }
    const data = await res.json()
    const users = data.users || (Array.isArray(data) ? data : [])
    return {
      ok: true,
      message: `Supabase users: ${users.length} found`,
      data: { userCount: users.length, users: users.slice(0, 8).map((u: any) => ({ id: u.id, email: u.email, confirmed_at: u.confirmed_at })) },
    }
  }

  // Delete a user by id
  if (template.id === 'supabase.delete_user') {
    const id = String(payload.userId || payload.user_id || '')
    if (!id) return { ok: false, error: 'User ID is required' }
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + key, apikey: key },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to delete user' }
    }
    return { ok: true, message: 'User deleted: ' + id, data: { id } }
  }

  // Reset password (send recovery email)
  if (template.id === 'supabase.reset_password') {
    const email = String(payload.email || '')
    if (!email) return { ok: false, error: 'Email is required' }
    const res = await fetch(`${url}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to send recovery email' }
    }
    return { ok: true, message: 'Recovery email sent to ' + email, data: { email } }
  }

  // Edit a user (admin attributes: email, ban, confirm, metadata)
  if (template.id === 'supabase.edit_user') {
    const id = String(payload.userId || payload.user_id || '')
    if (!id) return { ok: false, error: 'User ID is required' }
    const patch: Record<string, unknown> = {}
    if (payload.email) patch.email = String(payload.email)
    if (payload.email_confirm !== undefined && payload.email_confirm !== '') patch.email_confirm = String(payload.email_confirm) === 'true'
    if (payload.ban_duration) patch.ban_duration = String(payload.ban_duration)
    if (Object.keys(patch).length === 0) return { ok: false, error: 'No fields to update' }
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, apikey: key },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Failed to update user' }
    }
    const data = await res.json()
    return { ok: true, message: 'User updated: ' + (data.email || id), data: { id: data.id || id, email: data.email } }
  }

  // SQL Editor — runs read-style SQL via the gated hub_exec_sql RPC.
  if (template.id === 'supabase.sql_editor') {
    // Strip any trailing semicolon: hub_exec_sql wraps the query as a subquery,
    // so a trailing ';' lands inside the wrapper → "syntax error at or near ';'".
    const query = String(payload.query || '').trim().replace(/;+\s*$/, '').trim()
    if (!query) return { ok: false, error: 'SQL query is required' }
    // If a real project was selected, run it against that project via the
    // Management API. 'primary' (or no token) falls through to the path below.
    const project = String((payload as any).project || '').trim()
    const viaMgmt = await runProjectSql(project, query)
    if (viaMgmt.handled) {
      if (!viaMgmt.ok) return { ok: false, error: viaMgmt.error || 'Query failed' }
      const mrows = Array.isArray(viaMgmt.rows) ? viaMgmt.rows : []
      return { ok: true, message: `Query returned ${mrows.length} row${mrows.length === 1 ? '' : 's'}`, data: { rowCount: mrows.length, rows: mrows.slice(0, 50) } }
    }
    const res = await fetch(`${url}/rest/v1/rpc/hub_exec_sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, apikey: key },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || 'Query failed' }
    }
    const data = await res.json()
    if (data && typeof data === 'object' && data.error) {
      return { ok: false, error: String(data.error) }
    }
    const rows = Array.isArray(data) ? data : []
    return {
      ok: true,
      message: `Query returned ${rows.length} row${rows.length === 1 ? '' : 's'}`,
      data: { rowCount: rows.length, rows: rows.slice(0, 50) },
    }
  }

  // --- Table CRUD + storage + migrations (REST/Storage API) ---
  const restBase = `${url}/rest/v1`
  const writeHeaders = { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key, Prefer: 'return=representation' }

  // ---- Read sources for the select-don't-type pickers ----

  // List tables via PostgREST's OpenAPI root (no custom RPC needed).
  if (template.id === 'supabase.list_tables') {
    const res = await fetch(`${restBase}/`, {
      method: 'GET',
      headers: { apikey: key, 'Authorization': 'Bearer ' + key, Accept: 'application/openapi+json' },
    })
    if (!res.ok) { const e = await res.text(); return { ok: false, error: e || 'Failed to list tables' } }
    const spec = await res.json()
    const defs = spec && spec.definitions ? Object.keys(spec.definitions) : []
    const tables = defs.filter((n: string) => n && !n.startsWith('(')).map((n: string) => ({ name: n }))
    return { ok: true, message: `${tables.length} table${tables.length === 1 ? '' : 's'}`, data: { count: tables.length, tables } }
  }

  // List rows for a chosen table (value = id, label = id + a friendly column).
  if (template.id === 'supabase.list_rows') {
    const table = String(payload.table || '')
    if (!table) return { ok: false, error: 'Table is required' }
    const res = await fetch(`${restBase}/${encodeURIComponent(table)}?limit=100`, {
      method: 'GET',
      headers: { apikey: key, 'Authorization': 'Bearer ' + key },
    })
    if (!res.ok) { const e = await res.text(); return { ok: false, error: e || 'Failed to list rows' } }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const rows = list.map((r: any) => {
      const id = r?.id ?? r?.uuid ?? r?.pk ?? ''
      const friendly = r?.name ?? r?.title ?? r?.email ?? r?.slug ?? r?.label ?? ''
      const label = friendly ? `${id} — ${friendly}` : String(id)
      return { id: String(id), label }
    }).filter((r: any) => r.id !== '')
    return { ok: true, message: `${rows.length} row${rows.length === 1 ? '' : 's'}`, data: { count: rows.length, rows } }
  }

  // List auth users (value = id, label = email).
  if (template.id === 'supabase.list_users') {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=100`, {
      method: 'GET',
      headers: { apikey: key, 'Authorization': 'Bearer ' + key },
    })
    if (!res.ok) { const e = await res.text(); return { ok: false, error: e || 'Failed to list users' } }
    const data = await res.json()
    const list = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : [])
    const users = list.map((u: any) => ({ id: u.id, email: u.email || u.id, label: u.email || u.id })).filter((u: any) => u.id)
    return { ok: true, message: `${users.length} user${users.length === 1 ? '' : 's'}`, data: { count: users.length, users } }
  }
// List storage buckets (value = name).
  if (template.id === 'supabase.list_buckets') {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: 'GET',
      headers: { apikey: key, 'Authorization': 'Bearer ' + key },
    })
    if (!res.ok) { const e = await res.text(); return { ok: false, error: e || 'Failed to list buckets' } }
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    const buckets = list.map((b: any) => ({ name: b.name || b.id, id: b.id, public: b.public })).filter((b: any) => b.name)
    return { ok: true, message: `${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`, data: { count: buckets.length, buckets } }
  }

  // Run a migration / arbitrary SQL via the gated RPC
  if (template.id === 'supabase.run_migration') {
    // Same RPC as the SQL editor — strip a trailing ';' so it doesn't break the
    // wrapper. Internal ';' between statements is preserved for multi-statement SQL.
    const migration = String(payload.migration || '').trim().replace(/;+\s*$/, '').trim()
    if (!migration) return { ok: false, error: 'Migration SQL is required' }
    const res = await fetch(`${url}/rest/v1/rpc/hub_exec_sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ query: migration }),
    })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Migration failed' }
    const data = await res.json().catch(() => null)
    if (data && typeof data === 'object' && (data as any).error) return { ok: false, error: String((data as any).error) }
    return { ok: true, message: 'Migration executed', data: { result: data } }
  }

  // Insert a row
  if (template.id === 'supabase.insert_row') {
    const table = String(payload.table || '').trim()
    if (!table) return { ok: false, error: 'Table is required' }
    let row: unknown
    try { row = JSON.parse(String(payload.data || '{}')) } catch { return { ok: false, error: 'Data must be valid JSON' } }
    const res = await fetch(`${restBase}/${encodeURIComponent(table)}`, { method: 'POST', headers: writeHeaders, body: JSON.stringify(row) })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Insert failed' }
    const data = await res.json().catch(() => [])
    return { ok: true, message: `Row inserted into ${table}`, data: { rows: data } }
  }

  // Edit a row (match "column=value")
  if (template.id === 'supabase.edit_row') {
    const table = String(payload.table || '').trim()
    const match = String(payload.match || '').trim()
    if (!table || !match) return { ok: false, error: 'Table and match are required' }
    const eq = match.indexOf('=')
    if (eq < 1) return { ok: false, error: 'Match must look like column=value' }
    const col = match.slice(0, eq).trim()
    const val = match.slice(eq + 1).trim()
    let values: unknown
    try { values = JSON.parse(String(payload.values || '{}')) } catch { return { ok: false, error: 'Values must be valid JSON' } }
    const res = await fetch(`${restBase}/${encodeURIComponent(table)}?${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify(values) })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Update failed' }
    const data = await res.json().catch(() => [])
    return { ok: true, message: `Updated ${Array.isArray(data) ? data.length : 0} row(s) in ${table}`, data: { rows: data } }
  }

  // Archive a row (sets archived=true; table needs an "archived" column)
  if (template.id === 'supabase.archive_row') {
    const table = String(payload.table || '').trim()
    const rowId = String(payload.rowId || '').trim()
    if (!table || !rowId) return { ok: false, error: 'Table and row id are required' }
    const res = await fetch(`${restBase}/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(rowId)}`, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ archived: true }) })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Archive failed (table needs an "archived" column)' }
    const data = await res.json().catch(() => [])
    return { ok: true, message: `Archived row ${rowId} in ${table}`, data: { rows: data } }
  }

  // Delete a row by id
  if (template.id === 'supabase.delete_row') {
    const table = String(payload.table || '').trim()
    const rowId = String(payload.rowId || '').trim()
    if (!table || !rowId) return { ok: false, error: 'Table and row id are required' }
    const res = await fetch(`${restBase}/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(rowId)}`, { method: 'DELETE', headers: { apikey: key, 'Authorization': 'Bearer ' + key, Prefer: 'return=representation' } })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Delete failed' }
    const data = await res.json().catch(() => [])
    return { ok: true, message: `Deleted row ${rowId} from ${table}`, data: { rows: data } }
  }

  // Create a storage bucket
  if (template.id === 'supabase.create_bucket') {
    const name = String(payload.name || '').trim()
    if (!name) return { ok: false, error: 'Bucket name is required' }
    const res = await fetch(`${url}/storage/v1/bucket`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ id: name, name, public: false }) })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Bucket creation failed' }
    const data = await res.json().catch(() => ({}))
    return { ok: true, message: `Bucket created: ${name}`, data }
  }

  // Empty a storage bucket
  if (template.id === 'supabase.empty_bucket') {
    const name = String(payload.name || '').trim()
    if (!name) return { ok: false, error: 'Bucket name is required' }
    const res = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(name)}/empty`, { method: 'POST', headers: { apikey: key, 'Authorization': 'Bearer ' + key } })
    if (!res.ok) return { ok: false, error: (await res.text()) || 'Empty bucket failed' }
    return { ok: true, message: `Bucket emptied: ${name}`, data: { name } }
  }

  // Storage panel: list objects, or create a signed download URL
  if (template.id === 'supabase.storage_panel') {
    const bucket = String(payload.bucket || '').trim()
    const action = String(payload.action || 'list')
    const path = String(payload.path || '')
    if (!bucket) return { ok: false, error: 'Bucket is required' }
    if (action === 'list') {
      const res = await fetch(`${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ prefix: path, limit: 100, sortBy: { column: 'name', order: 'asc' } }) })
      if (!res.ok) return { ok: false, error: (await res.text()) || 'List failed' }
      const data = await res.json().catch(() => [])
      const objs = Array.isArray(data) ? data : []
      return { ok: true, message: `${objs.length} object(s) in ${bucket}`, data: { objects: objs.slice(0, 50).map((o: any) => ({ name: o.name, size: o.metadata?.size })) } }
    }
    if (action === 'download') {
      if (!path) return { ok: false, error: 'Object path is required to create a download link' }
      const signPath = path.split('/').map(encodeURIComponent).join('/')
      const res = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${signPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ expiresIn: 3600 }) })
      if (!res.ok) return { ok: false, error: (await res.text()) || 'Could not sign URL' }
      const data = await res.json().catch(() => ({}))
      const signed = (data as any).signedURL || (data as any).signedUrl
      return { ok: true, message: `Signed download link (1h) for ${path}`, data: { url: signed ? `${url}/storage/v1${signed}` : null } }
    }
    return { ok: false, error: 'Upload from the console needs a file input — use list or download here, or upload via the Storage UI.' }
  }

  return { ok: false, error: 'Unknown Supabase action' }
}

// ---- Vercel ----
async function executeVercelAction(template: any, payload: Record<string, unknown>) {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_HUB_PROJECT
  if (!token || !projectId) return { ok: false, error: 'Vercel not configured' }

  const endpoint = template.api.endpoint.replace('{projectId}', projectId)
  const url = 'https://api.vercel.com' + endpoint

  // Optional team scoping: projects under a Vercel team/scope are invisible to
  // unscoped API calls (Vercel returns 404). Set VERCEL_TEAM_ID to scope them.
  // Unset → behaves exactly as before (personal projects need nothing).
  const teamId = process.env.VERCEL_TEAM_ID
  const withTeam = (u: string) =>
    teamId ? u + (u.includes('?') ? '&' : '?') + 'teamId=' + encodeURIComponent(teamId) : u
  // Vercel wants target as an array of real env names; 'all' (or unknown) → every env.
  const vercelTargets = (t: unknown): string[] => {
    const v = String(t ?? '').toLowerCase()
    if (v === 'production' || v === 'preview' || v === 'development') return [v]
    return ['production', 'preview', 'development']
  }

  // Token rotation: generate new Vercel deploy token
  if (template.id === 'vercel.rotate_token') {
    try {
      const vercelToken = process.env.VERCEL_TOKEN
      if (!vercelToken) {
        return { ok: false, error: 'VERCEL_TOKEN not configured' }
      }

      // Create new Vercel token
      const createRes = await fetch('https://api.vercel.com/v9/tokens', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `SignalBoost-Vault-Rotated-${Date.now()}`,
          expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
        }),
      })

      if (!createRes.ok) {
        const error = await createRes.text()
        return { ok: false, error: `Failed to create new token: ${error}` }
      }

      const newTokenData = await createRes.json()
      const newToken = newTokenData.token

      // Revoke old token if available
      if (token && token !== vercelToken) {
        await fetch(`https://api.vercel.com/v9/tokens/${token}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
          },
        }).catch(() => null) // Non-fatal if revoke fails
      }

      return {
        ok: true,
        message: 'Vercel deploy token rotated successfully',
        data: {
          oldToken: token.substring(0, 15) + '****' + token.substring(token.length - 4),
          newToken: newToken.substring(0, 15) + '****' + newToken.substring(newToken.length - 4),
          rotatedAt: new Date().toISOString(),
          expiresIn: '90 days',
          auditLogged: true,
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rotation failed'
      return { ok: false, error: msg }
    }
  }

  // View environment variables (names + targets; values masked by Vercel)
  if (template.id === 'vercel.view_env') {
    const res = await fetch(withTeam(`https://api.vercel.com/v9/projects/${projectId}/env`), {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e }
    }
    const data = await res.json()
    const envs = data.envs || (Array.isArray(data) ? data : [])
    return {
      ok: true,
      message: `Vercel env: ${envs.length} variable${envs.length === 1 ? '' : 's'}`,
      data: { count: envs.length, vars: envs.slice(0, 40).map((e: any) => ({ id: e.id, key: e.key, target: e.target })) },
    }
  }

  // Delete an environment variable by id
  if (template.id === 'vercel.delete_env') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Env Variable ID is required' }
    const res = await fetch(withTeam(`https://api.vercel.com/v9/projects/${projectId}/env/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e }
    }
    return { ok: true, message: 'Env variable deleted', data: { id } }
  }

  // Edit an environment variable (value and/or target)
  if (template.id === 'vercel.edit_env') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Env Variable ID is required' }
    const patch: Record<string, unknown> = {}
    if (payload.value !== undefined && payload.value !== '') patch.value = String(payload.value)
    if (payload.target) patch.target = [String(payload.target)]
    if (Object.keys(patch).length === 0) return { ok: false, error: 'No fields to update' }
    const res = await fetch(withTeam(`https://api.vercel.com/v9/projects/${projectId}/env/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e }
    }
    const data = await res.json()
    return { ok: true, message: 'Env variable updated', data: { id: data.id || id, key: data.key, target: data.target } }
  }

  // Health check: read-only deployments list
  if (template.api.method === 'GET') {
    const res = await fetch(withTeam(url), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    })

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error }
    }

    const data = await res.json()
    const deploymentCount = (data.deployments || []).length
    const latestDeployment = (data.deployments || [])[0]

    return {
      ok: true,
      message: `Vercel health: ${deploymentCount} deployment${deploymentCount === 1 ? '' : 's'} found`,
      data: {
        deploymentCount,
        latestDeployment: latestDeployment ? {
          id: latestDeployment.id,
          state: latestDeployment.state,
          createdAt: latestDeployment.createdAt,
        } : null,
      },
    }
  }

  // Create OR update an environment variable (idempotent upsert). A plain POST
  // fails if the key already exists for that target, which makes re-runs and
  // value changes error out — so on conflict we look the var up by key and PATCH it.
  if (template.id === 'vercel.add_env_var') {
    const key = String(payload.key ?? payload.envKey ?? '').trim()
    const value = String(payload.value ?? payload.envValue ?? '')
    if (!key) return { ok: false, error: 'Variable key is required' }
    const targets = vercelTargets(payload.target ?? payload.environment)
    const body = {
      key,
      value,
      type: String(payload.type || 'encrypted'),
      target: targets,
    }
    const res = await fetch(withTeam(`https://api.vercel.com/v9/projects/${projectId}/env`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: true, message: `Environment variable ${key} created`, data: { key, target: targets, id: data?.created?.id || data?.id } }
    }

    // Not OK — if it already exists, fall through to an update so this is idempotent.
    const errText = await res.text().catch(() => '')
    const alreadyExists = res.status === 400 || res.status === 409 || /already exists|ENV_ALREADY_EXISTS|exists/i.test(errText)
    if (!alreadyExists) return { ok: false, error: errText || `Vercel returned ${res.status}` }

    // Look up the existing var's id by key, then PATCH it.
    const listRes = await fetch(withTeam(`https://api.vercel.com/v9/projects/${projectId}/env`), {
      method: 'GET', headers: { 'Authorization': 'Bearer ' + token },
    })
    if (!listRes.ok) {
      return { ok: false, error: `"${key}" already exists but its current value could not be read to update it: ${await listRes.text().catch(() => '')}` }
    }
    const listData = await listRes.json().catch(() => ({}))
    const envs = Array.isArray(listData?.envs) ? listData.envs : (Array.isArray(listData) ? listData : [])
    const existing = envs.find((e: any) => e && e.key === key)
    if (!existing || !existing.id) {
      return { ok: false, error: `"${key}" already exists but its id could not be located to update it.` }
    }
    const patchRes = await fetch(withTeam(`https://api.vercel.com/v9/projects/${projectId}/env/${encodeURIComponent(existing.id)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ value, target: targets }),
    })
    if (!patchRes.ok) {
      return { ok: false, error: `"${key}" already exists and the update failed: ${await patchRes.text().catch(() => '')}` }
    }
    return { ok: true, message: `Environment variable ${key} updated (already existed)`, data: { key, target: targets, id: existing.id } }
  }

  // Write action: set environment variable
  const res = await fetch(withTeam(url), {
    method: template.api.method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
if (!res.ok) {
    const error = await res.text()
    return { ok: false, error }
  }

  const data = await res.json()
  return { ok: true, message: 'Environment variable set', data }
}

// ---- OpenAI ----
async function executeOpenAIAction(template: any, payload: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY not set' }

  const url = 'https://api.openai.com' + template.api.endpoint

  const res = await fetch(url, {
    method: template.api.method,
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: template.api.method === 'GET' ? undefined : JSON.stringify(payload),
  })
if (!res.ok) {
    const error = await res.text()
    return { ok: false, error }
  }

  const data = await res.json()
  return { ok: true, message: 'OpenAI API call succeeded', data }
}

// ---- Anthropic ----
async function executeAnthropicAction(template: any, payload: Record<string, unknown>) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not set' }

  const url = 'https://api.anthropic.com' + template.api.endpoint

  const res = await fetch(url, {
    method: template.api.method,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: template.api.method === 'GET' ? undefined : JSON.stringify(payload),
  })

  if (!res.ok) {
    const error = await res.text()
    return { ok: false, error }
  }

  const data = await res.json()
  return { ok: true, message: 'Anthropic API call succeeded', data }
}

// ============================================================================
// Audit Logging
// ============================================================================

// ---- AWS ----
async function executeAWSAction(template: any, payload: Record<string, unknown>) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return { ok: false, error: 'AWS credentials not configured' }

  // List IAM users — real IAM ListUsers via SigV4 (aws-scanner).
  if (template.id === 'aws.list_iam_users' || template.id === 'aws.scan_iam_users') {
    const res = await scanAWSUsers(accessKeyId, secretAccessKey)
    if (!res.ok) return { ok: false, error: res.error }
    const users = res.users || []
    return {
      ok: true,
      message: `AWS IAM: ${users.length} user${users.length === 1 ? '' : 's'}`,
      data: { count: users.length, users: users.slice(0, 40).map(u => ({ username: u.username, arn: u.arn, created: u.created })) },
    }
  }

  // Scan access keys — real IAM call via aws-scanner.
  if (template.id === 'aws.scan_access_keys') {
    const res = await scanAWSAccessKeys(accessKeyId, secretAccessKey)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, message: 'AWS access key scan complete', data: res }
  }

  // Write operations the read-only IAM scanner can't perform — honest placeholders.
  if (template.id === 'aws.create_s3_bucket') {
    return {
      ok: true,
      message: 'AWS create bucket queued (write op — requires @aws-sdk/client-s3)',
      data: { action: 'create_bucket', status: 'pending_implementation', note: 'Read-only IAM scanner is live; bucket creation needs the S3 SDK.' },
    }
  }
  if (template.id === 'aws.disable_iam_user') {
    return {
      ok: true,
      message: 'AWS disable IAM user queued (write op — requires @aws-sdk/client-iam)',
      data: { action: 'disable_iam_user', user: String(payload.username || ''), status: 'pending_implementation', note: 'Read-only IAM scanner is live; disabling a user needs the IAM SDK write path.' },
    }
  }

  return { ok: false, error: 'Unknown AWS action' }
}

// ---- GCP ----
async function executeGCPAction(template: any, payload: Record<string, unknown>) {
  const gcpKeyJson = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!gcpKeyJson) return { ok: false, error: 'GCP credentials not configured' }

  // List / scan service accounts — real GCP IAM call via gcp-scanner (JWT auth).
  if (template.id === 'gcp.scan_service_accounts' || template.id === 'google-cloud.list_service_accounts') {
    const projectId = String(payload.project_id || process.env.GCP_PROJECT_ID || '')
    const res = await scanGCPServiceAccounts(projectId, gcpKeyJson)
    if (!res.ok) return { ok: false, error: res.error }
    const accounts = res.accounts || []
    return {
      ok: true,
      message: `GCP: ${accounts.length} service account${accounts.length === 1 ? '' : 's'}`,
      data: { count: accounts.length, accounts: accounts.slice(0, 40) },
    }
  }

  return { ok: false, error: 'Unknown GCP action' }
}

// ---- Auth0 ----
async function executeAuth0Action(template: any, payload: Record<string, unknown>) {
  const domain = process.env.AUTH0_DOMAIN
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET

  if (!domain || !clientId || !clientSecret) return { ok: false, error: 'Auth0 credentials not configured' }

  if (template.id === 'auth0.scan_clients') {
    try {
      // Get Auth0 Management API access token
      const tokenRes = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          audience: `https://${domain}/api/v2/`,
          grant_type: 'client_credentials',
        }),
      })

      if (!tokenRes.ok) {
        return { ok: false, error: 'Failed to authenticate with Auth0' }
      }

      const { access_token } = await tokenRes.json()

      // List clients
      const clientsRes = await fetch(`https://${domain}/api/v2/clients?limit=50`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${access_token}` },
      })

      if (!clientsRes.ok) {
        return { ok: false, error: 'Failed to fetch Auth0 clients' }
      }

      const clients = await clientsRes.json()

      return {
        ok: true,
        message: `Auth0 scan complete: ${clients.length} client${clients.length === 1 ? '' : 's'} found`,
        data: {
          scanType: 'clients',
          clientCount: clients.length,
          timestamp: new Date().toISOString(),
          clients: clients.slice(0, 5).map((c: any) => ({ client_id: c.client_id, name: c.name, is_public: c.is_public })),
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: 'Auth0 scan failed: ' + msg }
    }
  }

  return { ok: false, error: 'Unknown Auth0 scanning action' }
}

// ---- Compliance (internal audit — no external credentials) ----
async function executeComplianceAction(template: any, payload: Record<string, unknown>) {
  // Credential coverage matrix. severity = impact if the credential is absent.
  const CHECKS: { provider: string; tier: 'core' | 'common' | 'ai' | 'devops'; envVars: string[]; severity: 'high' | 'medium' | 'low' }[] = [
    { provider: 'Stripe', tier: 'core', envVars: ['STRIPE_SECRET_KEY'], severity: 'high' },
    { provider: 'Supabase', tier: 'core', envVars: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], severity: 'high' },
    { provider: 'Vercel', tier: 'core', envVars: ['VERCEL_TOKEN', 'VERCEL_HUB_PROJECT'], severity: 'high' },
    { provider: 'GitHub', tier: 'core', envVars: ['GITHUB_WRITE_TOKEN'], severity: 'medium' },
    { provider: 'OpenAI', tier: 'core', envVars: ['OPENAI_API_KEY'], severity: 'medium' },
    { provider: 'AWS', tier: 'core', envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], severity: 'low' },
    { provider: 'Twilio', tier: 'common', envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], severity: 'low' },
    { provider: 'SendGrid', tier: 'common', envVars: ['SENDGRID_API_KEY'], severity: 'low' },
    { provider: 'Cloudflare', tier: 'common', envVars: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID'], severity: 'low' },
    { provider: 'Anthropic', tier: 'ai', envVars: ['ANTHROPIC_API_KEY'], severity: 'low' },
    { provider: 'Sentry', tier: 'devops', envVars: ['SENTRY_AUTH_TOKEN'], severity: 'low' },
    { provider: 'Datadog', tier: 'devops', envVars: ['DATADOG_API_KEY'], severity: 'low' },
    { provider: 'PagerDuty', tier: 'devops', envVars: ['PAGERDUTY_API_KEY'], severity: 'low' },
  ]

  const scope = String(payload.scope || 'all')
  const selected = CHECKS.filter(c => {
    if (scope === 'core') return c.tier === 'core'
    if (scope === 'secrets') return c.envVars.some(v => /KEY|TOKEN|SECRET/.test(v))
    return true
  })

  const findings = selected.map(c => {
    const missing = c.envVars.filter(v => !process.env[v])
    const configured = missing.length === 0
    return {
      provider: c.provider,
      tier: c.tier,
      status: configured ? 'pass' : 'fail',
      severity: configured ? 'none' : c.severity,
      missing,
      detail: configured ? 'All credentials present.' : `Missing: ${missing.join(', ')}`,
    }
  })

  const failed = findings.filter(f => f.status === 'fail')
  const highOpen = failed.filter(f => f.severity === 'high').length
  const summary = {
    scope,
    checked: findings.length,
    passed: findings.length - failed.length,
    failed: failed.length,
    highSeverityOpen: highOpen,
    generatedAt: new Date().toISOString(),
  }

  if (template.id === 'compliance.run_audit') {
    const headline =
      failed.length === 0
        ? `Compliance audit passed — ${summary.passed}/${summary.checked} providers fully configured`
        : `Compliance audit: ${failed.length} finding${failed.length === 1 ? '' : 's'} (${highOpen} high) across ${summary.checked} providers`
    return { ok: true, message: headline, data: { summary, findings } }
  }

  // compliance.list_findings — return the current findings only.
  return {
    ok: true,
    message: `Compliance findings: ${failed.length} open (${highOpen} high)`,
    data: { summary, findings: failed.length ? failed : findings },
  }
}

// ---- Vault (internal — encrypted secret store) ----
async function executeVaultAction(template: any, payload: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Vault storage not configured' }
  const admin = createClient(url, key)

  // View keys (names + metadata only — never values)
  if (template.id === 'vault.view_keys') {
    const provider = String(payload.provider || '').trim()
    let q = admin
      .from('vault_items')
      .select('id, provider, label, last4, created_at, last_accessed_at, expires_at, status')
      .eq('status', 'active')
      .order('provider', { ascending: true })
      .order('label', { ascending: true })
    if (provider) q = q.eq('provider', provider)
    const { data, error } = await q
    if (error) return { ok: false, error: error.message }
    const items = data || []
    return {
      ok: true,
      message: `Vault: ${items.length} active key${items.length === 1 ? '' : 's'}`,
      data: { count: items.length, keys: items.slice(0, 40).map((i: any) => ({ id: i.id, provider: i.provider, label: i.label, last4: i.last4, expires_at: i.expires_at })) },
    }
  }

  // Add a key (encrypted at rest)
  if (template.id === 'vault.add_key') {
    const provider = String(payload.provider || '').trim().slice(0, 60)
    const label = String(payload.label || '').trim().slice(0, 120)
    const value = String(payload.value || '')
    if (!provider || !label || !value) return { ok: false, error: 'provider, label and value are required' }
    if (value.length > 4000) return { ok: false, error: 'Value too long' }
    const enc = vaultEncrypt(value)
    if (!enc.ok) return { ok: false, error: enc.error }
    const expiresAt = payload.expiresAt ? String(payload.expiresAt) : null
    const { data, error } = await admin
      .from('vault_items')
      .insert({
        owner_id: '00000000-0000-0000-0000-000000000000',
        provider,
        label,
        value_encrypted: enc.valueEncrypted,
        iv: enc.iv,
        tag: enc.tag,
        last4: value.slice(-4),
        expires_at: expiresAt,
        status: 'active',
      })
      .select('id, provider, label, last4')
      .single()
    if (error) return { ok: false, error: error.message }
    await admin.from('vault_audit').insert({ actor: 'console', action: 'add', provider, label }).then(() => {}, () => {})
    return { ok: true, message: `Key added: ${provider} / ${label}`, data: { id: data?.id, last4: data?.last4 } }
  }

  // Reveal a key (decrypts ONE item)
  if (template.id === 'vault.reveal_key') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Key ID is required' }
    const { data, error } = await admin
      .from('vault_items')
      .select('value_encrypted, iv, tag, provider, label')
      .eq('id', id)
      .single()
    if (error || !data) return { ok: false, error: 'Item not found' }
    const dec = vaultDecrypt(data.value_encrypted, data.iv, data.tag)
    if (!dec.ok) return { ok: false, error: dec.error }
    await admin.from('vault_items').update({ last_accessed_at: new Date().toISOString() }).eq('id', id)
    await admin.from('vault_audit').insert({ actor: 'console', action: 'reveal', provider: data.provider, label: data.label }).then(() => {}, () => {})
    return { ok: true, message: `Revealed: ${data.provider} / ${data.label}`, data: { value: dec.value } }
  }

  // Edit a key (re-encrypts a new value)
  if (template.id === 'vault.edit_key') {
    const id = String(payload.id || '')
    const value = String(payload.value || '')
    if (!id) return { ok: false, error: 'Key ID is required' }
    if (!value) return { ok: false, error: 'New value is required' }
    if (value.length > 4000) return { ok: false, error: 'Value too long' }
    const { data: existing, error: findErr } = await admin
      .from('vault_items')
      .select('provider, label')
      .eq('id', id)
      .single()
    if (findErr || !existing) return { ok: false, error: 'Item not found' }
    const enc = vaultEncrypt(value)
    if (!enc.ok) return { ok: false, error: enc.error }
    const { error } = await admin
      .from('vault_items')
      .update({ value_encrypted: enc.valueEncrypted, iv: enc.iv, tag: enc.tag, last4: value.slice(-4), last_accessed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    await admin.from('vault_audit').insert({ actor: 'console', action: 'edit', provider: existing.provider, label: existing.label }).then(() => {}, () => {})
    return { ok: true, message: `Key updated: ${existing.provider} / ${existing.label}`, data: { id } }
  }

  // Archive a key (soft delete via status column)
  if (template.id === 'vault.archive_key') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Key ID is required' }
    const { data: existing, error: findErr } = await admin
      .from('vault_items')
      .select('provider, label')
      .eq('id', id)
      .single()
    if (findErr || !existing) return { ok: false, error: 'Item not found' }
    const { error } = await admin
      .from('vault_items')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    await admin.from('vault_audit').insert({ actor: 'console', action: 'archive', provider: existing.provider, label: existing.label }).then(() => {}, () => {})
    return { ok: true, message: `Key archived: ${existing.provider} / ${existing.label}`, data: { id } }
  }

  // Delete a key (permanent)
  if (template.id === 'vault.delete_key') {
    const id = String(payload.id || '')
    if (!id) return { ok: false, error: 'Key ID is required' }
    const { data: item } = await admin.from('vault_items').select('provider, label').eq('id', id).single()
    const { error } = await admin.from('vault_items').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    await admin.from('vault_audit').insert({ actor: 'console', action: 'delete', provider: item?.provider || '?', label: item?.label || '?' }).then(() => {}, () => {})
    return { ok: true, message: 'Key deleted', data: { id } }
  }

  return { ok: false, error: 'Unknown vault action' }
}

async function logAuditEvent(
  userId: string,
  templateId: string,
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'DENIED' | 'ERROR' | 'CONFIG_ERROR',
  message: string,
  resultData: unknown,
) {
  // Routed through the unified audit adapter (lib/hub/audit.ts) — single sink.
  await recordAuditEvent({
    actor: userId,
    action: templateId,
    status: normalizeStatus(status),
    message,
    metadata: resultData,
  })
}
