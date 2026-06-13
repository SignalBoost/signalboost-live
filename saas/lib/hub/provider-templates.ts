// saas/lib/hub/provider-templates.ts
// Hub Console — Universal Provider Template Schema
//
// Purpose:
// - Define the "most-needed action" forms for each Business Operating Partner.
// - Map every form field to a real provider API endpoint + HTTP method.
// - Stay declarative: this file renders nothing and calls nothing. It is the
//   single source of truth that the form renderer and the action route read.
//
// Relationship to the rest of the Hub:
// - provider-registry.ts  -> WHERE a provider sits (tier, category, status, keys).
// - action-policy.ts      -> HOW DANGEROUS an action is (risk, approval, audit).
// - provider-templates.ts -> WHAT the operator fills in + WHERE it is sent.
//
// Safety contract:
// - Every template carries `policyActionId`. The action route resolves it through
//   getHubActionPolicy(). Any template whose policy is unknown is auto-BLOCKED by
//   the existing fallback in action-policy.ts — fail-closed by design.
// - This file never stores secrets and never holds endpoint credentials. Secrets
//   are injected server-side from the environment at execution time.

import type { HubProviderTierId } from './provider-registry'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency_cents'
  | 'email'
  | 'phone'
  | 'select'
  | 'toggle'
  | 'secret'

export type ProviderFormField = {
  id: string
  label: string
  type: FieldType
  required: boolean
  placeholder?: string
  help?: string
  // For `select`: the allowed choices.
  options?: { value: string; label: string }[]
  // For `text`/`textarea`/`number`: soft validation hints used by the renderer.
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  // For `secret`: the value is masked in the UI and never echoed back in audit logs.
  masked?: boolean
  // Default value shown when the form opens.
  defaultValue?: string | number | boolean
}

export type ProviderHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ProviderActionTemplate = {
  // Stable id used in URLs, audit records, and the action route switch.
  id: string
  providerId: string
  tier: HubProviderTierId
  // Operator-facing copy.
  label: string
  description: string
  icon: string
  // Links into action-policy.ts. Unknown ids resolve to a BLOCKED policy.
  policyActionId: string
  // Real provider API target. `endpoint` is the upstream path; the Hub action
  // route is the only place that attaches credentials and a base URL.
  api: {
    service: string
    method: ProviderHttpMethod
    endpoint: string
    docsUrl: string
  }
  // The form the operator fills in.
  fields: ProviderFormField[]
  // Runtime gates enforced by the action route, not by this file.
  requiresAuth: boolean
  requiresConfirm: boolean
  auditAction: boolean
  // When true the renderer shows a read-only "preview payload" step before submit.
  previewBeforeSubmit: boolean
}

// ---------------------------------------------------------------------------
// Templates — one or two essential actions per provider, mission-scoped.
// Endpoints are the canonical upstream API paths; the Hub action route owns
// base URLs, auth headers, and credential injection.
// ---------------------------------------------------------------------------

