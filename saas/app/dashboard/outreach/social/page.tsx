'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
      setMessage(uiCopy('u_47e3b94c02d591a1')); onSaved()
    } catch (err: any) { setMessage(err?.message || uiCopy('u_846449a0f6f9fd30')) }
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
      setMessage(`Discovered ${json.discovered || 0} destination(s)${selected ? uiCopy('u_f24b2671a077ae2b') : '.'}`)
      onSaved()
    } catch (err: any) { setMessage(err?.message || uiCopy('u_f87dc5d0ec8aad55')) }
    finally { setDiscovering(false) }
  }

  async function stageKeysPr() {
    setStaging(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/connect-via-pr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ platform: platform.platform, clientId, clientSecret }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not stage the keys PR.')
      setClientId(''); setClientSecret('')
      setMessage(uiCopy('u_cfb92b7c8cf57638'))
    } catch (err: any) { setMessage(err?.message || uiCopy('u_d2926bd60e31e2fb')) }
    finally { setStaging(false) }
  }

  return <article style={{ ...panel, borderColor: `${color}55` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div><h3 style={{ color: '#fff', margin: 0 }}>{platform.label}</h3><p style={{ color: 'rgba(255,255,255,.58)', margin: '6px 0 0', fontSize: 12 }}>{platform.platform} · {platform.contentKind}{platform.needsAccountRef ? uiCopy('u_995ec0155614ba22') : ''}</p></div>
      {chip(platform.status.replace(/_/g, ' '), color)}
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {chip(platform.configured ? uiCopy('u_981e35fc28bd91da') : uiCopy('u_3d85ca6d0470c5be'), platform.configured ? '#22c55e' : uiCopy('u_fee96ac315a27428'))}
      {chip(platform.connected ? uiCopy('u_2b70e9a5faf2e154') : uiCopy('u_a59145eba21915c7'), platform.connected ? '#22c55e' : uiCopy('u_2c1935d641692409'))}
      {chip(platform.publishReady ? uiCopy('u_5dc710061a5ae921') : uiCopy('u_89408d172de0b8be'), platform.publishReady ? '#22c55e' : uiCopy('u_1b50ef66d740bba7'))}
      {chip(`${platform.destinations?.length || 0} discovered destination(s)`, platform.destinations?.length ? uiCopy('u_02a948d8a9b37496') : '#94a3b8')}
    </div>

    {platform.missing.length ? <div style={{ marginTop: 12 }}><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '0 0 6px' }}>{uiCopy('u_f18078a1bd239c03')}</p><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{platform.missing.map(item => chip(item, '#fb923c'))}</div></div> : null}

    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      <button style={button} disabled={!platform.configured} onClick={() => { window.location.href = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform.platform)}` }}>{platform.connected ? uiCopy('u_1fa9ee19cf974e96') : uiCopy('u_f4c124ca228147dd')}</button>
      <button style={ghost} disabled={!platform.connected || discovering} onClick={discoverDestinations}>{discovering ? uiCopy('u_04872610a95e06ab') : uiCopy('u_ece1b9fbff497362')}</button>
      <button style={ghost} onClick={() => { window.location.href = `/api/outreach/social/oauth?platform=${encodeURIComponent(platform.platform)}&json=1` }}><LocalizedText fallback={uiCopy('u_eadab2feb149347a')} /></button>
    </div>

    <details style={{ marginTop: 12 }}>
      <summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}><LocalizedText fallback={uiCopy('u_6b0c74b8c2b57555')} /></summary>
      <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, margin: 0 }}><LocalizedText fallback={uiCopy('u_c3f44f99137d1a4f')} /></p>

        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{uiCopy('u_38c26894cab9239a')}<span style={{ color: '#22c55e', fontWeight: 700 }}>{uiCopy('u_81170ab44319dd3c')}</span></p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}><LocalizedText fallback={uiCopy('u_28ecb26cee124032')} /></p>
        </div>

        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{uiCopy('u_a682557e44aa5a2e')}</p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}><LocalizedText fallback={uiCopy('u_c46cf3b7f61c18fd')} /></p>
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={uiCopy('u_351cb20f4bd0b042')} style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box' }} />
          <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={uiCopy('u_828b9e24b894eb2b')} type="password" style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box', marginTop: 8 }} />
          <button style={{ ...ghost, marginTop: 8 }} disabled={staging || !clientId || !clientSecret} onClick={stageKeysPr}>{staging ? uiCopy('u_4f99b80d771c7a59') : uiCopy('u_e4cdbbe302457ab1')}</button>
        </div>

        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}><LocalizedText fallback={uiCopy('u_0f16a668d7d753b9')} /><span style={{ color: '#ffc300', fontWeight: 700 }}>{uiCopy('u_97eeab0e4a3653ec')}</span></p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}><LocalizedText fallback={uiCopy('u_abb789b408f418ff')} /></p>
          <button style={ghost} disabled title={uiCopy('u_c5b7da319b393c9f')}><LocalizedText fallback={uiCopy('u_8c2f9af7e0fe2a4d')} /></button>
        </div>
      </div>
    </details>

    {platform.destinations?.length ? <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 850, margin: 0 }}><LocalizedText fallback={uiCopy('u_7d74c7837e668974')} /></p>
      {platform.destinations.map((d, i) => <button key={`${d.accountRef}-${i}`} style={ghost} onClick={() => { setAccountRef(d.accountRef || ''); setAccountName(d.accountName || ''); if (d.accountRef) saveRef(d.accountRef, d.accountName || '') }}>{d.accountName || d.accountRef} · {d.kind}{d.hasAccessToken ? uiCopy('u_c27aa3d406f9f3e5') : ''}</button>)}
    </div> : null}

    {platform.needsAccountRef ? <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
      <label style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800 }}><LocalizedText fallback={uiCopy('u_4aab2ff0c9f5f7d0')} /></label>
      <input value={accountRef} onChange={e => setAccountRef(e.target.value)} placeholder={uiCopy('u_dc0823cf196be6cd')} style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10 }} />
      <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder={uiCopy('u_5306a7fad0cfb5c6')} style={{ background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10 }} />
      <button style={ghost} disabled={saving || !platform.connected} onClick={() => saveRef()}>{saving ? uiCopy('u_418b166e60281117') : uiCopy('u_a1287dd23d2e1785')}</button>
    </div> : null}

    {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }}>{message}</p> : null}
    <details style={{ marginTop: 12 }}><summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}><LocalizedText fallback={uiCopy('u_77f060fda5353aa3')} /></summary><pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,.26)', color: 'rgba(226,232,240,.82)', padding: 12, borderRadius: 12, overflow: 'auto', fontSize: 11 }}>{JSON.stringify(platform, null, 2)}</pre></details>
  </article>
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
    } catch (err: any) { setMessage(err?.message || uiCopy('u_7e27137747d281c4')) }
    finally { setLoading(false) }
  }

  async function setup() {
    setLoading(true); setMessage('')
    try {
      const res = await fetch('/api/outreach/social/setup', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Setup failed')
      setMessage(uiCopy('u_392fe62276b1e94d')); await load()
    } catch (err: any) { setMessage(err?.message || uiCopy('u_63984983d62f5767')) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  const platforms = data?.platforms || []
  const ready = useMemo(() => platforms.filter(p => p.publishReady), [platforms])

  return <main style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'radial-gradient(circle at top left, rgba(26,240,255,.14), transparent 28rem), linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'start' }}>
        <div><p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}><LocalizedText fallback={uiCopy('u_f21c7c4a7003aad5')} /></p><h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.04em' }}><LocalizedText fallback={uiCopy('u_f34f4c7b2f42a344')} /></h1><p style={{ color: 'rgba(255,255,255,.66)', maxWidth: 880, lineHeight: 1.6 }}>{uiCopy('u_033c525caf4bf112')}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button style={button} onClick={load}>{loading ? uiCopy('u_2750fb3e07650994') : uiCopy('u_34bfd6a88016234b')}</button><button style={ghost} onClick={setup}><LocalizedText fallback={uiCopy('u_ede32f7277637e91')} /></button></div>
      </div>
      {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', fontWeight: 850 }}>{message}</p> : null}
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <div style={panel}>{chip(uiCopy('u_074c90ce83154b92'), uiCopy('u_24be7a37f8da4d00'))}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.supportedPlatforms ?? '-'}</h2></div>
      <div style={panel}>{chip(uiCopy('u_48c67e185a6ece7a'), uiCopy('u_213060d9bc65e293'))}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.configuredProviders ?? '-'}</h2></div>
      <div style={panel}>{chip(uiCopy('u_0cf64b6117979fec'), '#22c55e')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.publishReadyPlatforms ?? '-'}</h2></div>
      <div style={panel}>{chip(uiCopy('u_7b481d3b0a9b3b7c'), data?.schemaReady ? '#22c55e' : uiCopy('u_0a1f68fed17f9dd3'))}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.schemaReady ? uiCopy('u_1fe9021ef23eeeaa') : uiCopy('u_5b4fe52c10850866')}</h2></div>
    </section>

    <section style={panel}><h2 style={{ color: '#fff', margin: 0 }}><LocalizedText fallback={uiCopy('u_e4b976b8bfa13e81')} /></h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{Object.entries(data?.rules || {}).map(([key, value]) => chip(`${key}: ${value ? 'yes' : 'no'}`, value ? '#22c55e' : '#fb923c'))}</div></section>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>{platforms.map(platform => <PlatformCard key={platform.platform} platform={platform} onSaved={load} />)}{!loading && !platforms.length ? <div style={panel}><p style={{ color: '#fff' }}>{message || uiCopy('u_b35f8e6e1b44ee4d')}</p></div> : null}</section>
    <section style={panel}><h2 style={{ color: '#fff', margin: 0 }}><LocalizedText fallback={uiCopy('u_a0e7455585f8603f')} /></h2><p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>{uiCopy('u_5ca2dfa7a8c1c5ea')}{ready.map(p => p.label).join(', ') || uiCopy('u_3ac97dc268c9a94e')}{uiCopy('u_6e1b12c06c7cb896')}</p></section>
  </main>
}
