'use client'

import { useEffect, useMemo, useState } from 'react'
import CosaCampaignFeed, { type CosaCampaignFeedItem } from '@/components/cosa/CosaCampaignFeed'

type OutreachRow = {
  id: string
  business_name: string
  business_url: string
  contact_email?: string | null
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
  useEffect(() => { setSendEmail(selected?.contact_email || '') }, [selected])

  const campaignFeed = useMemo<CosaCampaignFeedItem[]>(() => {
    return (data?.recentOutreach || []).map(row => ({
      id: row.id,
      title: row.business_name || 'Untitled campaign',
      status: row.status || 'pending',
      description: row.analyzer_summary?.hmi_summary || row.outreach_message || row.business_model_profile?.summary || 'No campaign summary available yet.',
      cta: row.business_url || row.contact_email || 'No CTA target available',
      source: row.source_platform,
    }))
  }, [data])

  const predictedNeeds = useMemo(() => {
    const needs = data?.recentOutreach.flatMap(row => row.predictive_needs?.likely_next_needs || []) || []
    return needs.reduce((acc: Record<string, number>, item: any) => {
      const label = item?.need || 'Unknown need'
      acc[label] = (acc[label] || 0) + 1
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
    if (res.ok) {
      const mode = String(json?.providerResult?.mode || '')
      const reallyEmailed = mode !== '' && mode !== 'manual_record_only'
      setMessage(reallyEmailed ? `✅ Email sent (${mode}).` : '⚠️ Recorded only — no email was sent.')
    } else {
      setMessage(json.error || 'Send failed')
    }
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
    if (res.ok) { setSourceUrl(''); setBusinessName('') }
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-white/60">
        Loading ADM Console...
      </div>
    )
  }

  const dashboardMetrics = [
    ['Pending', data?.metrics.pending],
    ['Approved', data?.metrics.approved],
    ['Sent', data?.metrics.sent],
    ['24h Sends', `${data?.metrics.sendLimit?.count || 0}/${data?.metrics.sendLimit?.limit || 50}`],
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[20px] border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-950/95 p-7 shadow-2xl shadow-black/50 backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="sb-eyebrow">ADM Console</span>
            <h1 className="sb-h2 mt-3">Dashboards → Security Logs → Outreach Control → Predictive Insights.</h1>
            <p className="sb-body max-w-2xl">{data?.hmi.summary || 'AI outreach command center with human approval, predictive needs, and security visibility.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={syncDigits} className="sb-button-secondary" style={{ opacity: busy ? 0.5 : 1 }}>Sync Digits</button>
            <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className="sb-button-primary" style={{ border: 'none', opacity: busy ? 0.5 : 1 }}>
              {data?.metrics.panicSwitch ? 'Disable Panic Switch' : 'Enable Panic Switch'}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-white/85">
          {message}
        </div>
      )}

      <section aria-label="Dashboards" className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        {dashboardMetrics.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <p className="m-0 text-[11px] uppercase tracking-widest text-white/45">{label}</p>
            <p className="mb-0 mt-2 text-3xl font-black text-white">{value ?? 0}</p>
          </div>
        ))}
      </section>

      <section aria-label="Security Logs" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="sb-eyebrow">Security Logs</span>
            <h2 className="sb-h3 mt-2">Safety before scale.</h2>
          </div>
          <span className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-300/85">
            24h events: {data?.metrics.security24h ?? 0}
          </span>
        </div>
        <InfoCard title="Recent Security Events" data={data?.recentSecurityEvents?.slice(0, 5)} />
      </section>

      <section aria-label="Outreach Control" className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <span className="sb-eyebrow">Outreach Control</span>
            <h2 className="sb-h3 mt-2">Analyze a business.</h2>
            <p className="mt-2 text-xs text-white/45">AI suggestion: start with businesses that show urgency but weak proof.</p>
            <div className="mt-4 flex flex-col gap-3">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Business name" className="sb-input w-full rounded-xl px-3 py-2.5 text-sm" />
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Public website or social URL" className="sb-input w-full rounded-xl px-3 py-2.5 text-sm" />
              <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="sb-button-primary w-full" style={{ border: 'none', opacity: busy || !sourceUrl ? 0.5 : 1 }}>Generate Assets + Queue</button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="sb-h3">Approval Queue</h3>
            <div className="mt-4">
              <CosaCampaignFeed
                campaigns={campaignFeed}
                selectedId={selected?.id}
                emptyLabel="No outreach records yet."
                onSelect={(campaign) => {
                  const row = data?.recentOutreach.find(item => item.id === campaign.id)
                  if (row) setSelected(row)
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {selected ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="sb-eyebrow">Generated Assets</span>
                  <h3 className="mt-2 text-xl font-semibold text-white">{selected.business_name}</h3>
                  <p className="mt-1 text-sm text-white/45">{selected.business_url}</p>
                  <p className="mt-2 text-sm font-bold" style={{ color: selected.contact_email ? '#1af0ff' : '#f59e0b' }}>
                    {selected.contact_email ? `Will send to: ${selected.contact_email}` : 'No recipient email found — this draft cannot be sent.'}
                  </p>
                  <p className="mt-3 text-sm text-white/70">{selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || selected.status === 'approved'} onClick={() => patchOutreach(selected.id, 'approved')} className="sb-button-primary" style={{ border: 'none', opacity: busy || selected.status === 'approved' ? 0.5 : 1 }}>Approve</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => patchOutreach(selected.id, 'rejected')} className="rounded-full border-0 bg-red-600 px-4 py-2 text-sm font-bold text-white" style={{ opacity: busy || selected.status === 'rejected' ? 0.5 : 1 }}>Reject</button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
                <InfoCard title="Analyzer" data={selected.analyzer_summary} />
                <InfoCard title="Profiler" data={selected.business_model_profile} />
                <InfoCard title="Predictive Intelligence" data={selected.predictive_needs} />
                <InfoCard title="Review Strategy" data={selected.review_strategy} />
                <InfoCard title="Social Plan" data={selected.social_plan} />
                <InfoCard title="Promo Campaign" data={selected.promo_plan} />
              </div>

              <div className="sb-ai-feedback mt-5">
                <strong>AI feedback</strong>
                <p>This campaign looks strong for urgency, but you could add a testimonial before sending.</p>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <h4 className="m-0 font-semibold text-white">Outreach Message</h4>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/70">{selected.outreach_message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="Optional email recipient" className="sb-input min-w-[180px] flex-1 rounded-xl px-3 py-2.5 text-sm" />
                  <button disabled={busy || selected.status !== 'approved'} onClick={sendSelected} className="sb-button-secondary" style={{ opacity: busy || selected.status !== 'approved' ? 0.5 : 1 }}>Send Now</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-white/40">No outreach records yet.</div>
          )}
        </div>
      </section>

      <section aria-label="Predictive Insights" className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <InfoCard title="Predictive Insights" data={predictedNeeds} />
        <InfoCard title="AI Behavior Monitor" data={data?.recentAiTasks?.slice(0, 5)} />
      </section>
    </div>
  )
}

function InfoCard({ title, data }: { title: string; data: any }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <h4 className="m-0 font-semibold text-white">{title}</h4>
      <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-white/50">
        {JSON.stringify(data || {}, null, 2)}
      </pre>
    </div>
  )
}
