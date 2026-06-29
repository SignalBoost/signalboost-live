'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'

const GOLD = '#ffc300'

const DEFAULT_AUTONOMOUS_DIRECTIVE = 'Create an online outreach campaign for YouTube and other platforms showing our services and products that help companies grow. Feature www.saas.signalboostapp.com.'

type OutreachRow = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: string
  created_at?: string
  outreach_message?: string
  analyzer_summary?: any
  predictive_needs?: any
  business_model_profile?: any
  social_plan?: any
  promo_plan?: any
  review_strategy?: any
}

type CampaignRow = {
  id: string
  title: string
  objective?: string
  audience?: string
  channel?: string
  status?: string
  risk_level?: string
  created_at?: string
  languages?: string[]
  metadata?: Record<string, any>
  assets?: Array<{ type?: string; status?: string; language?: string; brief?: string }>
  work_items?: Array<{
    id?: string
    kind?: string
    status?: string
    output?: { title?: string; opening?: string; draft?: string; call_to_action?: string }
  }>
}

type FormState = {
  title: string
  objective: string
  channel: string
  audience: string
  language: string
  priority: string
  estimatedCostUsd: string
  signal: string
}

const defaultForm: FormState = {
  title: 'Educational campaign: AI-operated growth department',
  objective: 'Explain how SignalBoost turns business ideas into approved marketing actions while keeping auditability, security, optimization, and owner control.',
  channel: 'youtube',
  audience: 'Business owners, operators, and enterprise buyers evaluating AI-assisted company operations.',
  language: 'en',
  priority: 'high',
  estimatedCostUsd: '12',
  signal: 'Founder requested a Fortune-500-style Marketing/Sales workflow: request, draft, approval, polish, publishing, monitoring, and learning.',
}

const channels = [
  ['youtube', 'YouTube education'],
  ['short_video', 'Short-form video'],
  ['linkedin', 'LinkedIn post'],
  ['blog', 'SEO / blog'],
  ['email', 'Sales email'],
  ['outreach', 'Targeted outreach'],
  ['landing_page', 'Landing page'],
  ['review_campaign', 'Customer proof'],
]

const priorities = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']]
const languages = [['en', 'English'], ['es', 'Spanish'], ['pt', 'Portuguese'], ['pl', 'Polish'], ['ru', 'Russian']]

function formatDate(value?: string) {
  if (!value) return 'Unknown time'
  try { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return value }
}

function summarize(value: any, fallback = 'No summary attached yet.') {
  if (!value) return fallback
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.slice(0, 4).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  if (typeof value === 'object') return String(value.summary || value.description || value.message || JSON.stringify(value, null, 2)).slice(0, 900)
  return String(value)
}

function hasDraft(campaign: CampaignRow) {
  return Boolean(campaign.work_items?.some(item => item.output))
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.28)', ...style }}>{children}</section>
}

