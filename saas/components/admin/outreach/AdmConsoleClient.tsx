'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'
import CosaCampaignFeed, { type CosaCampaignFeedItem } from '@/components/cosa/CosaCampaignFeed'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
      setMessage(json.error || uiCopy('u_9027c6a74e0c8fd9'))
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
    setMessage(res.ok ? `Outreach ${status}.` : json.error || uiCopy('u_e7333e74e51068cb'))
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
      setMessage(reallyEmailed ? `✅ Email sent (${mode}).` : uiCopy('u_08971d48290fae0b'))
    } else {
      setMessage(json.error || uiCopy('u_7dd7b8610fdb32c8'))
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
    setMessage(res.ok ? uiCopy('u_9d3175917d947606') : json.error || uiCopy('u_2edadc1c9807289f'))
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
    setMessage(res.ok ? `Digits sync processed ${json.processed || 0} partners.` : json.error || uiCopy('u_885c9cad5ad43590'))
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
    setMessage(res.ok ? (value ? uiCopy('u_c5d98c84a7b9a4f0') : uiCopy('u_25d7d845a8f1d78b')) : json.error || uiCopy('u_0eb75fe90071b4e7'))
    setBusy(false)
    await load()
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-white/60"><LocalizedText fallback={uiCopy('u_1ea3053b716cad0c')} /></div>
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
            <span className="sb-eyebrow"><LocalizedText fallback={uiCopy('u_c9e247bb379ea87d')} /></span>
            <h1 className="sb-h2 mt-3">{uiCopy('u_f1b92abc3a943d97')}</h1>
            <p className="sb-body max-w-2xl">{data?.hmi.summary || uiCopy('u_bdeace793ea128eb')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={syncDigits} className="sb-button-secondary" style={{ opacity: busy ? 0.5 : 1 }}><LocalizedText fallback={uiCopy('u_2220fea1690ca6a2')} /></button>
            <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className="sb-button-primary" style={{ border: 'none', opacity: busy ? 0.5 : 1 }}>
              {data?.metrics.panicSwitch ? uiCopy('u_3a9b0eb7cd21b9ec') : uiCopy('u_2659745de08845c5')}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-white/85">
          {message}
        </div>
      )}

      <section aria-label={uiCopy('u_e6103da109efd0f4')} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        {dashboardMetrics.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <p className="m-0 text-[11px] uppercase tracking-widest text-white/45">{label}</p>
            <p className="mb-0 mt-2 text-3xl font-black text-white">{value ?? 0}</p>
          </div>
        ))}
      </section>

      <section aria-label={uiCopy('u_aa274a128a2bc5ba')} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="sb-eyebrow"><LocalizedText fallback={uiCopy('u_7106d995317c767f')} /></span>
            <h2 className="sb-h3 mt-2"><LocalizedText fallback={uiCopy('u_9dbde8307f819142')} /></h2>
          </div>
          <span className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs text-cyan-300/85">{uiCopy('u_8f5f85c42e287571')}{data?.metrics.security24h ?? 0}
          </span>
        </div>
        <InfoCard title={uiCopy('u_21240c5bb85d273d')} data={data?.recentSecurityEvents?.slice(0, 5)} />
      </section>

      <section aria-label={uiCopy('u_8bf8ed2b02547182')} className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <span className="sb-eyebrow"><LocalizedText fallback={uiCopy('u_b579d2397ee0c78f')} /></span>
            <h2 className="sb-h3 mt-2"><LocalizedText fallback={uiCopy('u_233777e90d0e6e9e')} /></h2>
            <p className="mt-2 text-xs text-white/45"><LocalizedText fallback={uiCopy('u_368838d87fc593d1')} /></p>
            <div className="mt-4 flex flex-col gap-3">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={uiCopy('u_dbfd50a2c8be3b7a')} className="sb-input w-full rounded-xl px-3 py-2.5 text-sm" />
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder={uiCopy('u_f00148e9c1daf7c7')} className="sb-input w-full rounded-xl px-3 py-2.5 text-sm" />
              <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="sb-button-primary w-full" style={{ border: 'none', opacity: busy || !sourceUrl ? 0.5 : 1 }}>{uiCopy('u_e6294a47504ea75a')}</button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="sb-h3"><LocalizedText fallback={uiCopy('u_0c3bd3cffa9b7b93')} /></h3>
            <div className="mt-4">
              <CosaCampaignFeed
                campaigns={campaignFeed}
                selectedId={selected?.id}
                emptyLabel={uiCopy('u_56822fca6a1363c8')}
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
                  <span className="sb-eyebrow"><LocalizedText fallback={uiCopy('u_47b866eeec68ad74')} /></span>
                  <h3 className="mt-2 text-xl font-semibold text-white">{selected.business_name}</h3>
                  <p className="mt-1 text-sm text-white/45">{selected.business_url}</p>
                  <p className="mt-2 text-sm font-bold" style={{ color: selected.contact_email ? '#1af0ff' : '#f59e0b' }}>
                    {selected.contact_email ? `Will send to: ${selected.contact_email}` : uiCopy('u_1d55ac58ff89bd87')}
                  </p>
                  <p className="mt-3 text-sm text-white/70">{selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || selected.status === 'approved'} onClick={() => patchOutreach(selected.id, 'approved')} className="sb-button-primary" style={{ border: 'none', opacity: busy || selected.status === 'approved' ? 0.5 : 1 }}>{uiCopy('u_f32de49da23ec667')}</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => patchOutreach(selected.id, 'rejected')} className="rounded-full border-0 bg-red-600 px-4 py-2 text-sm font-bold text-white" style={{ opacity: busy || selected.status === 'rejected' ? 0.5 : 1 }}>{uiCopy('u_541162baf721a598')}</button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
                <InfoCard title={uiCopy('u_fbd4bdb92e7c90f3')} data={selected.analyzer_summary} />
                <InfoCard title={uiCopy('u_49b0793870f9e157')} data={selected.business_model_profile} />
                <InfoCard title={uiCopy('u_9bbbc764edf9d56c')} data={selected.predictive_needs} />
                <InfoCard title={uiCopy('u_7796b793264037be')} data={selected.review_strategy} />
                <InfoCard title={uiCopy('u_52b8a268af240e71')} data={selected.social_plan} />
                <InfoCard title={uiCopy('u_1cba30ada3708fef')} data={selected.promo_plan} />
              </div>

              <div className="sb-ai-feedback mt-5">
                <strong><LocalizedText fallback={uiCopy('u_26f3df5a67ed3d8c')} /></strong>
                <p><LocalizedText fallback={uiCopy('u_17f7f658e14c1382')} /></p>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <h4 className="m-0 font-semibold text-white"><LocalizedText fallback={uiCopy('u_ae6956e18483cc43')} /></h4>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/70">{selected.outreach_message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder={uiCopy('u_4f5c9e09eb7ae599')} className="sb-input min-w-[180px] flex-1 rounded-xl px-3 py-2.5 text-sm" />
                  <button disabled={busy || selected.status !== 'approved'} onClick={sendSelected} className="sb-button-secondary" style={{ opacity: busy || selected.status !== 'approved' ? 0.5 : 1 }}><LocalizedText fallback={uiCopy('u_5ec3b498506948ce')} /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-white/40"><LocalizedText fallback={uiCopy('u_8d67877afc61e182')} /></div>
          )}
        </div>
      </section>

      <section aria-label={uiCopy('u_e632eca471c3de0a')} className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <InfoCard title={uiCopy('u_722defbb0d515750')} data={predictedNeeds} />
        <InfoCard title={uiCopy('u_bd057d17c39fd5fe')} data={data?.recentAiTasks?.slice(0, 5)} />
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
