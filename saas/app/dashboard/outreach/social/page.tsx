'use client'

import { useEffect, useMemo, useState } from 'react'

type Platform = {
  platform: string
  label: string
  authUrl: string
  scopes: string[]
  contentKind: string
  needsAccountRef: boolean
  env: { clientId: boolean; clientSecret: boolean }
  token: null | { connected: boolean; accountRef: string | null; accountName: string | null; scopes: string[]; expiresAt: string | null; expired: boolean }
  configured: boolean
  connected: boolean
  publishReady: boolean
  missing: string[]
  status: string
}

type Capabilities = {
  ok: boolean
  schemaReady: boolean
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

function statusColor(p: Platform) {
  if (p.publishReady) return '#22c55e'
  if (p.configured) return '#ffc300'
  return '#fb923c'
}

function PlatformCard({ platform, onSaved }: { platform: Platform; onSaved: () => void }) {
  const [accountRef, setAccountRef] = useState(platform.token?.accountRef || '')
  const [accountName, setAccountName] = useState(platform.token?.accountName || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const color = statusColor(platform)

  async function saveRef() {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/outreach/social/account-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ platform: platform.platform, account_ref: accountRef, account_name: accountName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save account reference.')
      setMessage('Destination saved.')
      onSaved()
    } catch (err: any) {
      setMessage(err?.message || 'Could not save account reference.')
    } finally {
      setSaving(false)
    }
  }

  return <article style={{ ...panel, borderColor: `${color}55` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div>
        <h3 style={{ color: '#fff', margin: 0 }}>{platform.label}</h3>
        <p style={{ color: 'rgba(255,255,255,.58)', margin: '6px 0 0', fontSize: 12 }}>{platform.platform} · {platform.contentKind}{platform.needsAccountRef ? ' · destination required' : ''}</p>
      </div>
      {chip(platform.status.replace(/_/g, ' '), color)}
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {chip(platform.configured ? 'provider app configured' : 'provider app missing', platform.configured ? '#22c55e' : '#fb923c')}
      {chip(platform.connected ? 'OAuth connected' : 'not connected', platform.connected ? '#22c55e' : '#fb923c')}
      {chip(platform.publishReady ? 'publish ready' : 'not publish ready', platform.publishReady ? '#22c55e' : '#ffc300')}
    </div>

    {platform.missing.length ? <div style={{ marginTop: 12 }}>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '0 0 6px' }}>Missing:</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{platform.missing.map(item => chip(item, '#fb923c'))}</div>
    </div> : null}

    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      <button style={button} disabled={!platform.configured} onClick={() => { window.location.href = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform.platform)}` }}>{platform.connected ? 'Reconnect' : 'Connect'}</button>
      <button style={ghost} onClick={() => { window.location.href = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform.platform)}&json=1` }}>OAuth debug JSON</button>
    </div>

    {platform.needsAccountRef ? <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <label style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800 }}>Destination account reference</label>
      <input value={accountRef} onChange={e => setAccountRef(e.target.value)} placeholder="LinkedIn org id, Facebook page id, IG business id, or subreddit" style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10 }} />
      <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Friendly account name" style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10 }} />
      <button style={ghost} disabled={saving || !platform.connected} onClick={saveRef}>{saving ? 'Saving…' : 'Save destination'}</button>
      {message ? <p style={{ color: message.includes('saved') ? '#22c55e' : '#fb923c', margin: 0, fontSize: 12 }}>{message}</p> : null}
    </div> : null}

    <details style={{ marginTop: 12 }}>
      <summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}>Scopes and telemetry</summary>
      <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.26)', color: 'rgba(226,232,240,.82)', padding: 12, borderRadius: 12, overflow: 'auto', fontSize: 11 }}>{JSON.stringify(platform, null, 2)}</pre>
    </details>
  </article>
}

export default function EnterpriseSocialOutreachPage() {
  const [data, setData] = useState<Capabilities | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/outreach/social/capabilities', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({ ok: false, error: 'Invalid capabilities response' }))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not load social capabilities.')
      setData(json)
    } catch (err: any) {
      setMessage(err?.message || 'Could not load social capabilities.')
    } finally {
      setLoading(false)
    }
  }

  async function setup() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/outreach/social/setup', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Setup failed')
      setMessage('Social outreach schema is ready.')
      await load()
    } catch (err: any) {
      setMessage(err?.message || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const platforms = data?.platforms || []
  const ready = useMemo(() => platforms.filter(p => p.publishReady), [platforms])

  return <main style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'radial-gradient(circle at top left, rgba(26,240,255,.14), transparent 28rem), linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>Enterprise plug-and-play</p>
          <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.04em' }}>Social Outreach Connector Cockpit</h1>
          <p style={{ color: 'rgba(255,255,255,.66)', maxWidth: 880, lineHeight: 1.6 }}>A buyer can configure provider apps, connect social accounts, set destinations, and publish approved social outreach campaigns without rebuilding the backend.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button style={button} onClick={load}>{loading ? 'Loading…' : 'Refresh readiness'}</button>
          <button style={ghost} onClick={setup}>Run setup</button>
        </div>
      </div>
      {message ? <p style={{ color: message.toLowerCase().includes('ready') ? '#22c55e' : '#fb923c', fontWeight: 850 }}>{message}</p> : null}
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <div style={panel}>{chip('supported platforms', '#1af0ff')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.supportedPlatforms ?? '-'}</h2></div>
      <div style={panel}>{chip('configured providers', '#ffc300')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.configuredProviders ?? '-'}</h2></div>
      <div style={panel}>{chip('publish-ready', '#22c55e')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.publishReadyPlatforms ?? '-'}</h2></div>
      <div style={panel}>{chip('schema', data?.schemaReady ? '#22c55e' : '#fb923c')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.schemaReady ? 'ready' : 'not ready'}</h2></div>
    </section>

    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0 }}>Enterprise safety rules</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{Object.entries(data?.rules || {}).map(([key, value]) => chip(`${key}: ${value ? 'yes' : 'no'}`, value ? '#22c55e' : '#fb923c'))}</div>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
      {platforms.map(platform => <PlatformCard key={platform.platform} platform={platform} onSaved={load} />)}
      {!loading && !platforms.length ? <div style={panel}><p style={{ color: '#fff' }}>{message || 'No platform capability data returned.'}</p></div> : null}
    </section>

    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0 }}>Operational note</h2>
      <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>Currently publish-ready: {ready.map(p => p.label).join(', ') || 'none'}. Other platforms are structurally supported and become live after provider credentials, OAuth connection, and destination refs are configured.</p>
    </section>
  </main>
}
