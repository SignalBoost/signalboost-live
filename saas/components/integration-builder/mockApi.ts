export type Option = { id: string; label: string; description?: string; icon?: string; value?: string }
export type AuthType = 'oauth' | 'apiKey' | 'bearer'
export type Provider = { id: string; name: string; icon: string; description: string; auth: { type: AuthType; label: string } }
export type Endpoint = { id: string; name: string; path: string; description: string; methods: string[] }
export type SchemaField = { key: string; label: string; type: 'variable' | 'select' | 'toggle' | 'text'; required?: boolean; options?: Option[]; placeholder?: string }
export type ProviderSchema = { request: SchemaField[]; response: Record<string, unknown> }

const tags: Option[] = [
  { id: 'customer-data', label: 'Customer data', description: 'Identity and profile syncs.' },
  { id: 'approval-aware', label: 'Approval aware', description: 'Routes sensitive actions through review.' },
  { id: 'growth-ops', label: 'Growth ops', description: 'Marketing and lifecycle automations.' },
  { id: 'finance', label: 'Finance', description: 'Billing, invoices, and account state.' },
]

const providers: Provider[] = [
  { id: 'stripe', name: 'Stripe', icon: '💳', description: 'Billing, customer, and subscription workflows.', auth: { type: 'bearer', label: 'Restricted API token' } },
  { id: 'hubspot', name: 'HubSpot', icon: '🟠', description: 'CRM contacts, companies, and lifecycle data.', auth: { type: 'oauth', label: 'OAuth workspace connection' } },
  { id: 'supabase', name: 'Supabase', icon: '⚡', description: 'Database-backed application operations.', auth: { type: 'apiKey', label: 'Service role credential reference' } },
]

const endpoints: Record<string, Endpoint[]> = {
  stripe: [
    { id: 'customers-create', name: 'Create customer', path: '/v1/customers', description: 'Create a Stripe customer from approved profile data.', methods: ['POST'] },
    { id: 'customers-retrieve', name: 'Retrieve customer', path: '/v1/customers/{customer}', description: 'Read customer identity and billing state.', methods: ['GET'] },
  ],
  hubspot: [
    { id: 'contacts-upsert', name: 'Upsert contact', path: '/crm/v3/objects/contacts', description: 'Create or update a CRM contact.', methods: ['POST'] },
    { id: 'contacts-search', name: 'Search contacts', path: '/crm/v3/objects/contacts/search', description: 'Find contacts using safe predefined properties.', methods: ['POST'] },
  ],
  supabase: [
    { id: 'profiles-select', name: 'Select profile', path: '/rest/v1/profiles', description: 'Read a governed profile row.', methods: ['GET'] },
    { id: 'events-insert', name: 'Insert audit event', path: '/rest/v1/audit_events', description: 'Append an integration audit event.', methods: ['POST'] },
  ],
}

const schemas: Record<string, Record<string, ProviderSchema>> = {
  stripe: {
    'customers-create': {
      request: [
        { key: 'email', label: 'Customer email', type: 'variable', required: true },
        { key: 'name', label: 'Display name', type: 'variable' },
        { key: 'metadata.project_id', label: 'Project metadata', type: 'variable' },
      ],
      response: { response: { id: 'cus_123', email: 'customer@example.com', created: 1710000000, metadata: { project_id: 'proj_123' } } },
    },
    'customers-retrieve': {
      request: [{ key: 'customer', label: 'Customer ID', type: 'variable', required: true }],
      response: { response: { id: 'cus_123', email: 'customer@example.com', subscriptions: { total_count: 1 } } },
    },
  },
  hubspot: {
    'contacts-upsert': {
      request: [
        { key: 'properties.email', label: 'Email', type: 'variable', required: true },
        { key: 'properties.lifecycle_stage', label: 'Lifecycle stage', type: 'select', options: [{ id: 'lead', label: 'Lead' }, { id: 'customer', label: 'Customer' }] },
        { key: 'properties.marketing_opt_in', label: 'Marketing opt-in', type: 'toggle' },
      ],
      response: { response: { id: '901', properties: { email: 'customer@example.com', createdate: '2026-07-16T12:00:00Z' } } },
    },
    'contacts-search': {
      request: [{ key: 'filterGroups.email', label: 'Email filter', type: 'variable', required: true }],
      response: { response: { total: 1, results: [{ id: '901', properties: { email: 'customer@example.com' } }] } },
    },
  },
  supabase: {
    'profiles-select': {
      request: [{ key: 'id', label: 'Profile ID', type: 'variable', required: true }],
      response: { response: { data: { id: 'profile_123', email: 'customer@example.com', createdAt: '2026-07-16T12:00:00Z' } } },
    },
    'events-insert': {
      request: [
        { key: 'actor_id', label: 'Actor ID', type: 'variable' },
        { key: 'event_type', label: 'Event type', type: 'select', options: [{ id: 'integration_tested', label: 'Integration tested' }, { id: 'blueprint_compiled', label: 'Blueprint compiled' }] },
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
