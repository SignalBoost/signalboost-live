'use client'

import { useEffect, useMemo, useState } from 'react'

type OutreachRow = {
  id: string
  business_name: string
  business_url: string
  source_platform: string
  status: string
  created_at: string
  analyzer_summary?: any
  business_model_profile?: any
  predictive_needs?: any
  outreach_message?: string
}

type AdmData = {
  metrics: Record<string, any>
  recentOutreach: OutreachRow[]
  recentAiTasks: any[]
  recentSecurityEvents: any[]
  hmi: { summary: string; nextActions: string[] }
}

const workflow = ['Dashboards', 'Security Logs', 'Outreach Control', 'Predictive Insights']

export default function AdmConsoleClient() {
  const [data, setData] = useState<AdmData | null>(null)
  const [selected, setSelected] = useState<OutreachRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [sendEmail, setSendEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/adm', { cache: 'no-store' })
    const json = await res.json()
    if (res.ok) {
      setData(json)
      setSelected((current) => current ? json.recentOutreach.find((row: OutreachRow) => row.id === current.id) || current : json.recentOutreach[0] || null)
    } else {
      setMessage(json.error || 'Failed to load ADM Console')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const predictedNeeds = useMemo(() => {
    const needs = data?.recentOutreach.flatMap(row => row.predictive_needs?.likely_next_needs || []) || []
    return needs.reduce((acc: Record<string, number>, item: any) => {
      acc[item.need] = (acc[item.need] || 0) + 1
      return acc
    }, {})
  }, [data])

  async function patchOutreach(id: string, status: string) {
    setBusy(true)
    const res = await fetch('/api/outreach/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const json = await res.json()
    setMessage(res.ok ? `Outreach ${status}.` : json.error || 'Update failed')
    setBusy(false)
    await load()
  }

  async function sendSelected() {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_id: selected.id, channel: sendEmail ? 'email' : 'manual', to_email: sendEmail || undefined }),
    })
    const json = await res.json()
    setMessage(res.ok ? 'Outreach send recorded.' : json.error || 'Send failed')
    setBusy(false)
    await load()
  }

  async function runManualAnalysis() {
    setBusy(true)
    const res = await fetch('/api/outreach/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_url: sourceUrl, business_name: businessName, source_platform: 'manual' }),
    })
    const json = await res.json()
    setMessage(res.ok ? 'Business analyzed and queued.' : json.error || 'Analysis failed')
    setBusy(false)
    if (res.ok) {
      setSourceUrl('')
      setBusinessName('')
    }
    await load()
  }

  async function syncDigits() {
    setBusy(true)
    const res = await fetch('/api/outreach/digits/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    })
    const json = await res.json()
    setMessage(res.ok ? `Digits sync processed ${json.processed || 0} partners.` : json.error || 'Digits sync failed')
    setBusy(false)
    await load()
  }

  async function togglePanic(value: boolean) {
    setBusy(true)
    const res = await fetch('/api/admin/adm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_sending_disabled: value }),
    })
    const json = await res.json()
    setMessage(res.ok ? (value ? 'Panic switch enabled.' : 'Panic switch disabled.') : json.error || 'Setting update failed')
    setBusy(false)
    await load()
  }

  if (loading) return <div className="sb-glass" style={{ padding: 24 }}>Loading ADM Console...</div>

  return (
    <div className="sb-stack">
      <section className="sb-glass sb-grid-2" style={{ padding: 28, alignItems: 'end' }}>
        <div className="sb-stack">
          <p className="sb-eyebrow">Admin command center</p>
          <h2 className="sb-h2">ADM Console</h2>
          <p className="sb-body">{data?.hmi.summary}</p>
          <div className="sb-row">{workflow.map(step => <span className="sb-chip" key={step}>{step}</span>)}</div>
        </div>
        <div className="sb-row" style={{ justifyContent: 'flex-end' }}>
          <button disabled={busy} onClick={syncDigits} className="sb-button sb-button-secondary">Sync Digits</button>
          <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className="sb-button sb-button-primary">
            {data?.metrics.panicSwitch ? 'Disable Panic Switch' : 'Enable Panic Switch'}
          </button>
        </div>
      </section>

      {message && <div className="sb-ai-prompt">{message}</div>}

      <section className="sb-grid-4">
        {[
          ['Pending', data?.metrics.pending],
          ['Approved', data?.metrics.approved],
          ['Sent', data?.metrics.sent],
          ['Security Logs', data?.recentSecurityEvents?.length || 0],
          ['AI Tasks', data?.recentAiTasks?.length || 0],
          ['Daily Limit', data?.metrics.dailyLimit],
          ['Panic Switch', data?.metrics.panicSwitch ? 'On' : 'Off'],
          ['Predicted Needs', Object.keys(predictedNeeds).length],
        ].map(([label, value]) => (
          <div key={label} className="sb-glass-soft" style={{ padding: 18 }}>
            <p className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</p>
            <p className="sb-h3" style={{ marginTop: 8 }}>{value ?? '—'}</p>
          </div>
        ))}
      </section>

      <section className="sb-grid-2">
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">Outreach Control</p>
          <input className="sb-input" style={{ borderRadius: 14, padding: 12 }} placeholder="Business name" value={businessName} onChange={e => setBusinessName(e.target.value)} />
          <input className="sb-input" style={{ borderRadius: 14, padding: 12 }} placeholder="Business URL" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
          <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="sb-button sb-button-primary">Analyze and queue</button>
          <p className="sb-ai-prompt">“I’ll analyze, profile, predict, generate assets, then wait for approval.”</p>
        </div>

        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">Predictive Insights</p>
          {Object.entries(predictedNeeds).length === 0 ? <p className="sb-body">No prediction cluster yet.</p> : Object.entries(predictedNeeds).map(([need, count]) => (
            <div className="sb-row" key={need} style={{ justifyContent: 'space-between' }}><span>{need}</span><span className="sb-chip">{String(count)}</span></div>
          ))}
        </div>
      </section>

      <section className="sb-grid-2">
        <div className="sb-glass-soft sb-stack" style={{ padding: 20 }}>
          <p className="sb-eyebrow">Approval Queue</p>
          {data?.recentOutreach?.map(row => (
            <button key={row.id} onClick={() => setSelected(row)} className="sb-glass-soft" style={{ padding: 14, textAlign: 'left', color: '#fff', borderColor: selected?.id === row.id ? 'rgba(255,195,0,0.45)' : 'rgba(255,255,255,0.10)' }}>
              <strong>{row.business_name || row.business_url}</strong>
              <p className="sb-caption">{row.status} • {row.source_platform}</p>
            </button>
          )) || <p className="sb-body">No outreach queued.</p>}
        </div>

        <div className="sb-glass sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">Generated Assets</p>
          <h3 className="sb-h3">{selected?.business_name || 'Select an outreach item'}</h3>
          <p className="sb-body" style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{selected?.outreach_message || 'Generated email, campaign notes, and approval controls appear here.'}</p>
          <div className="sb-tone-selector"><span>Friendly</span><span>Professional</span><span>Playful</span></div>
          <input className="sb-input" style={{ borderRadius: 14, padding: 12 }} placeholder="Optional send-to email" value={sendEmail} onChange={e => setSendEmail(e.target.value)} />
          <div className="sb-row">
            <button disabled={busy || !selected} onClick={() => selected && patchOutreach(selected.id, 'approved')} className="sb-button sb-button-secondary">Approve</button>
            <button disabled={busy || !selected} onClick={sendSelected} className="sb-button sb-button-primary">Send / record</button>
            <button disabled={busy || !selected} onClick={() => selected && patchOutreach(selected.id, 'rejected')} className="sb-button sb-button-ghost">Reject</button>
          </div>
          <p className="sb-ai-prompt">This campaign looks strong for urgency, but you could add a testimonial.</p>
        </div>
      </section>
    </div>
  )
}
