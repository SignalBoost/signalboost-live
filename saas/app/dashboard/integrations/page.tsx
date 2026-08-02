// saas/app/dashboard/integrations/page.tsx
'use client'

// THE INTEGRATION CATALOG, made visible.
//
// The catalog and the declare-your-own path both already existed as working API routes,
// and nothing rendered them — the repo's recurring "coded but never wired" shape. This
// page is the missing half: every provider the product ships, what each can actually do,
// which are connected, and a form to declare one the catalog does not name.
//
// The distinction this page refuses to blur: a capability is either IMPLEMENTED (there
// is a function behind it) or DECLARED (the provider claims it and nobody has written
// the code yet). Both are shown, labelled differently. A buyer discovering at run time
// that a listed capability was a promise is exactly the failure this product is sold
// against.

import { useEffect, useState } from 'react'
import { LocalizedText } from '@/components/i18n/LocalizedText'
import { uiText } from '@/lib/i18n/uiText'

type Provider = {
  id: string
  label: string
  category: string
  auth: string
  docsUrl: string | null
  capabilities: string[]
  implemented: string[]
  connected: boolean
  tasks: unknown[]
}

type Declared = { id: string; label: string; category: string; auth: string }

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }
const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, fontSize: 13, width: '100%' }
const smallLabel: React.CSSProperties = { color: 'rgba(255,255,255,.62)', fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4 }

// Machine values, rendered as-is: they are the API's own vocabulary, not prose, and
// translating them would break the value the form posts back.
const AUTH_KINDS = ['api_key', 'oauth2']
const CATEGORIES = ['crm', 'email_marketing', 'messaging', 'cdp', 'enrichment', 'scheduling', 'payments', 'audit', 'cybersecurity', 'compliance']

function pill(text: string, color: string) {
  return <span style={{ display: 'inline-flex', border: `1px solid ${color}66`, background: `${color}18`, color, borderRadius: 999, padding: '3px 9px', fontSize: 10.5, fontWeight: 900 }}>{text}</span>
}

function ProviderCard({ provider }: { provider: Provider }) {
  const declaredOnly = provider.capabilities.filter(c => !provider.implemented.includes(c))
  return <article style={{ ...panel, padding: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <strong style={{ color: '#fff', fontSize: 14 }}>{provider.label}</strong>
      {provider.connected ? pill(uiText('generatedUi.u_int_connected'), '#22c55e') : pill(uiText('generatedUi.u_int_notconnected'), '#94a3b8')}
    </div>
    <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '6px 0 0' }}>{provider.auth}</p>

    {provider.implemented.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
      {provider.implemented.map(c => pill(c, '#22c55e'))}
    </div> : null}

    {declaredOnly.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {declaredOnly.map(c => pill(c, '#fb923c'))}
    </div> : null}

    {provider.docsUrl ? <a href={provider.docsUrl} target="_blank" rel="noreferrer" style={{ color: '#1af0ff', fontSize: 11, fontWeight: 800, display: 'inline-block', marginTop: 10 }}>
      <LocalizedText fallback={uiText('generatedUi.u_int_docs')} />
    </a> : null}
  </article>
}

