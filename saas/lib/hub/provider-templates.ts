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

  // ---- Key Rotation (Write + Sync) ----------------------------------------
  {
    id: 'stripe.rotate_key',
    providerId: 'stripe',
    tier: 'core',
    label: 'Rotate API Key',
    description: 'Generate new Stripe API key, revoke old one, sync to Vercel.',
    icon: '🔄',
    policyActionId: 'rotate_credential',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/keys/rotate', docsUrl: 'https://docs.stripe.com/api/authentication' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'supabase.rotate_key',
    providerId: 'supabase',
    tier: 'core',
    label: 'Rotate Service Key',
    description: 'Generate new Supabase service key, revoke old one, sync to Vercel.',
    icon: '🔄',
    policyActionId: 'rotate_credential',
    api: { service: 'supabase', method: 'POST', endpoint: '/auth/v1/keys/rotate', docsUrl: 'https://supabase.com/docs/guides/auth' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: true,
auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'vercel.rotate_token',
    providerId: 'vercel',
    tier: 'core',
    label: 'Rotate Deploy Token',
    description: 'Generate new Vercel deployment token, revoke old one.',
    icon: '🔄',
    policyActionId: 'rotate_credential',
    api: { service: 'vercel', method: 'POST', endpoint: '/v9/tokens', docsUrl: 'https://vercel.com/docs/rest-api#endpoints/authentication-and-tokens' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'github.rotate_token',
    providerId: 'github',
    tier: 'common',
    label: 'Rotate Personal Access Token',
    description: 'Generate new GitHub PAT, revoke old one, sync to Vercel.',
    icon: '🔄',
    policyActionId: 'rotate_credential',
    api: { service: 'github', method: 'POST', endpoint: '/user/gpg_keys', docsUrl: 'https://docs.github.com/en/rest/users/gpg-keys' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 1: Azure ------------------------------------------------------
  {
    id: 'azure.list_resources',
    providerId: 'azure',
    tier: 'core',
    label: 'List Resource Groups',
    description: 'List Azure resource groups in the configured subscription.',
    icon: '☁️',
    policyActionId: 'read_provider_status',
    api: { service: 'azure', method: 'GET', endpoint: '/subscriptions/{subscriptionId}/resourcegroups?api-version=2021-04-01', docsUrl: 'https://learn.microsoft.com/en-us/rest/api/resources/resource-groups/list' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'azure.test_connection',
    providerId: 'azure',
    tier: 'core',
    label: 'Verify Connection',
    description: 'Test the Azure tenant connection and credentials.',
    icon: '✓',
    policyActionId: 'read_provider_status',
    api: { service: 'azure', method: 'GET', endpoint: '/subscriptions?api-version=2020-01-01', docsUrl: 'https://learn.microsoft.com/en-us/rest/api/resources/subscriptions/list' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 2: Firebase ---------------------------------------------------
  {
    id: 'firebase.list_users',
    providerId: 'firebase',
    tier: 'common',
    label: 'List Users',
    description: 'List Firebase Auth users (up to 1000 at a time).',
    icon: '🔥',
    policyActionId: 'read_provider_status',
    api: { service: 'firebase', method: 'GET', endpoint: '/v1/projects/{projectId}/accounts:batchGet', docsUrl: 'https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchGet' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'firebase.send_notification',
    providerId: 'firebase',
    tier: 'common',
    label: 'Send Push Notification',
    description: 'Send a Firebase Cloud Messaging push notification.',
    icon: '🔔',
    policyActionId: 'send_message',
    api: { service: 'firebase', method: 'POST', endpoint: '/v1/projects/{projectId}/messages:send', docsUrl: 'https://firebase.google.com/docs/cloud-messaging/send-message' },
    fields: [
      { id: 'token', label: 'Device token', type: 'text', required: true, placeholder: 'fcm-device-token' },
      { id: 'title', label: 'Title', type: 'text', required: true, maxLength: 100 },
      { id: 'body', label: 'Body', type: 'textarea', required: true, maxLength: 500 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },

  // ---- Tier 2: MongoDB ----------------------------------------------------
  {
    id: 'mongodb.list_databases',
    providerId: 'mongodb',
    tier: 'common',
    label: 'List Databases',
    description: 'List databases in your MongoDB Atlas cluster.',
    icon: '🍃',
    policyActionId: 'read_provider_status',
    api: { service: 'mongodb', method: 'GET', endpoint: '/api/atlas/v2/groups/{groupId}/databases', docsUrl: 'https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'mongodb.list_clusters',
    providerId: 'mongodb',
    tier: 'common',
    label: 'List Clusters',
    description: 'List MongoDB Atlas clusters in the project.',
    icon: '📊',
    policyActionId: 'read_provider_status',
    api: { service: 'mongodb', method: 'GET', endpoint: '/api/atlas/v2/groups/{groupId}/clusters', docsUrl: 'https://www.mongodb.com/docs/atlas/reference/api-resources-spec/v2/' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 2: DigitalOcean -----------------------------------------------
  {
    id: 'digitalocean.list_droplets',
    providerId: 'digitalocean',
    tier: 'common',
    label: 'List Droplets',
    description: 'List all Droplets in your DigitalOcean account.',
    icon: '🌊',
    policyActionId: 'read_provider_status',
    api: { service: 'digitalocean', method: 'GET', endpoint: '/v2/droplets', docsUrl: 'https://docs.digitalocean.com/reference/api/api-reference/#tag/Droplets' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'digitalocean.list_apps',
    providerId: 'digitalocean',
    tier: 'common',
    label: 'List Apps',
    description: 'List App Platform applications.',
    icon: '📱',
    policyActionId: 'read_provider_status',
    api: { service: 'digitalocean', method: 'GET', endpoint: '/v2/apps', docsUrl: 'https://docs.digitalocean.com/reference/api/api-reference/#tag/Apps' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 3: Hugging Face -----------------------------------------------
  {
    id: 'hugging-face.test_key',
    providerId: 'hugging-face',
    tier: 'ai',
    label: 'Verify API Token',
    description: 'Check the Hugging Face token is valid.',
    icon: '🤗',
    policyActionId: 'read_provider_status',
    api: { service: 'hugging-face', method: 'GET', endpoint: '/api/whoami-v2', docsUrl: 'https://huggingface.co/docs/hub/api' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'hugging-face.run_inference',
    providerId: 'hugging-face',
    tier: 'ai',
    label: 'Run Inference',
    description: 'Run inference on a Hugging Face hosted model.',
    icon: '🤖',
    policyActionId: 'invoke_model',
    api: { service: 'hugging-face', method: 'POST', endpoint: '/models/{model}', docsUrl: 'https://huggingface.co/docs/api-inference/' },
    fields: [
      { id: 'model', label: 'Model', type: 'text', required: true, placeholder: 'meta-llama/Llama-2-7b-chat-hf' },
      { id: 'inputs', label: 'Input', type: 'textarea', required: true, maxLength: 2000 },
    ],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 3: Stability AI -----------------------------------------------
  {
    id: 'stability-ai.list_engines',
    providerId: 'stability-ai',
    tier: 'ai',
    label: 'List Available Engines',
    description: 'List Stability AI image generation engines.',
    icon: '🎨',
    policyActionId: 'read_provider_status',
    api: { service: 'stability-ai', method: 'GET', endpoint: '/v1/engines/list', docsUrl: 'https://platform.stability.ai/docs/api-reference' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'stability-ai.generate_image',
    providerId: 'stability-ai',
    tier: 'ai',
    label: 'Generate Image',
    description: 'Generate an image from a text prompt.',
    icon: '🖼️',
    policyActionId: 'invoke_model',
    api: { service: 'stability-ai', method: 'POST', endpoint: '/v1/generation/{engine_id}/text-to-image', docsUrl: 'https://platform.stability.ai/docs/api-reference' },
    fields: [
      { id: 'engine_id', label: 'Engine', type: 'select', required: true, defaultValue: 'stable-diffusion-xl-1024-v1-0', options: [{ value: 'stable-diffusion-xl-1024-v1-0', label: 'SDXL 1.0' }, { value: 'stable-diffusion-v1-6', label: 'SD 1.6' }] },
      { id: 'prompt', label: 'Prompt', type: 'textarea', required: true, maxLength: 1000 },
    ],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 4: Docker Hub -------------------------------------------------
  {
    id: 'docker-hub.list_repos',
    providerId: 'docker-hub',
    tier: 'devops',
    label: 'List Repositories',
    description: 'List your Docker Hub repositories.',
    icon: '🐳',
    policyActionId: 'read_provider_status',
    api: { service: 'docker-hub', method: 'GET', endpoint: '/v2/repositories/{username}/', docsUrl: 'https://docs.docker.com/docker-hub/api/latest/' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 4: Terraform Cloud --------------------------------------------
  {
    id: 'terraform-cloud.list_workspaces',
    providerId: 'terraform-cloud',
    tier: 'devops',
    label: 'List Workspaces',
    description: 'List workspaces in your Terraform Cloud organization.',
    icon: '🏗️',
    policyActionId: 'read_provider_status',
    api: { service: 'terraform-cloud', method: 'GET', endpoint: '/api/v2/organizations/{organization}/workspaces', docsUrl: 'https://developer.hashicorp.com/terraform/cloud-docs/api-docs/workspaces' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'terraform-cloud.trigger_run',
    providerId: 'terraform-cloud',
    tier: 'devops',
    label: 'Trigger Plan Run',
    description: 'Trigger a Terraform plan run on a workspace.',
    icon: '▶️',
    policyActionId: 'invoke_action',
    api: { service: 'terraform-cloud', method: 'POST', endpoint: '/api/v2/runs', docsUrl: 'https://developer.hashicorp.com/terraform/cloud-docs/api-docs/run' },
    fields: [
      { id: 'workspace_id', label: 'Workspace ID', type: 'text', required: true, placeholder: 'ws-...' },
      { id: 'message', label: 'Message', type: 'text', required: false, maxLength: 200 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },

  // ---- Tier 5: Mixpanel ---------------------------------------------------
  {
    id: 'mixpanel.list_events',
    providerId: 'mixpanel',
    tier: 'marketing',
    label: 'List Top Events',
    description: 'Get the top tracked events from Mixpanel.',
    icon: '📊',
    policyActionId: 'read_provider_status',
    api: { service: 'mixpanel', method: 'GET', endpoint: '/api/2.0/events/names', docsUrl: 'https://developer.mixpanel.com/reference/overview' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'mixpanel.track_event',
    providerId: 'mixpanel',
    tier: 'marketing',
    label: 'Track Event',
    description: 'Send a tracking event to Mixpanel.',
    icon: '📝',
    policyActionId: 'send_data',
    api: { service: 'mixpanel', method: 'POST', endpoint: '/track', docsUrl: 'https://developer.mixpanel.com/reference/track-event' },
    fields: [
      { id: 'event', label: 'Event name', type: 'text', required: true, maxLength: 100 },
      { id: 'distinct_id', label: 'User ID', type: 'text', required: true, maxLength: 100 },
    ],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 5: Segment ----------------------------------------------------
  {
    id: 'segment.list_sources',
    providerId: 'segment',
    tier: 'marketing',
    label: 'List Sources',
    description: 'List your Segment data sources.',
    icon: '🔌',
    policyActionId: 'read_provider_status',
    api: { service: 'segment', method: 'GET', endpoint: '/v1beta/workspaces/{workspaceId}/sources', docsUrl: 'https://segment.com/docs/api/config-api/' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'segment.track_event',
    providerId: 'segment',
    tier: 'marketing',
    label: 'Track Event',
    description: 'Send a tracking event through Segment.',
    icon: '📝',
    policyActionId: 'send_data',
    api: { service: 'segment', method: 'POST', endpoint: '/v1/track', docsUrl: 'https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/' },
    fields: [
      { id: 'event', label: 'Event name', type: 'text', required: true, maxLength: 100 },
      { id: 'userId', label: 'User ID', type: 'text', required: true, maxLength: 100 },
    ],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 5: GA4 (Google Analytics) -------------------------------------
  {
    id: 'ga4.run_report',
    providerId: 'ga4',
    tier: 'marketing',
    label: 'Run Report',
    description: 'Run a GA4 analytics report (active users last 7 days).',
    icon: '📈',
    policyActionId: 'read_provider_status',
    api: { service: 'ga4', method: 'POST', endpoint: '/v1beta/properties/{propertyId}:runReport', docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'ga4.list_accounts',
    providerId: 'ga4',
    tier: 'marketing',
    label: 'List Accounts',
    description: 'List GA4 accounts visible to the configured user.',
    icon: '👤',
    policyActionId: 'read_provider_status',
    api: { service: 'ga4', method: 'GET', endpoint: '/v1beta/accountSummaries', docsUrl: 'https://developers.google.com/analytics/devguides/config/admin/v1' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },

  // ---- Tier 5: HubSpot ----------------------------------------------------
  {
    id: 'hubspot.list_contacts',
    providerId: 'hubspot',
    tier: 'marketing',
    label: 'List Contacts',
    description: 'List recent HubSpot contacts (last 100).',
    icon: '👥',
    policyActionId: 'read_provider_status',
    api: { service: 'hubspot', method: 'GET', endpoint: '/crm/v3/objects/contacts', docsUrl: 'https://developers.hubspot.com/docs/api/crm/contacts' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'hubspot.create_contact',
    providerId: 'hubspot',
    tier: 'marketing',
    label: 'Create Contact',
    description: 'Create a new contact in HubSpot CRM.',
    icon: '➕',
    policyActionId: 'create_record',
    api: { service: 'hubspot', method: 'POST', endpoint: '/crm/v3/objects/contacts', docsUrl: 'https://developers.hubspot.com/docs/api/crm/contacts' },
    fields: [
      { id: 'email', label: 'Email', type: 'email', required: true },
      { id: 'firstname', label: 'First name', type: 'text', required: false, maxLength: 100 },
      { id: 'lastname', label: 'Last name', type: 'text', required: false, maxLength: 100 },
      { id: 'company', label: 'Company', type: 'text', required: false, maxLength: 200 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },

  // ---- Tier 5: Intercom ---------------------------------------------------
  {
    id: 'intercom.list_conversations',
    providerId: 'intercom',
    tier: 'marketing',
    label: 'List Conversations',
    description: 'List recent Intercom conversations.',
    icon: '💬',
    policyActionId: 'read_provider_status',
    api: { service: 'intercom', method: 'GET', endpoint: '/conversations', docsUrl: 'https://developers.intercom.com/intercom-api-reference/reference/conversations' },
    fields: [],
    requiresAuth: true,
    requiresConfirm: false,
    auditAction: true,
    previewBeforeSubmit: false,
  },
  {
    id: 'intercom.send_message',
    providerId: 'intercom',
    tier: 'marketing',
    label: 'Send Message to User',
    description: 'Send an Intercom message to a known user.',
    icon: '✉️',
    policyActionId: 'send_message',
    api: { service: 'intercom', method: 'POST', endpoint: '/messages', docsUrl: 'https://developers.intercom.com/intercom-api-reference/reference/create-a-message' },
    fields: [
      { id: 'user_id', label: 'User ID', type: 'text', required: true, maxLength: 100 },
      { id: 'subject', label: 'Subject', type: 'text', required: true, maxLength: 200 },
      { id: 'body', label: 'Body', type: 'textarea', required: true, maxLength: 5000 },
    ],
    requiresAuth: true,
    requiresConfirm: true,
    auditAction: true,
    previewBeforeSubmit: true,
  },

  // ===========================================================================
  // CONSOLE REDESIGN — CRUD coverage for the tiered provider console.
  // Card sectioning + branding live in lib/hub/console-catalog.ts.
  // Endpoints are upstream paths; /api/hub/action owns base URLs + credentials.
  // ===========================================================================

  // ---- Stripe (Catalog + API Keys) --------------------------------------
  {
    id: 'stripe.create_price',
    providerId: 'stripe', tier: 'core',
    label: 'Create Price',
    description: 'Attach a new recurring or one-time price to an existing Stripe product.',
    icon: '🏷️', policyActionId: 'create_stripe_price',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/prices', docsUrl: 'https://docs.stripe.com/api/prices/create' },
    fields: [
      { id: 'product', label: 'Product ID', type: 'text', required: true, placeholder: 'prod_...', help: 'The Stripe product this price belongs to.' },
      { id: 'unit_amount', label: 'Price (USD)', type: 'currency_cents', required: true, min: 0, help: 'Entered in dollars, sent to Stripe in cents.' },
      { id: 'currency', label: 'Currency', type: 'select', required: true, defaultValue: 'usd', options: [{ value: 'usd', label: 'USD' }, { value: 'eur', label: 'EUR' }, { value: 'gbp', label: 'GBP' }, { value: 'mxn', label: 'MXN' }] },
      { id: 'interval', label: 'Billing interval', type: 'select', required: true, defaultValue: 'month', options: [{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }, { value: 'one_time', label: 'One-time' }] },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'stripe.view_products',
    providerId: 'stripe', tier: 'core',
    label: 'View Products',
    description: 'List live Stripe products and their identifiers.',
    icon: '📦', policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/products?limit=20', docsUrl: 'https://docs.stripe.com/api/products/list' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'stripe.delete_product',
    providerId: 'stripe', tier: 'core',
    label: 'Delete Product',
    description: 'Permanently delete a Stripe product. Only products with no active prices can be deleted.',
    icon: '🗑️', policyActionId: 'delete_stripe_product',
    api: { service: 'stripe', method: 'DELETE', endpoint: '/v1/products/{id}', docsUrl: 'https://docs.stripe.com/api/products/delete' },
    fields: [
      { id: 'id', label: 'Product ID', type: 'text', required: true, placeholder: 'prod_...' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'stripe.add_api_key',
    providerId: 'stripe', tier: 'core',
label: 'Add API Key',
    description: 'Create a new restricted Stripe API key for a scoped integration.',
    icon: '🔑', policyActionId: 'manage_stripe_keys',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/api_keys', docsUrl: 'https://docs.stripe.com/keys' },
    fields: [
      { id: 'name', label: 'Key name', type: 'text', required: true, maxLength: 120, placeholder: 'partner-readonly' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },

  // ---- Supabase (Users) -------------------------------------------------
  {
    id: 'supabase.view_users',
    providerId: 'supabase', tier: 'core',
    label: 'View Users',
    description: 'List Supabase Auth users with their confirmation status.',
    icon: '👥', policyActionId: 'read_provider_status',
    api: { service: 'supabase', method: 'GET', endpoint: '/auth/v1/admin/users?per_page=50', docsUrl: 'https://supabase.com/docs/reference/javascript/auth-admin-listusers' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'supabase.delete_user',
    providerId: 'supabase', tier: 'core',
    label: 'Delete User',
    description: 'Permanently delete a Supabase Auth user by ID.',
    icon: '🗑️', policyActionId: 'delete_supabase_user',
    api: { service: 'supabase', method: 'DELETE', endpoint: '/auth/v1/admin/users/{id}', docsUrl: 'https://supabase.com/docs/reference/javascript/auth-admin-deleteuser' },
    fields: [
      { id: 'user_id', label: 'User ID (UUID)', type: 'text', required: true, placeholder: '00000000-0000-...' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'supabase.reset_password',
    providerId: 'supabase', tier: 'core',
    label: 'Reset User Password',
    description: 'Send a Supabase password recovery email to a user.',
    icon: '🔁', policyActionId: 'reset_supabase_password',
    api: { service: 'supabase', method: 'POST', endpoint: '/auth/v1/recover', docsUrl: 'https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail' },
    fields: [
      { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'name@email.com' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },

  // ---- Vercel (Environment) — also surfaced under Supabase Project Settings
  {
    id: 'vercel.view_env',
    providerId: 'vercel', tier: 'core',
    label: 'View Env Variables',
    description: 'List project environment variable names and targets (values stay masked).',
    icon: '📋', policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/v9/projects/{projectId}/env', docsUrl: 'https://vercel.com/docs/rest-api/reference/endpoints/projects/retrieve-the-environment-variables-of-a-project-by-id-or-name' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'vercel.delete_env',
    providerId: 'vercel', tier: 'core',
    label: 'Delete Env Variable',
    description: 'Remove an environment variable from the project by its ID.',
    icon: '🗑️', policyActionId: 'delete_vercel_env',
    api: { service: 'vercel', method: 'DELETE', endpoint: '/v9/projects/{projectId}/env/{id}', docsUrl: 'https://vercel.com/docs/rest-api/reference/endpoints/projects/remove-an-environment-variable' },
    fields: [
      { id: 'id', label: 'Env Variable ID', type: 'text', required: true, placeholder: 'Use View Env Variables to find the ID' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },

  // ---- GitHub (Repository) ----------------------------------------------
  {
    id: 'github.view_repos',
    providerId: 'github', tier: 'core',
    label: 'View Repos',
    description: 'List repositories the connected token can access, most recently updated first.',
    icon: '📚', policyActionId: 'read_provider_status',
    api: { service: 'github', method: 'GET', endpoint: '/user/repos?per_page=20&sort=updated', docsUrl: 'https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },

  // ---- AWS (IAM) --------------------------------------------------------
  {
    id: 'aws.list_iam_users',
    providerId: 'aws', tier: 'core',
    label: 'List IAM Users',
    description: 'List AWS IAM users and the age of their access keys.',
    icon: '👤', policyActionId: 'read_provider_status',
    api: { service: 'aws', method: 'GET', endpoint: '/iam/users', docsUrl: 'https://docs.aws.amazon.com/IAM/latest/APIReference/API_ListUsers.html' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'aws.disable_iam_user',
    providerId: 'aws', tier: 'core',
    label: 'Disable IAM User',
    description: 'Deactivate an IAM user access keys to revoke programmatic access.',
    icon: '⛔', policyActionId: 'disable_aws_iam_user',
    api: { service: 'aws', method: 'POST', endpoint: '/iam/users/{user}/disable', docsUrl: 'https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAccessKey.html' },
    fields: [
      { id: 'user_name', label: 'IAM user name', type: 'text', required: true, placeholder: 'deploy-bot' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },

  // ---- Google Cloud (IAM) ----------------------------------------------
  {
    id: 'google-cloud.list_service_accounts',
    providerId: 'google-cloud', tier: 'core',
    label: 'List Service Accounts',
    description: 'Audit GCP service accounts and their key bindings.',
    icon: '🔍', policyActionId: 'read_provider_status',
    api: { service: 'gcp', method: 'GET', endpoint: '/v1/projects/{projectId}/serviceAccounts', docsUrl: 'https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/list' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },

  // ---- Twilio -----------------------------------------------------------
  {
    id: 'twilio.verify_number',
    providerId: 'twilio', tier: 'common',
    label: 'Verify Number',
    description: 'Start a phone verification via Twilio Verify.',
    icon: '✅', policyActionId: 'twilio_verify_number',
    api: { service: 'twilio', method: 'POST', endpoint: '/v2/Services/{ServiceSid}/Verifications', docsUrl: 'https://www.twilio.com/docs/verify/api/verification' },
    fields: [
      { id: 'to', label: 'Phone (E.164)', type: 'phone', required: true, placeholder: '+15551234567' },
      { id: 'channel', label: 'Channel', type: 'select', required: true, defaultValue: 'sms', options: [{ value: 'sms', label: 'SMS' }, { value: 'call', label: 'Voice call' }] },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },

  // ---- SendGrid ---------------------------------------------------------
  {
    id: 'sendgrid.check_domain',
    providerId: 'sendgrid', tier: 'common',
    label: 'Check Domain Auth',
    description: 'List authenticated sending domains and their DNS validation state.',
    icon: '🛡️', policyActionId: 'read_provider_status',
    api: { service: 'sendgrid', method: 'GET', endpoint: '/v3/whitelabel/domains', docsUrl: 'https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/list-all-authenticated-domains' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },

  // ---- Cloudflare (DNS) -------------------------------------------------
  {
    id: 'cloudflare.add_dns',
    providerId: 'cloudflare', tier: 'common',
    label: 'Add DNS Record',
    description: 'Create a DNS record in the configured Cloudflare zone.',
    icon: '🧭', policyActionId: 'cloudflare_add_dns',
    api: { service: 'cloudflare', method: 'POST', endpoint: '/client/v4/zones/{zoneId}/dns_records', docsUrl: 'https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/' },
    fields: [
      { id: 'type', label: 'Type', type: 'select', required: true, defaultValue: 'A', options: [{ value: 'A', label: 'A' }, { value: 'AAAA', label: 'AAAA' }, { value: 'CNAME', label: 'CNAME' }, { value: 'TXT', label: 'TXT' }] },
      { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'app.signalboostapp.com' },
      { id: 'content', label: 'Content', type: 'text', required: true, placeholder: '76.76.21.21' },
      { id: 'proxied', label: 'Proxy through Cloudflare', type: 'toggle', required: false, defaultValue: true },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'cloudflare.toggle_proxy',
    providerId: 'cloudflare', tier: 'common',
    label: 'Toggle Proxy',
    description: 'Turn Cloudflare proxy (orange cloud) on or off for an existing DNS record.',
    icon: '🔀', policyActionId: 'cloudflare_toggle_proxy',
    api: { service: 'cloudflare', method: 'PATCH', endpoint: '/client/v4/zones/{zoneId}/dns_records/{id}', docsUrl: 'https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/edit/' },
    fields: [
      { id: 'id', label: 'DNS Record ID', type: 'text', required: true, placeholder: 'Record ID from Cloudflare' },
      { id: 'proxied', label: 'Proxied', type: 'toggle', required: false, defaultValue: true },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },

  // ---- Firebase (Security Rules) ---------------------------------------
  {
    id: 'firebase.view_rules',
    providerId: 'firebase', tier: 'common',
    label: 'View Rules',
    description: 'Fetch the currently published Firestore / Storage security rules.',
    icon: '📜', policyActionId: 'read_provider_status',
    api: { service: 'firebase', method: 'GET', endpoint: '/v1/projects/{projectId}/rulesets', docsUrl: 'https://firebase.google.com/docs/rules/manage-deploy' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'firebase.upload_rules',
    providerId: 'firebase', tier: 'common',
    label: 'Upload Rules',
    description: 'Publish a new Firestore / Storage security ruleset.',
    icon: '⬆️', policyActionId: 'firebase_upload_rules',
    api: { service: 'firebase', method: 'POST', endpoint: '/v1/projects/{projectId}/rulesets', docsUrl: 'https://firebase.google.com/docs/rules/manage-deploy' },
    fields: [
      { id: 'source', label: 'Rules source', type: 'textarea', required: true, maxLength: 8000, placeholder: 'rules_version = "2"; service cloud.firestore { ... }' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },

  // ---- DigitalOcean (Compute) ------------------------------------------
  {
    id: 'digitalocean.create_droplet',
    providerId: 'digitalocean', tier: 'common',
    label: 'Create Droplet',
    description: 'Provision a new DigitalOcean Droplet.',
    icon: '🌊', policyActionId: 'create_droplet',
    api: { service: 'digitalocean', method: 'POST', endpoint: '/v2/droplets', docsUrl: 'https://docs.digitalocean.com/reference/api/api-reference/#operation/droplets_create' },
    fields: [
      { id: 'name', label: 'Droplet name', type: 'text', required: true, placeholder: 'web-01' },
      { id: 'region', label: 'Region', type: 'select', required: true, defaultValue: 'nyc3', options: [{ value: 'nyc3', label: 'New York 3' }, { value: 'sfo3', label: 'San Francisco 3' }, { value: 'ams3', label: 'Amsterdam 3' }] },
      { id: 'size', label: 'Size', type: 'select', required: true, defaultValue: 's-1vcpu-1gb', options: [{ value: 's-1vcpu-1gb', label: '1 vCPU / 1 GB' }, { value: 's-2vcpu-2gb', label: '2 vCPU / 2 GB' }] },
      { id: 'image', label: 'Image', type: 'text', required: true, defaultValue: 'ubuntu-24-04-x64', placeholder: 'ubuntu-24-04-x64' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },

  // ---- Datadog (Observability) -----------------------------------------
  {
    id: 'datadog.check_metrics',
    providerId: 'datadog', tier: 'devops',
    label: 'Check Metrics',
    description: 'Query a Datadog timeseries metric over the last hour.',
    icon: '📈', policyActionId: 'read_provider_status',
    api: { service: 'datadog', method: 'GET', endpoint: '/api/v1/query', docsUrl: 'https://docs.datadoghq.com/api/latest/metrics/' },
    fields: [
      { id: 'query', label: 'Metric query', type: 'text', required: true, defaultValue: 'avg:system.cpu.user{*}', placeholder: 'avg:system.cpu.user{*}' },
    ],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'datadog.create_monitor',
    providerId: 'datadog', tier: 'devops',
    label: 'Create Monitor',
    description: 'Create a Datadog metric alert monitor.',
    icon: '🚦', policyActionId: 'datadog_create_monitor',
    api: { service: 'datadog', method: 'POST', endpoint: '/api/v1/monitor', docsUrl: 'https://docs.datadoghq.com/api/latest/monitors/' },
    fields: [
      { id: 'name', label: 'Monitor name', type: 'text', required: true, maxLength: 120 },
      { id: 'query', label: 'Alert query', type: 'text', required: true, placeholder: 'avg(last_5m):avg:system.cpu.user{*} > 0.9' },
      { id: 'message', label: 'Notification message', type: 'textarea', required: false, maxLength: 1000 },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },

  // ---- Sentry (Issues) --------------------------------------------------
  {
    id: 'sentry.resolve_issue',
    providerId: 'sentry', tier: 'devops',
    label: 'Resolve Issue',
    description: 'Mark a Sentry issue as resolved by its ID.',
    icon: '✔️', policyActionId: 'sentry_resolve_issue',
    api: { service: 'sentry', method: 'PUT', endpoint: '/api/0/issues/{id}/', docsUrl: 'https://docs.sentry.io/api/events/update-an-issue/' },
    fields: [
      { id: 'id', label: 'Issue ID', type: 'text', required: true, placeholder: 'Issue ID from List Issues' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },

  // ---- PagerDuty (Incidents) -------------------------------------------
  {
    id: 'pagerduty.list_incidents',
    providerId: 'pagerduty', tier: 'devops',
    label: 'List Incidents',
    description: 'List currently triggered and acknowledged PagerDuty incidents.',
    icon: '📟', policyActionId: 'read_provider_status',
    api: { service: 'pagerduty', method: 'GET', endpoint: '/incidents?statuses[]=triggered&statuses[]=acknowledged', docsUrl: 'https://developer.pagerduty.com/api-reference/9d0b4b12e36f9-list-incidents' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'pagerduty.trigger_incident',
    providerId: 'pagerduty', tier: 'devops',
    label: 'Trigger Incident',
    description: 'Open a new PagerDuty incident on a service.',
    icon: '🚨', policyActionId: 'pagerduty_trigger_incident',
    api: { service: 'pagerduty', method: 'POST', endpoint: '/incidents', docsUrl: 'https://developer.pagerduty.com/api-reference/a7d81b0e9200f-create-an-incident' },
    fields: [
      { id: 'title', label: 'Incident title', type: 'text', required: true, maxLength: 200 },
      { id: 'service_id', label: 'Service ID', type: 'text', required: true, placeholder: 'PXXXXXX' },
      { id: 'urgency', label: 'Urgency', type: 'select', required: true, defaultValue: 'high', options: [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }] },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },

  // ---- Compliance (Audit) — internal, no external credentials ----------
  {
    id: 'compliance.run_audit',
    providerId: 'compliance', tier: 'devops',
    label: 'Run Audit',
    description: 'Scan provider credential coverage and configuration across the platform.',
    icon: '🛡️', policyActionId: 'compliance_run_audit',
    api: { service: 'compliance', method: 'POST', endpoint: '/internal/compliance/audit', docsUrl: '' },
    fields: [
      { id: 'scope', label: 'Scope', type: 'select', required: true, defaultValue: 'all', options: [{ value: 'all', label: 'All providers' }, { value: 'core', label: 'Core providers only' }, { value: 'secrets', label: 'Secrets & keys only' }] },
    ],
    requiresAuth: true, requiresConfirm: false, auditAction: true, previewBeforeSubmit: false,
  },
  {
    id: 'compliance.list_findings',
    providerId: 'compliance', tier: 'devops',
    label: 'List Findings',
    description: 'Show the latest compliance findings and their severity.',
    icon: '📋', policyActionId: 'read_provider_status',
    api: { service: 'compliance', method: 'GET', endpoint: '/internal/compliance/findings', docsUrl: '' },
    fields: [],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'stripe.edit_product',
    providerId: 'stripe', tier: 'core',
    label: 'Edit Product',
    description: 'Update a Stripe product name, description, or active state.',
    icon: '✏️', policyActionId: 'edit_stripe_product',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/products/{id}', docsUrl: 'https://docs.stripe.com/api/products/update' },
    fields: [
      { id: 'id', label: 'Product ID', type: 'text', required: true, placeholder: 'prod_...' },
      { id: 'name', label: 'New name', type: 'text', required: false, maxLength: 120 },
      { id: 'description', label: 'New description', type: 'textarea', required: false, maxLength: 400 },
      { id: 'active', label: 'Active', type: 'select', required: false, options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Archived (inactive)' }] },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'stripe.view_prices',
    providerId: 'stripe', tier: 'core',
    label: 'View Prices',
    description: 'List Stripe prices, optionally filtered by product.',
    icon: '🏷️', policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/prices?limit=20', docsUrl: 'https://docs.stripe.com/api/prices/list' },
    fields: [
      { id: 'product', label: 'Filter by product ID', type: 'text', required: false, placeholder: 'prod_... (optional)' },
    ],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'stripe.edit_price',
    providerId: 'stripe', tier: 'core',
    label: 'Edit Price',
    description: 'Update a price nickname or activate/deactivate it (amounts are immutable in Stripe).',
    icon: '✏️', policyActionId: 'edit_stripe_price',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/prices/{id}', docsUrl: 'https://docs.stripe.com/api/prices/update' },
    fields: [
      { id: 'id', label: 'Price ID', type: 'text', required: true, placeholder: 'price_...' },
      { id: 'nickname', label: 'Nickname', type: 'text', required: false, maxLength: 120 },
      { id: 'active', label: 'Active', type: 'select', required: false, options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'supabase.edit_user',
    providerId: 'supabase', tier: 'core',
    label: 'Edit User',
    description: 'Update a Supabase user — email, confirm status, or ban duration.',
    icon: '✏️', policyActionId: 'edit_supabase_user',
    api: { service: 'supabase', method: 'PUT', endpoint: '/auth/v1/admin/users/{id}', docsUrl: 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid' },
    fields: [
      { id: 'user_id', label: 'User ID', type: 'text', required: true, placeholder: 'User UUID from View Users' },
      { id: 'email', label: 'New email', type: 'email', required: false },
      { id: 'email_confirm', label: 'Confirm email', type: 'select', required: false, options: [{ value: 'true', label: 'Mark confirmed' }, { value: 'false', label: 'Mark unconfirmed' }] },
      { id: 'ban_duration', label: 'Ban duration', type: 'text', required: false, placeholder: 'e.g. 24h or none' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'supabase.sql_editor',
    providerId: 'supabase', tier: 'core',
    label: 'SQL Editor',
    description: 'Run a SQL query against the database via the gated hub_exec_sql function.',
    icon: '🧮', policyActionId: 'run_sql_query',
    api: { service: 'supabase', method: 'POST', endpoint: '/rest/v1/rpc/hub_exec_sql', docsUrl: '' },
    fields: [
      { id: 'query', label: 'SQL query', type: 'textarea', required: true, maxLength: 4000, placeholder: 'select id, email from auth.users limit 10' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'vercel.edit_env',
    providerId: 'vercel', tier: 'core',
    label: 'Edit Env Var',
    description: 'Update a Vercel environment variable value or target.',
    icon: '✏️', policyActionId: 'edit_vercel_env',
    api: { service: 'vercel', method: 'PATCH', endpoint: '/v9/projects/{projectId}/env/{id}', docsUrl: 'https://vercel.com/docs/rest-api/endpoints/env' },
    fields: [
      { id: 'id', label: 'Env Variable ID', type: 'text', required: true, placeholder: 'ID from View Env Vars' },
      { id: 'value', label: 'New value', type: 'secret', required: false, masked: true },
      { id: 'target', label: 'Target', type: 'select', required: false, options: [{ value: 'production', label: 'Production' }, { value: 'preview', label: 'Preview' }, { value: 'development', label: 'Development' }] },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
  },
  {
    id: 'vault.view_keys',
    providerId: 'vault', tier: 'core',
    label: 'View Keys',
    description: 'List stored vault keys with provider, label, and last 4 — never the secret value.',
    icon: '🗝️', policyActionId: 'read_provider_status',
    api: { service: 'vault', method: 'GET', endpoint: '/internal/vault/keys', docsUrl: '' },
    fields: [
      { id: 'provider', label: 'Filter by provider', type: 'text', required: false, placeholder: 'Stripe (optional)' },
    ],
    requiresAuth: true, requiresConfirm: false, auditAction: false, previewBeforeSubmit: false,
  },
  {
    id: 'vault.add_key',
    providerId: 'vault', tier: 'core',
    label: 'Add Key',
    description: 'Store a new secret in the vault, encrypted at rest (AES-256-GCM).',
    icon: '➕', policyActionId: 'vault_add_key',
    api: { service: 'vault', method: 'POST', endpoint: '/internal/vault/keys', docsUrl: '' },
    fields: [
      { id: 'provider', label: 'Provider', type: 'text', required: true, maxLength: 60, placeholder: 'Stripe' },
      { id: 'label', label: 'Label', type: 'text', required: true, maxLength: 120, placeholder: 'Production secret key' },
      { id: 'value', label: 'Secret value', type: 'secret', required: true, masked: true, placeholder: 'sk_live_...' },
      { id: 'expiresAt', label: 'Expires (optional)', type: 'text', required: false, placeholder: 'YYYY-MM-DD' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },
  {
    id: 'vault.reveal_key',
    providerId: 'vault', tier: 'core',
    label: 'Reveal Key',
    description: 'Decrypt and reveal a single secret value. Audited.',
    icon: '👁️', policyActionId: 'vault_reveal_key',
    api: { service: 'vault', method: 'POST', endpoint: '/internal/vault/reveal', docsUrl: '' },
    fields: [
      { id: 'id', label: 'Key ID', type: 'text', required: true, placeholder: 'Key UUID from View Keys' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },
  {
    id: 'vault.edit_key',
    providerId: 'vault', tier: 'core',
    label: 'Edit Key',
    description: 'Replace a stored secret with a new value. Re-encrypts at rest.',
    icon: '✏️', policyActionId: 'vault_edit_key',
    api: { service: 'vault', method: 'PATCH', endpoint: '/internal/vault/keys', docsUrl: '' },
    fields: [
      { id: 'id', label: 'Key ID', type: 'text', required: true, placeholder: 'Key UUID from View Keys' },
      { id: 'value', label: 'New secret value', type: 'secret', required: true, masked: true, placeholder: 'sk_live_...' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },
  {
    id: 'vault.archive_key',
    providerId: 'vault', tier: 'core',
    label: 'Archive Key',
    description: 'Soft-delete a key — hidden from the active list but recoverable.',
    icon: '🗄️', policyActionId: 'vault_archive_key',
    api: { service: 'vault', method: 'PATCH', endpoint: '/internal/vault/archive', docsUrl: '' },
    fields: [
      { id: 'id', label: 'Key ID', type: 'text', required: true, placeholder: 'Key UUID from View Keys' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: false,
  },
  {
    id: 'vault.delete_key',
    providerId: 'vault', tier: 'core',
    label: 'Delete Key',
    description: 'Permanently delete a key from the vault. This cannot be undone.',
    icon: '🗑️', policyActionId: 'vault_delete_key',
    api: { service: 'vault', method: 'DELETE', endpoint: '/internal/vault/keys', docsUrl: '' },
    fields: [
      { id: 'id', label: 'Key ID', type: 'text', required: true, placeholder: 'Key UUID from View Keys' },
    ],
    requiresAuth: true, requiresConfirm: true, auditAction: true, previewBeforeSubmit: true,
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
