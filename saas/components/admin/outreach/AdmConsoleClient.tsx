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
  website_json?: any
  review_strategy?: any
  social_plan?: any
  promo_plan?: any
}

type AdmData = {
  metrics: Record<string, any>
  recentOutreach: OutreachRow[]
  recentAiTasks: any[]
  recentSecurityEvents: any[]
  hmi: { summary: string; nextActions: string[] }
}

const statusColors: Record<string, string> = {
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  sent: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  rejected: 'border-red-500/40 bg-red-500/10 text-red-200',
}

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

  if (loading) return <div className="sb-card p-6 text-slate-300">Loading ADM Console...</div>

  const dashboardMetrics = [
    ['Pending', data?.metrics.pending],
    ['Approved', data?.metrics.approved],
    ['Sent', data?.metrics.sent],
    ['24h Sends', `${data?.metrics.sendLimit?.count || 0}/${data?.metrics.sendLimit?.limit || 50}`],
  ]

  return (
    <div className="space-y-6">
      <section className="sb-glass p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className="sb-eyebrow">ADM Console</span>
            <h1 className="sb-h2 mt-3">Dashboards → Security Logs → Outreach Control → Predictive Insights.</h1>
            <p className="sb-body max-w-3xl">{data?.hmi.summary || 'AI outreach command center with human approval, predictive needs, and security visibility.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={syncDigits} className="sb-button-secondary border disabled:opacity-50">Sync Digits</button>
            <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className="sb-button-primary border-0 disabled:opacity-50">
              {data?.metrics.panicSwitch ? 'Disable Panic Switch' : 'Enable Panic Switch'}
            </button>
          </div>
        </div>
      </section>

      {message && <div className="sb-card p-4 text-sm text-slate-200">{message}</div>}

      <section aria-label="Dashboards" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map(([label, value]) => (
          <div key={String(label)} className="sb-card p-5">
            <p className="sb-caption uppercase tracking-wider">{label}</p>
            <p className="mt-2 text-3xl font-black text-white">{value ?? 0}</p>
          </div>
        ))}
      </section>

      <section aria-label="Security Logs" className="sb-card p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="sb-eyebrow">Security Logs</span>
            <h2 className="sb-h3 mt-2">Safety before scale.</h2>
          </div>
          <span className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-100">24h events: {data?.metrics.security24h ?? 0}</span>
        </div>
        <InfoCard title="Recent Security Events" data={data?.recentSecurityEvents.slice(0, 5)} />
      </section>

      <section aria-label="Outreach Control" className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <div className="sb-card p-5">
            <span className="sb-eyebrow">Outreach Control</span>
            <h2 className="sb-h3 mt-2">Analyze a business.</h2>
            <p className="sb-caption mt-2">AI suggestion: start with businesses that show urgency but weak proof.</p>
            <div className="mt-4 space-y-3">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Business name" className="sb-input w-full rounded-xl px-3 py-3 text-sm" />
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Public website or social URL" className="sb-input w-full rounded-xl px-3 py-3 text-sm" />
              <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="sb-button-primary w-full border-0 disabled:opacity-50">Generate Assets + Queue</button>
            </div>
          </div>

          <div className="sb-card p-5">
            <h3 className="sb-h3">Approval Queue</h3>
            <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
              {data?.recentOutreach.map(row => (
                <button key={row.id} onClick={() => setSelected(row)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === row.id ? 'border-yellow-300/50 bg-yellow-300/10' : 'border-white/10 bg-black/20 hover:border-cyan-300/40'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white">{row.business_name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusColors[row.status] || 'border-slate-600 text-slate-300'}`}>{row.status}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.source_platform} • {row.business_url}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="sb-card p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <span className="sb-eyebrow">Generated Assets</span>
                  <h3 className="mt-2 text-xl font-semibold text-white">{selected.business_name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{selected.business_url}</p>
                  <p className="mt-3 text-sm text-slate-300">{selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || selected.status === 'approved'} onClick={() => patchOutreach(selected.id, 'approved')} className="sb-button-primary border-0 disabled:opacity-50">Approve</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => patchOutreach(selected.id, 'rejected')} className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reject</button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <InfoCard title="Analyzer" data={selected.analyzer_summary} />
                <InfoCard title="Profiler" data={selected.business_model_profile} />
                <InfoCard title="Predictive Intelligence" data={selected.predictive_needs} />
                <InfoCard title="Review Strategy" data={selected.review_strategy} />
                <InfoCard title="Social Plan" data={selected.social_plan} />
                <InfoCard title="Promo Campaign" data={selected.promo_plan} />
              </div>

              <div className="sb-ai-feedback">
                <strong>AI feedback</strong>
                <p>This campaign looks strong for urgency, but you could add a testimonial before sending.</p>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <h4 className="font-medium text-white">Outreach Message</h4>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.outreach_message}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="Optional email recipient" className="sb-input flex-1 rounded-xl px-3 py-3 text-sm" />
                  <button disabled={busy || selected.status !== 'approved'} onClick={sendSelected} className="sb-button-secondary disabled:opacity-50">Send Now</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="sb-card p-8 text-slate-400">No outreach records yet.</div>
          )}
        </div>
      </section>

      <section aria-label="Predictive Insights" className="grid gap-4 lg:grid-cols-2">
        <InfoCard title="Predictive Insights" data={predictedNeeds} />
        <InfoCard title="AI Behavior Monitor" data={data?.recentAiTasks.slice(0, 5)} />
      </section>
    </div>
  )
}

function InfoCard({ title, data }: { title: string; data: any }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <h4 className="font-medium text-white">{title}</h4>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">{JSON.stringify(data || {}, null, 2)}</pre>
    </div>
  )
}
