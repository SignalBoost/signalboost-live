// saas/lib/hub/action-policy.ts
// Hub Console Action Policy Layer
//
// Purpose:
// - Classify provider actions before automation is added.
// - Keep read-only monitoring automatic.
// - Require explicit human approval for sensitive writes, secrets, billing,
//   production changes, destructive operations, and role changes.
//
// This file does not execute provider actions. It is a safety contract used by
// future Hub automation flows.

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
}

export function getHubActionPolicy(actionId: string): HubActionPolicy {
  return HUB_ACTION_POLICIES[actionId] || {
    id: actionId,
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

export function canRunWithoutApproval(actionId: string): boolean {
  const policy = getHubActionPolicy(actionId)
  return policy.approval === 'none' && policy.risk === 'low'
}

export function requiresOwnerApproval(actionId: string): boolean {
  const policy = getHubActionPolicy(actionId)
  return policy.approval === 'owner' || policy.approval === 'owner_with_audit'
}

export function isActionBlocked(actionId: string): boolean {
  return getHubActionPolicy(actionId).approval === 'blocked'
}
