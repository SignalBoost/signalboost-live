// saas/lib/hub/provider-templates-extra.ts
// Hub Console — extended provider action templates (Wave 1 coverage build).
//
// These are merged into PROVIDER_TEMPLATES by provider-templates.ts (Object.assign),
// so getTemplate(), validateTemplatePayload(), the console cards, the action route,
// and the audit layer all pick them up automatically. Every policyActionId below
// already exists (non-blocked) in action-policy.ts, so each action is auth-gated and
// audit-logged through the same central pipeline as Stripe/Vercel.
//
// Execution status (handlers live in app/api/hub/action/route.ts):
//   EXECUTES NOW : stripe, supabase, vercel, github, aws, vault, openai
//   RENDER-ONLY  : twilio, sendgrid, cloudflare, firebase, digitalocean, datadog,
//                  sentry, pagerduty, governance  (clicking returns a clean
//                  "not implemented / not configured" message — Wave 2 adds handlers)
//
// Flat field model mirrors provider-templates.ts. tsconfig strict:false.

import type { ProviderTemplate } from './provider-templates'

export const EXTRA_TEMPLATES: Record<string, ProviderTemplate> = {
  // ---- Supabase (Marketing project) read actions — portable engine ----
  'supabase_mkt.list_tables': { id: 'supabase_mkt.list_tables', label: 'List Tables', description: 'Public tables in the marketing project.', icon: '🗃️', policyActionId: 'read_provider_status', api: { service: 'supabase_mkt', method: 'GET', endpoint: '/rest/v1/' }, fields: [] },
  'supabase_mkt.list_rows': { id: 'supabase_mkt.list_rows', label: 'List Rows', description: 'Rows from a chosen table.', icon: '📄', policyActionId: 'read_provider_status', api: { service: 'supabase_mkt', method: 'GET', endpoint: '/rest/v1/' }, fields: [
      { id: 'table', label: 'Table', type: 'remote_select', required: true, source: { action: 'supabase_mkt.list_tables', dataPath: 'tables', valueKey: 'name', labelTemplate: '{name}' } },
    ] },
  'supabase_mkt.list_users': { id: 'supabase_mkt.list_users', label: 'List Users', description: 'Auth users in the marketing project.', icon: '👤', policyActionId: 'read_provider_status', api: { service: 'supabase_mkt', method: 'GET', endpoint: '/auth/v1/admin/users' }, fields: [] },
  'supabase_mkt.list_buckets': { id: 'supabase_mkt.list_buckets', label: 'List Buckets', description: 'Storage buckets in the marketing project.', icon: '🪣', policyActionId: 'read_provider_status', api: { service: 'supabase_mkt', method: 'GET', endpoint: '/storage/v1/bucket' }, fields: [] },
  // ---- Batch: Anthropic / Gemini / Resend / AssemblyAI (portable engine) ----
  'anthropic.list_models': { id: 'anthropic.list_models', label: 'View Models', description: 'Models available to the API key.', icon: '🧠', policyActionId: 'read_provider_status', api: { service: 'anthropic', method: 'GET', endpoint: '/v1/models' }, fields: [] },
  'anthropic.retrieve_model': { id: 'anthropic.retrieve_model', label: 'Model Details', description: 'Details for a specific model.', icon: '🔎', policyActionId: 'read_provider_status', api: { service: 'anthropic', method: 'GET', endpoint: '/v1/models' }, fields: [
      { id: 'model', label: 'Model', type: 'remote_select', required: true, source: { action: 'anthropic.list_models', dataPath: 'models', valueKey: 'id', labelTemplate: '{display_name}' } },
    ] },
  'gemini.list_models': { id: 'gemini.list_models', label: 'View Models', description: 'Models available to the Gemini key.', icon: '🧠', policyActionId: 'read_provider_status', api: { service: 'gemini', method: 'GET', endpoint: '/v1beta/models' }, fields: [] },
  'gemini.model_details': { id: 'gemini.model_details', label: 'Model Details', description: 'Details for a specific model.', icon: '🔎', policyActionId: 'read_provider_status', api: { service: 'gemini', method: 'GET', endpoint: '/v1beta/models' }, fields: [
      { id: 'model', label: 'Model', type: 'remote_select', required: true, source: { action: 'gemini.list_models', dataPath: 'models', valueKey: 'name', labelTemplate: '{displayName}' } },
    ] },
  'resend.list_domains': { id: 'resend.list_domains', label: 'List Domains', description: 'Sending domains and verification status.', icon: '🌐', policyActionId: 'read_provider_status', api: { service: 'resend', method: 'GET', endpoint: '/domains' }, fields: [] },
  'resend.list_audiences': { id: 'resend.list_audiences', label: 'List Audiences', description: 'Contact audiences.', icon: '👥', policyActionId: 'read_provider_status', api: { service: 'resend', method: 'GET', endpoint: '/audiences' }, fields: [] },
  'resend.list_broadcasts': { id: 'resend.list_broadcasts', label: 'List Broadcasts', description: 'Recent broadcasts.', icon: '📣', policyActionId: 'read_provider_status', api: { service: 'resend', method: 'GET', endpoint: '/broadcasts' }, fields: [] },
  'resend.list_api_keys': { id: 'resend.list_api_keys', label: 'List API Keys', description: 'API keys on the account.', icon: '🔑', policyActionId: 'read_provider_status', api: { service: 'resend', method: 'GET', endpoint: '/api-keys' }, fields: [] },
  'assemblyai.list_transcripts': { id: 'assemblyai.list_transcripts', label: 'Recent Transcripts', description: 'Most recent transcription jobs.', icon: '🎧', policyActionId: 'read_provider_status', api: { service: 'assemblyai', method: 'GET', endpoint: '/v2/transcript' }, fields: [] },
  'assemblyai.transcript_details': { id: 'assemblyai.transcript_details', label: 'Transcript Details', description: 'Inspect a transcription job.', icon: '🔎', policyActionId: 'read_provider_status', api: { service: 'assemblyai', method: 'GET', endpoint: '/v2/transcript' }, fields: [
      { id: 'id', label: 'Transcript', type: 'remote_select', required: true, source: { action: 'assemblyai.list_transcripts', dataPath: 'transcripts', valueKey: 'id', labelTemplate: '{id} ({status})' } },
    ] },
  // ---- ElevenLabs read actions (run through the portable engine) ----
  'elevenlabs.list_voices': {
    id: 'elevenlabs.list_voices', label: 'List Voices', description: 'Voices available to the account.', icon: '🎙️',
    policyActionId: 'read_provider_status', api: { service: 'elevenlabs', method: 'GET', endpoint: '/v1/voices' }, fields: [],
  },
  'elevenlabs.voice_details': {
    id: 'elevenlabs.voice_details', label: 'Voice Details', description: 'Inspect a specific voice.', icon: '🔎',
    policyActionId: 'read_provider_status', api: { service: 'elevenlabs', method: 'GET', endpoint: '/v1/voices' },
    fields: [
      { id: 'voice_id', label: 'Voice', type: 'remote_select', required: true, source: { action: 'elevenlabs.list_voices', dataPath: 'voices', valueKey: 'voice_id', labelTemplate: '{name}' } },
    ],
  },
  'elevenlabs.list_models': {
    id: 'elevenlabs.list_models', label: 'List Models', description: 'Speech models available to the account.', icon: '🧠',
    policyActionId: 'read_provider_status', api: { service: 'elevenlabs', method: 'GET', endpoint: '/v1/models' }, fields: [],
  },
  'elevenlabs.subscription': {
    id: 'elevenlabs.subscription', label: 'Subscription & Usage', description: 'Plan tier and character quota usage.', icon: '📊',
    policyActionId: 'read_provider_status', api: { service: 'elevenlabs', method: 'GET', endpoint: '/v1/user/subscription' }, fields: [],
  },
  'elevenlabs.list_history': {
    id: 'elevenlabs.list_history', label: 'Generation History', description: 'Recent text-to-speech generations.', icon: '🕓',
    policyActionId: 'read_provider_status', api: { service: 'elevenlabs', method: 'GET', endpoint: '/v1/history' }, fields: [],
  },
  // ---- OpenAI read actions (run through the portable engine) ----
  'openai.list_models': {
    id: 'openai.list_models', label: 'View Models', description: 'List models available to the configured API key.', icon: '🧠',
    policyActionId: 'read_provider_status', api: { service: 'openai', method: 'GET', endpoint: '/v1/models' }, fields: [],
  },
  'openai.retrieve_model': {
    id: 'openai.retrieve_model', label: 'Model Details', description: 'Show details for a specific model.', icon: '🔎',
    policyActionId: 'read_provider_status', api: { service: 'openai', method: 'GET', endpoint: '/v1/models' },
    fields: [
      { id: 'model', label: 'Model', type: 'remote_select', required: true, source: { action: 'openai.list_models', dataPath: 'models', valueKey: 'id', labelTemplate: '{id}' } },
    ],
  },
  'openai.list_files': {
    id: 'openai.list_files', label: 'List Files', description: 'Files uploaded to the OpenAI account.', icon: '📄',
    policyActionId: 'read_provider_status', api: { service: 'openai', method: 'GET', endpoint: '/v1/files' }, fields: [],
  },
  'openai.list_fine_tunes': {
    id: 'openai.list_fine_tunes', label: 'Fine-tuning Jobs', description: 'Recent fine-tuning jobs and their status.', icon: '🎛️',
    policyActionId: 'read_provider_status', api: { service: 'openai', method: 'GET', endpoint: '/v1/fine_tuning/jobs' }, fields: [],
  },
  'openai.list_batches': {
    id: 'openai.list_batches', label: 'Batch Jobs', description: 'Recent batch jobs and their status.', icon: '📦',
    policyActionId: 'read_provider_status', api: { service: 'openai', method: 'GET', endpoint: '/v1/batches' }, fields: [],
  },
  // ---- Supabase read sources for select-don't-type pickers ----
  'supabase.list_tables': {
    id: 'supabase.list_tables', label: 'List Tables', description: 'List public tables (picker source).', icon: '🗃️',
    policyActionId: 'read_provider_status', api: { service: 'supabase', method: 'GET', endpoint: '/rest/v1/' }, fields: []
  },

  // ---- Project picker source + SQL Editor override (adds a searchable project dropdown) ----
  'supabase.list_projects': {
    id: 'supabase.list_projects', label: 'List Projects', description: 'Your Supabase projects (picker source).', icon: '🗂️',
    policyActionId: 'read_provider_status', api: { service: 'supabase', method: 'GET', endpoint: '/v1/projects' }, fields: []
  },
  // Overrides the base SQL Editor: adds a live project selector before the query.
  'supabase.sql_editor': {
    id: 'supabase.sql_editor', label: 'SQL Editor',
    description: 'Pick a project, then run raw SQL against it.', icon: '\u26a1',
    previewBeforeSubmit: true, policyActionId: 'sql_editor',
    api: { service: 'supabase', method: 'POST', endpoint: '/v1/rpc/execute_sql' },
    fields: [
      { id: 'project', label: 'Project', type: 'remote_select', required: true, source: { action: 'supabase.list_projects', dataPath: 'projects', valueKey: 'ref', labelTemplate: '{name}' } },
      { id: 'query', label: 'SQL Raw Statement', type: 'textarea', required: true, placeholder: 'SELECT current_database(), now();' }
    ]
  },
  'supabase.list_rows': {
    id: 'supabase.list_rows', label: 'List Rows', description: 'List rows for a table (picker source).', icon: '📋',
    policyActionId: 'read_provider_status', api: { service: 'supabase', method: 'GET', endpoint: '/rest/v1' },
    fields: [{ id: 'table', label: 'Table', type: 'text' }]
  },
  'supabase.list_users': {
    id: 'supabase.list_users', label: 'List Users', description: 'List auth users (picker source).', icon: '👤',
    policyActionId: 'read_provider_status', api: { service: 'supabase', method: 'GET', endpoint: '/auth/v1/admin/users' }, fields: []
  },
  'supabase.list_buckets': {
    id: 'supabase.list_buckets', label: 'List Buckets', description: 'List storage buckets (picker source).', icon: '🪣',
    policyActionId: 'read_provider_status', api: { service: 'supabase', method: 'GET', endpoint: '/storage/v1/bucket' }, fields: []
  },
  // ===================== STRIPE (gap) =====================
  'stripe.archive_price': {
    id: 'stripe.archive_price',
    label: 'Archive Price',
    description: 'Deactivate a price so it can no longer be purchased (recoverable).',
    icon: '🗄️',
    requiresConfirm: true,
    policyActionId: 'archive_stripe_price',
    api: { service: 'Stripe', method: 'POST', endpoint: '/v1/prices/archive' },
    fields: [{ id: 'id', label: 'Price ID', type: 'text', required: true, placeholder: 'price_...' }],
  },

  // ===================== SUPABASE (gaps) =====================
  'supabase.invite_user': {
    id: 'supabase.invite_user',
    label: 'Invite User',
    description: 'Send an email invite to provision a new authenticated user.',
    icon: '✉️',
    policyActionId: 'invite_supabase_user',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/auth/invite' },
    fields: [{ id: 'email', label: 'User Email', type: 'email', required: true, placeholder: 'newuser@domain.com' }],
  },
  'supabase.edit_user': {
    id: 'supabase.edit_user',
    label: 'Edit User',
    description: 'Update a user\'s email, metadata, or confirmation state.',
    icon: '✏️',
    policyActionId: 'edit_supabase_user',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/auth/users/update' },
    fields: [
      { id: 'userId', label: 'User', type: 'remote_select', required: true, source: { action: 'supabase.list_users', dataPath: 'users', valueKey: 'id', labelTemplate: '{label}' } },
      { id: 'email', label: 'New Email', type: 'email' },
    ],
  },
  'supabase.delete_user': {
    id: 'supabase.delete_user',
    label: 'Delete User',
    description: 'Permanently remove an authenticated user and their identity.',
    icon: '🗑️',
    requiresConfirm: true,
    policyActionId: 'delete_supabase_user',
    api: { service: 'Supabase', method: 'DELETE', endpoint: '/v1/auth/users' },
    fields: [{ id: 'userId', label: 'User', type: 'remote_select', required: true, source: { action: 'supabase.list_users', dataPath: 'users', valueKey: 'id', labelTemplate: '{label}' } }],
  },
  'supabase.reset_password': {
    id: 'supabase.reset_password',
    label: 'Reset Password',
    description: 'Trigger a password-recovery email for a user account.',
    icon: '🔁',
    policyActionId: 'reset_supabase_password',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/auth/recover' },
    fields: [{ id: 'email', label: 'User Email', type: 'remote_select', required: true, source: { action: 'supabase.list_users', dataPath: 'users', valueKey: 'email', labelTemplate: '{label}' } }],
  },
  'supabase.edit_row': {
    id: 'supabase.edit_row',
    label: 'Edit Row',
    description: 'Update an existing table row matched by a filter expression.',
    icon: '📝',
    policyActionId: 'table_crud',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/data/update' },
    fields: [
      { id: 'table', label: 'Table', type: 'remote_select', required: true, source: { action: 'supabase.list_tables', dataPath: 'tables', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'match', label: 'Match (column=value)', type: 'text', required: true, placeholder: 'id=42' },
      { id: 'values', label: 'New Values (JSON)', type: 'textarea', required: true, placeholder: '{ "status": "paid" }' },
    ],
  },
  'supabase.storage_panel': {
    id: 'supabase.storage_panel',
    label: 'Storage Panel',
    description: 'Upload, download, or list objects inside a storage bucket.',
    icon: '📂',
    policyActionId: 'storage_panel',
    api: { service: 'Supabase', method: 'POST', endpoint: '/v1/storage/panel' },
    fields: [
      { id: 'bucket', label: 'Bucket', type: 'remote_select', required: true, source: { action: 'supabase.list_buckets', dataPath: 'buckets', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'action', label: 'Operation', type: 'select', required: true, options: [
        { label: 'List objects', value: 'list' },
        { label: 'Upload', value: 'upload' },
        { label: 'Download', value: 'download' },
      ] },
      { id: 'path', label: 'Object Path', type: 'text', placeholder: 'folder/file.png' },
    ],
  },

  // ===================== VERCEL (gaps) =====================
  'vercel.edit_env': {
    id: 'vercel.edit_env',
    label: 'Edit Env Var',
    description: 'Update the value and/or target environments of a variable.',
    icon: '✏️',
    policyActionId: 'edit_vercel_env',
    api: { service: 'Vercel', method: 'PATCH', endpoint: '/v1/projects/env' },
    fields: [
      { id: 'id', label: 'Env Variable ID', type: 'text', required: true, placeholder: 'env id' },
      { id: 'value', label: 'New Value', type: 'secret' },
      { id: 'target', label: 'Target', type: 'select', options: [
        { label: 'Production', value: 'production' },
        { label: 'Preview', value: 'preview' },
        { label: 'Development', value: 'development' },
      ] },
    ],
  },
  'vercel.logs': {
    id: 'vercel.logs',
    label: 'Logs Viewer',
    description: 'Stream recent platform, build, and runtime log events.',
    icon: '📜',
    policyActionId: 'read_provider_status',
    api: { service: 'Vercel', method: 'GET', endpoint: '/v1/logs' },
    fields: [],
  },

  // ===================== GITHUB =====================
  // ===================== GITHUB =====================
  // Repo + PR/issue/branch fields are remote_select: populated live from list
  // actions and chosen from a dropdown — no typing ids that might be wrong/closed.
  'github.list_repos': {
    id: 'github.list_repos',
    label: 'View Repos',
    description: 'List repositories visible to the configured access token.',
    icon: '📚',
    policyActionId: 'read_provider_status',
    api: { service: 'GitHub', method: 'GET', endpoint: '/v1/repos' },
    fields: [],
  },
  'github.list_prs': {
    id: 'github.list_prs',
    label: 'List Pull Requests',
    description: 'Show open pull requests (newest first) for a repository.',
    icon: '🔀',
    policyActionId: 'read_provider_status',
    api: { service: 'GitHub', method: 'GET', endpoint: '/v1/pulls' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
    ],
  },
  'github.view_pr_files': {
    id: 'github.view_pr_files',
    label: 'View PR Files',
    description: 'List the files changed in a pull request.',
    icon: '📂',
    policyActionId: 'read_provider_status',
    api: { service: 'GitHub', method: 'GET', endpoint: '/v1/pulls/files' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'number', label: 'Pull Request', type: 'remote_select', required: true, source: { action: 'github.list_prs', dataPath: 'pulls', valueKey: 'number', labelTemplate: '#{number} — {title} ({branch})', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } },
    ],
  },
  'github.merge_pr': {
    id: 'github.merge_pr',
    label: 'Merge PR',
    description: 'Merge a pull request into its base branch.',
    icon: '✅',
    requiresConfirm: true,
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'PUT', endpoint: '/v1/pulls/merge' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'number', label: 'Pull Request', type: 'remote_select', required: true, source: { action: 'github.list_prs', dataPath: 'pulls', valueKey: 'number', labelTemplate: '#{number} — {title} ({branch})', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } },
      { id: 'method', label: 'Merge Method', type: 'select', defaultValue: 'merge', options: [
        { label: 'Merge commit', value: 'merge' },
        { label: 'Squash', value: 'squash' },
        { label: 'Rebase', value: 'rebase' },
      ] },
    ],
  },
  'github.close_pr': {
    id: 'github.close_pr',
    label: 'Close PR',
    description: 'Close a pull request without merging.',
    icon: '🚫',
    requiresConfirm: true,
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'PATCH', endpoint: '/v1/pulls/close' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'number', label: 'Pull Request', type: 'remote_select', required: true, source: { action: 'github.list_prs', dataPath: 'pulls', valueKey: 'number', labelTemplate: '#{number} — {title} ({branch})', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } },
    ],
  },
  'github.list_branches': {
    id: 'github.list_branches',
    label: 'List Branches',
    description: 'List branches in a repository (useful for ai/* cleanup).',
    icon: '🌿',
    policyActionId: 'read_provider_status',
    api: { service: 'GitHub', method: 'GET', endpoint: '/v1/branches' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
    ],
  },
  'github.delete_branch': {
    id: 'github.delete_branch',
    label: 'Delete Branch',
    description: 'Delete a branch by name (main is protected).',
    icon: '🗑️',
    requiresConfirm: true,
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'DELETE', endpoint: '/v1/branches' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'branch', label: 'Branch', type: 'remote_select', required: true, source: { action: 'github.list_branches', dataPath: 'branches', valueKey: 'name', labelTemplate: '{name}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } },
    ],
  },
  'github.list_commits': {
    id: 'github.list_commits',
    label: 'Recent Commits',
    description: 'Show the most recent commits on a repository.',
    icon: '📜',
    policyActionId: 'read_provider_status',
    api: { service: 'GitHub', method: 'GET', endpoint: '/v1/commits' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
    ],
  },
  'github.list_issues': {
    id: 'github.list_issues',
    label: 'List Issues',
    description: 'Show open issues for a repository.',
    icon: '🐛',
    policyActionId: 'read_provider_status',
    api: { service: 'GitHub', method: 'GET', endpoint: '/v1/issues' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
    ],
  },
  'github.open_issue': {
    id: 'github.open_issue',
    label: 'Open Issue',
    description: 'Create a new issue on a repository.',
    icon: '🐛',
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'POST', endpoint: '/v1/issues' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'title', label: 'Title', type: 'text', required: true },
      { id: 'body', label: 'Description', type: 'textarea' },
    ],
  },
  'github.edit_issue': {
    id: 'github.edit_issue',
    label: 'Edit Issue',
    description: 'Update an issue\u2019s title or open/closed state.',
    icon: '✏️',
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'POST', endpoint: '/v1/issues/update' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'number', label: 'Issue', type: 'remote_select', required: true, source: { action: 'github.list_issues', dataPath: 'issues', valueKey: 'number', labelTemplate: '#{number} — {title}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } },
      { id: 'title', label: 'New Title', type: 'text' },
      { id: 'state', label: 'State', type: 'select', options: [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
      ] },
    ],
  },
  'github.close_issue': {
    id: 'github.close_issue',
    label: 'Close Issue',
    description: 'Close an open issue.',
    icon: '✔️',
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'PATCH', endpoint: '/v1/issues/close' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'number', label: 'Issue', type: 'remote_select', required: true, source: { action: 'github.list_issues', dataPath: 'issues', valueKey: 'number', labelTemplate: '#{number} — {title}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } },
    ],
  },
  'github.rotate_token': {
    id: 'github.rotate_token',
    label: 'Rotate Token',
    description: 'Rotate the stored GitHub access token (revoke + reissue).',
    icon: '🔑',
    requiresConfirm: true,
    policyActionId: 'rotate_credential',
    api: { service: 'GitHub', method: 'POST', endpoint: '/v1/token/rotate' },
    fields: [],
  },
  'github.manage_secrets': {
    id: 'github.manage_secrets',
    label: 'Manage Secrets',
    description: 'Create or update an Actions secret on a repository.',
    icon: '🔒',
    policyActionId: 'crud_actions',
    api: { service: 'GitHub', method: 'POST', endpoint: '/v1/secrets' },
    fields: [
      { id: 'repo', label: 'Repository', type: 'remote_select', required: true, defaultValue: 'SignalBoost/signalboost-live', source: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } },
      { id: 'name', label: 'Secret Name', type: 'text', required: true, placeholder: 'API_KEY' },
      { id: 'value', label: 'Secret Value', type: 'secret', required: true },
    ],
  },

  // ===================== AWS (gap) =====================
  'aws.rotate_credential': {
    id: 'aws.rotate_credential',
    label: 'Rotate Credential',
    description: 'Rotate an IAM access key pair for a user.',
    icon: '🔑',
    requiresConfirm: true,
    policyActionId: 'rotate_credential',
    api: { service: 'AWS', method: 'POST', endpoint: '/v1/iam/credentials/rotate' },
    fields: [{ id: 'username', label: 'IAM Username', type: 'text', required: true }],
  },

  // ===================== TWILIO =====================
  'twilio.send_sms': {
    id: 'twilio.send_sms',
    label: 'Send SMS',
    description: 'Send an outbound SMS message from your Twilio number.',
    icon: '💬',
    policyActionId: 'send_twilio_sms',
    api: { service: 'Twilio', method: 'POST', endpoint: '/Messages' },
    fields: [
      { id: 'to', label: 'To', type: 'phone', required: true, placeholder: '+15551234567' },
      { id: 'body', label: 'Message', type: 'textarea', required: true, maxLength: 1600 },
    ],
  },
  'twilio.verify_number': {
    id: 'twilio.verify_number',
    label: 'Verify Number',
    description: 'Start phone-number verification (sends a one-time code).',
    icon: '✅',
    policyActionId: 'twilio_verify_number',
    api: { service: 'Twilio', method: 'POST', endpoint: '/Verify' },
    fields: [{ id: 'to', label: 'Phone Number', type: 'phone', required: true, placeholder: '+15551234567' }],
  },

  // ===================== SENDGRID =====================
  'sendgrid.send_email': {
    id: 'sendgrid.send_email',
    label: 'Send Email',
    description: 'Send a transactional email through SendGrid.',
    icon: '📧',
    policyActionId: 'send_sendgrid_email',
    api: { service: 'SendGrid', method: 'POST', endpoint: '/v3/mail/send' },
    fields: [
      { id: 'to', label: 'To', type: 'email', required: true },
      { id: 'subject', label: 'Subject', type: 'text', required: true },
      { id: 'body', label: 'Body', type: 'textarea', required: true },
    ],
  },
  'sendgrid.check_domain_auth': {
    id: 'sendgrid.check_domain_auth',
    label: 'Check Domain Auth',
    description: 'Inspect sender-domain authentication (SPF/DKIM) status.',
    icon: '🛡️',
    policyActionId: 'read_provider_status',
    api: { service: 'SendGrid', method: 'GET', endpoint: '/v3/whitelabel/domains' },
    fields: [{ id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'mail.domain.com' }],
  },

  // ===================== CLOUDFLARE =====================
  'cloudflare.add_dns_record': {
    id: 'cloudflare.add_dns_record',
    label: 'Add DNS Record',
    description: 'Create a DNS record in the configured Cloudflare zone.',
    icon: '🌐',
    policyActionId: 'cloudflare_add_dns',
    api: { service: 'Cloudflare', method: 'POST', endpoint: '/dns_records' },
    fields: [
      { id: 'type', label: 'Type', type: 'select', required: true, options: [
        { label: 'A', value: 'A' }, { label: 'AAAA', value: 'AAAA' }, { label: 'CNAME', value: 'CNAME' },
        { label: 'TXT', value: 'TXT' }, { label: 'MX', value: 'MX' },
      ] },
      { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'www' },
      { id: 'content', label: 'Content', type: 'text', required: true, placeholder: '192.0.2.1' },
      { id: 'ttl', label: 'TTL (sec)', type: 'number', defaultValue: 3600 },
      { id: 'proxied', label: 'Proxied', type: 'toggle' },
    ],
  },
  'cloudflare.toggle_proxy': {
    id: 'cloudflare.toggle_proxy',
    label: 'Toggle Proxy',
    description: 'Turn the orange-cloud proxy on or off for a record.',
    icon: '☁️',
    policyActionId: 'cloudflare_toggle_proxy',
    api: { service: 'Cloudflare', method: 'PATCH', endpoint: '/dns_records' },
    fields: [
      { id: 'recordId', label: 'Record ID', type: 'text', required: true },
      { id: 'proxied', label: 'Proxied', type: 'toggle' },
    ],
  },
  'cloudflare.purge_cache': {
    id: 'cloudflare.purge_cache',
    label: 'Purge Cache',
    description: 'Purge the entire Cloudflare edge cache for the zone.',
    icon: '🧹',
    requiresConfirm: true,
    policyActionId: 'cloudflare_purge_cache',
    api: { service: 'Cloudflare', method: 'POST', endpoint: '/purge_cache' },
    fields: [],
  },

  // ===================== FIREBASE =====================
  'firebase.upload_rules': {
    id: 'firebase.upload_rules',
    label: 'Upload Rules',
    description: 'Publish a new Firestore/Storage security ruleset.',
    icon: '⬆️',
    requiresConfirm: true,
    policyActionId: 'firebase_upload_rules',
    api: { service: 'Firebase', method: 'POST', endpoint: '/v1/rules' },
    fields: [{ id: 'rules', label: 'Rules Source', type: 'textarea', required: true, placeholder: 'rules_version = \'2\'; ...' }],
  },
  'firebase.view_rules': {
    id: 'firebase.view_rules',
    label: 'View Rules',
    description: 'Show the currently published security ruleset.',
    icon: '📄',
    policyActionId: 'read_provider_status',
    api: { service: 'Firebase', method: 'GET', endpoint: '/v1/rules' },
    fields: [],
  },

  // ===================== DIGITALOCEAN =====================
  'digitalocean.create_droplet': {
    id: 'digitalocean.create_droplet',
    label: 'Create Droplet',
    description: 'Provision a new DigitalOcean compute droplet.',
    icon: '💧',
    requiresConfirm: true,
    policyActionId: 'create_droplet',
    api: { service: 'DigitalOcean', method: 'POST', endpoint: '/v2/droplets' },
    fields: [
      { id: 'name', label: 'Droplet Name', type: 'text', required: true, placeholder: 'web-01' },
      { id: 'region', label: 'Region', type: 'select', required: true, options: [
        { label: 'NYC1', value: 'nyc1' }, { label: 'SFO3', value: 'sfo3' }, { label: 'AMS3', value: 'ams3' },
      ] },
      { id: 'size', label: 'Size', type: 'select', required: true, options: [
        { label: '1 vCPU / 1 GB', value: 's-1vcpu-1gb' }, { label: '2 vCPU / 4 GB', value: 's-2vcpu-4gb' },
      ] },
      { id: 'image', label: 'Image', type: 'text', defaultValue: 'ubuntu-22-04-x64' },
    ],
  },
  'digitalocean.view_droplets': {
    id: 'digitalocean.view_droplets',
    label: 'View Droplets',
    description: 'List active droplets and their status.',
    icon: '🗂️',
    policyActionId: 'read_provider_status',
    api: { service: 'DigitalOcean', method: 'GET', endpoint: '/v2/droplets' },
    fields: [],
  },

  // ===================== DATADOG =====================
  'datadog.create_monitor': {
    id: 'datadog.create_monitor',
    label: 'Create Monitor',
    description: 'Create a metric/alert monitor.',
    icon: '🐶',
    policyActionId: 'datadog_create_monitor',
    api: { service: 'Datadog', method: 'POST', endpoint: '/api/v1/monitor' },
    fields: [
      { id: 'name', label: 'Monitor Name', type: 'text', required: true },
      { id: 'query', label: 'Query', type: 'textarea', required: true, placeholder: 'avg(last_5m):avg:system.cpu.user{*} > 0.9' },
      { id: 'message', label: 'Alert Message', type: 'textarea' },
    ],
  },
  'datadog.check_metrics': {
    id: 'datadog.check_metrics',
    label: 'Check Metrics',
    description: 'Run a metric query and view the latest series.',
    icon: '📈',
    policyActionId: 'read_provider_status',
    api: { service: 'Datadog', method: 'GET', endpoint: '/api/v1/query' },
    fields: [{ id: 'query', label: 'Metric Query', type: 'text', required: true, placeholder: 'system.cpu.user{*}' }],
  },

  // ===================== SENTRY =====================
  'sentry.list_issues': {
    id: 'sentry.list_issues',
    label: 'List Issues',
    description: 'List unresolved issues for a project.',
    icon: '🐞',
    policyActionId: 'read_provider_status',
    api: { service: 'Sentry', method: 'GET', endpoint: '/api/0/issues' },
    fields: [{ id: 'project', label: 'Project Slug', type: 'text', required: true, placeholder: 'signalboost' }],
  },
  'sentry.resolve_issue': {
    id: 'sentry.resolve_issue',
    label: 'Resolve Issue',
    description: 'Mark an issue as resolved.',
    icon: '✔️',
    policyActionId: 'sentry_resolve_issue',
    api: { service: 'Sentry', method: 'PUT', endpoint: '/api/0/issues/resolve' },
    fields: [{ id: 'issueId', label: 'Issue ID', type: 'text', required: true }],
  },

  // ===================== PAGERDUTY =====================
  'pagerduty.list_incidents': {
    id: 'pagerduty.list_incidents',
    label: 'List Incidents',
    description: 'List recent and active incidents.',
    icon: '📟',
    policyActionId: 'read_provider_status',
    api: { service: 'PagerDuty', method: 'GET', endpoint: '/incidents' },
    fields: [],
  },
  'pagerduty.trigger_incident': {
    id: 'pagerduty.trigger_incident',
    label: 'Trigger Incident',
    description: 'Manually trigger a new incident on a service.',
    icon: '🚨',
    requiresConfirm: true,
    policyActionId: 'pagerduty_trigger_incident',
    api: { service: 'PagerDuty', method: 'POST', endpoint: '/incidents' },
    fields: [
      { id: 'title', label: 'Title', type: 'text', required: true },
      { id: 'service', label: 'Service ID', type: 'text', required: true },
      { id: 'urgency', label: 'Urgency', type: 'select', options: [
        { label: 'High', value: 'high' }, { label: 'Low', value: 'low' },
      ] },
    ],
  },

  // ===================== VAULT (gaps) =====================
  'vault.edit_secret': {
    id: 'vault.edit_secret',
    label: 'Edit Key',
    description: 'Update the value of an existing vault secret.',
    icon: '✏️',
    policyActionId: 'vault_edit_key',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/edit' },
    fields: [
      { id: 'key', label: 'Key Name', type: 'text', required: true },
      { id: 'value', label: 'New Value', type: 'secret', required: true },
    ],
  },
  'vault.archive_secret': {
    id: 'vault.archive_secret',
    label: 'Archive Key',
    description: 'Archive a secret (hidden but recoverable).',
    icon: '🗄️',
    requiresConfirm: true,
    policyActionId: 'vault_archive_key',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/archive' },
    fields: [{ id: 'key', label: 'Key Name', type: 'text', required: true }],
  },
  'vault.reveal_secret': {
    id: 'vault.reveal_secret',
    label: 'Reveal Key',
    description: 'Decrypt and reveal a secret value (audit-logged).',
    icon: '👁️',
    policyActionId: 'vault_reveal_key',
    api: { service: 'Vault', method: 'POST', endpoint: '/v1/vault/reveal' },
    fields: [{ id: 'key', label: 'Key Name', type: 'text', required: true }],
  },
  'vault.audit_log': {
    id: 'vault.audit_log',
    label: 'Audit Log',
    description: 'View the vault access and mutation audit trail.',
    icon: '📊',
    policyActionId: 'audit_log',
    api: { service: 'Vault', method: 'GET', endpoint: '/v1/vault/audit' },
    fields: [],
  },

  // ===================== GOVERNANCE (gaps) =====================
  'gov.change_permissions': {
    id: 'gov.change_permissions',
    label: 'Change Role Permissions',
    description: 'Adjust the permission set attached to a member or role.',
    icon: '🧩',
    policyActionId: 'change_role_permissions',
    api: { service: 'Governance', method: 'POST', endpoint: '/v1/team/permissions' },
    fields: [
      { id: 'memberId', label: 'Member ID', type: 'text', required: true },
      { id: 'permissions', label: 'Permissions (comma-separated)', type: 'textarea', required: true, placeholder: 'billing:read, deployments:deploy' },
    ],
  },
  'gov.run_compliance_audit': {
    id: 'gov.run_compliance_audit',
    label: 'Run Compliance Audit',
    description: 'Run a compliance sweep across the selected scope.',
    icon: '🔍',
    policyActionId: 'compliance_run_audit',
    api: { service: 'Governance', method: 'POST', endpoint: '/v1/audit/run' },
    fields: [
      { id: 'scope', label: 'Scope', type: 'select', required: true, options: [
        { label: 'Everything', value: 'all' }, { label: 'Access & Roles', value: 'access' },
        { label: 'Billing', value: 'billing' }, { label: 'Data', value: 'data' },
      ] },
    ],
  },
  // ===================== GITHUB (console expansion) =====================
}
