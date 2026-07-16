'use client'

import { useMemo, useState } from 'react'

const PROVIDERS = ['OpenAI', 'Anthropic', 'Vercel', 'Supabase', 'Stripe', 'GitHub', 'Resend', 'Awin', 'Travelpayouts', 'Custom REST API']
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const field = { width: '100%', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, background: 'rgba(15,23,42,.82)', color: '#f8fafc', padding: '11px 12px', outline: 'none' }
const label = { display: 'grid', gap: 7, color: '#cbd5e1', fontSize: 13, fontWeight: 800 }
const card = { border: '1px solid rgba(148,163,184,.16)', borderRadius: 20, background: 'rgba(2,6,23,.72)', padding: 20, boxShadow: '0 24px 70px rgba(0,0,0,.24)' }

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function ToolBuilder() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [providerQuery, setProviderQuery] = useState('')
  const [provider, setProvider] = useState('')
  const [method, setMethod] = useState('POST')
  const [endpoint, setEndpoint] = useState('')
  const [authType, setAuthType] = useState('bearer')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState([])
  const [requestTemplate, setRequestTemplate] = useState('{\n  "prompt": "{{input.prompt}}"\n}')
  const [outputPath, setOutputPath] = useState('data.output')
  const [copied, setCopied] = useState(false)

  const providers = useMemo(() => PROVIDERS.filter(item => item.toLowerCase().includes(providerQuery.toLowerCase())), [providerQuery])
  const compiled = useMemo(() => ({
    id: slugify(name || `${provider || 'custom'}-tool`),
    name: name || 'Untitled integration tool',
    description,
    provider: provider || null,
    tags,
    transport: {
      method,
      endpoint,
      auth: { type: authType, credential_ref: authType === 'none' ? null : `${slugify(provider || 'provider')}_credential` },
    },
    request_template: (() => { try { return JSON.parse(requestTemplate) } catch { return requestTemplate } })(),
    response_mapping: { output_path: outputPath },
    governance: { requires_approval: method !== 'GET', secrets_backend_only: true },
  }), [name, description, provider, tags, method, endpoint, authType, requestTemplate, outputPath])

  function addTag(value = tagInput) {
    const next = value.trim().toLowerCase()
    if (next && !tags.includes(next)) setTags(current => [...current, next])
    setTagInput('')
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(compiled, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <main style={{ minHeight: '100%', padding: '28px clamp(14px,3vw,34px) 48px', color: '#f8fafc', background: 'radial-gradient(circle at top right, rgba(26,240,255,.08), transparent 28%), transparent' }}>
      <div style={{ width: 'min(1440px,100%)', margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <p style={{ margin: 0, color: '#ffc300', fontWeight: 900, letterSpacing: '.16em', fontSize: 11, textTransform: 'uppercase' }}>Integrations</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 'clamp(28px,4vw,46px)', letterSpacing: '-.04em' }}>Interactive Tool Builder</h1>
          <p style={{ margin: 0, color: '#94a3b8', maxWidth: 760 }}>Define a provider action, inject searchable tags, and compile a provider-neutral JSON blueprint in real time.</p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(320px,.95fr)', gap: 20, alignItems: 'start' }} className="tool-builder-grid">
          <div style={{ ...card, display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }} className="tool-builder-two">
              <label style={label}>Tool name<input style={field} value={name} onChange={e => setName(e.target.value)} placeholder="Generate campaign video" /></label>
              <label style={label}>HTTP method<select style={field} value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(item => <option key={item}>{item}</option>)}</select></label>
            </div>

            <label style={label}>Description<textarea style={{ ...field, minHeight: 84, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this tool does and when COSA should use it" /></label>

            <div style={{ position: 'relative' }}>
              <label style={label}>Provider search<input style={field} value={providerQuery} onChange={e => setProviderQuery(e.target.value)} placeholder="Search providers..." /></label>
              {providerQuery && !provider && <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 6, maxHeight: 220, overflow: 'auto', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, background: '#07101f', padding: 6 }}>
                {providers.map(item => <button key={item} type="button" onClick={() => { setProvider(item); setProviderQuery(item) }} style={{ width: '100%', textAlign: 'left', border: 0, borderRadius: 9, background: 'transparent', color: '#e2e8f0', padding: '10px 11px', cursor: 'pointer' }}>{item}</button>)}
                {!providers.length && <div style={{ padding: 10, color: '#94a3b8' }}>No provider found.</div>}
              </div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 180px', gap: 14 }} className="tool-builder-two">
              <label style={label}>Endpoint<input style={field} value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://api.provider.com/v1/action" /></label>
              <label style={label}>Authentication<select style={field} value={authType} onChange={e => setAuthType(e.target.value)}><option value="bearer">Bearer token</option><option value="api_key">API key</option><option value="basic">Basic auth</option><option value="none">None</option></select></label>
            </div>

            <div style={label}>Tags
              <div style={{ display: 'flex', gap: 8 }}><input style={field} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} placeholder="Type a tag and press Enter" /><button type="button" onClick={() => addTag()} style={{ border: 0, borderRadius: 12, padding: '0 18px', background: '#ffc300', color: '#111827', fontWeight: 900, cursor: 'pointer' }}>Add</button></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{tags.map(tag => <button key={tag} type="button" onClick={() => setTags(current => current.filter(item => item !== tag))} style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 999, background: 'rgba(26,240,255,.08)', color: '#67e8f9', padding: '6px 10px', cursor: 'pointer' }}>{tag} ×</button>)}</div>
            </div>

            <label style={label}>Request template<textarea spellCheck={false} style={{ ...field, minHeight: 180, resize: 'vertical', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }} value={requestTemplate} onChange={e => setRequestTemplate(e.target.value)} /></label>
            <label style={label}>Response output path<input style={field} value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="data.output" /></label>
          </div>

          <aside style={{ ...card, position: 'sticky', top: 88, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Live compiler</div><h2 style={{ margin: '4px 0 0', fontSize: 20 }}>Tool blueprint JSON</h2></div><button type="button" onClick={copyJson} style={{ border: '1px solid rgba(255,195,0,.35)', borderRadius: 10, background: 'rgba(255,195,0,.1)', color: '#ffc300', padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy JSON'}</button></div>
            <pre style={{ margin: 0, maxHeight: '68vh', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 14, background: '#020617', border: '1px solid rgba(148,163,184,.14)', padding: 16, color: '#dbeafe', fontSize: 12.5, lineHeight: 1.6 }}>{JSON.stringify(compiled, null, 2)}</pre>
          </aside>
        </section>
      </div>
      <style>{`@media(max-width:980px){.tool-builder-grid{grid-template-columns:1fr!important}.tool-builder-grid aside{position:static!important}}@media(max-width:640px){.tool-builder-two{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}
