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
