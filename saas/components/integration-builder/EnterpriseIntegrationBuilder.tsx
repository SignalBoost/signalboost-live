// saas/components/integration-builder/EnterpriseIntegrationBuilder.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import { useEffect, useMemo, useState } from 'react'
import IntegrationMetadataPanel from './IntegrationMetadataPanel.tsx'
import ProviderEndpointPanel from './ProviderEndpointPanel.tsx'
import ResponseMappingPanel from './ResponseMappingPanel.tsx'
import GovernancePanel from './GovernancePanel.tsx'
import JsonBlueprintPanel from './JsonBlueprintPanel.tsx'
import { mockApi, type Endpoint, type Option, type Provider, type ProviderSchema } from './mockApi.ts'
import { uiText } from '@/lib/i18n/uiText'

export default function EnterpriseIntegrationBuilder() {
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [tags, setTags] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<Option[]>([]); const [providers, setProviders] = useState<Provider[]>([]); const [providerId, setProviderId] = useState('')
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]); const [endpointId, setEndpointId] = useState(''); const [method, setMethod] = useState('')
  const [schema, setSchema] = useState<ProviderSchema>({ request: [], response: { response: {} } }); const [requestValues, setRequestValues] = useState<Record<string, unknown>>({}); const [mappings, setMappings] = useState<Record<string, string>>({})
  const [governance, setGovernance] = useState({ requires_approval: true, secrets_backend_only: true, supervisor_monitoring: true })
  useEffect(() => { mockApi.listTags().then(setTagOptions); mockApi.listProviders().then(setProviders) }, [])
  useEffect(() => { if (!providerId) return; setEndpointId(''); setMethod(''); setSchema({ request: [], response: { response: {} } }); setRequestValues({}); setMappings({}); mockApi.listEndpoints(providerId).then((items) => { setEndpoints(items); if (items[0]) { setEndpointId(items[0].id); setMethod(items[0].methods[0]) } }) }, [providerId])
  useEffect(() => { if (!providerId || !endpointId) return; const endpoint = endpoints.find((item) => item.id === endpointId); setMethod(endpoint?.methods[0] || ''); setRequestValues({}); setMappings({}); mockApi.getSchema(providerId, endpointId).then(setSchema) }, [providerId, endpointId, endpoints])
  const provider = providers.find((item) => item.id === providerId); const endpoint = endpoints.find((item) => item.id === endpointId)
  const blueprint = useMemo(() => ({ name, description, tags, provider_key: providerId, endpoint_template: endpoint?.path || endpointId, http_method: method, auth: { type: provider?.auth.type || '', credential_refs: provider ? { primary: `vault://${provider.id}/${provider.auth.type}/primary` } : {} }, request_template: requestValues, response_mapping: { output_paths: mappings }, governance }), [name, description, tags, providerId, endpoint, endpointId, method, provider, requestValues, mappings, governance])
  return <main style={{ maxWidth: 1500, margin: '0 auto', padding: '32px 18px 48px', display: 'grid', gap: 24 }}><header style={{ display: 'grid', gap: 8 }}><span className="sb-eyebrow">{uiText('generatedUi.u_45777240e0f04d78')}</span><h1 style={{ margin: 0, fontSize: 'clamp(30px, 4vw, 52px)', letterSpacing: '-.04em' }}><LocalizedText fallback={uiText('generatedUi.u_335f07df87d8f86a')} /></h1><p style={{ maxWidth: 980, margin: 0, color: 'rgba(255,255,255,.68)', fontSize: 16, lineHeight: 1.6 }}><LocalizedText fallback={uiText('generatedUi.u_e0e66eca6a92b341')} /></p></header><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}><IntegrationMetadataPanel name={name} description={description} tags={tags} providerId={providerId} tagOptions={tagOptions} providers={providers} onName={setName} onDescription={setDescription} onTags={setTags} onProvider={setProviderId} /><ProviderEndpointPanel provider={provider} endpoints={endpoints} endpointId={endpointId} method={method} requestFields={schema.request} requestValues={requestValues} onEndpoint={setEndpointId} onMethod={setMethod} onRequestValues={setRequestValues} /><div style={{ display: 'grid', gap: 24 }}><ResponseMappingPanel schema={schema.response} mappings={mappings} onMappings={setMappings} /><GovernancePanel governance={governance} onGovernance={setGovernance} /></div></div><JsonBlueprintPanel blueprint={blueprint} /></main>
}