export default function MarketingSalesCosaPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [outreach, setOutreach] = useState<OutreachRow[]>([])
  const [selected, setSelected] = useState<OutreachRow | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [autonomousDirective, setAutonomousDirective] = useState(DEFAULT_AUTONOMOUS_DIRECTIVE)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load(keepMessage = false) {
    setLoading(true)
    if (!keepMessage) setMessage('')
    try {
      const [admRes, campaignRes] = await Promise.all([
        fetch('/api/admin/adm', { cache: 'no-store' }),
        fetch('/api/cos/campaign-queue', { cache: 'no-store' }),
      ])
      const admJson = await admRes.json().catch(() => null)
      const campaignJson = await campaignRes.json().catch(() => null)
      if (!admRes.ok) throw new Error(admJson?.error || 'Could not load approval data.')
      if (!campaignRes.ok) throw new Error(campaignJson?.error || 'Could not load campaign queue.')
      const rows = Array.isArray(admJson?.recentOutreach) ? admJson.recentOutreach : []
      setOutreach(rows)
      setSelected(current => current ? rows.find((row: OutreachRow) => row.id === current.id) || rows[0] || null : rows.find((row: OutreachRow) => row.status === 'pending') || rows[0] || null)
      setCampaigns(Array.isArray(campaignJson?.campaigns) ? campaignJson.campaigns : [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load Marketing/Sales data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pendingOutreach = useMemo(() => outreach.filter(row => row.status === 'pending'), [outreach])
  const decidedOutreach = useMemo(() => outreach.filter(row => row.status !== 'pending'), [outreach])
  const stats = useMemo(() => ({
    waiting: campaigns.filter(row => row.status === 'waiting_approval' || row.status === 'draft').length,
    approved: campaigns.filter(row => row.status === 'approved').length,
    queued: campaigns.filter(row => row.status === 'queued' || row.status === 'running').length,
    drafted: campaigns.filter(hasDraft).length,
  }), [campaigns])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function generateDraft(id: string) {
    const res = await fetch('/api/cos/script-worker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: id }) })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(json?.error || 'Could not generate draft.')
    return json
  }

  async function createAutonomousCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!autonomousDirective.trim()) {
      setMessage('Add a campaign command first.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: autonomousDirective }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Could not create autonomous campaign.')
      const campaignId = json?.campaign?.id
      if (campaignId) await generateDraft(campaignId)
      setMessage('COSA created the campaign and prepared an internal review draft. Publishing, sending, and spending are still locked until approval.')
      await load(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not run autonomous campaign command.')
    } finally {
      setBusy(false)
    }
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.title.trim() || !form.objective.trim()) {
      setMessage('Campaign title and objective are required.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: { ...form, estimatedCostUsd: Number(form.estimatedCostUsd || 0) } }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Could not create campaign.')
      setMessage('Campaign request queued for owner approval. COSA has not published, sent, or spent anything.')
      await load(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create campaign.')
    } finally {
      setBusy(false)
    }
  }

  async function patchCampaign(id: string, status: 'approved' | 'rejected' | 'queued') {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || `Could not mark campaign ${status}.`)
      setMessage(`Campaign marked ${status}.`)
      await load(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not mark campaign ${status}.`)
    } finally {
      setBusy(false)
    }
  }

  async function generateDraftFromButton(id: string) {
    setBusy(true)
    try {
      await generateDraft(id)
      setMessage('Review draft generated. Publishing is still gated.')
      await load(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not generate draft.')
    } finally {
      setBusy(false)
    }
  }

  async function patchSelected(status: 'approved' | 'rejected') {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch('/api/outreach/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id, status }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || `Could not mark item ${status}.`)
      setMessage(status === 'approved' ? 'Approved. COSA can move this work to the next guarded step.' : 'Rejected. COSA will not execute this item.')
      await load(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not mark item ${status}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={{ background: 'linear-gradient(145deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 28, boxShadow: '0 28px 80px rgba(0,0,0,0.38)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <p className="sb-eyebrow" style={{ margin: 0 }}>Marketing & Sales Department</p>
            <h1 style={{ color: '#fff', fontSize: 34, lineHeight: 1.05, letterSpacing: '-0.04em', margin: '10px 0 0', fontWeight: 950 }}>COSA turns one command into review-ready campaign work.</h1>
            <p style={{ color: 'rgba(255,255,255,0.68)', maxWidth: 820, lineHeight: 1.7, marginTop: 14 }}>The owner-light workflow is: command, autonomous campaign setup, internal draft, owner review, final approval, publishing gate, monitoring, and optimization feedback.</p>
          </div>
          <button onClick={() => load()} disabled={loading || busy} style={ghostButton}>{loading ? 'Loading...' : 'Refresh department data'}</button>
        </div>
      </section>

      {message && <div style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.75)', color: '#fff', padding: '12px 16px', borderRadius: 14 }}>{message}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        {[
          ['Campaigns', campaigns.length],
          ['Awaiting approval', stats.waiting],
          ['Approved', stats.approved],
          ['Worker queue', stats.queued],
          ['Drafts generated', stats.drafted],
          ['Outreach approvals', pendingOutreach.length],
        ].map(([label, value]) => <Metric key={String(label)} label={String(label)} value={String(value)} />)}
      </section>

      <Card style={{ background: 'linear-gradient(145deg, rgba(255,195,0,0.11), rgba(15,23,42,0.72))', border: '1px solid rgba(255,195,0,0.24)' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Owner-light campaign command</p>
        <h2 style={h2}>Tell COSA what you want. COSA prepares the draft.</h2>
        <p style={bodyText}>This creates a governed campaign and an internal review draft. It does not publish, send outreach, or spend money.</p>
        <form onSubmit={createAutonomousCampaign} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <Field label="Campaign command" value={autonomousDirective} onChange={setAutonomousDirective} textarea />
          <button type="submit" disabled={busy} style={primaryButton}>{busy ? 'Working...' : 'Run COSA campaign command'}</button>
        </form>
      </Card>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, .95fr) minmax(320px, 1.05fr)', gap: 18, alignItems: 'start' }} className="cosa-grid">
        <Card>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Detailed campaign request</p>
          <h2 style={h2}>Use this only when you want manual control</h2>
          <p style={bodyText}>The detailed form remains available for campaigns where you want to choose channel, priority, audience, and language yourself.</p>
          <form onSubmit={createCampaign} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <Field label="Campaign title" value={form.title} onChange={value => setField('title', value)} />
            <Field label="Objective" value={form.objective} onChange={value => setField('objective', value)} textarea />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <SelectField label="Channel" value={form.channel} options={channels} onChange={value => setField('channel', value)} />
              <SelectField label="Priority" value={form.priority} options={priorities} onChange={value => setField('priority', value)} />
              <SelectField label="Language" value={form.language} options={languages} onChange={value => setField('language', value)} />
            </div>
            <Field label="Target audience" value={form.audience} onChange={value => setField('audience', value)} />
            <Field label="Signal / reason" value={form.signal} onChange={value => setField('signal', value)} textarea />
            <Field label="Estimated cost USD" type="number" value={form.estimatedCostUsd} onChange={value => setField('estimatedCostUsd', value)} />
            <button type="submit" disabled={busy} style={secondaryButton}>{busy ? 'Working...' : 'Create governed campaign'}</button>
          </form>
        </Card>

        <Card>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Autonomous workflow</p>
          <h2 style={h2}>COSA handles execution steps; owner controls risk</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {[
              ['01', 'Command', 'You give COSA a plain-language campaign directive.'],
              ['02', 'Predict', 'COSA infers channel, audience, tone, and campaign structure.'],
              ['03', 'Draft', 'COSA creates an internal review draft automatically.'],
              ['04', 'Review', 'You approve, reject, archive, or request edits.'],
              ['05', 'Publish gate', 'Publishing connectors stay locked until approval.'],
              ['06', 'Optimize', 'Monitoring data feeds the optimization layer.'],
            ].map(([num, title, text]) => <WorkflowStep key={num} num={num} title={title} text={text} />)}
          </div>
        </Card>
      </section>

      <Card>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Campaign repository</p>
        <h2 style={h2}>Every campaign stays visible</h2>
        <p style={bodyText}>This is the department record. It shows what was requested, what COSA drafted, what requires approval, and what has been queued.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {loading && <p style={bodyText}>Loading campaign queue...</p>}
          {!loading && campaigns.length === 0 && <p style={bodyText}>No campaigns queued yet. Run the COSA command above to create a review-ready draft.</p>}
          {campaigns.slice(0, 10).map(campaign => <CampaignCard key={campaign.id} campaign={campaign} busy={busy} onPatch={patchCampaign} onGenerateDraft={generateDraftFromButton} />)}
        </div>
      </Card>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, .85fr) minmax(360px, 1.4fr)', gap: 18, alignItems: 'start' }} className="cosa-grid">
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div><p className="sb-eyebrow" style={{ margin: 0 }}>Approval queue</p><h2 style={h2}>Review finished outreach</h2></div>
            <span style={{ color: GOLD, fontWeight: 950 }}>{pendingOutreach.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {pendingOutreach.length === 0 && <p style={bodyText}>No pending outreach approvals right now.</p>}
            {pendingOutreach.map(row => <QueueButton key={row.id} row={row} active={selected?.id === row.id} onClick={() => setSelected(row)} />)}
          </div>
        </Card>
        <Card style={{ minHeight: 430 }}>
          {!selected && <div style={{ color: 'rgba(255,255,255,.55)', display: 'grid', minHeight: 340, placeItems: 'center', textAlign: 'center' }}>Select a queued COSA recommendation to inspect.</div>}
          {selected && <SelectedOutreach row={selected} busy={busy} onPatch={patchSelected} />}
        </Card>
      </section>

      <Card>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Enterprise control plane</p>
        <h2 style={h2}>The department plugs into your existing modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          <InfoBlock title="Audit" body="Campaign create, draft, approve, reject, and queue actions go through admin checks and audit logging." />
          <InfoBlock title="Cybersecurity" body="External connectors remain guarded; COSA prepares work without uncontrolled sending, posting, or spending." />
          <InfoBlock title="Optimization" body="Campaign results can feed predictive scoring, next-best-action logic, and future recommendations." />
        </div>
      </Card>

      {decidedOutreach.length > 0 && <Card><p className="sb-eyebrow" style={{ margin: 0 }}>Recent decisions</p><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{decidedOutreach.slice(0, 8).map(row => <QueueButton key={row.id} row={row} active={selected?.id === row.id} onClick={() => setSelected(row)} />)}</div></Card>}

      <style>{`@media (max-width: 920px) { .cosa-grid { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><p style={{ margin: 0, color: 'rgba(255,255,255,.45)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 900 }}>{label}</p><p style={{ margin: '8px 0 0', color: '#fff', fontSize: 30, fontWeight: 950 }}>{value}</p></Card>
}

function WorkflowStep({ num, title, text }: { num: string; title: string; text: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 12, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.035)', borderRadius: 14, padding: 12 }}><span style={{ width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', color: '#000', background: GOLD, fontWeight: 950, fontSize: 12 }}>{num}</span><div><strong style={{ color: '#fff', fontSize: 14 }}>{title}</strong><p style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, lineHeight: 1.55, margin: '4px 0 0' }}>{text}</p></div></div>
}

function Field({ label, value, onChange, textarea = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; type?: string }) {
  const inputStyle: CSSProperties = { width: '100%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(2,6,23,.72)', color: '#fff', borderRadius: 12, padding: '11px 12px', outline: 'none' }
  return <label style={labelStyle}><span>{label}</span>{textarea ? <textarea value={value} onChange={event => onChange(event.target.value)} rows={4} style={inputStyle} /> : <input type={type} value={value} onChange={event => onChange(event.target.value)} style={inputStyle} />}</label>
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <label style={labelStyle}><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)} style={{ width: '100%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(2,6,23,.72)', color: '#fff', borderRadius: 12, padding: '11px 12px', outline: 'none' }}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
}

function QueueButton({ row, active, onClick }: { row: OutreachRow; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} style={{ textAlign: 'left', border: active ? '1px solid rgba(255,195,0,.65)' : '1px solid rgba(255,255,255,.08)', background: active ? 'rgba(255,195,0,.09)' : 'rgba(255,255,255,.04)', color: '#fff', borderRadius: 14, padding: 14, cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 14 }}>{row.business_name || 'Unnamed opportunity'}</strong><span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12 }}>{row.source_platform || 'COSA'} · {row.status || 'pending'} · {formatDate(row.created_at)}</span></button>
}

