import { LIVE_PROVIDER_IDS, type ConsoleProvider } from '@/lib/hub/console-catalog'
import { PROVIDER_TEMPLATES, type ProviderTemplate } from '@/lib/hub/provider-templates'

export const IMPROVMX_PROVIDER: ConsoleProvider = {
  id: 'improvmx',
  name: 'ImprovMX',
  subtitle: 'EMAIL FORWARDING',
  accent: '#18a999',
  tier: 'tier2',
  sections: [
    { title: 'Domains', templateIds: ['improvmx.list_domains', 'improvmx.get_domain'] },
    { title: 'Aliases', templateIds: ['improvmx.list_aliases', 'improvmx.create_alias', 'improvmx.update_alias', 'improvmx.delete_alias'] },
  ],
}

LIVE_PROVIDER_IDS.add('improvmx')

const domainPicker = {
  id: 'domain',
  label: 'Domain',
  type: 'remote_select' as const,
  required: true,
  source: {
    action: 'improvmx.list_domains',
    dataPath: 'domains',
    valueKey: 'domain',
    labelTemplate: '{domain} — {status}',
    emptyHint: 'No ImprovMX domains were returned.',
  },
}

const templates: Record<string, ProviderTemplate> = {
  'improvmx.list_domains': {
    id: 'improvmx.list_domains', label: 'List Domains', description: 'Load live ImprovMX domains and forwarding status.', icon: '🌐',
    policyActionId: 'read_provider_status', api: { service: 'improvmx', method: 'GET', endpoint: '/domains' }, fields: [],
  },
  'improvmx.get_domain': {
    id: 'improvmx.get_domain', label: 'Domain Status', description: 'Inspect live forwarding and DNS status for an ImprovMX domain.', icon: '🔎',
    policyActionId: 'read_provider_status', api: { service: 'improvmx', method: 'GET', endpoint: '/domains/{domain}' }, fields: [domainPicker],
  },
  'improvmx.list_aliases': {
    id: 'improvmx.list_aliases', label: 'List Aliases', description: 'Load all live forwarding aliases for a domain.', icon: '📬',
    policyActionId: 'read_provider_status', api: { service: 'improvmx', method: 'GET', endpoint: '/domains/{domain}/aliases' }, fields: [domainPicker],
  },
  'improvmx.create_alias': {
    id: 'improvmx.create_alias', label: 'Create Alias', description: 'Create a new forwarding address on an existing ImprovMX domain.', icon: '➕',
    policyActionId: 'crud_actions', previewBeforeSubmit: true, api: { service: 'improvmx', method: 'POST', endpoint: '/domains/{domain}/aliases' },
    fields: [domainPicker, { id: 'alias', label: 'New alias', type: 'text', required: true, placeholder: 'saaspartners' }, { id: 'forward', label: 'Forward to', type: 'email', required: true, placeholder: 'owner@example.com' }],
  },
  'improvmx.update_alias': {
    id: 'improvmx.update_alias', label: 'Update Alias', description: 'Change the forwarding destination for an existing alias.', icon: '✏️',
    policyActionId: 'crud_actions', previewBeforeSubmit: true, api: { service: 'improvmx', method: 'PUT', endpoint: '/domains/{domain}/aliases/{alias}' },
    fields: [domainPicker, { id: 'alias', label: 'Alias', type: 'remote_select', required: true, source: { action: 'improvmx.list_aliases', dataPath: 'aliases', valueKey: 'alias', labelTemplate: '{alias} → {forward}', dependsOn: ['domain'], emptyHint: 'Select a domain first.' } }, { id: 'forward', label: 'New forwarding email', type: 'email', required: true }],
  },
  'improvmx.delete_alias': {
    id: 'improvmx.delete_alias', label: 'Delete Alias', description: 'Permanently remove an existing forwarding alias.', icon: '🗑️',
    policyActionId: 'delete_provider_resource', requiresConfirm: true, api: { service: 'improvmx', method: 'DELETE', endpoint: '/domains/{domain}/aliases/{alias}' },
    fields: [domainPicker, { id: 'alias', label: 'Alias', type: 'remote_select', required: true, source: { action: 'improvmx.list_aliases', dataPath: 'aliases', valueKey: 'alias', labelTemplate: '{alias} → {forward}', dependsOn: ['domain'], emptyHint: 'Select a domain first.' } }],
  },
}

Object.assign(PROVIDER_TEMPLATES, templates)
