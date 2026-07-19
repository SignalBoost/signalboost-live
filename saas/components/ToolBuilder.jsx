'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useCallback, useEffect, useMemo, useState } from 'react'
import GovernancePanel from './GovernancePanel'
import JsonBlueprint from './JsonBlueprint'
import JsonEditor from './JsonEditor'
import ProviderDropdown from './ProviderDropdown'
import ResponseMapper from './ResponseMapper'
import TagSelector from './TagSelector'

const parseJson = value => { try { return JSON.parse(value) } catch { return { _invalidJsonDraft: value } } }

function normalizeProviders(payload) {
  const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.providers) ? payload.providers : []
  return raw.filter(provider => provider && typeof provider.id === 'string' && typeof provider.name === 'string')
}

function EndpointField({ provider, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const endpoints = provider?.endpoints || []
  const filtered = endpoints.filter(endpoint => {
    const needle = query.trim().toLowerCase()
    return !needle || `${endpoint.url} ${endpoint.example}`.toLowerCase().includes(needle)
  })

  return (
    <div className="relative">
      <label className="grid gap-2 text-sm font-bold text-slate-200"><LocalizedText fallback={"Endpoint Template"} /><input
          disabled={!provider}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 font-mono text-sm text-white outline-none ring-cyan-300/40 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={value}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onChange={event => {
            const nextValue = event.target.value
            onChange(nextValue)
            setQuery(nextValue)
            setOpen(true)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false)
          }}
          placeholder={provider ? 'Provider endpoint template' : 'Select provider first'}
        />
      </label>

      {open && provider && (
        <div role="listbox" className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl">
          {filtered.map(endpointOption => (
            <button
              key={endpointOption.id}
              type="button"
              role="option"
              aria-selected={endpointOption.url === value}
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(endpointOption.url)
                setQuery('')
                setOpen(false)
              }}
              className="w-full rounded-xl px-3 py-3 text-left text-slate-100 hover:bg-cyan-400/10"
            >
              <span className="block break-all font-mono text-sm text-cyan-100">{endpointOption.url}</span>
              <span className="text-xs text-slate-400">{endpointOption.example}</span>
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-4 text-sm text-slate-400"><LocalizedText fallback={"No matching provider endpoints. You may keep your manual override."} /></p>}
        </div>
      )}
    </div>
  )
}

function AuthFields({ provider, value, onChange }) {
  const schema = provider?.authSchema || []
  if (!provider) return <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400"><LocalizedText fallback={"Choose a provider to load its authentication configuration."} /></div>

  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-white">Authentication</h3>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-bold uppercase text-cyan-100">{provider.authType}</span>
      </div>
      {schema.map(field => field.type === 'oauth_ref' ? (
        <button
          key={field.key}
          type="button"
          onClick={() => onChange({ ...value, [field.key]: `${provider.id}_oauth_connection` })}
          className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-3 font-bold text-cyan-100"
        >
          Use configured {provider.name} OAuth connection
        </button>
      ) : (
        <label key={field.key} className="grid gap-2 text-sm font-bold text-slate-200">
          {field.label}
          <input
            type="text"
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none"
            value={value[field.key] || ''}
            onChange={event => onChange({ ...value, [field.key]: event.target.value })}
            placeholder={`${provider.id}_${field.key}`}
          />
        </label>
      ))}
    </div>
  )
}

