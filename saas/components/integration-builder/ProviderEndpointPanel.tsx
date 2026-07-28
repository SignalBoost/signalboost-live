// saas/components/integration-builder/ProviderEndpointPanel.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import SearchableDropdown from './SearchableDropdown.tsx'
import RequestFormBuilder from './RequestFormBuilder.tsx'
import type { Endpoint, Provider, SchemaField } from './mockApi.ts'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'

export default function ProviderEndpointPanel({ provider, endpoints, endpointId, method, requestFields, requestValues, onEndpoint, onMethod, onRequestValues }: { provider?: Provider; endpoints: Endpoint[]; endpointId: string; method: string; requestFields: SchemaField[]; requestValues: Record<string, unknown>; onEndpoint: (v: string) => void; onMethod: (v: string) => void; onRequestValues: (v: Record<string, unknown>) => void }) {
  const endpoint = endpoints.find((item) => item.id === endpointId)
  return <section className="sb-glass-panel" style={{ padding: 18, display: 'grid', gap: 18 }}><h2 style={{ margin: 0, fontSize: 18 }}>{uiCopy('u_db423b958389e9c8')}</h2><div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}><h3 style={{ margin: 0, fontSize: 15 }}>{uiCopy('u_9b99c2b19790a087')}</h3>{!provider && <p style={{ margin: 0, color: 'rgba(255,255,255,.55)' }}><LocalizedText fallback={uiCopy('u_83f34b0c71aa28dd')} /></p>}{provider?.auth.type === 'oauth' && <code style={masked}>{provider.name}</code>}{provider?.auth.type === 'apiKey' && <code style={masked}>{uiCopy('u_3abb1fcac6bee2bb')}</code>}{provider?.auth.type === 'bearer' && <code style={masked}>{uiCopy('u_5685ee2d65e4cec1')}</code>}</div><SearchableDropdown label={uiCopy('u_c15cd50f3ca9d0c6')} options={endpoints.map((e) => ({ id: e.id, label: e.name, description: e.description }))} value={endpointId} onChange={(v) => onEndpoint(v as string)} placeholder={uiCopy('u_5926d6ea09f926c1')} /><label style={{ display: 'grid', gap: 7, color: '#fff', fontWeight: 850, fontSize: 13 }}><LocalizedText fallback={uiCopy('u_965cca9b4953b083')} /><select value={method} onChange={(e) => onMethod(e.target.value)} disabled={!endpoint} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: '#020617', color: '#fff', padding: 11 }}>{(endpoint?.methods || []).map((m) => <option key={m} value={m}>{m}</option>)}</select></label><div style={{ display: 'grid', gap: 10 }}><h3 style={{ margin: 0, fontSize: 15 }}>{uiCopy('u_19c6b52ea4bef72f')}</h3><RequestFormBuilder fields={requestFields} values={requestValues} onChange={onRequestValues} /></div></section>
}
const masked = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, background: 'rgba(2,6,23,.78)', color: 'rgba(255,255,255,.72)', padding: 12 }
