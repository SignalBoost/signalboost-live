'use client'

// saas/app/dashboard/marketing/press-providers/page.tsx
// Press & Media Provider Cockpit — mirrors the Social Outreach Connector Cockpit layout
// (/dashboard/outreach/social). Reads providers from the press-media registry (live vs
// coming) and drives the free provider end-to-end via /api/agency/press-media.

import { LocalizedText } from '@/components/i18n/LocalizedText'
import PressProviderConnectForm from './PressProviderConnectForm'
import { useEffect, useMemo, useState } from 'react'

type Provider = { id: string; label: string; type: string; cost: string; proof: string; needs: string[]; blurb: string; live: boolean; registered?: boolean }
type Campaign = {
  id: string; status: string; media_target_type: string; headline?: string | null; publication_name?: string | null
  editor_contact?: string | null; publication_contact?: string | null; cta_url?: string | null; published_url?: string | null
  source?: string | null; updated_at?: string | null
}
type Cockpit = { ok: boolean; providers: Provider[]; summary: { total: number; live: number; coming: number }; campaigns: Campaign[]; error?: string }

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }
const field: React.CSSProperties = { background: 'rgba(2,6,23,.8)', border: '1px solid rgba(148,163,184,.22)', borderRadius: 12, color: '#fff', padding: 10, width: '100%', boxSizing: 'border-box' }

function chip(text: string, color = '#94a3b8') {
  return <span style={{ display: 'inline-flex', border: `1px solid ${color}66`, background: `${color}18`, color, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 900 }}>{text}</span>
}
function statusColor(c: Campaign) {
  if (c.status === 'published') return '#22c55e'
  if (c.status === 'approved') return '#1af0ff'
  if (c.status === 'rejected') return '#fb923c'
  return '#ffc300'
}
function goodMessage(value: string) { return /sent|saved|ready|queued|submitted|dispatched|published|recorded/i.test(value) }

// ── One provider card (the placement Luis liked, applied to press adapter types) ──
function ProviderCard({ provider, onRan }: { provider: Provider; onRan: () => void }) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [editorEmail, setEditorEmail] = useState('')
  const [publicationName, setPublicationName] = useState('')
  const [audience, setAudience] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [language, setLanguage] = useState('')
  const [autoDispatch, setAutoDispatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const color = provider.live ? '#22c55e' : '#fb923c'
  const isPaid = provider.id !== 'free_submission'

  async function run() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          provider_id: provider.id, goal, editor_email: editorEmail, publication_name: publicationName,
          audience, cta_url: ctaUrl, language, auto_dispatch: autoDispatch,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || 'Could not run the campaign.')
      setMessage(json.state === 'submitted' ? 'Submitted to the editor — proof stays pending until you record the published link.' : `Queued for owner approval (${json.status}).`)
      setGoal(''); onRan()
    } catch (err: any) { setMessage(err?.message || 'Could not run the campaign.') }
    finally { setBusy(false) }
  }

  return <article style={{ ...panel, borderColor: `${color}55` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div>
        <h3 style={{ color: '#fff', margin: 0 }}>{provider.label}</h3>
        <p style={{ color: 'rgba(255,255,255,.58)', margin: '6px 0 0', fontSize: 12 }}>{provider.type} · {provider.cost} · proof: {provider.proof}</p>
      </div>
      {chip(provider.live ? 'live' : 'coming soon', color)}
    </div>

    <p style={{ color: 'rgba(255,255,255,.66)', fontSize: 13, lineHeight: 1.6, margin: '12px 0 0' }}>{provider.blurb}</p>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {chip(`cost: ${provider.cost}`, provider.cost === 'free' ? '#22c55e' : '#ffc300')}
      {chip(`proof: ${provider.proof}`, '#1af0ff')}
      {provider.needs.map((n) => chip(`needs: ${n}`, '#94a3b8'))}
    </div>

    {provider.live ? <div style={{ marginTop: 14 }}>
      <button style={button} onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Run a press campaign'}</button>
      {open ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this release say? e.g. Announce our AI audit tool to free IT magazines." rows={3} style={{ ...field, resize: 'vertical' }} />
        <input value={editorEmail} onChange={(e) => setEditorEmail(e.target.value)} placeholder="Verified editor email (real contact only)" style={field} />
        <input value={publicationName} onChange={(e) => setPublicationName(e.target.value)} placeholder="Publication name" style={field} />
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience (optional)" style={field} />
        <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="Call-to-action URL (optional)" style={field} />
        <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Language (optional, e.g. es, pt)" style={field} />
        <label style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={autoDispatch} onChange={(e) => setAutoDispatch(e.target.checked)} />
          <LocalizedText fallback={"Send now (owner only — otherwise it queues for approval)"} />
        </label>
        <button style={button} disabled={busy || !goal.trim()} onClick={run}>{busy ? 'Working…' : 'Generate & run'}</button>
      </div> : null}
      {isPaid ? <PressProviderConnectForm providerId={provider.id} connected onChanged={onRan} /> : null}
    </div> : provider.registered ? <div style={{ marginTop: 14 }}>
      <PressProviderConnectForm providerId={provider.id} onChanged={onRan} />
    </div> : <div style={{ marginTop: 14 }}>
      <button style={ghost} disabled title="Connect your own provider account — coming"><LocalizedText fallback={"Connect provider (coming)"} /></button>
      <details style={{ marginTop: 12 }}>
        <summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}><LocalizedText fallback={"Connection method — API · COS+PR · Browser Agent"} /></summary>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, margin: 0 }}><LocalizedText fallback={"When this provider is enabled you connect your OWN account — the platform never fronts the spend. All three paths reach the same result."} /></p>
          <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}><p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>API <span style={{ color: '#22c55e', fontWeight: 700 }}>· cheapest</span></p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}><LocalizedText fallback={"Paste this provider's API key; the engine drives it directly."} /></p></div>
          <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}><p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>COS + PR</p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}><LocalizedText fallback={"Stage the provider credentials as an infrastructure PR, review and merge, then connect."} /></p></div>
          <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}><p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}><LocalizedText fallback={"Browser Agent"} /> <span style={{ color: '#ffc300', fontWeight: 700 }}>· premium</span></p><p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}><LocalizedText fallback={"Assisted setup that drives the provider's own screens and pauses for login / 2FA."} /></p></div>
        </div>
      </details>
    </div>}

    {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }}>{message}</p> : null}
  </article>
}

