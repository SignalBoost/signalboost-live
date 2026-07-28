import { uiText } from '@/lib/i18n/uiText'
export type Option = { id: string; label: string; description?: string; icon?: string; value?: string }
export type AuthType = 'oauth' | 'apiKey' | 'bearer'
export type Provider = { id: string; name: string; icon: string; description: string; auth: { type: AuthType; label: string } }
export type Endpoint = { id: string; name: string; path: string; description: string; methods: string[] }
export type SchemaField = { key: string; label: string; type: 'variable' | 'select' | 'toggle' | 'text'; required?: boolean; options?: Option[]; placeholder?: string }
export type ProviderSchema = { request: SchemaField[]; response: Record<string, unknown> }

const tags: Option[] = [
  { id: 'customer-data', label: uiText('generatedUi.u_91d3d9beb7148fdc'), description: uiText('generatedUi.u_b420f89c272192c5') },
  { id: 'approval-aware', label: uiText('generatedUi.u_bebab5ab6655b7fa'), description: uiText('generatedUi.u_ed0af7c742365767') },
  { id: 'growth-ops', label: uiText('generatedUi.u_5129bede8b8a9009'), description: uiText('generatedUi.u_6f0aec183b956299') },
  { id: 'finance', label: uiText('generatedUi.u_b696d75511dc16f2'), description: uiText('generatedUi.u_67fa1209d4d8a43f') },
]

const providers: Provider[] = [
  { id: 'stripe', name: 'Stripe', icon: '💳', description: uiText('generatedUi.u_146935d808f020d7'), auth: { type: 'bearer', label: uiText('generatedUi.u_087f346781812df5') } },
  { id: 'hubspot', name: 'HubSpot', icon: '🟠', description: uiText('generatedUi.u_5154e0b306a5cc04'), auth: { type: 'oauth', label: uiText('generatedUi.u_ec26efed420d6947') } },
  { id: 'supabase', name: 'Supabase', icon: '⚡', description: uiText('generatedUi.u_f12af46af0e2ddb4'), auth: { type: 'apiKey', label: uiText('generatedUi.u_18feee94fcb5d968') } },
]

const endpoints: Record<string, Endpoint[]> = {
  stripe: [
    { id: 'customers-create', name: 'Create customer', path: '/v1/customers', description: uiText('generatedUi.u_0d2b272d2d64cb79'), methods: ['POST'] },
    { id: 'customers-retrieve', name: 'Retrieve customer', path: '/v1/customers/{customer}', description: uiText('generatedUi.u_314fe6887515bb67'), methods: ['GET'] },
  ],
  hubspot: [
    { id: 'contacts-upsert', name: 'Upsert contact', path: '/crm/v3/objects/contacts', description: uiText('generatedUi.u_acf1cc4d0f057038'), methods: ['POST'] },
    { id: 'contacts-search', name: 'Search contacts', path: '/crm/v3/objects/contacts/search', description: uiText('generatedUi.u_8a4c85c3a6b4acfe'), methods: ['POST'] },
  ],
  supabase: [
    { id: 'profiles-select', name: 'Select profile', path: '/rest/v1/profiles', description: uiText('generatedUi.u_d6986aaffd4dda27'), methods: ['GET'] },
    { id: 'events-insert', name: 'Insert audit event', path: '/rest/v1/audit_events', description: uiText('generatedUi.u_3f0da33109b96ecb'), methods: ['POST'] },
  ],
}

const schemas: Record<string, Record<string, ProviderSchema>> = {
  stripe: {
    'customers-create': {
      request: [
        { key: 'email', label: uiText('generatedUi.u_fb326abd8a993105'), type: 'variable', required: true },
        { key: 'name', label: uiText('generatedUi.u_2b7f6a84de917e38'), type: 'variable' },
        { key: 'metadata.project_id', label: uiText('generatedUi.u_818043d95e7e5728'), type: 'variable' },
      ],
      response: { response: { id: 'cus_123', email: 'customer@example.com', created: 1710000000, metadata: { project_id: 'proj_123' } } },
    },
    'customers-retrieve': {
      request: [{ key: 'customer', label: uiText('generatedUi.u_62566c648cebabc3'), type: 'variable', required: true }],
      response: { response: { id: 'cus_123', email: 'customer@example.com', subscriptions: { total_count: 1 } } },
    },
  },
  hubspot: {
    'contacts-upsert': {
      request: [
        { key: 'properties.email', label: uiText('generatedUi.u_969ccbd3cf6300ec'), type: 'variable', required: true },
        { key: 'properties.lifecycle_stage', label: uiText('generatedUi.u_9ccd3de956d1de7d'), type: 'select', options: [{ id: 'lead', label: uiText('generatedUi.u_645978287991a6f4') }, { id: 'customer', label: uiText('generatedUi.u_bf3763383aaf4306') }] },
        { key: 'properties.marketing_opt_in', label: uiText('generatedUi.u_60871df8c7ad8dcc'), type: 'toggle' },
      ],
      response: { response: { id: '901', properties: { email: 'customer@example.com', createdate: '2026-07-16T12:00:00Z' } } },
    },
    'contacts-search': {
      request: [{ key: 'filterGroups.email', label: uiText('generatedUi.u_144bfe10f8a6adcb'), type: 'variable', required: true }],
      response: { response: { total: 1, results: [{ id: '901', properties: { email: 'customer@example.com' } }] } },
    },
  },
  supabase: {
    'profiles-select': {
      request: [{ key: 'id', label: uiText('generatedUi.u_e1093e7ec2ce4a3d'), type: 'variable', required: true }],
      response: { response: { data: { id: 'profile_123', email: 'customer@example.com', createdAt: '2026-07-16T12:00:00Z' } } },
    },
    'events-insert': {
      request: [
        { key: 'actor_id', label: uiText('generatedUi.u_ecbb48b41cda8303'), type: 'variable' },
        { key: 'event_type', label: uiText('generatedUi.u_70d81703598192c7'), type: 'select', options: [{ id: 'integration_tested', label: uiText('generatedUi.u_65b2e3853ada9116') }, { id: 'blueprint_compiled', label: uiText('generatedUi.u_23c737e4d1ec630f') }] },
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
