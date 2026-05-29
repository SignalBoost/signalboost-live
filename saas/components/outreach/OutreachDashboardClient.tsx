'use client'

import { useEffect, useMemo, useState } from 'react'

type OutreachStatus = 'pending' | 'approved' | 'sent' | 'rejected'

type OutreachRow = {
  id: string
  business_name: string
  business_url: string
  source_platform?: string
  status: OutreachStatus
  created_at?: string
  approved_at?: string | null
  sent_at?: string | null
  analyzer_summary?: any
  website_json?: any
  review_strategy?: any
  social_plan?: any
  promo_plan?: any
  outreach_message?: string
}

type SendLimit = { ok: boolean; count: number; limit: number }

const socialPlatforms = [
  { key: 'facebook_pages', label: 'Facebook Pages' },
  { key: 'instagram_business', label: 'Instagram Business' },
  { key: 'linkedin_company', label: 'LinkedIn Company' },
  { key: 'twitter_x', label: 'Twitter/X' },
  { key: 'youtube_channels', label: 'YouTube Channels' },
]

const tabs: Array<{ status: OutreachStatus; label: string }> = [
  { status: 'pending', label: 'Pending Approval' },
  { status: 'approved', label: 'Approved (waiting to send)' },
  { status: 'sent', label: 'Sent' },
  { status: 'rejected', label: 'Rejected' },
]

const statusStyles: Record<OutreachStatus, string> = {
  pending: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
  approved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  sent: 'border-sky-400/40 bg-sky-400/10 text-sky-100',
  rejected: 'border-rose-400/40 bg-rose-400/10 text-rose-100',
}

