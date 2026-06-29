// saas/lib/hub/provider-templates-resend.ts
// Full Resend CRUD: domains (add/re-verify/delete), API keys (create/delete),
// contacts (add/delete), audiences (create/delete), send test email.
// Every write action is policy-gated (admin or owner_with_audit).

import type { ProviderTemplate } from './provider-templates'

export const RESEND_CONSOLE_TEMPLATES: Record<string, ProviderTemplate> = {
  // ── Read: delivery list ──────────────────────────────────────────────────
  'resend.email_deliveries': {
    id: 'resend.email_deliveries', label: 'Email Delivery', icon: '📬',
    description: 'Live list of sent emails with delivered / bounced / opened state.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/__console/email-deliveries' },
    fields: [],
  },

  // ── Domains ──────────────────────────────────────────────────────────────
  'resend.list_domains': {
    id: 'resend.list_domains', label: 'List Domains', icon: '🌐',
    description: 'Sending domains and verification status.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/domains' },
    fields: [],
  },
  'resend.add_domain': {
    id: 'resend.add_domain', label: 'Add Domain', icon: '➕',
    description: 'Register a new sending domain in Resend.',
    policyActionId: 'crud_actions',
    api: { service: 'resend', method: 'POST', endpoint: '/domains' },
    fields: [
      { id: 'name', label: 'Domain (e.g. signalboostapp.com)', type: 'text', required: true, placeholder: 'signalboostapp.com' },
      { id: 'region', label: 'Region', type: 'select', required: true, options: [
        { value: 'us-east-1', label: 'US East (N. Virginia)' },
        { value: 'eu-west-1', label: 'EU West (Ireland)' },
        { value: 'sa-east-1', label: 'SA East (São Paulo)' },
      ]},
    ],
  },
  'resend.verify_domain': {
    id: 'resend.verify_domain', label: 'Re-verify Domain', icon: '✅',
    description: 'Trigger re-verification for a domain after adding DNS records.',
    policyActionId: 'crud_actions',
    api: { service: 'resend', method: 'POST', endpoint: '/domains/{id}/verify' },
    fields: [
      { id: 'domainId', label: 'Domain', type: 'remote_select', required: true,
        source: { action: 'resend.list_domains', dataPath: 'domains', valueKey: 'id', labelTemplate: '{name} — {status}' } },
    ],
  },
  'resend.delete_domain': {
    id: 'resend.delete_domain', label: 'Delete Domain', icon: '🗑️',
    description: 'Permanently remove a sending domain from Resend.',
    policyActionId: 'delete_provider_resource',
    requiresConfirm: true,
    api: { service: 'resend', method: 'DELETE', endpoint: '/domains/{id}' },
    fields: [
      { id: 'domainId', label: 'Domain', type: 'remote_select', required: true,
        source: { action: 'resend.list_domains', dataPath: 'domains', valueKey: 'id', labelTemplate: '{name} — {status}' } },
    ],
  },

  // ── API Keys ──────────────────────────────────────────────────────────────
  'resend.list_api_keys': {
    id: 'resend.list_api_keys', label: 'List API Keys', icon: '🔑',
    description: 'API keys on the account.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/api-keys' },
    fields: [],
  },
  'resend.create_api_key': {
    id: 'resend.create_api_key', label: 'Create API Key', icon: '➕',
    description: 'Create a new Resend API key with optional permission scope.',
    policyActionId: 'crud_actions',
    api: { service: 'resend', method: 'POST', endpoint: '/api-keys' },
    fields: [
      { id: 'name', label: 'Key name', type: 'text', required: true, placeholder: 'Production key' },
      { id: 'permission', label: 'Permission', type: 'select', required: true, options: [
        { value: 'full_access', label: 'Full access' },
        { value: 'sending_access', label: 'Sending access only' },
      ]},
    ],
  },
  'resend.delete_api_key': {
    id: 'resend.delete_api_key', label: 'Delete API Key', icon: '🗑️',
    description: 'Permanently revoke a Resend API key.',
    policyActionId: 'rotate_secret_key',
    requiresConfirm: true,
    api: { service: 'resend', method: 'DELETE', endpoint: '/api-keys/{id}' },
    fields: [
      { id: 'keyId', label: 'API Key', type: 'remote_select', required: true,
        source: { action: 'resend.list_api_keys', dataPath: 'keys', valueKey: 'id', labelTemplate: '{name}' } },
    ],
  },

  // ── Audiences ──────────────────────────────────────────────────────────────
  'resend.list_audiences': {
    id: 'resend.list_audiences', label: 'List Audiences', icon: '👥',
    description: 'Contact audiences.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/audiences' },
    fields: [],
  },
  'resend.create_audience': {
    id: 'resend.create_audience', label: 'Create Audience', icon: '➕',
    description: 'Create a new contact audience.',
    policyActionId: 'crud_actions',
    api: { service: 'resend', method: 'POST', endpoint: '/audiences' },
    fields: [
      { id: 'name', label: 'Audience name', type: 'text', required: true, placeholder: 'Newsletter subscribers' },
    ],
  },
  'resend.delete_audience': {
    id: 'resend.delete_audience', label: 'Delete Audience', icon: '🗑️',
    description: 'Permanently delete an audience and all its contacts.',
    policyActionId: 'delete_provider_resource',
    requiresConfirm: true,
    api: { service: 'resend', method: 'DELETE', endpoint: '/audiences/{id}' },
    fields: [
      { id: 'audienceId', label: 'Audience', type: 'remote_select', required: true,
        source: { action: 'resend.list_audiences', dataPath: 'audiences', valueKey: 'id', labelTemplate: '{name}' } },
    ],
  },

  // ── Contacts ──────────────────────────────────────────────────────────────
  'resend.add_contact': {
    id: 'resend.add_contact', label: 'Add Contact', icon: '➕',
    description: 'Add a contact to an audience.',
    policyActionId: 'crud_actions',
    api: { service: 'resend', method: 'POST', endpoint: '/audiences/{audienceId}/contacts' },
    fields: [
      { id: 'audienceId', label: 'Audience', type: 'remote_select', required: true,
        source: { action: 'resend.list_audiences', dataPath: 'audiences', valueKey: 'id', labelTemplate: '{name}' } },
      { id: 'email', label: 'Email', type: 'email', required: true },
      { id: 'first_name', label: 'First name', type: 'text' },
      { id: 'last_name', label: 'Last name', type: 'text' },
    ],
  },
  'resend.delete_contact': {
    id: 'resend.delete_contact', label: 'Delete Contact', icon: '🗑️',
    description: 'Remove a contact from an audience by email.',
    policyActionId: 'crud_actions',
    requiresConfirm: true,
    api: { service: 'resend', method: 'DELETE', endpoint: '/audiences/{audienceId}/contacts' },
    fields: [
      { id: 'audienceId', label: 'Audience', type: 'remote_select', required: true,
        source: { action: 'resend.list_audiences', dataPath: 'audiences', valueKey: 'id', labelTemplate: '{name}' } },
      { id: 'email', label: 'Contact email', type: 'email', required: true },
    ],
  },

  // ── Broadcasts ──────────────────────────────────────────────────────────────
  'resend.list_broadcasts': {
    id: 'resend.list_broadcasts', label: 'List Broadcasts', icon: '📣',
    description: 'Recent broadcasts.',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/broadcasts' },
    fields: [],
  },

  // ── Send test email ────────────────────────────────────────────────────────
  'resend.send_test_email': {
    id: 'resend.send_test_email', label: 'Send Test Email', icon: '📤',
    description: 'Send a one-off test email to verify domain and deliverability.',
    policyActionId: 'send_sendgrid_email',
    api: { service: 'resend', method: 'POST', endpoint: '/emails' },
    fields: [
      { id: 'to', label: 'Recipient email', type: 'email', required: true },
      { id: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'SignalBoost test email' },
      { id: 'from_name', label: 'From name', type: 'text', placeholder: 'SaaSSignal Sales' },
    ],
  },
}
