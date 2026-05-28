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

  if (loading) return <div className="text-slate-300">Loading ADM Console...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Admin Command Center</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">ADM Console</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">{data?.hmi.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={syncDigits} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Sync Digits</button>
          <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className={`rounded-lg px-4 py-2 text-sm font-medium ${data?.metrics.panicSwitch ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'} disabled:opacity-50`}>
            {data?.metrics.panicSwitch ? 'Disable Panic Switch' : 'Enable Panic Switch'}
          </button>
        </div>
      </div>

      {message && <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Pending', data?.metrics.pending],
          ['Approved', data?.metrics.approved],
          ['Sent', data?.metrics.sent],
          ['24h Sends', `${data?.metrics.sendLimit?.count || 0}/${data?.metrics.sendLimit?.limit || 50}`],
          ['Security Events', data?.metrics.security24h],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="font-semibold text-white">Analyze Business</h3>
            <div className="mt-4 space-y-3">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Business name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Public website or social URL" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Generate Assets + Queue</button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="font-semibold text-white">Outreach Queue</h3>
            <div className="mt-4 max-h-[640px] space-y-2 overflow-auto pr-1">
              {data?.recentOutreach.map(row => (
                <button key={row.id} onClick={() => setSelected(row)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === row.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
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
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">{selected.business_name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{selected.business_url}</p>
                  <p className="mt-3 text-sm text-slate-300">{selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || selected.status === 'approved'} onClick={() => patchOutreach(selected.id, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">Approve</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => patchOutreach(selected.id, 'rejected')} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50">Reject</button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <InfoCard title="Business Intelligence" data={selected.analyzer_summary} />
                <InfoCard title="Business Model Profiler" data={selected.business_model_profile} />
                <InfoCard title="Predictive Needs" data={selected.predictive_needs} />
                <InfoCard title="Review Strategy" data={selected.review_strategy} />
                <InfoCard title="Social Plan" data={selected.social_plan} />
                <InfoCard title="Promo Campaign" data={selected.promo_plan} />
              </div>

              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h4 className="font-medium text-white">Outreach Message</h4>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.outreach_message}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="Optional email recipient" className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
                  <button disabled={busy || selected.status !== 'approved'} onClick={sendSelected} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Send Now</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">No outreach records yet.</div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <InfoCard title="Predicted Needs Mix" data={predictedNeeds} />
            <InfoCard title="AI Behavior Monitor" data={data?.recentAiTasks.slice(0, 5)} />
            <InfoCard title="Security & Privacy" data={{ panicSwitch: data?.metrics.panicSwitch, rateLimit24h: data?.metrics.rateLimit24h, recentSecurityEvents: data?.recentSecurityEvents.slice(0, 5) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ title, data }: { title: string; data: any }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <h4 className="font-medium text-white">{title}</h4>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">{JSON.stringify(data || {}, null, 2)}</pre>
    </div>
  )
}
