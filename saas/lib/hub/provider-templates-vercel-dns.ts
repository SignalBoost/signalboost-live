// saas/lib/hub/provider-templates-vercel-dns.ts
// Vercel DNS records + propagation checker templates.

import type { ProviderTemplate } from './provider-templates'

export const VERCEL_DNS_TEMPLATES: Record<string, ProviderTemplate> = {
  'vercel.list_dns_records': {
    id: 'vercel.list_dns_records', label: 'List DNS Records', icon: '🌐',
    description: 'All DNS records for a domain managed by Vercel.',
    policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/v4/domains/{domain}/records' },
    fields: [{ id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' }],
  },
  'vercel.add_dns_record': {
    id: 'vercel.add_dns_record', label: 'Add DNS Record', icon: '➕',
    description: 'Add a DNS record (A, CNAME, MX, TXT, etc) to a Vercel-managed domain.',
    policyActionId: 'crud_actions',
    api: { service: 'vercel', method: 'POST', endpoint: '/v2/domains/{domain}/records' },
    fields: [
      { id: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'signalboostapp.com' },
      { id: 'type', label: 'Type', type: 'select', required: true, options: [
        { value: 'A', label: 'A' }, { value: 'AAAA', label: 'AAAA' },
        { value: 'CNAME', label: 'CNAME' }, { value: 'MX', label: 'MX' },
        { value: 'TXT', label: 'TXT' }, { value: 'NS', label: 'NS' },
      ]},
      { id: 'name', label: 'Name (blank for root, or subdomain)', type: 'text' },
      { id: 'value', label: 'Value', type: 'text', required: true },
      { id: 'ttl', label: 'TTL (seconds)', type: 'text' },
      { id: 'mxPriority', label: 'MX Priority (MX only)', type: 'text' },
    ],
  },
  'vercel.edit_dns_record': {
    id: 'vercel.edit_dns_record', label: 'Edit DNS Record', icon: '✏️',
    description: 'Update the value of an existing DNS record.',
    policyActionId: 'crud_actions',
    api: { service: 'vercel', method: 'PATCH', endpoint: '/v1/domains/records/{recordId}' },
    fields: [
      { id: 'recordId', label: 'Record ID', type: 'text', required: true },
      { id: 'value', label: 'New value', type: 'text', required: true },
    ],
  },
  'vercel.delete_dns_record': {
    id: 'vercel.delete_dns_record', label: 'Delete DNS Record', icon: '🗑️',
    description: 'Remove a DNS record from a Vercel-managed domain.',
    policyActionId: 'delete_provider_resource', requiresConfirm: true,
    api: { service: 'vercel', method: 'DELETE', endpoint: '/v2/domains/{domain}/records/{recordId}' },
    fields: [
      { id: 'domain', label: 'Domain', type: 'text', required: true },
      { id: 'recordId', label: 'Record ID', type: 'text', required: true },
    ],
  },
  'vercel.check_dns_propagation': {
    id: 'vercel.check_dns_propagation', label: 'Check DNS Propagation', icon: '🔎',
    description: 'Check whether a DNS record has propagated, using public DNS-over-HTTPS resolvers (Google + Cloudflare) — no need to leave the hub or use a third-party site.',
    policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/dns-over-https/resolve' },
    fields: [
      { id: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'resend._domainkey.signalboostapp.com' },
      { id: 'type', label: 'Record type', type: 'select', required: true, options: [
        { value: 'TXT', label: 'TXT' }, { value: 'MX', label: 'MX' }, { value: 'A', label: 'A' },
        { value: 'AAAA', label: 'AAAA' }, { value: 'CNAME', label: 'CNAME' }, { value: 'NS', label: 'NS' },
      ]},
      { id: 'expectedValue', label: 'Expected value (optional)', type: 'text' },
    ],
  },
}
