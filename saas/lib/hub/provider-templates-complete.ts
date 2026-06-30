// saas/lib/hub/provider-templates-complete.ts
// Complete action templates for every hub provider — fills all gaps identified
// in the June 2026 audit. Covers setup, maintenance, and operational tasks for
// every Tier 1-3 provider. All write actions are policy-gated.

import type { ProviderTemplate } from './provider-templates'

export const COMPLETE_TEMPLATES: Record<string, ProviderTemplate> = {


  // ═══════════════════════════════════════════════════════════════════════════
  // NAMECHEAP — DNS records + one-click Resend DNS setup
  // ═══════════════════════════════════════════════════════════════════════════
  'namecheap.list_dns_records': {
    id: 'namecheap.list_dns_records', label: 'List DNS Records', icon: '🌐',
    description: '⚠️ BLOCKED: Namecheap requires a static whitelisted IP, but Vercel rotates outbound IPs per request — every call fails with "Invalid request IP". Use Vercel → DNS Records instead.',
    policyActionId: 'read_provider_status',
    api: { service: 'namecheap', method: 'GET', endpoint: '/domains/dns/hosts' },
    fields: [{ id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'example.com' }],
  },
  'namecheap.add_dns_record': {
    id: 'namecheap.add_dns_record', label: 'Add DNS Record', icon: '➕',
    description: 'Add a DNS host record in Namecheap while preserving existing records.',
    policyActionId: 'crud_actions',
    api: { service: 'namecheap', method: 'POST', endpoint: '/domains/dns/hosts' },
    fields: [
      { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'example.com' },
      { id: 'type', label: 'Type', type: 'select', required: true, options: [
        { value: 'A', label: 'A' }, { value: 'AAAA', label: 'AAAA' }, { value: 'CNAME', label: 'CNAME' }, { value: 'MX', label: 'MX' }, { value: 'TXT', label: 'TXT' },
      ] },
      { id: 'host', label: 'Host', type: 'text', required: true, placeholder: '@' },
      { id: 'value', label: 'Value', type: 'text', required: true },
      { id: 'ttl', label: 'TTL', type: 'number', placeholder: '1800' },
      { id: 'mxPref', label: 'MX preference', type: 'number' },
    ],
  },
  'namecheap.delete_dns_record': {
    id: 'namecheap.delete_dns_record', label: 'Delete DNS Record', icon: '🗑️',
    description: '⚠️ BLOCKED: same static-IP limitation as the other Namecheap DNS actions — see List DNS Records for details. Use Vercel → DNS Records instead.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'namecheap', method: 'DELETE', endpoint: '/domains/dns/hosts/{hostId}' },
    fields: [
      { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'example.com' },
      { id: 'hostId', label: 'Host ID', type: 'text', required: true },
    ],
  },
  'namecheap.setup_resend_dns': {
    id: 'namecheap.setup_resend_dns', label: 'Set Up Resend DNS', icon: '⚡',
    description: 'Paste Resend domain DNS records and add them to Namecheap in one click.',
    policyActionId: 'crud_actions',
    api: { service: 'namecheap', method: 'POST', endpoint: '/domains/dns/resend' },
    fields: [
      { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'example.com' },
      { id: 'records', label: 'Resend DNS records JSON', type: 'textarea', required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RESEND — get domain DNS records (per-record status)
  // ═══════════════════════════════════════════════════════════════════════════
  'resend.get_domain': {
    id: 'resend.get_domain', label: 'Domain DNS Records', icon: '🔍',
    description: 'Show every DNS record Resend requires and its per-record verification status — which are verified vs still missing.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/domains/{id}' },
    fields: [
      { id: 'domainId', label: 'Domain', type: 'remote_select', required: true,
        source: { action: 'resend.list_domains', dataPath: 'domains', valueKey: 'id', labelTemplate: '{name} — {status}' } },
    ],
  },
  'resend.list_contacts': {
    id: 'resend.list_contacts', label: 'List Contacts', icon: '📋',
    description: 'List all contacts in an audience.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/audiences/{audienceId}/contacts' },
    fields: [{ id: 'audienceId', label: 'Audience ID', type: 'remote_select', required: true, source: { action: 'resend.list_audiences', dataPath: 'audiences', valueKey: 'id', labelTemplate: '{name}' } }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AWS
  // ═══════════════════════════════════════════════════════════════════════════
  'aws.delete_s3_bucket': {
    id: 'aws.delete_s3_bucket', label: 'Delete S3 Bucket', icon: '🗑️',
    description: 'Permanently delete an S3 bucket (must be empty first).',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'aws', method: 'DELETE', endpoint: '/s3/buckets/{bucket}' },
    fields: [{ id: 'bucket', label: 'Bucket name', type: 'text', required: true }],
  },
  'aws.create_iam_user': {
    id: 'aws.create_iam_user', label: 'Create IAM User', icon: '➕',
    description: 'Create a new IAM user.',
    policyActionId: 'crud_actions',
    api: { service: 'aws', method: 'POST', endpoint: '/iam/users' },
    fields: [{ id: 'username', label: 'Username', type: 'text', required: true }],
  },
  'aws.delete_iam_user': {
    id: 'aws.delete_iam_user', label: 'Delete IAM User', icon: '🗑️',
    description: 'Permanently delete an IAM user.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'aws', method: 'DELETE', endpoint: '/iam/users/{username}' },
    fields: [{ id: 'username', label: 'Username', type: 'text', required: true }],
  },
  'aws.list_regions': {
    id: 'aws.list_regions', label: 'List Regions', icon: '🌐',
    description: 'List all available AWS regions.',
    policyActionId: 'read_provider_status',
    api: { service: 'aws', method: 'GET', endpoint: '/ec2/regions' },
    fields: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GCP
  // ═══════════════════════════════════════════════════════════════════════════
  'gcp.list_projects': {
    id: 'gcp.list_projects', label: 'List Projects', icon: '📋',
    description: 'List all GCP projects.',
    policyActionId: 'read_provider_status',
    api: { service: 'gcp', method: 'GET', endpoint: '/cloudresourcemanager/v1/projects' },
    fields: [],
  },
  'gcp.create_service_account': {
    id: 'gcp.create_service_account', label: 'Create Service Account', icon: '➕',
    description: 'Create a new GCP service account.',
    policyActionId: 'crud_actions',
    api: { service: 'gcp', method: 'POST', endpoint: '/iam/serviceaccounts' },
    fields: [
      { id: 'projectId', label: 'Project ID', type: 'text', required: true },
      { id: 'accountId', label: 'Account ID', type: 'text', required: true, placeholder: 'my-service-account' },
      { id: 'displayName', label: 'Display name', type: 'text' },
    ],
  },
  'gcp.enable_service_account': {
    id: 'gcp.enable_service_account', label: 'Enable Service Account', icon: '✅',
    description: 'Re-enable a previously disabled GCP service account.',
    policyActionId: 'crud_actions',
    api: { service: 'gcp', method: 'POST', endpoint: '/iam/serviceaccounts/{email}/enable' },
    fields: [{ id: 'email', label: 'Service account email', type: 'email', required: true }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AZURE
  // ═══════════════════════════════════════════════════════════════════════════
  'azure.list_subscriptions': {
    id: 'azure.list_subscriptions', label: 'List Subscriptions', icon: '📋',
    description: 'List all Azure subscriptions.',
    policyActionId: 'read_provider_status',
    api: { service: 'azure', method: 'GET', endpoint: '/subscriptions?api-version=2020-01-01' },
    fields: [],
  },
  'azure.list_resource_groups': {
    id: 'azure.list_resource_groups', label: 'List Resource Groups', icon: '📋',
    description: 'List resource groups in a subscription.',
    policyActionId: 'read_provider_status',
    api: { service: 'azure', method: 'GET', endpoint: '/subscriptions/{subscriptionId}/resourcegroups?api-version=2021-04-01' },
    fields: [{ id: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true }],
  },
  'azure.list_resources': {
    id: 'azure.list_resources', label: 'List Resources', icon: '📋',
    description: 'List all resources in a resource group.',
    policyActionId: 'read_provider_status',
    api: { service: 'azure', method: 'GET', endpoint: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/resources?api-version=2021-04-01' },
    fields: [
      { id: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true },
      { id: 'resourceGroup', label: 'Resource group', type: 'text', required: true },
    ],
  },
  'azure.create_resource_group': {
    id: 'azure.create_resource_group', label: 'Create Resource Group', icon: '➕',
    description: 'Create a new Azure resource group.',
    policyActionId: 'crud_actions',
    api: { service: 'azure', method: 'PUT', endpoint: '/subscriptions/{subscriptionId}/resourcegroups/{name}?api-version=2021-04-01' },
    fields: [
      { id: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true },
      { id: 'name', label: 'Resource group name', type: 'text', required: true },
      { id: 'location', label: 'Location (e.g. eastus)', type: 'text', required: true },
    ],
  },
  'azure.delete_resource_group': {
    id: 'azure.delete_resource_group', label: 'Delete Resource Group', icon: '🗑️',
    description: 'Permanently delete a resource group and all its resources.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'azure', method: 'DELETE', endpoint: '/subscriptions/{subscriptionId}/resourcegroups/{name}?api-version=2021-04-01' },
    fields: [
      { id: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true },
      { id: 'name', label: 'Resource group name', type: 'text', required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STRIPE
  // ═══════════════════════════════════════════════════════════════════════════
  'stripe.list_subscriptions': {
    id: 'stripe.list_subscriptions', label: 'List Subscriptions', icon: '📋',
    description: 'All active and past subscriptions.',
    policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/subscriptions?limit=50' },
    fields: [],
  },
  'stripe.cancel_subscription': {
    id: 'stripe.cancel_subscription', label: 'Cancel Subscription', icon: '🗑️',
    description: 'Cancel a subscription immediately.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'stripe', method: 'DELETE', endpoint: '/v1/subscriptions/{id}' },
    fields: [{ id: 'id', label: 'Subscription ID', type: 'text', required: true, placeholder: 'sub_...' }],
  },
  'stripe.list_payments': {
    id: 'stripe.list_payments', label: 'List Payments', icon: '💳',
    description: 'Recent payment intents.',
    policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/payment_intents?limit=50' },
    fields: [],
  },
  'stripe.list_disputes': {
    id: 'stripe.list_disputes', label: 'List Disputes', icon: '⚠️',
    description: 'Open and closed payment disputes.',
    policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/disputes?limit=50' },
    fields: [],
  },
  'stripe.create_coupon': {
    id: 'stripe.create_coupon', label: 'Create Coupon', icon: '🎟️',
    description: 'Create a discount coupon.',
    policyActionId: 'crud_actions',
    api: { service: 'stripe', method: 'POST', endpoint: '/v1/coupons' },
    fields: [
      { id: 'id', label: 'Coupon code (optional)', type: 'text' },
      { id: 'percent_off', label: 'Percent off (e.g. 20)', type: 'number' },
      { id: 'duration', label: 'Duration (once/repeating/forever)', type: 'text', required: true },
    ],
  },
  'stripe.list_coupons': {
    id: 'stripe.list_coupons', label: 'List Coupons', icon: '📋',
    description: 'All active discount coupons.',
    policyActionId: 'read_provider_status',
    api: { service: 'stripe', method: 'GET', endpoint: '/v1/coupons?limit=50' },
    fields: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE
  // ═══════════════════════════════════════════════════════════════════════════
  'supabase.list_tables': {
    id: 'supabase.list_tables', label: 'List Tables', icon: '📋',
    description: 'All tables in the public schema.',
    policyActionId: 'read_provider_status',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/query' },
    fields: [],
  },
  'supabase.list_functions': {
    id: 'supabase.list_functions', label: 'List Functions', icon: '⚡',
    description: 'All deployed edge functions.',
    policyActionId: 'read_provider_status',
    api: { service: 'Supabase', method: 'GET', endpoint: '/v1/edge-functions' },
    fields: [],
  },
  'supabase.list_rls_policies': {
    id: 'supabase.list_rls_policies', label: 'List RLS Policies', icon: '🔒',
    description: 'Row-level security policies on all tables.',
    policyActionId: 'read_provider_status',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/query' },
    fields: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VERCEL
  // ═══════════════════════════════════════════════════════════════════════════
  'vercel.add_env': {
    id: 'vercel.add_env', label: 'Add Env Variable', icon: '➕',
    description: 'Add a new environment variable to the project.',
    policyActionId: 'crud_actions',
    api: { service: 'vercel', method: 'POST', endpoint: '/v10/projects/{projectId}/env' },
    fields: [
      { id: 'key', label: 'Key', type: 'text', required: true },
      { id: 'value', label: 'Value', type: 'text', required: true },
      { id: 'target', label: 'Target (production/preview/development)', type: 'text', required: true },
    ],
  },
  'vercel.list_domains': {
    id: 'vercel.list_domains', label: 'List Domains', icon: '🌐',
    description: 'All domains attached to the project.',
    policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/v9/projects/{projectId}/domains' },
    fields: [],
  },
  'vercel.add_domain': {
    id: 'vercel.add_domain', label: 'Add Domain', icon: '➕',
    description: 'Attach a custom domain to the Vercel project.',
    policyActionId: 'crud_actions',
    api: { service: 'vercel', method: 'POST', endpoint: '/v10/projects/{projectId}/domains' },
    fields: [{ id: 'name', label: 'Domain name', type: 'text', required: true }],
  },
  'vercel.remove_domain': {
    id: 'vercel.remove_domain', label: 'Remove Domain', icon: '🗑️',
    description: 'Remove a custom domain from the project.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'vercel', method: 'DELETE', endpoint: '/v9/projects/{projectId}/domains/{domain}' },
    fields: [{ id: 'domain', label: 'Domain name', type: 'text', required: true }],
  },
  'vercel.promote_to_production': {
    id: 'vercel.promote_to_production', label: 'Promote to Production', icon: '🚀',
    description: 'Alias a specific deployment to the production domain.',
    policyActionId: 'crud_actions', requiresConfirm: true,
    api: { service: 'vercel', method: 'PATCH', endpoint: '/v12/deployments/{deploymentId}/promote' },
    fields: [{ id: 'deploymentId', label: 'Deployment ID', type: 'text', required: true, placeholder: 'dpl_...' }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GITHUB
  // ═══════════════════════════════════════════════════════════════════════════
  'github.create_repo': {
    id: 'github.create_repo', label: 'Create Repository', icon: '➕',
    description: 'Create a new GitHub repository.',
    policyActionId: 'crud_actions',
    api: { service: 'github', method: 'POST', endpoint: '/user/repos' },
    fields: [
      { id: 'name', label: 'Repository name', type: 'text', required: true },
      { id: 'private', label: 'Private', type: 'toggle' },
      { id: 'description', label: 'Description', type: 'text' },
    ],
  },
  'github.create_branch': {
    id: 'github.create_branch', label: 'Create Branch', icon: '🌿',
    description: 'Create a new branch from a base ref.',
    policyActionId: 'crud_actions',
    api: { service: 'github', method: 'POST', endpoint: '/repos/{owner}/{repo}/git/refs' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' }, liveOptions: { provider: 'github', source: 'repositories', valueField: 'name', labelField: 'name', searchFields: ['name'] } },
      { id: 'branch', label: 'New branch name', type: 'text', required: true },
      { id: 'from', label: 'Base branch', type: 'remote_select', required: true, defaultValue: 'main', source: { action: 'github.list_branches', dataPath: 'branches', valueKey: 'name', labelTemplate: '{name}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' }, liveOptions: { provider: 'github', source: 'branches', dependsOn: ['repo'], valueField: 'name', labelField: 'name', searchFields: ['name'] } },
    ],
  },
  'github.list_workflows': {
    id: 'github.list_workflows', label: 'List Workflows', icon: '📋',
    description: 'All GitHub Actions workflows in the repo.',
    policyActionId: 'read_provider_status',
    api: { service: 'github', method: 'GET', endpoint: '/repos/{owner}/{repo}/actions/workflows' },
    fields: [{ id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' }, liveOptions: { provider: 'github', source: 'repositories', valueField: 'name', labelField: 'name', searchFields: ['name'] } }],
  },
  'github.trigger_workflow': {
    id: 'github.trigger_workflow', label: 'Trigger Workflow', icon: '▶️',
    description: 'Manually trigger a GitHub Actions workflow.',
    policyActionId: 'crud_actions',
    api: { service: 'github', method: 'POST', endpoint: '/repos/{owner}/{repo}/actions/workflows/{workflowId}/dispatches' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' }, liveOptions: { provider: 'github', source: 'repositories', valueField: 'name', labelField: 'name', searchFields: ['name'] } },
      { id: 'workflowId', label: 'Workflow', type: 'remote_select', required: true, source: { action: 'github.list_workflows', dataPath: 'workflows', valueKey: 'id', labelTemplate: '{name} — {path}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' }, liveOptions: { provider: 'github', source: 'workflows', dependsOn: ['repo'], valueField: 'id', labelField: 'name', searchFields: ['name', 'path'] } },
      { id: 'ref', label: 'Branch/tag', type: 'remote_select', required: true, defaultValue: 'main', source: { action: 'github.list_branches', dataPath: 'branches', valueKey: 'name', labelTemplate: '{name}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' }, liveOptions: { provider: 'github', source: 'branches', dependsOn: ['repo'], valueField: 'name', labelField: 'name', searchFields: ['name'] } },
    ],
  },
  'github.list_workflow_runs': {
    id: 'github.list_workflow_runs', label: 'List Workflow Runs', icon: '📋',
    description: 'Recent workflow run history.',
    policyActionId: 'read_provider_status',
    api: { service: 'github', method: 'GET', endpoint: '/repos/{owner}/{repo}/actions/runs?per_page=20' },
    fields: [{ id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' }, liveOptions: { provider: 'github', source: 'repositories', valueField: 'name', labelField: 'name', searchFields: ['name'] } }],
  },
  'github.manage_secret': {
    id: 'github.manage_secret', label: 'Set Repository Secret', icon: '🔒',
    description: 'Create or update a GitHub Actions secret.',
    policyActionId: 'rotate_secret_key',
    api: { service: 'github', method: 'PUT', endpoint: '/repos/{owner}/{repo}/actions/secrets/{name}' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' }, liveOptions: { provider: 'github', source: 'repositories', valueField: 'name', labelField: 'name', searchFields: ['name'] } },
      { id: 'name', label: 'Secret name', type: 'text', required: true },
      { id: 'value', label: 'Secret value', type: 'text', required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OPENAI
  // ═══════════════════════════════════════════════════════════════════════════
  'openai.test_completion': {
    id: 'openai.test_completion', label: 'Test Completion', icon: '💬',
    description: 'Send a test prompt and get a response — verifies API key and model access.',
    policyActionId: 'read_provider_status',
    api: { service: 'openai', method: 'POST', endpoint: '/v1/chat/completions' },
    fields: [
      { id: 'model', label: 'Model', type: 'text', required: true, placeholder: 'gpt-4o' },
      { id: 'prompt', label: 'Prompt', type: 'text', required: true, placeholder: 'Say hello.' },
    ],
  },
  'openai.view_usage': {
    id: 'openai.view_usage', label: 'View Usage', icon: '📊',
    description: 'Token usage and costs for the current billing period.',
    policyActionId: 'read_provider_status',
    api: { service: 'openai', method: 'GET', endpoint: '/v1/usage' },
    fields: [],
  },
  'openai.delete_file': {
    id: 'openai.delete_file', label: 'Delete File', icon: '🗑️',
    description: 'Delete an uploaded file from OpenAI.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'openai', method: 'DELETE', endpoint: '/v1/files/{id}' },
    fields: [{ id: 'id', label: 'File ID', type: 'text', required: true, placeholder: 'file-...' }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TWILIO
  // ═══════════════════════════════════════════════════════════════════════════
  'twilio.buy_number': {
    id: 'twilio.buy_number', label: 'Buy Phone Number', icon: '➕',
    description: 'Purchase a new Twilio phone number.',
    policyActionId: 'crud_actions', requiresConfirm: true,
    api: { service: 'twilio', method: 'POST', endpoint: '/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json' },
    fields: [
      { id: 'PhoneNumber', label: 'Phone number (e.g. +15005550006)', type: 'text', required: true },
    ],
  },
  'twilio.release_number': {
    id: 'twilio.release_number', label: 'Release Number', icon: '🗑️',
    description: 'Release a phone number from the account.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'twilio', method: 'DELETE', endpoint: '/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers/{Sid}.json' },
    fields: [{ id: 'Sid', label: 'Phone number SID', type: 'text', required: true }],
  },
  'twilio.list_messaging_services': {
    id: 'twilio.list_messaging_services', label: 'List Messaging Services', icon: '📋',
    description: 'All Twilio Messaging Services.',
    policyActionId: 'read_provider_status',
    api: { service: 'twilio', method: 'GET', endpoint: '/2010-04-01/Accounts/{AccountSid}/Messages/Services.json' },
    fields: [],
  },
  'twilio.create_messaging_service': {
    id: 'twilio.create_messaging_service', label: 'Create Messaging Service', icon: '➕',
    description: 'Create a new Twilio Messaging Service.',
    policyActionId: 'crud_actions',
    api: { service: 'twilio', method: 'POST', endpoint: '/v1/Services' },
    fields: [{ id: 'FriendlyName', label: 'Service name', type: 'text', required: true }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDGRID
  // ═══════════════════════════════════════════════════════════════════════════
  'sendgrid.create_template': {
    id: 'sendgrid.create_template', label: 'Create Template', icon: '➕',
    description: 'Create a new dynamic email template.',
    policyActionId: 'crud_actions',
    api: { service: 'sendgrid', method: 'POST', endpoint: '/v3/templates' },
    fields: [
      { id: 'name', label: 'Template name', type: 'text', required: true },
      { id: 'generation', label: 'Generation (dynamic/legacy)', type: 'text', required: true },
    ],
  },
  'sendgrid.delete_template': {
    id: 'sendgrid.delete_template', label: 'Delete Template', icon: '🗑️',
    description: 'Permanently delete a template.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'sendgrid', method: 'DELETE', endpoint: '/v3/templates/{id}' },
    fields: [{ id: 'id', label: 'Template ID', type: 'text', required: true }],
  },
  'sendgrid.delete_suppression': {
    id: 'sendgrid.delete_suppression', label: 'Remove Suppression', icon: '🗑️',
    description: 'Remove an email from the global suppression/unsubscribe list.',
    policyActionId: 'crud_actions', requiresConfirm: true,
    api: { service: 'sendgrid', method: 'DELETE', endpoint: '/v3/asm/suppressions/global/{email}' },
    fields: [{ id: 'email', label: 'Email to remove', type: 'email', required: true }],
  },
  'sendgrid.list_sender_identities': {
    id: 'sendgrid.list_sender_identities', label: 'List Sender Identities', icon: '📋',
    description: 'Verified sender email addresses.',
    policyActionId: 'read_provider_status',
    api: { service: 'sendgrid', method: 'GET', endpoint: '/v3/verified_senders' },
    fields: [],
  },
  'sendgrid.authenticate_domain': {
    id: 'sendgrid.authenticate_domain', label: 'Authenticate Domain', icon: '✅',
    description: 'Set up domain authentication (DKIM/SPF) for a sending domain.',
    policyActionId: 'crud_actions',
    api: { service: 'sendgrid', method: 'POST', endpoint: '/v3/whitelabel/domains' },
    fields: [
      { id: 'domain', label: 'Domain', type: 'text', required: true },
      { id: 'subdomain', label: 'Subdomain prefix (e.g. em)', type: 'text' },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUDFLARE
  // ═══════════════════════════════════════════════════════════════════════════
  'cloudflare.list_zones': {
    id: 'cloudflare.list_zones', label: 'List Zones', icon: '📋',
    description: 'All Cloudflare zones (domains) on the account.',
    policyActionId: 'read_provider_status',
    api: { service: 'cloudflare', method: 'GET', endpoint: '/zones' },
    fields: [],
  },
  'cloudflare.edit_dns_record': {
    id: 'cloudflare.edit_dns_record', label: 'Edit DNS Record', icon: '✏️',
    description: 'Update an existing DNS record.',
    policyActionId: 'crud_actions',
    api: { service: 'cloudflare', method: 'PATCH', endpoint: '/zones/{zoneId}/dns_records/{id}' },
    fields: [
      { id: 'id', label: 'Record ID', type: 'text', required: true },
      { id: 'content', label: 'New value/content', type: 'text', required: true },
      { id: 'proxied', label: 'Proxied (true/false)', type: 'text' },
    ],
  },
  'cloudflare.list_page_rules': {
    id: 'cloudflare.list_page_rules', label: 'List Page Rules', icon: '📋',
    description: 'Active page rules on the zone.',
    policyActionId: 'read_provider_status',
    api: { service: 'cloudflare', method: 'GET', endpoint: '/zones/{zoneId}/pagerules?status=active' },
    fields: [],
  },
  'cloudflare.list_workers': {
    id: 'cloudflare.list_workers', label: 'List Workers', icon: '📋',
    description: 'Deployed Cloudflare Workers scripts.',
    policyActionId: 'read_provider_status',
    api: { service: 'cloudflare', method: 'GET', endpoint: '/accounts/{accountId}/workers/scripts' },
    fields: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITALOCEAN
  // ═══════════════════════════════════════════════════════════════════════════
  'digitalocean.list_firewalls': {
    id: 'digitalocean.list_firewalls', label: 'List Firewalls', icon: '🛡️',
    description: 'All DigitalOcean cloud firewalls.',
    policyActionId: 'read_provider_status',
    api: { service: 'digitalocean', method: 'GET', endpoint: '/v2/firewalls' },
    fields: [],
  },
  'digitalocean.create_firewall': {
    id: 'digitalocean.create_firewall', label: 'Create Firewall', icon: '➕',
    description: 'Create a new cloud firewall.',
    policyActionId: 'crud_actions',
    api: { service: 'digitalocean', method: 'POST', endpoint: '/v2/firewalls' },
    fields: [{ id: 'name', label: 'Firewall name', type: 'text', required: true }],
  },
  'digitalocean.list_snapshots': {
    id: 'digitalocean.list_snapshots', label: 'List Snapshots', icon: '📋',
    description: 'All droplet and volume snapshots.',
    policyActionId: 'read_provider_status',
    api: { service: 'digitalocean', method: 'GET', endpoint: '/v2/snapshots' },
    fields: [],
  },
  'digitalocean.list_ssh_keys': {
    id: 'digitalocean.list_ssh_keys', label: 'List SSH Keys', icon: '🔑',
    description: 'SSH keys on the account.',
    policyActionId: 'read_provider_status',
    api: { service: 'digitalocean', method: 'GET', endpoint: '/v2/account/keys' },
    fields: [],
  },
  'digitalocean.add_ssh_key': {
    id: 'digitalocean.add_ssh_key', label: 'Add SSH Key', icon: '➕',
    description: 'Add a new SSH key to the account.',
    policyActionId: 'crud_actions',
    api: { service: 'digitalocean', method: 'POST', endpoint: '/v2/account/keys' },
    fields: [
      { id: 'name', label: 'Key name', type: 'text', required: true },
      { id: 'public_key', label: 'Public key', type: 'text', required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ELEVENLABS
  // ═══════════════════════════════════════════════════════════════════════════
  'elevenlabs.list_voices': {
    id: 'elevenlabs.list_voices', label: 'List Voices', icon: '🎙️',
    description: 'All available voices including cloned voices.',
    policyActionId: 'read_provider_status',
    api: { service: 'elevenlabs', method: 'GET', endpoint: '/v1/voices' },
    fields: [],
  },
  'elevenlabs.delete_voice': {
    id: 'elevenlabs.delete_voice', label: 'Delete Voice', icon: '🗑️',
    description: 'Delete a cloned voice.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'elevenlabs', method: 'DELETE', endpoint: '/v1/voices/{voiceId}' },
    fields: [{ id: 'voiceId', label: 'Voice ID', type: 'remote_select', required: true, source: { action: 'elevenlabs.list_voices', dataPath: 'voices', valueKey: 'voice_id', labelTemplate: '{name}' } }],
  },
  'elevenlabs.generate_speech': {
    id: 'elevenlabs.generate_speech', label: 'Generate Speech', icon: '🔊',
    description: 'Convert text to speech with a selected voice.',
    policyActionId: 'crud_actions',
    api: { service: 'elevenlabs', method: 'POST', endpoint: '/v1/text-to-speech/{voiceId}' },
    fields: [
      { id: 'voiceId', label: 'Voice ID', type: 'remote_select', required: true, source: { action: 'elevenlabs.list_voices', dataPath: 'voices', valueKey: 'voice_id', labelTemplate: '{name}' } },
      { id: 'text', label: 'Text', type: 'text', required: true },
    ],
  },
  'elevenlabs.delete_history_item': {
    id: 'elevenlabs.delete_history_item', label: 'Delete History Item', icon: '🗑️',
    description: 'Remove a generated audio item from history.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'elevenlabs', method: 'DELETE', endpoint: '/v1/history/{historyItemId}' },
    fields: [{ id: 'historyItemId', label: 'History item ID', type: 'text', required: true }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSEMBLYAI
  // ═══════════════════════════════════════════════════════════════════════════
  'assemblyai.submit_transcript': {
    id: 'assemblyai.submit_transcript', label: 'Submit Transcript', icon: '➕',
    description: 'Submit an audio URL for transcription.',
    policyActionId: 'crud_actions',
    api: { service: 'assemblyai', method: 'POST', endpoint: '/v2/transcript' },
    fields: [
      { id: 'audio_url', label: 'Audio URL', type: 'text', required: true },
      { id: 'speaker_labels', label: 'Speaker labels (true/false)', type: 'text' },
    ],
  },
  'assemblyai.get_transcript': {
    id: 'assemblyai.get_transcript', label: 'Get Transcript Status', icon: '🔍',
    description: 'Check the status and result of a transcript.',
    policyActionId: 'read_provider_status',
    api: { service: 'assemblyai', method: 'GET', endpoint: '/v2/transcript/{id}' },
    fields: [{ id: 'id', label: 'Transcript ID', type: 'text', required: true }],
  },
  'assemblyai.delete_transcript': {
    id: 'assemblyai.delete_transcript', label: 'Delete Transcript', icon: '🗑️',
    description: 'Permanently delete a transcript and its audio.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'assemblyai', method: 'DELETE', endpoint: '/v2/transcript/{id}' },
    fields: [{ id: 'id', label: 'Transcript ID', type: 'text', required: true }],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATADOG
  // ═══════════════════════════════════════════════════════════════════════════
  'datadog.list_monitors': {
    id: 'datadog.list_monitors', label: 'List Monitors', icon: '📋',
    description: 'All active Datadog monitors.',
    policyActionId: 'read_provider_status',
    api: { service: 'datadog', method: 'GET', endpoint: '/api/v1/monitor' },
    fields: [],
  },
  'datadog.mute_monitor': {
    id: 'datadog.mute_monitor', label: 'Mute Monitor', icon: '🔕',
    description: 'Mute a monitor to silence alerts.',
    policyActionId: 'crud_actions',
    api: { service: 'datadog', method: 'POST', endpoint: '/api/v1/monitor/{monitorId}/mute' },
    fields: [
      { id: 'monitorId', label: 'Monitor ID', type: 'remote_select', required: true, source: { action: 'datadog.list_monitors', dataPath: 'monitors', valueKey: 'id', labelTemplate: '{name}' } },
      { id: 'end', label: 'Mute until (Unix timestamp, optional)', type: 'text' },
    ],
  },
  'datadog.unmute_monitor': {
    id: 'datadog.unmute_monitor', label: 'Unmute Monitor', icon: '🔔',
    description: 'Unmute a previously muted monitor.',
    policyActionId: 'crud_actions',
    api: { service: 'datadog', method: 'POST', endpoint: '/api/v1/monitor/{monitorId}/unmute' },
    fields: [{ id: 'monitorId', label: 'Monitor ID', type: 'remote_select', required: true, source: { action: 'datadog.list_monitors', dataPath: 'monitors', valueKey: 'id', labelTemplate: '{name}' } }],
  },
  'datadog.list_dashboards': {
    id: 'datadog.list_dashboards', label: 'List Dashboards', icon: '📊',
    description: 'All Datadog dashboards.',
    policyActionId: 'read_provider_status',
    api: { service: 'datadog', method: 'GET', endpoint: '/api/v1/dashboard' },
    fields: [],
  },
  'datadog.search_events': {
    id: 'datadog.search_events', label: 'Search Events', icon: '🔍',
    description: 'Search the Datadog event stream.',
    policyActionId: 'read_provider_status',
    api: { service: 'datadog', method: 'GET', endpoint: '/api/v1/events' },
    fields: [
      { id: 'start', label: 'Start (Unix timestamp)', type: 'text', required: true },
      { id: 'end', label: 'End (Unix timestamp)', type: 'text', required: true },
      { id: 'priority', label: 'Priority (normal/low)', type: 'text' },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SENTRY
  // ═══════════════════════════════════════════════════════════════════════════
  'sentry.list_projects': {
    id: 'sentry.list_projects', label: 'List Projects', icon: '📋',
    description: 'All Sentry projects.',
    policyActionId: 'read_provider_status',
    api: { service: 'sentry', method: 'GET', endpoint: '/api/0/projects/' },
    fields: [],
  },
  'sentry.list_releases': {
    id: 'sentry.list_releases', label: 'List Releases', icon: '📋',
    description: 'Recent releases for a project.',
    policyActionId: 'read_provider_status',
    api: { service: 'sentry', method: 'GET', endpoint: '/api/0/projects/{org}/{project}/releases/' },
    fields: [
      { id: 'org', label: 'Organization slug', type: 'text', required: true },
      { id: 'project', label: 'Project slug', type: 'text', required: true },
    ],
  },
  'sentry.update_issue': {
    id: 'sentry.update_issue', label: 'Update Issue', icon: '✏️',
    description: 'Update the status or assignment of an issue.',
    policyActionId: 'crud_actions',
    api: { service: 'sentry', method: 'PUT', endpoint: '/api/0/issues/{id}/' },
    fields: [
      { id: 'id', label: 'Issue ID', type: 'text', required: true },
      { id: 'status', label: 'Status (resolved/unresolved/ignored)', type: 'text' },
      { id: 'assignedTo', label: 'Assign to (username)', type: 'text' },
    ],
  },
  'sentry.delete_issue': {
    id: 'sentry.delete_issue', label: 'Delete Issue', icon: '🗑️',
    description: 'Permanently delete a Sentry issue.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'sentry', method: 'DELETE', endpoint: '/api/0/issues/{id}/' },
    fields: [{ id: 'id', label: 'Issue ID', type: 'text', required: true }],
  },
  'sentry.create_alert': {
    id: 'sentry.create_alert', label: 'Create Alert Rule', icon: '🔔',
    description: 'Create a new issue alert rule.',
    policyActionId: 'crud_actions',
    api: { service: 'sentry', method: 'POST', endpoint: '/api/0/projects/{org}/{project}/rules/' },
    fields: [
      { id: 'org', label: 'Organization slug', type: 'text', required: true },
      { id: 'project', label: 'Project slug', type: 'text', required: true },
      { id: 'name', label: 'Alert name', type: 'text', required: true },
    ],
  },
}