function SelectedOutreach({ row, busy, onPatch }: { row: OutreachRow; busy: boolean; onPatch: (status: 'approved' | 'rejected') => void }) {
  return <div style={{ display: 'grid', gap: 14 }}><div><p className="sb-eyebrow" style={{ margin: 0 }}>{row.status || 'pending'} · {row.source_platform || 'COSA'}</p><h2 style={{ color: '#fff', fontSize: 26, margin: '8px 0 0', lineHeight: 1.15 }}>{row.business_name || 'Unnamed opportunity'}</h2>{row.business_url && <p style={{ color: 'rgba(255,255,255,.55)', margin: '6px 0 0' }}>{row.business_url}</p>}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}><InfoBlock title="Analyzer" body={summarize(row.analyzer_summary)} /><InfoBlock title="Predictive needs" body={summarize(row.predictive_needs)} /><InfoBlock title="Business profile" body={summarize(row.business_model_profile)} /></div><InfoBlock title="Prepared outreach" body={row.outreach_message || 'No outreach draft attached yet.'} large /><InfoBlock title="Social / promo plan" body={[summarize(row.social_plan, ''), summarize(row.promo_plan, ''), summarize(row.review_strategy, '')].filter(Boolean).join('\n\n') || 'No channel plan attached yet.'} large /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 16 }}><button disabled={busy || row.status !== 'pending'} onClick={() => onPatch('rejected')} style={secondaryButton}>Reject</button><button disabled={busy || row.status !== 'pending'} onClick={() => onPatch('approved')} style={primaryButton}>Approve next step</button></div></div>
}

