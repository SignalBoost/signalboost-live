// saas/app/dashboard/outreach/social/page.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'

type Destination = { accountRef: string | null; accountName: string | null; kind: string | null; hasAccessToken: boolean; discoveredAt: string | null }
type Platform = {
  platform: string
  label: string
  authUrl: string
  scopes: string[]
  contentKind: string
  needsAccountRef: boolean
  env: { clientId: boolean; clientSecret: boolean }
  token: null | { connected: boolean; accountRef: string | null; accountName: string | null; scopes: string[]; expiresAt: string | null; expired: boolean }
  destinations?: Destination[]
  destinationDiscoveryReady?: boolean
  configured: boolean
  connected: boolean
  publishReady: boolean
  missing: string[]
  status: string
}

type Capabilities = {
  ok: boolean
  schemaReady: boolean
  destinationsReady?: boolean
  summary: { supportedPlatforms: number; configuredProviders: number; publishReadyPlatforms: number; draftReady: boolean; publishReady: boolean }
  rules: Record<string, boolean>
  platforms: Platform[]
  error?: string
}

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }

function chip(text: string, color = '#94a3b8') {
  return <span style={{ display: 'inline-flex', border: `1px solid ${color}66`, background: `${color}18`, color, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 900 }}>{text}</span>
}
function statusColor(p: Platform) { if (p.publishReady) return '#22c55e'; if (p.configured) return '#ffc300'; return '#fb923c' }
function goodMessage(value: string) { return /saved|ready|discover/i.test(value) }