export const PROVIDER_TEMPLATES: ProviderActionTemplate[] = [
  // ---- Tier 1 / Core -----------------------------------------------------
  {
    id: 'stripe.create_product',
    providerId: 'stripe',
    tier: 'core',
    label: 'Create Product',
    description: 'Create a new Stripe product and its first recurring price.',
    icon: '💳',
    policyActionId: 'create_stripe_price',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/products', docsUrl: 'https://docs.stripe.com/api/products/create' },
    fields: [
      { id: 'name', label: 'Product name', type: 'text', required: true, maxLength: 120, placeholder: 'SignalBoost Growth' },
      { id: 'description', label: 'Description', type: 'textarea', required: false, maxLength: 400 },
      { id: 'unit_amount', label: 'Price (USD)', type: 'currency_cents', required: true, min: 0, help: 'Entered in dollars, sent to Stripe in cents.' },
      { id: 'interval', label: 'Billing interval', type: 'select', required: true, defaultValue: 'month', options: [{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }, { value: 'one_time', label: 'One-time' }] },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },
  {
    id: 'supabase.invite_user',
    providerId: 'supabase',
    tier: 'core',
    label: 'Invite User',
    description: 'Send a Supabase Auth invite to a new platform user.',
    icon: '🗄️',
    policyActionId: 'invite_supabase_user',
    api: { service: 'supabase', method: 'POST', endpoint: '/auth/v1/invite', docsUrl: 'https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail' },
    fields: [
      { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'name@email.com' },
      { id: 'redirect_to', label: 'Redirect URL', type: 'text', required: false, placeholder: 'https://saas.signalboostapp.com/auth/callback' },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'vercel.set_env',
    providerId: 'vercel',
    tier: 'core',
    label: 'Set Environment Variable',
    description: 'Add or update a project environment variable on Preview only.',
    icon: '▲',
    policyActionId: 'update_preview_environment',
    api: { service: 'vercel', method: 'POST', endpoint: '/v10/projects/{projectId}/env', docsUrl: 'https://vercel.com/docs/rest-api/reference/endpoints/projects/create-one-or-more-environment-variables' },
    fields: [
      { id: 'key', label: 'Variable name', type: 'text', required: true, placeholder: 'NEW_PROVIDER_TOKEN', maxLength: 100 },
      { id: 'value', label: 'Value', type: 'secret', required: true, masked: true },
      { id: 'target', label: 'Target', type: 'select', required: true, defaultValue: 'preview', options: [{ value: 'preview', label: 'Preview' }, { value: 'development', label: 'Development' }] },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },
  {
    id: 'github.open_issue',
    providerId: 'github',
    tier: 'core',
    label: 'Open Issue',
    description: 'Open a tracking issue on the live repository.',
    icon: '🐙',
    policyActionId: 'prepare_recommended_fix',
    api: { service: 'github', method: 'POST', endpoint: '/repos/{owner}/{repo}/issues', docsUrl: 'https://docs.github.com/en/rest/issues/issues#create-an-issue' },
    fields: [
      { id: 'title', label: 'Title', type: 'text', required: true, maxLength: 140 },
      { id: 'body', label: 'Description', type: 'textarea', required: false, maxLength: 2000 },
    ],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'aws.create_bucket',
    providerId: 'aws',
    tier: 'core',
    label: 'Create S3 Bucket',
    description: 'Create a new private S3 bucket in the selected region.',
    icon: '☁️',
    policyActionId: 'create_aws_bucket',
    api: { service: 'aws-s3', method: 'PUT', endpoint: '/{bucket}', docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html' },
    fields: [
      { id: 'bucket', label: 'Bucket name', type: 'text', required: true, minLength: 3, maxLength: 63, help: 'Lowercase, globally unique, no spaces.' },
      { id: 'region', label: 'Region', type: 'select', required: true, defaultValue: 'us-east-1', options: [{ value: 'us-east-1', label: 'us-east-1' }, { value: 'us-west-2', label: 'us-west-2' }, { value: 'eu-west-1', label: 'eu-west-1' }] },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },
  {
    id: 'openai.test_key',
    providerId: 'openai',
    tier: 'core',
    label: 'Verify API Key',
    description: 'List available models to confirm the OpenAI key is valid.',
    icon: '🤖',
    policyActionId: 'read_provider_status',
    api: { service: 'openai', method: 'GET', endpoint: '/v1/models', docsUrl: 'https://platform.openai.com/docs/api-reference/models/list' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 2 / Common ---------------------------------------------------
  {
    id: 'twilio.send_sms',
    providerId: 'twilio',
    tier: 'common',
    label: 'Send SMS',
    description: 'Send a one-off SMS from the configured Twilio number.',
    icon: '📱',
    policyActionId: 'send_twilio_sms',
    api: { service: 'twilio', method: 'POST', endpoint: '/2010-04-01/Accounts/{AccountSid}/Messages.json', docsUrl: 'https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource' },
    fields: [
      { id: 'to', label: 'To (E.164)', type: 'phone', required: true, placeholder: '+15551234567' },
      { id: 'body', label: 'Message', type: 'textarea', required: true, maxLength: 1600 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },
  {
    id: 'sendgrid.send_email',
    providerId: 'sendgrid',
    tier: 'common',
    label: 'Send Email',
    description: 'Send a transactional email through SendGrid.',
    icon: '✉️',
    policyActionId: 'send_sendgrid_email',
    api: { service: 'sendgrid', method: 'POST', endpoint: '/v3/mail/send', docsUrl: 'https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send' },
    fields: [
      { id: 'to', label: 'To', type: 'email', required: true },
      { id: 'subject', label: 'Subject', type: 'text', required: true, maxLength: 200 },
      { id: 'content', label: 'Body', type: 'textarea', required: true, maxLength: 5000 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },
  {
    id: 'cloudflare.purge_cache',
    providerId: 'cloudflare',
    tier: 'common',
    label: 'Purge Cache',
    description: 'Purge the edge cache for the configured zone.',
    icon: '🌐',
    policyActionId: 'cloudflare_purge_cache',
    api: { service: 'cloudflare', method: 'POST', endpoint: '/client/v4/zones/{zoneId}/purge_cache', docsUrl: 'https://developers.cloudflare.com/api/resources/cache/methods/purge/' },
    fields: [
      { id: 'purge_everything', label: 'Purge everything', type: 'toggle', required: true, defaultValue: false },
      { id: 'files', label: 'Specific URLs (one per line)', type: 'textarea', required: false, help: 'Ignored when "Purge everything" is on.' },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },
  {
    id: 'auth0.list_clients',
    providerId: 'auth0',
    tier: 'common',
    label: 'Audit Clients',
    description: 'List Auth0 application clients to review old or unused secrets.',
    icon: '🔑',
    policyActionId: 'read_provider_status',
    api: { service: 'auth0', method: 'GET', endpoint: '/api/v2/clients', docsUrl: 'https://auth0.com/docs/api/management/v2/clients/get-clients' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 3 / AI -------------------------------------------------------
  {
    id: 'anthropic.test_key',
    providerId: 'anthropic',
    tier: 'ai',
    label: 'Verify API Key',
    description: 'List available models to confirm the Anthropic key is valid.',
    icon: '🧠',
    policyActionId: 'read_provider_status',
    api: { service: 'anthropic', method: 'GET', endpoint: '/v1/models', docsUrl: 'https://docs.claude.com/en/api/models-list' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'replicate.run_model',
    providerId: 'replicate',
    tier: 'ai',
    label: 'Run Prediction',
    description: 'Create a prediction against a Replicate model version.',
    icon: '🔁',
    policyActionId: 'replicate_run_model',
    api: { service: 'replicate', method: 'POST', endpoint: '/v1/predictions', docsUrl: 'https://replicate.com/docs/reference/http#predictions.create' },
    fields: [
      { id: 'version', label: 'Model version', type: 'text', required: true, placeholder: 'owner/model:hash' },
      { id: 'prompt', label: 'Prompt', type: 'textarea', required: true, maxLength: 2000 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },

  // ---- Tier 4 / DevOps & Infra ------------------------------------------
  {
    id: 'sentry.list_issues',
    providerId: 'sentry',
    tier: 'devops',
    label: 'List Open Issues',
    description: 'List unresolved Sentry issues for the configured project.',
    icon: '🛑',
    policyActionId: 'read_provider_status',
    api: { service: 'sentry', method: 'GET', endpoint: '/api/0/projects/{org}/{project}/issues/', docsUrl: 'https://docs.sentry.io/api/events/list-a-projects-issues/' },
    fields: [
      { id: 'query', label: 'Filter', type: 'text', required: false, defaultValue: 'is:unresolved' },
    ],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'datadog.read_health',
    providerId: 'datadog',
    tier: 'devops',
    label: 'Read Monitor Health',
    description: 'List Datadog monitors and their current alert state.',
    icon: '📈',
    policyActionId: 'read_provider_status',
    api: { service: 'datadog', method: 'GET', endpoint: '/api/v1/monitor', docsUrl: 'https://docs.datadoghq.com/api/latest/monitors/#get-all-monitor-details' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'pagerduty.list_oncall',
    providerId: 'pagerduty',
    tier: 'devops',
    label: 'Who Is On-Call',
    description: 'List the current on-call responders across escalation policies.',
    icon: '🚨',
    policyActionId: 'read_provider_status',
    api: { service: 'pagerduty', method: 'GET', endpoint: '/oncalls', docsUrl: 'https://developer.pagerduty.com/api-reference/3a6b910f11050-list-all-of-the-on-calls' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Health Checks (Read-Only Status) ------------------------------------
  {
    id: 'stripe.read_health',
    providerId: 'stripe',
    tier: 'core',
    label: 'Read Stripe Health',
    description: 'Fetch live products, subscriptions, webhook status, and recent payments.',
    icon: '💳',
    policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/products?limit=50', docsUrl: 'https://docs.stripe.com/api/products/list' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
  {
    id: 'supabase.read_health',
    providerId: 'supabase',
    tier: 'core',
    label: 'Read Supabase Health',
    description: 'Fetch database health, user count, storage usage, and API status.',
    icon: '🗄️',
    policyActionId: 'read_provider_status',
    api: { service: 'supabase', method: 'GET', endpoint: '/v1/projects/{projectId}/health', docsUrl: 'https://supabase.com/docs/reference/cli/supabase-status' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
  {
    id: 'vercel.read_health',
    providerId: 'vercel',
    tier: 'core',
    label: 'Read Vercel Health',
    description: 'Fetch deployment history, domain status, and environment variable coverage.',
    icon: '▲',
    policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/v6/deployments?limit=20', docsUrl: 'https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },

  // ---- User Config Scanning (Security Audits) ---------------------------
  {
    id: 'aws.scan_iam_users',
    providerId: 'aws-s3',
    tier: 'devops',
    label: 'Scan IAM Users & Roles',
    description: 'Audit all IAM users, roles, attached policies, and potential exposure risks.',
    icon: '🔍',
    policyActionId: 'read_provider_status',
    api: { service: 'aws', method: 'GET', endpoint: '/iam/users', docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users.html' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
  {
    id: 'aws.scan_access_keys',
    providerId: 'aws-s3',
    tier: 'devops',
    label: 'Scan Access Keys',
    description: 'Find old, inactive, or publicly exposed AWS access keys.',
    icon: '🔑',
    policyActionId: 'read_provider_status',
    api: { service: 'aws', method: 'GET', endpoint: '/iam/access-keys', docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
  {
    id: 'gcp.scan_service_accounts',
    providerId: 'gcp',
    tier: 'devops',
    label: 'Scan Service Accounts',
    description: 'Audit GCP service accounts, API keys, and IAM role bindings.',
    icon: '🔍',
    policyActionId: 'read_provider_status',
    api: { service: 'gcp', method: 'GET', endpoint: '/serviceAccounts', docsUrl: 'https://cloud.google.com/iam/docs/service-accounts' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
  {
    id: 'auth0.scan_clients',
    providerId: 'auth0',
    tier: 'common',
    label: 'Scan Applications & Clients',
    description: 'Audit Auth0 applications, OAuth clients, and security settings.',
    icon: '🔍',
    policyActionId: 'read_provider_status',
    api: { service: 'auth0', method: 'GET', endpoint: '/api/v2/clients', docsUrl: 'https://auth0.com/docs/get-started/applications' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
  {
    id: 'supabase.scan_users',
    providerId: 'supabase',
    tier: 'core',
    label: 'Scan Users & Roles',
    description: 'Audit Supabase users, roles, RLS policies, and service keys.',
    icon: '🔍',
    policyActionId: 'read_provider_status',
    api: { service: 'supabase', method: 'GET', endpoint: '/auth/v1/admin/users', docsUrl: 'https://supabase.com/docs/guides/auth/admin-management' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: false,
    previewBeforeSubmit: false,
  },
]

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getProviderTemplates(providerId: string): ProviderActionTemplate[] {
  return PROVIDER_TEMPLATES.filter(template => template.providerId === providerId)
}

export function getTemplate(templateId: string): ProviderActionTemplate | undefined {
  return PROVIDER_TEMPLATES.find(template => template.id === templateId)
}

export function getTemplatesByTier(tier: HubProviderTierId): ProviderActionTemplate[] {
  return PROVIDER_TEMPLATES.filter(template => template.tier === tier)
}

export function getWriteTemplates(): ProviderActionTemplate[] {
  return PROVIDER_TEMPLATES.filter(template => template.api.method !== 'GET')
}

export function getReadOnlyTemplates(): ProviderActionTemplate[] {
  return PROVIDER_TEMPLATES.filter(template => template.api.method === 'GET')
}

// Validate a submitted form against its template. Flat { ok, error? } result
// style per repo convention — no thrown errors, no union narrowing.
export function validateTemplatePayload(
  templateId: string,
  payload: Record<string, unknown>,
): { ok: boolean; error?: string; missing?: string[] } {
  const template = getTemplate(templateId)
  if (!template) return { ok: false, error: 'Unknown template: ' + templateId }
  const missing: string[] = []
  for (const field of template.fields) {
    if (!field.required) continue
    const value = payload[field.id]
    if (value === undefined || value === null || value === '') missing.push(field.id)
  }
  if (missing.length > 0) return { ok: false, error: 'Missing required fields', missing }
  return { ok: true }
}