function CampaignCard({ campaign, busy, onPatch, onGenerateDraft }: { campaign: CampaignRow; busy: boolean; onPatch: (id: string, status: 'approved' | 'rejected' | 'queued') => void; onGenerateDraft: (id: string) => void }) {
  const waiting = campaign.status === 'waiting_approval' || campaign.status === 'draft'
  const canQueue = campaign.status === 'approved'
  const canDraft = campaign.work_items?.some(item => item.kind === 'script_worker') && ['draft', 'waiting_approval', 'approved', 'queued', 'running'].includes(campaign.status || '')
  const output = campaign.work_items?.find(item => item.output)?.output
  const autonomous = Boolean(campaign.metadata?.autonomous)
  return <div style={{ border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.035)', borderRadius: 14, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}><div><strong style={{ color: '#fff', display: 'block' }}>{campaign.title}</strong><span style={{ color: 'rgba(255,255,255,.52)', fontSize: 12 }}>{campaign.channel || 'campaign'} · {campaign.status || 'waiting_approval'} · {formatDate(campaign.created_at)}{autonomous ? ' · autonomous' : ''}</span><p style={{ color: 'rgba(255,255,255,.68)', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>{campaign.objective || 'No objective attached.'}</p>{campaign.audience && <p style={{ color: 'rgba(255,255,255,.52)', fontSize: 12, margin: '8px 0 0' }}>Audience: {campaign.audience}</p>}</div><span style={{ color: GOLD, fontSize: 11, fontWeight: 950, textTransform: 'uppercase' }}>{campaign.risk_level || 'medium'} risk</span></div><p style={{ color: 'rgba(255,255,255,.52)', fontSize: 12, margin: '8px 0 0' }}>Work items: {campaign.work_items?.length || 0} · Languages: {(campaign.languages || []).join(', ') || 'en'}</p>{campaign.assets?.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{campaign.assets.slice(0, 5).map((asset, index) => <span key={`${asset.type}-${index}`} style={{ border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.18)', borderRadius: 999, padding: '5px 8px', color: 'rgba(255,255,255,.66)', fontSize: 11 }}>{asset.type || 'asset'} · {asset.status || 'needed'}</span>)}</div> : null}{output && <div style={{ marginTop: 14, border: '1px solid rgba(255,195,0,.22)', borderRadius: 14, background: 'rgba(255,195,0,.06)', padding: 14 }}><p className="sb-eyebrow" style={{ margin: 0 }}>Review draft generated</p><h3 style={{ color: '#fff', margin: '8px 0 0', fontSize: 16 }}>{output.title || 'Generated campaign draft'}</h3><p style={{ color: 'rgba(255,255,255,.74)', lineHeight: 1.65, fontSize: 13 }}>{output.opening}</p><pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.8)', background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.55, maxHeight: 320, overflow: 'auto' }}>{output.draft}</pre>{output.call_to_action && <p style={{ color: GOLD, fontWeight: 900, margin: '10px 0 0', fontSize: 13 }}>CTA: {output.call_to_action}</p>}</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>{waiting && <button disabled={busy} onClick={() => onPatch(campaign.id, 'rejected')} style={secondaryButton}>Reject</button>}{waiting && <button disabled={busy} onClick={() => onPatch(campaign.id, 'approved')} style={primaryButton}>Approve campaign</button>}{canQueue && <button disabled={busy} onClick={() => onPatch(campaign.id, 'queued')} style={secondaryButton}>Queue worker</button>}{canDraft && !output && <button disabled={busy} onClick={() => onGenerateDraft(campaign.id)} style={primaryButton}>Generate review draft</button>}</div></div>
}

function InfoBlock({ title, body, large = false }: { title: string; body: string; large?: boolean }) {
  return <div style={{ background: 'rgba(0,0,0,.24)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 14, minHeight: large ? 120 : 96 }}><p style={{ margin: 0, color: GOLD, fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 950 }}>{title}</p><p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,.78)', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{body}</p></div>
}

const h2: CSSProperties = { color: '#fff', margin: '8px 0 0', fontSize: 20 }
const bodyText: CSSProperties = { color: 'rgba(255,255,255,.62)', margin: '8px 0 0', lineHeight: 1.6 }
const labelStyle: CSSProperties = { display: 'grid', gap: 7, fontSize: 12, color: 'rgba(226,232,240,.72)', fontWeight: 800 }
const primaryButton: CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '11px 16px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '11px 16px', fontWeight: 850, cursor: 'pointer' }
const ghostButton: CSSProperties = { border: '1px solid rgba(255,195,0,.4)', background: 'rgba(255,195,0,.12)', color: GOLD, borderRadius: 12, padding: '11px 16px', fontWeight: 900, cursor: 'pointer' }