function PlatformCard({ platform, onSaved }: { platform: Platform; onSaved: () => void }) {
  const [accountRef, setAccountRef] = useState(platform.token?.accountRef || '')
  const [accountName, setAccountName] = useState(platform.token?.accountName || '')
  const [saving, setSaving] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [staging, setStaging] = useState(false)
  const [message, setMessage] = useState('')
  const color = statusColor(platform)

  async function saveRef(ref = accountRef, name = accountName) {
    setSaving(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/account-ref', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ platform: platform.platform, account_ref: ref, account_name: name }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save account reference.')
      setMessage("Destination saved."); onSaved()
    } catch (err: any) { setMessage(err?.message || "Could not save account reference.") }
    finally { setSaving(false) }
  }

  async function discoverDestinations() {
    setDiscovering(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ platform: platform.platform, auto_select: true }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not discover destinations.')
      const selected = json.selected
      if (selected?.accountRef) { setAccountRef(selected.accountRef); setAccountName(selected.accountName || '') }
      setMessage(`Discovered ${json.discovered || 0} destination(s)${selected ? " and auto-selected one." : '.'}`)
      onSaved()
    } catch (err: any) { setMessage(err?.message || "Could not discover destinations.") }
    finally { setDiscovering(false) }
  }

  async function stageKeysPr() {
    setStaging(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/connect-via-pr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ platform: platform.platform, clientId, clientSecret }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not stage the keys PR.')
      setClientId(''); setClientSecret('')
      setMessage("Keys PR staged — review and merge it on the Infrastructure page, then click Connect.")
    } catch (err: any) { setMessage(err?.message || "Could not stage the keys PR.") }
    finally { setStaging(false) }
  }

  return <article style={{ ...panel, borderColor: `${color}55` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div><h3 style={{ color: '#fff', margin: 0 }}>{platform.label}</h3><p style={{ color: 'rgba(255,255,255,.58)', margin: '6px 0 0', fontSize: 12 }}>{platform.platform} · {platform.contentKind}{platform.needsAccountRef ? uiText('generatedUi.u_6950a59324791c69') : ''}</p></div>
      {chip(platform.status.replace(/_/g, ' '), color)}
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {chip(platform.configured ? "provider app configured" : "provider app missing", platform.configured ? '#22c55e' : "#fb923c")}
      {chip(platform.connected ? "OAuth connected" : "not connected", platform.connected ? '#22c55e' : "#fb923c")}
      {chip(platform.publishReady ? "publish ready" : "not publish ready", platform.publishReady ? '#22c55e' : "#ffc300")}
      {chip(`${platform.destinations?.length || 0} discovered destination(s)`, platform.destinations?.length ? "#1af0ff" : '#94a3b8')}
    </div>

    {platform.missing.length ? <div style={{ marginTop: 12 }}><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '0 0 6px' }}>{uiText('generatedUi.u_10c4b48e0b09a118')}</p><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{platform.missing.map(item => chip(item, '#fb923c'))}</div></div> : null}

    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      <button style={button} disabled={!platform.configured} onClick={() => { window.location.href = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform.platform)}` }}>{platform.connected ? uiText('generatedUi.u_bf8a9eab9e7e141b') : uiText('generatedUi.u_1a2303ede07493ac')}</button>
      <button style={ghost} disabled={!platform.connected || discovering} onClick={discoverDestinations}>{discovering ? uiText('generatedUi.u_96913fe64fa68845') : uiText('generatedUi.u_939542cba899b934')}</button>
      <button style={ghost} onClick={() => { window.location.href = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform.platform)}&json=1` }}><LocalizedText fallback={uiText('generatedUi.u_28af012fe23dff20')} /></button>
    </div>

    <details style={{ marginTop: 12 }}>
      <summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}><LocalizedText fallback={uiText('generatedUi.u_575cb6ce8857a896')} /></summary>
      <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_ca058869cfdfb72d')} /></p>

        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{uiText('generatedUi.u_c8e5998f6a3955c2')}<span style={{ color: '#22c55e', fontWeight: 700 }}>{uiText('generatedUi.u_637e3b25d0431416')}</span></p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_947b134e0ea2ec01')} /></p>
        </div>

        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{uiText('generatedUi.u_c180f8b15bf4980d')}</p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}><LocalizedText fallback={uiText('generatedUi.u_5253838530ee6e0a')} /></p>
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={uiText('generatedUi.u_8726db013948f070')} style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box' }} />
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={uiText('generatedUi.u_ae21cf6d24b8ca46')} type="password" style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box', marginTop: 8 }} />
          <button style={{ ...ghost, marginTop: 8 }} disabled={staging || !clientId || !clientSecret} onClick={stageKeysPr}>{staging ? uiText('generatedUi.u_afcf81fc43e4bfb7') : uiText('generatedUi.u_5964d0933def89aa')}</button>
        </div>

        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}><LocalizedText fallback={uiText('generatedUi.u_d87f4e7006767b32')} /><span style={{ color: '#ffc300', fontWeight: 700 }}>{uiText('generatedUi.u_137c7cd0f93235ea')}</span></p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}><LocalizedText fallback={uiText('generatedUi.u_ce813b2e6dcfd64d')} /></p>
          <button style={ghost} disabled title={uiText('generatedUi.u_6eb9d851ed2d12cf')}><LocalizedText fallback={uiText('generatedUi.u_ccbb6ff28a3ded44')} /></button>
        </div>
      </div>
    </details>

    {platform.destinations?.length ? <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 850, margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_e38137db382d09ec')} /></p>
      {platform.destinations.map((d, i) => <button key={`${d.accountRef}-${i}`} style={ghost} onClick={() => { setAccountRef(d.accountRef || ''); setAccountName(d.accountName || ''); if (d.accountRef) saveRef(d.accountRef, d.accountName || '') }}>{d.accountName || d.accountRef} · {d.kind}{d.hasAccessToken ? uiText('generatedUi.u_c4c80677a93cbbef') : ''}</button>)}
    </div> : null}

    {platform.needsAccountRef ? <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <label style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800 }}><LocalizedText fallback={uiText('generatedUi.u_2d6246588b2fcad6')} /></label>
      <input value={accountRef} onChange={e => setAccountRef(e.target.value)} placeholder={uiText('generatedUi.u_1338a18f44e557ad')} style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10 }} />
      <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder={uiText('generatedUi.u_fce95f4de4b8bf99')} style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10 }} />
      <button style={ghost} disabled={saving || !platform.connected} onClick={() => saveRef()}>{saving ? uiText('generatedUi.u_23e39291d6135814') : uiText('generatedUi.u_28bc183e20fc85ce')}</button>
    </div> : null}

    {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }}>{message}</p> : null}
    <details style={{ marginTop: 12 }}><summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}><LocalizedText fallback={uiText('generatedUi.u_f4358942298f75f9')} /></summary><pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.26)', color: 'rgba(226,232,240,.82)', padding: 12, borderRadius: 12, overflow: 'auto', fontSize: 11 }}>{JSON.stringify(platform, null, 2)}</pre></details>
  </article>
}

