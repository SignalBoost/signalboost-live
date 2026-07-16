'use client'

import { useEffect, useMemo, useState } from 'react'
import GovernancePanel from './GovernancePanel'
import JsonBlueprint from './JsonBlueprint'
import JsonEditor from './JsonEditor'
import ProviderDropdown from './ProviderDropdown'
import ResponseMapper from './ResponseMapper'
import TagSelector from './TagSelector'

const parseJson = value => { try { return JSON.parse(value) } catch { return { _invalidJsonDraft: value } } }

function EndpointDropdown({ provider, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const endpoints = provider?.endpoints || []
  const selected = endpoints.find(endpoint => endpoint.url === value)
  const filtered = endpoints.filter(endpoint => `${endpoint.url} ${endpoint.example}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="relative"><label className="grid gap-2 text-sm font-bold text-slate-200">Endpoint<input disabled={!provider} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-50" value={open ? query : selected?.url || ''} onFocus={() => { setOpen(true); setQuery('') }} onChange={event => { setQuery(event.target.value); setOpen(true) }} placeholder={provider ? 'Search absolute endpoint templates' : 'Select provider first'} /></label>{open && provider && <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl">{filtered.map(endpoint => <button key={endpoint.id} type="button" onClick={() => { onChange(endpoint.url); setOpen(false) }} className="w-full rounded-xl px-3 py-3 text-left text-slate-100 hover:bg-cyan-400/10"><span className="block break-all font-mono text-sm text-cyan-100">{endpoint.url}</span><span className="text-xs text-slate-400">Example: {endpoint.example}</span></button>)}{!filtered.length && <p className="px-3 py-4 text-sm text-slate-400">No endpoints found.</p>}</div>}</div>
}

function AuthFields({ provider, value, onChange }) {
  const schema = provider?.authSchema || []
  if (!provider) return <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">Choose a provider to auto-populate authentication fields.</div>
  return <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-center justify-between"><h3 className="font-black text-white">Authentication</h3><span className="text-xs text-slate-400" title="Values are represented as backend-only references in the blueprint.">Secrets never leave backend</span></div>{schema.map(field => field.type === 'oauth' ? <button key={field.key} type="button" onClick={() => onChange({ ...value, [field.key]: 'oauth_connection_ref' })} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-3 font-bold text-cyan-100">Connect {provider.name} OAuth</button> : <label key={field.key} className="grid gap-2 text-sm font-bold text-slate-200">{field.label}<input type="text" className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none" value={value[field.key] || ''} onChange={event => onChange({ ...value, [field.key]: event.target.value })} placeholder={`${field.label} credential reference`} /></label>)}</div>
}

export default function ToolBuilder() {
  const [name, setName] = useState('Customer enrichment workflow')
  const [description, setDescription] = useState('Governed integration blueprint with backend-only secrets, endpoint metadata, and supervisor monitoring.')
  const [tags, setTags] = useState(['governed'])
  const [provider, setProvider] = useState(null)
  const [auth, setAuth] = useState({})
  const [method, setMethod] = useState('POST')
  const [endpoint, setEndpoint] = useState('')
  const [requestBody, setRequestBody] = useState(`{\n  "customerId": "{{input.customerId}}"\n}`)
  const [responseMapping, setResponseMapping] = useState({ source: 'response.data.id', target: 'integration.output.userId' })
  const [governance, setGovernance] = useState({ supervisorMonitoring: true })
  const [logsOpen, setLogsOpen] = useState(false)
  const [testStatus, setTestStatus] = useState('Ready')

  useEffect(() => {
    if (provider) {
      setAuth({})
      setMethod(provider.methods[0])
      setEndpoint(provider.endpoints[0]?.url || '')
    }
  }, [provider])

  const blueprint = useMemo(() => ({
    name,
    description,
    tags,
    provider_key: provider?.id || null,
    endpoint_template: endpoint,
    http_method: method,
    auth: {
      type: provider?.authSchema?.[0]?.type === 'oauth' ? 'oauth' : 'bearer',
      credential_refs: Object.fromEntries(Object.entries(auth).map(([key, value]) => [key, value || `${provider?.id || 'provider'}_${key}`])),
    },
    request_template: parseJson(requestBody),
    response_mapping: {
      output_paths: responseMapping.target && responseMapping.source
        ? { [responseMapping.target]: responseMapping.source }
        : {},
    },
    governance: {
      requires_approval: method !== 'GET',
      secrets_backend_only: true,
      supervisor_monitoring: governance.supervisorMonitoring,
    },
  }), [name, description, tags, provider, auth, endpoint, method, requestBody, responseMapping, governance])

  async function testIntegration() {
    setTestStatus('Calling /integration/test with current config…')
    await new Promise(resolve => setTimeout(resolve, 500))
    setTestStatus('Mock test passed — replace placeholder with POST /integration/test.')
  }

  return <main className="min-h-full px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto grid max-w-[1600px] gap-6"><header className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl"><p className="text-xs font-black uppercase tracking-[.22em] text-amber-200">Integrations</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Enterprise Integration Builder</h1><p className="mt-3 max-w-3xl text-slate-300">Build provider-backed, approval-aware integration blueprints with searchable metadata, dynamic provider schemas, no-code endpoint selection, and a live JSON compiler.</p></header>

    <section className="grid gap-6 xl:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl"><h2 className="mb-5 text-xl font-black">Integration Metadata</h2><div className="grid gap-5"><label className="grid gap-2 text-sm font-bold text-slate-200">Integration Name<input className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 focus:ring-2" value={name} onChange={event => setName(event.target.value)} /></label><label className="grid gap-2 text-sm font-bold text-slate-200">Description<textarea className="min-h-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 focus:ring-2" value={description} onChange={event => setDescription(event.target.value)} /></label><TagSelector value={tags} onChange={setTags} /><ProviderDropdown value={provider?.id || ''} onChange={setProvider} /><AuthFields provider={provider} value={auth} onChange={setAuth} /></div></div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl"><h2 className="mb-5 text-xl font-black">Endpoint & Request</h2><div className="grid gap-5"><label className="grid gap-2 text-sm font-bold text-slate-200">HTTP Method<select disabled={!provider} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white disabled:opacity-50" value={method} onChange={event => setMethod(event.target.value)}>{(provider?.methods || ['POST']).map(item => <option key={item}>{item}</option>)}</select></label><EndpointDropdown provider={provider} value={endpoint} onChange={setEndpoint} /><JsonEditor value={requestBody} onChange={setRequestBody} variables={provider?.variables || []} /><ResponseMapper value={responseMapping} onChange={setResponseMapping} /></div></div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl"><h2 className="mb-5 text-xl font-black">Governance & Supervisor</h2><GovernancePanel value={governance} onChange={setGovernance} onTest={testIntegration} onLogs={() => setLogsOpen(true)} /><p className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-sm text-slate-300">{testStatus}</p></div>
    </section>

    <JsonBlueprint blueprint={blueprint} />

    {logsOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black">Recent Logs</h2><button type="button" onClick={() => setLogsOpen(false)} className="rounded-xl border border-white/10 px-3 py-2 font-bold text-slate-200">Close</button></div><div className="grid gap-3 text-sm text-slate-300"><p>• Loaded provider metadata from the current provider catalog.</p><p>• Endpoint schema synchronized after provider selection.</p><p>• Test action queued for placeholder /integration/test.</p></div></div></div>}
  </div></main>
}
