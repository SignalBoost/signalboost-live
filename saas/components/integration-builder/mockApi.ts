import { uiCopy } from '@/lib/i18n/generatedUiCopy'
export type Option = { id: string; label: string; description?: string; icon?: string; value?: string }
export type AuthType = 'oauth' | 'apiKey' | 'bearer'
export type Provider = { id: string; name: string; icon: string; description: string; auth: { type: AuthType; label: string } }
export type Endpoint = { id: string; name: string; path: string; description: string; methods: string[] }
export type SchemaField = { key: string; label: string; type: 'variable' | 'select' | 'toggle' | 'text'; required?: boolean; options?: Option[]; placeholder?: string }
export type ProviderSchema = { request: SchemaField[]; response: Record<string, unknown> }

const tags: Option[] = [
  { id: 'customer-data', label: uiCopy('u_ee056aa38eb6c665'), description: uiCopy('u_cdff9d3646ba4d71') },
  { id: 'approval-aware', label: uiCopy('u_7a9bd48eea529cc8'), description: uiCopy('u_2710f0fabc3eba5e') },
  { id: 'growth-ops', label: uiCopy('u_73693c5021e5c8fb'), description: uiCopy('u_668b3c77b7b3ff15') },
  { id: 'finance', label: uiCopy('u_735b95835978ec85'), description: uiCopy('u_85dfb0d04dc0e7d4') },
]

const providers: Provider[] = [
  { id: 'stripe', name: 'Stripe', icon: '💳', description: uiCopy('u_fea1cb8dedf8acbd'), auth: { type: 'bearer', label: uiCopy('u_8f69dc836c640968') } },
  { id: 'hubspot', name: 'HubSpot', icon: '🟠', description: uiCopy('u_b53f21717066da44'), auth: { type: 'oauth', label: uiCopy('u_b39024735f960456') } },
  { id: 'supabase', name: 'Supabase', icon: '⚡', description: uiCopy('u_82f8537bdef3e81c'), auth: { type: 'apiKey', label: uiCopy('u_1db6de14c2af733b') } },
]

const endpoints: Record<string, Endpoint[]> = {
  stripe: [
    { id: 'customers-create', name: 'Create customer', path: '/v1/customers', description: uiCopy('u_a06b95835afcc572'), methods: ['POST'] },
    { id: 'customers-retrieve', name: 'Retrieve customer', path: '/v1/customers/{customer}', description: uiCopy('u_039b88c4b5627461'), methods: ['GET'] },
  ],
  hubspot: [
    { id: 'contacts-upsert', name: 'Upsert contact', path: '/crm/v3/objects/contacts', description: uiCopy('u_2bd5c66c76b5bc87'), methods: ['POST'] },
    { id: 'contacts-search', name: 'Search contacts', path: '/crm/v3/objects/contacts/search', description: uiCopy('u_079e8bda3e7ebdcd'), methods: ['POST'] },
  ],
  supabase: [
    { id: 'profiles-select', name: 'Select profile', path: '/rest/v1/profiles', description: uiCopy('u_fce07c7e267687a1'), methods: ['GET'] },
    { id: 'events-insert', name: 'Insert audit event', path: '/rest/v1/audit_events', description: uiCopy('u_8f97510470bf0263'), methods: ['POST'] },
  ],
}

const schemas: Record<string, Record<string, ProviderSchema>> = {
  stripe: {
    'customers-create': {
      request: [
        { key: 'email', label: uiCopy('u_85117f1465181894'), type: 'variable', required: true },
        { key: 'name', label: uiCopy('u_f121426f30fe88ee'), type: 'variable' },
        { key: 'metadata.project_id', label: uiCopy('u_f3a426e3e64c9ccc'), type: 'variable' },
      ],
      response: { response: { id: 'cus_123', email: 'customer@example.com', created: 1710000000, metadata: { project_id: 'proj_123' } } },
    },
    'customers-retrieve': {
      request: [{ key: 'customer', label: uiCopy('u_710fe107f264c558'), type: 'variable', required: true }],
      response: { response: { id: 'cus_123', email: 'customer@example.com', subscriptions: { total_count: 1 } } },
    },
  },
  hubspot: {
    'contacts-upsert': {
      request: [
        { key: 'properties.email', label: uiCopy('u_454a40d960db76a4'), type: 'variable', required: true },
        { key: 'properties.lifecycle_stage', label: uiCopy('u_b54da001fa889ffd'), type: 'select', options: [{ id: 'lead', label: uiCopy('u_752064acc88ce57d') }, { id: 'customer', label: uiCopy('u_f73385fa99175048') }] },
        { key: 'properties.marketing_opt_in', label: uiCopy('u_b0a754da633d3db1'), type: 'toggle' },
      ],
      response: { response: { id: '901', properties: { email: 'customer@example.com', createdate: '2026-07-16T12:00:00Z' } } },
    },
    'contacts-search': {
      request: [{ key: 'filterGroups.email', label: uiCopy('u_cbd02834d52b03ec'), type: 'variable', required: true }],
      response: { response: { total: 1, results: [{ id: '901', properties: { email: 'customer@example.com' } }] } },
    },
  },
  supabase: {
    'profiles-select': {
      request: [{ key: 'id', label: uiCopy('u_f2c56537cc589b58'), type: 'variable', required: true }],
      response: { response: { data: { id: 'profile_123', email: 'customer@example.com', createdAt: '2026-07-16T12:00:00Z' } } },
    },
    'events-insert': {
      request: [
        { key: 'actor_id', label: uiCopy('u_a279c8d356d21997'), type: 'variable' },
        { key: 'event_type', label: uiCopy('u_c043ef104473f0c3'), type: 'select', options: [{ id: 'integration_tested', label: uiCopy('u_8fef30b748a58fa2') }, { id: 'blueprint_compiled', label: uiCopy('u_bc9dfa06ce6f4ae0') }] },
      ],
      response: { response: { data: { id: 'evt_123', status: 'queued', createdAt: '2026-07-16T12:00:00Z' } } },
    },
  },
}

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 300))
export const mockApi = {
  listTags: () => delay(tags),
  listProviders: () => delay(providers),
  listEndpoints: (providerId: string) => delay(endpoints[providerId] || []),
  getSchema: (providerId: string, endpointId: string) => delay(schemas[providerId]?.[endpointId] || { request: [], response: { response: {} } }),
  testIntegration: () => delay({ ok: true, logs: ['Blueprint compiled without editable JSON.', 'Credential references resolved as backend-only aliases.', 'Supervisor test telemetry queued.'] }),
}