// ── One campaign row with owner actions (mirrors social's destination actions) ──
function CampaignRow({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const color = statusColor(campaign)

  async function act(action: 'dispatch' | 'record_url') {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/agency/press-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action, campaign_id: campaign.id, url }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || 'Action failed.')
      setMessage(action === 'dispatch' ? 'Dispatched through the provider.' : 'Published link recorded.')
      onChanged()
    } catch (err: any) { setMessage(err?.message || 'Action failed.') }
    finally { setBusy(false) }
  }

  return <div style={{ ...panel, borderColor: `${color}44` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
      <div>
        <h4 style={{ color: '#fff', margin: 0, fontSize: 14 }}>{campaign.headline || campaign.publication_name || campaign.media_target_type}</h4>
        <p style={{ color: 'rgba(255,255,255,.55)', margin: '4px 0 0', fontSize: 11 }}>{campaign.media_target_type} · {campaign.editor_contact || campaign.publication_contact || 'no contact'}{campaign.source ? ` · ${campaign.source}` : ''}</p>
      </div>
      {chip(campaign.status.replace(/_/g, ' '), color)}
    </div>

    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {campaign.status === 'pending_owner_review' ? <button style={button} disabled={busy} onClick={() => act('dispatch')}>{busy ? 'Working…' : 'Approve & dispatch'}</button> : null}
      {campaign.published_url ? <a href={campaign.published_url} target="_blank" rel="noreferrer" style={{ ...ghost, textDecoration: 'none' }}><LocalizedText fallback={"Open published link"} /></a> : <>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Record real published URL" style={{ ...field, width: 260 }} />
        <button style={ghost} disabled={busy || !/^https?:\/\//i.test(url)} onClick={() => act('record_url')}>{busy ? 'Working…' : 'Record URL'}</button>
      </>}
    </div>
    {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', margin: '10px 0 0', fontSize: 12 }}>{message}</p> : null}
  </div>
}

export default function PressMediaProviderCockpit() {
  const [data, setData] = useState<Cockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true); setMessage('')
    try {
      const res = await fetch('/api/agency/press-media', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({ ok: false, error: 'Invalid cockpit response' }))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not load press providers.')
      setData(json)
    } catch (err: any) { setMessage(err?.message || 'Could not load press providers.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  const providers = data?.providers || []
  const campaigns = data?.campaigns || []
  const liveNames = useMemo(() => providers.filter((p) => p.live).map((p) => p.label), [providers])

  return <main style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 22px', display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'radial-gradient(circle at top left, rgba(26,240,255,.14), transparent 28rem), linear-gradient(145deg, rgba(15,23,42,.96), rgba(2,6,23,.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}><LocalizedText fallback={"Enterprise plug-and-play"} /></p>
          <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.04em' }}><LocalizedText fallback={"Press & Media Provider Cockpit"} /></h1>
          <p style={{ color: 'rgba(255,255,255,.66)', maxWidth: 880, lineHeight: 1.6 }}>Connect your own media providers and the same governed engine drives them all: brief, AI-written release, owner approval, spend gate, dispatch, and provider-shaped proof. SignalBoost runs on the free provider; resourced buyers flip on paid ones — no backend change.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button style={button} onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button></div>
      </div>
      {message ? <p style={{ color: goodMessage(message) ? '#22c55e' : '#fb923c', fontWeight: 850 }}>{message}</p> : null}
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <div style={panel}>{chip('provider types', '#1af0ff')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.total ?? '-'}</h2></div>
      <div style={panel}>{chip('live now', '#22c55e')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.live ?? '-'}</h2></div>
      <div style={panel}>{chip('coming', '#ffc300')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{data?.summary?.coming ?? '-'}</h2></div>
      <div style={panel}>{chip('recent campaigns', '#94a3b8')}<h2 style={{ color: '#fff', margin: '8px 0 0' }}>{campaigns.length}</h2></div>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
      {providers.map((p) => <ProviderCard key={p.id} provider={p} onRan={load} />)}
      {!loading && !providers.length ? <div style={panel}><p style={{ color: '#fff' }}>{message || 'No provider data returned.'}</p></div> : null}
    </section>

    {campaigns.length ? <section style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ color: '#fff', margin: 0 }}><LocalizedText fallback={"Recent press campaigns"} /></h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>{campaigns.map((c) => <CampaignRow key={c.id} campaign={c} onChanged={load} />)}</div>
    </section> : null}

    <section style={panel}><h2 style={{ color: '#fff', margin: 0 }}><LocalizedText fallback={"Operational note"} /></h2><p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>Live now: {liveNames.join(', ') || 'none'}. The other provider types are structurally supported and go live once their adapter is registered — the card flips to live automatically. Paid providers never auto-send without owner budget approval, and no published URL is ever fabricated: the owner records the real link.</p></section>
  </main>
}