export default function ToolBuilder() {
  const [providers, setProviders] = useState([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providersError, setProvidersError] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [name, setName] = useState('Customer enrichment workflow')
  const [description, setDescription] = useState('Governed integration blueprint with backend-only secrets, endpoint metadata, and supervisor monitoring.')
  const [tags, setTags] = useState([])
  const [auth, setAuth] = useState({})
  const [method, setMethod] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [requestBody, setRequestBody] = useState(`{\n  "customerId": "{{input.customerId}}"\n}`)
  const [responseMapping, setResponseMapping] = useState({ source: 'response.data.id', target: 'integration.output.userId' })
  const [governance, setGovernance] = useState({ supervisorMonitoring: true })
  const [logsOpen, setLogsOpen] = useState(false)
  const [testStatus, setTestStatus] = useState('Ready')

  const provider = useMemo(
    () => providers.find(item => item.id === selectedProviderId) || null,
    [providers, selectedProviderId],
  )

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true)
    setProvidersError('')

    try {
      const response = await fetch('/api/providers', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Provider lookup failed (${response.status})`)

      const nextProviders = normalizeProviders(await response.json())
      if (!nextProviders.length) throw new Error('Provider catalog is empty')

      setProviders(nextProviders)
      setSelectedProviderId(current => nextProviders.some(item => item.id === current) ? current : '')
    } catch (error) {
      setProviders([])
      setSelectedProviderId('')
      setProvidersError(error instanceof Error ? error.message : 'Provider catalog is unavailable')
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  function handleProviderChange(nextProvider) {
    if (!nextProvider) {
      setSelectedProviderId('')
      setAuth({})
      setMethod('')
      setEndpoint('')
      return
    }

    const canonicalProvider = providers.find(item => item.id === nextProvider.id)
    if (!canonicalProvider) return

    const nextMethod = canonicalProvider.defaultMethod || canonicalProvider.methods?.[0] || 'GET'
    const nextEndpoint = canonicalProvider.defaultEndpoint || canonicalProvider.endpoints?.[0]?.url || ''
    const nextAuth = Object.fromEntries(
      (canonicalProvider.authSchema || []).map(field => [
        field.key,
        field.type === 'oauth_ref'
          ? `${canonicalProvider.id}_oauth_connection`
          : `${canonicalProvider.id}_${field.key}`,
      ]),
    )

    setSelectedProviderId(canonicalProvider.id)
    setMethod(nextMethod)
    setEndpoint(nextEndpoint)
    setAuth(nextAuth)
  }

  const blueprint = useMemo(() => ({
    name,
    description,
    tags,
    provider_key: provider?.id || null,
    provider_name: provider?.name || null,
    endpoint_template: endpoint || null,
    http_method: method || null,
    auth: {
      type: provider?.authType || 'none',
      credential_refs: auth,
    },
    request_template: parseJson(requestBody),
    response_mapping: {
      output_paths: responseMapping.target && responseMapping.source
        ? { [responseMapping.target]: responseMapping.source }
        : {},
    },
    governance: {
      requires_approval: method ? method !== 'GET' : true,
      secrets_backend_only: true,
      supervisor_monitoring: governance.supervisorMonitoring,
    },
  }), [name, description, tags, provider, auth, endpoint, method, requestBody, responseMapping, governance])

  async function testIntegration() {
    setTestStatus('Calling /integration/test with current config…')
    await new Promise(resolve => setTimeout(resolve, 500))
    setTestStatus('Mock test passed — replace placeholder with POST /integration/test.')
  }

  return (
    <main className="min-h-full px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1600px] gap-6">
        <header className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[.22em] text-amber-200">Integrations</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl"><LocalizedText fallback={"Enterprise Integration Builder"} /></h1>
          <p className="mt-3 max-w-3xl text-slate-300"><LocalizedText fallback={"Select an approved provider to load its default method, endpoint, authentication schema, variables, and JSON blueprint values. Method and endpoint remain editable after selection."} /></p>
        </header>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black"><LocalizedText fallback={"Integration Metadata"} /></h2>
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm font-bold text-slate-200"><LocalizedText fallback={"Integration Name"} /><input className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 focus:ring-2" value={name} onChange={event => setName(event.target.value)} /></label>
              <label className="grid gap-2 text-sm font-bold text-slate-200">Description<textarea className="min-h-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 focus:ring-2" value={description} onChange={event => setDescription(event.target.value)} /></label>
              <ProviderDropdown
                providers={providers}
                value={provider}
                onChange={handleProviderChange}
                loading={providersLoading}
                error={providersError}
                onRetry={loadProviders}
              />
              <TagSelector value={tags} onChange={setTags} />
              <AuthFields provider={provider} value={auth} onChange={setAuth} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black"><LocalizedText fallback={"Endpoint & Request"} /></h2>
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm font-bold text-slate-200"><LocalizedText fallback={"HTTP Method"} /><select disabled={!provider} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white disabled:opacity-50" value={method} onChange={event => setMethod(event.target.value)}>
                  {(provider?.methods || []).map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <EndpointField provider={provider} value={endpoint} onChange={setEndpoint} />
              <JsonEditor value={requestBody} onChange={setRequestBody} variables={provider?.variables || []} />
              <ResponseMapper value={responseMapping} onChange={setResponseMapping} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black"><LocalizedText fallback={"Governance & Supervisor"} /></h2>
            <GovernancePanel value={governance} onChange={setGovernance} onTest={testIntegration} onLogs={() => setLogsOpen(true)} />
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-sm text-slate-300">{testStatus}</p>
          </div>
        </section>

        <JsonBlueprint blueprint={blueprint} />

        {logsOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black"><LocalizedText fallback={"Recent Logs"} /></h2><button type="button" onClick={() => setLogsOpen(false)} className="rounded-xl border border-white/10 px-3 py-2 font-bold text-slate-200">Close</button></div><div className="grid gap-3 text-sm text-slate-300"><p>• ToolBuilder loaded and owns the provider catalog.</p><p>• ProviderDropdown reports only the selected catalog provider.</p><p>• Method, endpoint, auth, variables, and JSON share one provider source.</p></div></div></div>}
      </div>
    </main>
  )
}