export default function OutreachDashboardClient() {
  const [activeTab, setActiveTab] = useState<OutreachStatus>('pending')
  const [rows, setRows] = useState<OutreachRow[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [sendLimit, setSendLimit] = useState<SendLimit>({ ok: true, count: 0, limit: 50 })
  const [businessName, setBusinessName] = useState('')
  const [businessUrl, setBusinessUrl] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [socialPlatform, setSocialPlatform] = useState('facebook_pages')
  const [socialText, setSocialText] = useState('')
  const [socialImageUrl, setSocialImageUrl] = useState('')
  const [socialVideoUrl, setSocialVideoUrl] = useState('')

  const selected = useMemo(() => rows.find(row => row.id === selectedId) || rows[0] || null, [rows, selectedId])
  const counts = useMemo(() => rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {} as Record<OutreachStatus, number>), [rows])

  async function load(status = activeTab) {
    const res = await fetch(`/api/outreach/queue?status=${status}&limit=100`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) {
      setNotice(json.error || 'Unable to load outreach queue.')
      return
    }
    const nextRows = json.outreach || []
    setRows(nextRows)
    setSendLimit(json.sendLimit || { ok: true, count: 0, limit: 50 })
    setSelectedId(current => nextRows.some((row: OutreachRow) => row.id === current) ? current : nextRows[0]?.id || '')
  }

  useEffect(() => { load(activeTab) }, [activeTab])

  useEffect(() => {
    setMessageDraft(selected?.outreach_message || '')
    setSocialText(selected?.social_plan?.seven_day_calendar?.[0]?.caption || selected?.outreach_message || '')
  }, [selected?.id, selected?.outreach_message])

  async function generatePackage() {
    setBusy(true)
    setNotice('Analyzing public business text and preparing the approval package...')
    const res = await fetch('/api/outreach/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_name: businessName, business_url: businessUrl, source_platform: 'manual' }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) {
      setNotice(json.error || 'Generation failed.')
      return
    }
    setBusinessName('')
    setBusinessUrl('')
    setActiveTab('pending')
    setNotice('Outreach package generated and placed in the approval queue. Nothing was sent.')
    await load('pending')
    setSelectedId(json.outreach?.id || '')
  }

  async function syncDigits() {
    setBusy(true)
    setNotice('Importing Digits partner businesses into the approval queue...')
    const res = await fetch('/api/outreach/digits/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    })
    const json = await res.json()
    setBusy(false)
    setNotice(res.ok ? `Digits sync processed ${json.processed || 0} partners. New packages remain pending approval.` : json.error || 'Digits sync failed.')
    await load(activeTab)
  }

  async function approve(decision: 'approved' | 'rejected') {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/outreach/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_id: selected.id, decision, outreach_message: messageDraft }),
    })
    const json = await res.json()
    setBusy(false)
    setNotice(res.ok ? `Outreach ${decision}.` : json.error || 'Approval update failed.')
    if (res.ok) setActiveTab(decision)
    await load(decision)
  }

  async function saveMessage() {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/outreach/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, outreach_message: messageDraft }),
    })
    const json = await res.json()
    setBusy(false)
    setNotice(res.ok ? 'Message saved for human approval.' : json.error || 'Message save failed.')
    await load(activeTab)
  }

  async function connectSocial(platform = socialPlatform) {
    const res = await fetch(`/api/outreach/social/oauth?platform=${platform}`, { cache: 'no-store' })
    const json = await res.json()
    setNotice(res.ok ? `OAuth ready for ${json.connector?.label}. Open provider URL from the logged response when credentials are configured.` : json.error || 'OAuth start failed.')
  }

  async function sendSocialNow() {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/outreach/social/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_id: selected.id, platform: socialPlatform, text: socialText, image_url: socialImageUrl || undefined, video_url: socialVideoUrl || undefined }),
    })
    const json = await res.json()
    setBusy(false)
    setNotice(res.ok ? `Social post queued/sent through ${socialPlatform}; engagement tracking started.` : json.error || 'Social post failed.')
    if (res.ok) setActiveTab('sent')
    await load(res.ok ? 'sent' : activeTab)
  }

  async function sendNow() {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_id: selected.id, channel: recipientEmail ? 'email' : 'manual', to_email: recipientEmail || undefined }),
    })
    const json = await res.json()
    setBusy(false)
    setNotice(res.ok ? 'Approved outreach was sent or recorded and logged.' : json.error || 'Send failed.')
    if (res.ok) setActiveTab('sent')
    await load(res.ok ? 'sent' : activeTab)
  }

  const sendBlocked = !selected || selected.status !== 'approved' || !sendLimit.ok || busy

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300">SaaS.SignalBoost AI Outreach Engine</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Value-first outreach approval queue</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Analyze public business pages, generate website, review, social, and promo assets, then queue personalized SaaS.SignalBoost outreach for human review. Emails are never sent automatically.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm">
              <p className="text-slate-400">24-hour approved send limit</p>
              <p className="mt-1 text-2xl font-semibold text-white">{sendLimit.count}/{sendLimit.limit}</p>
              <p className={sendLimit.ok ? 'text-emerald-300' : 'text-rose-300'}>{sendLimit.ok ? 'Send capacity available' : 'Daily limit reached'}</p>
            </div>
          </div>
        </header>

        {notice && <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">{notice}</div>}

        <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold text-white">Add a business</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
              <input value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="Business name (optional)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
              <input value={businessUrl} onChange={event => setBusinessUrl(event.target.value)} placeholder="Public website or social profile URL" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
              <button disabled={busy || !businessUrl} onClick={generatePackage} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Generate + Queue</button>
            </div>
          </div>
          <button disabled={busy} onClick={syncDigits} className="rounded-2xl border border-blue-500/30 bg-blue-600 px-5 py-4 text-sm font-semibold text-white disabled:opacity-50">Sync Digits Partners</button>
        </section>

        <nav className="grid gap-2 md:grid-cols-4">
          {tabs.map(tab => (
            <button key={tab.status} onClick={() => setActiveTab(tab.status)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${activeTab === tab.status ? 'border-emerald-400 bg-emerald-400/10 text-white' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'}`}>
              {tab.label}
              <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs">{activeTab === tab.status ? rows.length : counts[tab.status] || 0}</span>
            </button>
          ))}
        </nav>

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-semibold text-white">{tabs.find(tab => tab.status === activeTab)?.label}</h2>
            {rows.length === 0 ? <p className="text-sm text-slate-400">No outreach packages in this tab.</p> : rows.map(row => (
              <button key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === row.id ? 'border-emerald-400 bg-emerald-400/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{row.business_name}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusStyles[row.status]}`}>{row.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{row.source_platform || 'manual'} • {row.business_url}</p>
              </button>
            ))}
          </aside>

          {selected ? (
            <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">{selected.business_name}</h2>
                  <a href={selected.business_url} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-emerald-300 hover:text-emerald-200">{selected.business_url}</a>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{selected.analyzer_summary?.public_summary || selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || selected.status === 'approved'} onClick={() => approve('approved')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => approve('rejected')} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Reject</button>
                </div>
              </div>

              <WebsitePreview website={selected.website_json} businessName={selected.business_name} />

              <div className="grid gap-4 lg:grid-cols-3">
                <JsonCard title="Review-generation strategy" data={selected.review_strategy} />
                <JsonCard title="Social media content plan" data={selected.social_plan} />
                <JsonCard title="Promotional campaign plan" data={selected.promo_plan} />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold text-white">Outreach message for approval</h3>
                  <button disabled={busy || !messageDraft} onClick={saveMessage} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-50">Edit Message / Save</button>
                </div>
                <textarea value={messageDraft} onChange={event => setMessageDraft(event.target.value)} className="mt-3 min-h-64 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm leading-6 text-slate-100 outline-none focus:border-emerald-400" />
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                  <input value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} placeholder="Recipient email for approved email send (optional manual log if blank)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
                  <button disabled={sendBlocked} onClick={sendNow} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Send Now</button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Send Now is only enabled for approved messages while the 50-per-24-hours limit has capacity.</p>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-slate-950 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-white">Social Outreach</h3>
                    <p className="mt-1 text-xs text-slate-500">OAuth connectors support text, image, and video posts with likes, shares, and comments logged back to Admin Console.</p>
                  </div>
                  <span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs font-semibold text-amber-200">{sendLimit.count}/{sendLimit.limit} posts today</span>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
                  <div className="space-y-2">
                    {socialPlatforms.map(platform => (
                      <button key={platform.key} onClick={() => { setSocialPlatform(platform.key); connectSocial(platform.key) }} className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${socialPlatform === platform.key ? 'border-cyan-300 bg-cyan-300/10 text-white' : 'border-slate-800 bg-slate-900 text-slate-300'}`}>
                        {platform.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <textarea value={socialText} onChange={event => setSocialText(event.target.value)} className="min-h-36 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-300" placeholder="Generated caption or post text" />
                    <div className="grid gap-3 md:grid-cols-2">
                      <input value={socialImageUrl} onChange={event => setSocialImageUrl(event.target.value)} placeholder="Image URL (optional)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300" />
                      <input value={socialVideoUrl} onChange={event => setSocialVideoUrl(event.target.value)} placeholder="Video URL (optional)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => connectSocial()} className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50">Authenticate OAuth</button>
                      <button disabled={sendBlocked} onClick={sendSocialNow} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">Approve & Send Social</button>
                    </div>
                    <p className="text-xs text-slate-500">Compliance: requires approved queue status, enforces 50 posts/day, and centralizes provider rate-limit policy checks before publishing.</p>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-slate-400">Select or generate an outreach package.</section>
          )}
        </div>
      </div>
    </main>
  )
}

function WebsitePreview({ website, businessName }: { website: any; businessName: string }) {
  const hero = website?.hero || website?.homepage || website || {}
  const title = hero?.title || hero?.headline || businessName
  const subtitle = hero?.subtitle || hero?.subheadline || hero?.description || 'AI-generated website concept prepared by SaaS.SignalBoost.'
  const sections = Array.isArray(website?.sections) ? website.sections.slice(0, 4) : []

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <div className="bg-gradient-to-br from-emerald-500 via-blue-500 to-slate-900 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-950/80">Website preview</p>
        <h3 className="mt-3 text-3xl font-bold text-white">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">{subtitle}</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {sections.length ? sections.map((section: any, index: number) => (
          <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h4 className="font-semibold text-white">{section.title || section.heading || `Section ${index + 1}`}</h4>
            <p className="mt-2 text-sm leading-6 text-slate-400">{section.body || section.copy || section.text || JSON.stringify(section).slice(0, 220)}</p>
          </div>
        )) : <pre className="col-span-full max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">{JSON.stringify(website || {}, null, 2)}</pre>}
      </div>
    </div>
  )
}

function JsonCard({ title, data }: { title: string; data: any }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">{JSON.stringify(data || {}, null, 2)}</pre>
    </article>
  )
}
