'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'
import CosaCampaignFeed, { type CosaCampaignFeedItem } from '@/components/cosa/CosaCampaignFeed'
import { uiText } from '@/lib/i18n/uiText'

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
      setMessage(json.error || "Failed to load ADM Console")
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
    setMessage(res.ok ? `Outreach ${status}.` : json.error || "Update failed")
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
      setMessage(reallyEmailed ? `✅ Email sent (${mode}).` : "⚠️ Recorded only — no email was sent.")
    } else {
      setMessage(json.error || "Send failed")
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
    setMessage(res.ok ? "Business analyzed and queued." : json.error || "Analysis failed")
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
    setMessage(res.ok ? `Digits sync processed ${json.processed || 0} partners.` : json.error || "Digits sync failed")
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
    setMessage(res.ok ? (value ? "Panic switch enabled." : "Panic switch disabled.") : json.error || "Setting update failed")
    setBusy(false)
    await load()
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-white/60"><LocalizedText fallback={uiText('generatedUi.u_9c75fb6a9bca30e4')} /></div>
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
            <span className="sb-eyebrow"><LocalizedText fallback={uiText('generatedUi.u_29fcbf459e7a2fa1')} /></span>
            <h1 className="sb-h2 mt-3">{uiText('generatedUi.u_905e7a655afa2f68')}</h1>
            <p className="sb-body max-w-2xl">{data?.hmi.summary || uiText('generatedUi.u_8c11b3ab97d49e65')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={syncDigits} className="sb-button-secondary" style={{ opacity: busy ? 0.5 : 1 }}><LocalizedText fallback={uiText('generatedUi.u_6793870064873306')} /></button>
            <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className="sb-button-primary" style={{ border: 'none', opacity: busy ? 0.5 : 1 }}>
              {data?.metrics.panicSwitch ? uiText('generatedUi.u_894767b8ffaeadfb') : uiText('generatedUi.u_adeae630546b3ce6')}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-white/85">
          {message}
        </div>
      )}

      <section aria-label={uiText('generatedUi.u_a53bcafb67d960df')} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        {dashboardMetrics.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <p className="m-0 text-[11px] uppercase tracking-widest text-white/45">{label}</p>
            <p className="mb-0 mt-2 text-3xl font-black text-white">{value ?? 0}</p>
          </div>
        ))}
      </section>

      <section aria-label={uiText('generatedUi.u_6bb7c509ffb43a80')} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="sb-eyebrow"><LocalizedText fallback={uiText('generatedUi.u_6bb7c509ffb43a80')} /></span>
            <h2 className="sb-h3 mt-2"><LocalizedText fallback={uiText('generatedUi.u_2d9a4b3c5b47594d')} /></h2>
          </div>
          <span className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-300/85">{uiText('generatedUi.u_fb2689a7525128a3')}{data?.metrics.security24h ?? 0}
          </span>
        </div>
        <InfoCard title={uiText('generatedUi.u_45f316ab53d0d057')} data={data?.recentSecurityEvents?.slice(0, 5)} />
      </section>

      <section aria-label={uiText('generatedUi.u_83b2836083a4d6d3')} className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <span className="sb-eyebrow"><LocalizedText fallback={uiText('generatedUi.u_83b2836083a4d6d3')} /></span>
            <h2 className="sb-h3 mt-2"><LocalizedText fallback={uiText('generatedUi.u_e2911a3add3e0f74')} /></h2>
            <p className="mt-2 text-xs text-white/45"><LocalizedText fallback={uiText('generatedUi.u_0e14a54610b36186')} /></p>
            <div className="mt-4 flex flex-col gap-3">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={uiText('generatedUi.u_a921756ed1ccfa2a')} className="sb-input w-full rounded-xl px-3 py-2.5 text-sm" />
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder={uiText('generatedUi.u_44206a82a002447c')} className="sb-input w-full rounded-xl px-3 py-2.5 text-sm" />
              <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="sb-button-primary w-full" style={{ border: 'none', opacity: busy || !sourceUrl ? 0.5 : 1 }}>{uiText('generatedUi.u_497ba06fc169f038')}</button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="sb-h3"><LocalizedText fallback={uiText('generatedUi.u_c1a070e0a89b1d41')} /></h3>
            <div className="mt-4">
              <CosaCampaignFeed
                campaigns={campaignFeed}
                selectedId={selected?.id}
                emptyLabel={uiText('generatedUi.u_840b563546b3ef12')}
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
                  <span className="sb-eyebrow"><LocalizedText fallback={uiText('generatedUi.u_84a475e1402ec604')} /></span>
                  <h3 className="mt-2 text-xl font-semibold text-white">{selected.business_name}</h3>
                  <p className="mt-1 text-sm text-white/45">{selected.business_url}</p>
                  <p className="mt-2 text-sm font-bold" style={{ color: selected.contact_email ? '#1af0ff' : '#f59e0b' }}>
                    {selected.contact_email ? `Will send to: ${selected.contact_email}` : uiText('generatedUi.u_e92fd8b6f6ba89a6')}
                  </p>
                  <p className="mt-3 text-sm text-white/70">{selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || selected.status === 'approved'} onClick={() => patchOutreach(selected.id, 'approved')} className="sb-button-primary" style={{ border: 'none', opacity: busy || selected.status === 'approved' ? 0.5 : 1 }}>{uiText('generatedUi.u_6007acbe30b2cd98')}</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => patchOutreach(selected.id, 'rejected')} className="rounded-full border-0 bg-red-600 px-4 py-2 text-sm font-bold text-white" style={{ opacity: busy || selected.status === 'rejected' ? 0.5 : 1 }}>{uiText('generatedUi.u_ab604a360777735f')}</button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
                <InfoCard title={uiText('generatedUi.u_b55bb5be20928223')} data={selected.analyzer_summary} />
                <InfoCard title={uiText('generatedUi.u_851fea20e8898c7e')} data={selected.business_model_profile} />
                <InfoCard title={uiText('generatedUi.u_90a3f924b4cc6bbe')} data={selected.predictive_needs} />
                <InfoCard title={uiText('generatedUi.u_160f5fd810912f3c')} data={selected.review_strategy} />
                <InfoCard title={uiText('generatedUi.u_a8f197a5b868a140')} data={selected.social_plan} />
                <InfoCard title={uiText('generatedUi.u_d7e33138baab2971')} data={selected.promo_plan} />
              </div>

              <div className="sb-ai-feedback mt-5">
                <strong><LocalizedText fallback={uiText('generatedUi.u_d3be6e3c361f38a4')} /></strong>
                <p><LocalizedText fallback={uiText('generatedUi.u_2ded7ce91dc5cf79')} /></p>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <h4 className="m-0 font-semibold text-white"><LocalizedText fallback={uiText('generatedUi.u_d20b73953a498154')} /></h4>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/70">{selected.outreach_message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder={uiText('generatedUi.u_9e24adb947416462')} className="sb-input min-w-[180px] flex-1 rounded-xl px-3 py-2.5 text-sm" />
                  <button
                    disabled={busy || selected.status !== 'approved' || selected.status === 'sent'}
                    onClick={sendSelected}
                    className="sb-button-secondary"
                    style={{ opacity: busy || selected.status !== 'approved' || selected.status === 'sent' ? 0.5 : 1 }}
                  >
                    <LocalizedText fallback={uiText('generatedUi.u_b6185804241b3112')} />
                  </button>
                </div>
                {selected.status === 'pending' && (
                  <p className="mt-2 text-xs" style={{ color: '#f59e0b' }}>
                    {uiText('generatedUi.u_hint_approve_first', 'Approve this draft first, then use the Send button to release it.')}
                  </p>
                )}
                {selected.status === 'sent' && (
                  <p className="mt-2 text-xs" style={{ color: '#1af0ff' }}>
                    {uiText('generatedUi.u_hint_already_sent', 'This draft has already been sent.')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-white/40"><LocalizedText fallback={uiText('generatedUi.u_840b563546b3ef12')} /></div>
          )}
        </div>
      </section>

      <section aria-label={uiText('generatedUi.u_817f1f5a1267e6c7')} className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <InfoCard title={uiText('generatedUi.u_817f1f5a1267e6c7')} data={predictedNeeds} />
        <InfoCard title={uiText('generatedUi.u_7a129df2c60059d7')} data={data?.recentAiTasks?.slice(0, 5)} />
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