export default function IntegrationsCatalogPage() {
  const [byCategory, setByCategory] = useState<Record<string, Provider[]>>({})
  const [declared, setDeclared] = useState<Declared[]>([])
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const emptyForm = { id: '', label: '', category: 'crm', auth: 'api_key', authUrl: '', tokenUrl: '', scopes: '', docsUrl: '', capabilities: '' }
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setMessage('')
    try {
      const [catRes, decRes] = await Promise.all([
        fetch('/api/integrations/catalog', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/integrations/providers', { cache: 'no-store', credentials: 'include' }),
      ])
      const cat = await catRes.json().catch(() => ({}))
      const dec = await decRes.json().catch(() => ({}))
      if (!catRes.ok || !cat.ok) throw new Error(cat.error || uiText('generatedUi.u_int_loadfail'))
      setByCategory(cat.byCategory || {})
      setTotal(cat.total || 0)
      setDeclared(Array.isArray(dec?.providers) ? dec.providers : [])
    } catch (err: any) { setMessage(err?.message || uiText('generatedUi.u_int_loadfail')) }
  }

  useEffect(() => { load() }, [])

  async function declare() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/integrations/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || uiText('generatedUi.u_int_declarefail'))
      setMessage(json.note || '')
      setForm(emptyForm)
      await load()
    } catch (err: any) { setMessage(err?.message || uiText('generatedUi.u_int_declarefail')) }
    finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`/api/integrations/providers?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || uiText('generatedUi.u_int_removefail'))
      await load()
    } catch (err: any) { setMessage(err?.message || uiText('generatedUi.u_int_removefail')) }
    finally { setBusy(false) }
  }

  const ready = form.id.trim() && form.label.trim() && (form.auth !== 'oauth2' || form.authUrl.trim())

  return <main style={{ display: 'grid', gap: 16, padding: 20, maxWidth: 1200, margin: '0 auto' }}>
    <section style={panel}>
      <h1 style={{ color: '#fff', margin: 0, fontSize: 22 }}><LocalizedText fallback={uiText('generatedUi.u_int_title')} /></h1>
      <p style={{ color: 'rgba(255,255,255,.62)', margin: '8px 0 0', lineHeight: 1.6, fontSize: 13 }}>
        <LocalizedText fallback={uiText('generatedUi.u_int_intro')} />
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {pill(`${total}`, '#1af0ff')}
        {pill(uiText('generatedUi.u_int_greenmeans'), '#22c55e')}
        {pill(uiText('generatedUi.u_int_ambermeans'), '#fb923c')}
      </div>
    </section>

    <section style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}><LocalizedText fallback={uiText('generatedUi.u_int_addtitle')} /></h2>
          <p style={{ color: 'rgba(255,255,255,.6)', margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
            <LocalizedText fallback={uiText('generatedUi.u_int_addintro')} />
          </p>
        </div>
        <button style={ghost} onClick={() => setOpen(!open)}>{open ? uiText('generatedUi.u_int_close') : uiText('generatedUi.u_int_declare')}</button>
      </div>

      {declared.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {declared.map(d => <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(34,197,94,.4)', background: 'rgba(34,197,94,.12)', color: '#22c55e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800 }}>
          {d.label} · {d.category}
          <button onClick={() => remove(d.id)} disabled={busy} style={{ border: 'none', background: 'transparent', color: '#fca5a5', cursor: 'pointer', fontWeight: 900 }}>×</button>
        </span>)}
      </div> : null}

      {open ? <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_id')} /></label><input style={field} value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} /></div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_label')} /></label><input style={field} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_category')} /></label>
            <select style={field} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_auth')} /></label>
            <select style={field} value={form.auth} onChange={e => setForm({ ...form, auth: e.target.value })}>{AUTH_KINDS.map(a => <option key={a} value={a}>{a}</option>)}</select>
          </div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_authurl')} /></label><input style={field} value={form.authUrl} onChange={e => setForm({ ...form, authUrl: e.target.value })} /></div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_tokenurl')} /></label><input style={field} value={form.tokenUrl} onChange={e => setForm({ ...form, tokenUrl: e.target.value })} /></div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_docs')} /></label><input style={field} value={form.docsUrl} onChange={e => setForm({ ...form, docsUrl: e.target.value })} /></div>
          <div><label style={smallLabel}><LocalizedText fallback={uiText('generatedUi.u_int_f_caps')} /></label><input style={field} value={form.capabilities} onChange={e => setForm({ ...form, capabilities: e.target.value })} /></div>
        </div>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          <LocalizedText fallback={uiText('generatedUi.u_int_declarednote')} />
        </p>
        <div><button style={button} disabled={busy || !ready} onClick={declare}>{busy ? uiText('generatedUi.u_int_saving') : uiText('generatedUi.u_int_declare')}</button></div>
      </div> : null}

      {message ? <p style={{ color: '#1af0ff', margin: '12px 0 0', fontSize: 12, lineHeight: 1.6 }}>{message}</p> : null}
    </section>

    {Object.entries(byCategory).map(([category, providers]: [string, Provider[]]) => <section key={category} style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ color: 'rgba(255,255,255,.72)', margin: 0, fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase' }}>{category}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {providers.map(p => <ProviderCard key={p.id} provider={p} />)}
      </div>
    </section>)}
  </main>
}