// ── Declare a platform ───────────────────────────────────────────────────────
//
// The eight built-in connectors are conveniences, not the limit. A platform is a
// declaration — where to authorize, what the publish request looks like, where the post
// id comes back — so an operator adds Threads, Bluesky, Mastodon, Telegram or anything
// else without a code change, a release, or asking us.
//
// The form asks for the minimum that makes a platform publishable and confirmable. It
// deliberately does NOT ask for the client id and secret: those belong in the
// environment or the buyer's vault, and the response tells the operator exactly which
// two variables to set next.
function DeclarePlatformPanel({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const empty = {
    id: '', label: '', authUrl: '', tokenUrl: '', scopes: '',
    publishUrl: '', method: 'POST', bodyKind: 'json',
    bodyTemplate: '{\n  "text": "{text}"\n}',
    idPath: '', idHeader: '', urlPath: '', permalinkTemplate: '',
    content: 'text', needsAccountRef: false,
  }
  const [form, setForm] = useState(empty)
  const [declared, setDeclared] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)

  const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, fontSize: 13, width: '100%' }
  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,.62)', fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4 }

  async function loadDeclared() {
    try {
      const res = await fetch('/api/outreach/social/platforms', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      setDeclared(Array.isArray(json?.platforms) ? json.platforms : [])
    } catch { /* the built-ins still work without this list */ }
  }

  useEffect(() => { loadDeclared() }, [])

  async function submit() {
    setBusy(true); setNote('')
    try {
      const res = await fetch('/api/outreach/social/platforms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, scopes: form.scopes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not declare this platform.')
      setNote(json.next || `${form.id} declared.`)
      setForm(empty)
      await loadDeclared()
      onChanged()
    } catch (err: any) { setNote(err?.message || 'Could not declare this platform.') }
    finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!window.confirm(`Remove the declared platform "${id}"?`)) return
    setBusy(true); setNote('')
    try {
      const res = await fetch(`/api/outreach/social/platforms?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not remove this platform.')
      await loadDeclared(); onChanged()
    } catch (err: any) { setNote(err?.message || 'Could not remove this platform.') }
    finally { setBusy(false) }
  }

  const ready = form.id.trim() && form.label.trim() && form.authUrl.trim() && form.publishUrl.trim()
    && (form.idPath.trim() || form.idHeader.trim() || form.urlPath.trim())

  return <section style={panel}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ color: '#fff', margin: 0 }}>{uiText('generatedUi.u_ca169ad9a39d8b2c')}</h2>
        <p style={{ color: 'rgba(255,255,255,.6)', margin: '6px 0 0', fontSize: 13, lineHeight: 1.6 }}> {uiText('generatedUi.u_e13bbfa1cbfd78f0')} </p>
      </div>
      <button style={ghost} onClick={() => setOpen(!open)}>{open ? uiText('generatedUi.u_7d9eb7acb13e2462') : uiText('generatedUi.u_1bda0ea94f93d03c')}</button>
    </div>

    {declared.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      {declared.map(item => <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(34,197,94,.4)', background: 'rgba(34,197,94,.12)', color: '#22c55e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800 }}>
        {item.label} · {item.id}
        <button onClick={() => remove(item.id)} disabled={busy} style={{ border: 'none', background: 'transparent', color: '#fca5a5', cursor: 'pointer', fontWeight: 900 }}>×</button>
      </span>)}
    </div> : null}

    {open ? <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div><label style={labelStyle}>{uiText('generatedUi.u_4d855ad31368b940')}</label><input style={field} value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder={uiText('generatedUi.u_41a37f5b02ea6532')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_2b7f6a84de917e38')}</label><input style={field} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={uiText('generatedUi.u_4ed485c714011860')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_6a1a03c4daab4ccf')}</label><input style={field} value={form.authUrl} onChange={e => setForm({ ...form, authUrl: e.target.value })} placeholder={uiText('generatedUi.u_419c4bfda5ea7c40')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_804b52f6a75c7ab7')}</label><input style={field} value={form.tokenUrl} onChange={e => setForm({ ...form, tokenUrl: e.target.value })} placeholder={uiText('generatedUi.u_0e87d26a0be2b4d5')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_44832b6ad20b5f69')}</label><input style={field} value={form.scopes} onChange={e => setForm({ ...form, scopes: e.target.value })} placeholder={uiText('generatedUi.u_2eb67117eab3a411')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_4207937c19df071a')}</label><input style={field} value={form.publishUrl} onChange={e => setForm({ ...form, publishUrl: e.target.value })} placeholder={uiText('generatedUi.u_730cd708e1c60f41')} /></div>
      </div>

      <div>
        <label style={labelStyle}>{uiText('generatedUi.u_fdfdfab3d30bd134')} {uiText('generatedUi.u_ada0db1bcc3bb7d1')}, {uiText('generatedUi.u_123953875dfc180b')}, {uiText('generatedUi.u_7f6d1e5dc420403e')}, {uiText('generatedUi.u_8cbe16eae44f4e5f')} {uiText('generatedUi.u_c22e579dba452e17')}</label>
        <textarea style={{ ...field, minHeight: 96, fontFamily: 'ui-monospace, monospace' }} value={form.bodyTemplate} onChange={e => setForm({ ...form, bodyTemplate: e.target.value })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div><label style={labelStyle}>{uiText('generatedUi.u_04b161225a1508f6')}</label><input style={field} value={form.idPath} onChange={e => setForm({ ...form, idPath: e.target.value })} placeholder={uiText('generatedUi.u_cbd3a38cc39d8f59')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_6a7c5d51b88b4baa')}</label><input style={field} value={form.idHeader} onChange={e => setForm({ ...form, idHeader: e.target.value })} placeholder={uiText('generatedUi.u_a53a51e5bda57fcd')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_86e730a874e657da')}</label><input style={field} value={form.urlPath} onChange={e => setForm({ ...form, urlPath: e.target.value })} placeholder={uiText('generatedUi.u_b5da913936112526')} /></div>
        <div><label style={labelStyle}>{uiText('generatedUi.u_5b7d9943d7fd77a9')}</label><input style={field} value={form.permalinkTemplate} onChange={e => setForm({ ...form, permalinkTemplate: e.target.value })} placeholder={uiText('generatedUi.u_6cecc5f8bb0f9a66')} /></div>
      </div>

      <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, margin: 0, lineHeight: 1.6 }}> {uiText('generatedUi.u_8c70f65de43a511b')} </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={form.needsAccountRef} onChange={e => setForm({ ...form, needsAccountRef: e.target.checked })} /> {uiText('generatedUi.u_9a61e3f8777ab974')} </label>
        <select style={{ ...field, width: 'auto' }} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}>
          <option value="text">{uiText('generatedUi.u_ce7e98cf46a40f10')}</option>
          <option value="video">{uiText('generatedUi.u_5cd402084b8e6dd0')}</option>
          <option value="media">{uiText('generatedUi.u_e6440cdaa1aa4cc4')}</option>
        </select>
        <button style={button} disabled={busy || !ready} onClick={submit}>{busy ? uiText('generatedUi.u_23e39291d6135814') : uiText('generatedUi.u_105820a9b1614cb1')}</button>
      </div>
    </div> : null}

    {note ? <p style={{ color: goodMessage(note) || /Set SOCIAL_/.test(note) ? '#22c55e' : '#fb923c', margin: '12px 0 0', fontSize: 12, lineHeight: 1.6 }}>{note}</p> : null}
  </section>
}

export default function EnterpriseSocialOutreachPage() {
  const [data, setData] = useState<Capabilities | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/capabilities', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({ ok: false, error: 'Invalid capabilities response' }))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not load social capabilities.')
      setData(json)
    } catch (err: any) { setMessage(err?.message || "Could not load social capabilities.") }
    finally { setLoading(false) }
  }

  async function setup() {
    setLoading(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/setup', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Setup failed')
      setMessage("Social outreach schema is ready."); await load()
    } catch (err: any) { setMessage(err?.message || "Setup failed") }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  const platforms = data?.platforms || []
  const ready = useMemo(() => platforms.filter(p => p.publishReady), [platforms])

  return <main style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'radial-gradient(circle at top left, rgba(26,240,255,.14), transparent 28rem), linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'start' }}>
        <div><p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}><LocalizedText fallback={uiText('generatedUi.u_f4deea1cb81c3089')} /></p><h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.04em' }}><LocalizedText fallback={uiText('generatedUi.u_f81da1da7de1af25')} /></h1><p style={{ color: 'rgba(255,255,255,.66)', maxWidth: 880, lineHeight: 1.6 }}>{uiText('generatedUi.u_6bdac1577a8bebab')}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button style={button} onClick={load}>{loading ? uiText('generatedUi.u_ba3bbbe10d8bef66') : uiText('generatedUi.u_4e357ddabe3323d9')}</button><button style={ghost} onClick={setup}><LocalizedText fallback={uiText('generatedUi.u_5066259b6cb888a7')} /></button></div>
      </div>
      {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', fontWeight: 850 }}>{message}</p> : null}
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <div style={panel}>{chip("supported platforms", "#1af0ff")}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.supportedPlatforms ?? '-'}</h2></div>
      <div style={panel}>{chip("configured providers", "#ffc300")}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.configuredProviders ?? '-'}</h2></div>
      <div style={panel}>{chip("publish-ready", '#22c55e')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.publishReadyPlatforms ?? '-'}</h2></div>
      <div style={panel}>{chip("schema", data?.schemaReady ? '#22c55e' : "#fb923c")}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.schemaReady ? uiText('generatedUi.u_b24d6d33736ecd56') : uiText('generatedUi.u_6b76aeb099be1205')}</h2></div>
    </section>

    <section style={panel}><h2 style={{ color: '#fff', margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_9f1f18a8f01992f6')} /></h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{Object.entries(data?.rules || {}).map(([key, value]) => chip(`${key}: ${value ? 'yes' : 'no'}`, value ? '#22c55e' : '#fb923c'))}</div></section>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>{platforms.map(platform => <PlatformCard key={platform.platform} platform={platform} onSaved={load} />)}{!loading && !platforms.length ? <div style={panel}><p style={{ color: '#fff' }}>{message || uiText('generatedUi.u_625459f2edcdf1ea')}</p></div> : null}</section>
    <DeclarePlatformPanel onChanged={load} />
    <section style={panel}><h2 style={{ color: '#fff', margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_fc9d7b8617a87ec1')} /></h2><p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>{uiText('generatedUi.u_4ab6cc4f4cf32b2c')}{ready.map(p => p.label).join(', ') || uiText('generatedUi.u_140bedbf9c3f6d56')}{uiText('generatedUi.u_cbde47e3c4bbca3d')}</p></section>
  </main>
}
