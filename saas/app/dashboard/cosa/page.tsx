'use client'

import { useEffect, useMemo, useState } from 'react'

const GOLD = '#ffc300'

type OutreachRow = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: string
  created_at?: string
  outreach_message?: string
  analyzer_summary?: any
  business_model_profile?: any
  predictive_needs?: any
  social_plan?: any
  promo_plan?: any
  review_strategy?: any
}

type AdmData = {
  metrics?: Record<string, any>
  recentOutreach?: OutreachRow[]
  recentAiTasks?: any[]
  recentSecurityEvents?: any[]
  hmi?: { summary?: string; nextActions?: string[] }
}

type CompanyGoal = {
  id: string
  title: string
  description: string
  priority: string
  status: string
  kpi: string
  target: number
  current: number
  unit: string
}

type ExecutiveMetric = {
  id: string
  label: string
  value: string | number
  status: 'healthy' | 'watch' | 'at_risk'
  explanation: string
}

type ExecutiveBriefingItem = {
  id: string
  title: string
  summary: string
  priority: string
  confidence: number
  evidence: string[]
  recommended_action: string
  approval_required: boolean
}

type ExecutiveBriefing = {
  generated_at: string
  headline: string
  operating_principle: string
  goals: CompanyGoal[]
  metrics: ExecutiveMetric[]
  recommendations: ExecutiveBriefingItem[]
  next_actions: string[]
}

type CampaignWorkItem = {
  id?: string
  kind?: string
  status?: string
  output?: {
    title?: string
    opening?: string
    draft?: string
    call_to_action?: string
    estimated_duration_minutes?: number
    scenes?: Array<{ label?: string; narration?: string; visual_direction?: string }>
  }
}

type CampaignQueueRow = {
  id: string
  title: string
  objective?: string
  channel?: string
  status?: string
  risk_level?: string
  approval_required?: boolean
  languages?: string[]
  work_items?: CampaignWorkItem[]
  created_at?: string
}

function formatDate(value?: string) {
  if (!value) return 'Unknown time'
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function summarize(value: any, fallback = 'No AI summary attached yet.') {
  if (!value) return fallback
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.slice(0, 4).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  if (typeof value === 'object') {
    const preferred = value.summary || value.description || value.recommendation || value.message || value.objective
    if (preferred) return String(preferred)
    return Object.entries(value)
      .slice(0, 4)
      .map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`)
      .join('\n')
  }
  return String(value)
}

function riskLabel(row: OutreachRow) {
  const message = `${row.outreach_message || ''} ${summarize(row.predictive_needs, '')}`.toLowerCase()
  if (message.includes('budget') || message.includes('send') || message.includes('ad') || message.includes('price')) return 'Needs owner approval'
  if (row.status === 'pending') return 'Ready for review'
  return 'Logged'
}

function progressPercent(goal: CompanyGoal) {
  if (!goal.target || goal.target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((goal.current / goal.target) * 100)))
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{
      background: 'rgba(15,23,42,0.68)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 18,
      padding: 20,
      boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
      ...style,
    }}>
      {children}
    </section>
  )
}

export default function MarketingSalesCosaPage() {
  const [data, setData] = useState<AdmData | null>(null)
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignQueueRow[]>([])
  const [selected, setSelected] = useState<OutreachRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const [admRes, briefingRes, campaignRes] = await Promise.all([
        fetch('/api/admin/adm', { cache: 'no-store' }),
        fetch('/api/cos/executive/briefing', { cache: 'no-store' }),
        fetch('/api/cos/campaign-queue', { cache: 'no-store' }),
      ])

      const json = await admRes.json()
      if (!admRes.ok) throw new Error(json?.error || 'Could not load COSA command data.')
      setData(json)
      setSelected((current) => {
        const rows = json.recentOutreach || []
        if (current) return rows.find((row: OutreachRow) => row.id === current.id) || rows[0] || null
        return rows.find((row: OutreachRow) => row.status === 'pending') || rows[0] || null
      })

      if (briefingRes.ok) {
        const executiveJson = await briefingRes.json().catch(() => null)
        setBriefing(executiveJson?.briefing || null)
      } else {
        setBriefing(null)
      }

      if (campaignRes.ok) {
        const campaignJson = await campaignRes.json().catch(() => null)
        setCampaigns(Array.isArray(campaignJson?.campaigns) ? campaignJson.campaigns : [])
      } else {
        setCampaigns([])
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load COSA command data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pendingRows = useMemo(() => data?.recentOutreach?.filter(row => row.status === 'pending') || [], [data])
  const completedRows = useMemo(() => data?.recentOutreach?.filter(row => row.status !== 'pending') || [], [data])
  const campaignQueue = useMemo(() => campaigns.slice(0, 8), [campaigns])

  async function createStarterCampaign() {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not create campaign queue item.')
      setMessage('Campaign queued for owner approval. COSA can now route it toward worker execution after approval.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create campaign queue item.')
    } finally {
      setBusy(false)
    }
  }

  async function patchCampaign(id: string, status: 'approved' | 'rejected' | 'queued') {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `Could not mark campaign ${status}.`)
      setMessage(`Campaign marked ${status}.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not mark campaign ${status}.`)
    } finally {
      setBusy(false)
    }
  }

  async function generateDraft(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/script-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Could not generate YouTube draft.')
      setMessage('YouTube draft generated and attached to the campaign. This is content generation, not video rendering yet.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not generate YouTube draft.')
    } finally {
      setBusy(false)
    }
  }

  async function patchSelected(status: 'approved' | 'rejected') {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch('/api/outreach/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `Could not mark item ${status}.`)
      setMessage(status === 'approved' ? 'Approved. COSA can move this work to the next guarded step.' : 'Rejected. COSA will not execute this item.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not mark item ${status}.`)
    } finally {
      setBusy(false)
    }
  }

  const metrics = data?.metrics || {}
  const metricCards = [
    ['Pending approvals', metrics.pending ?? 0],
    ['Campaign queue', campaigns.length],
    ['Approved', metrics.approved ?? 0],
    ['Sent / executed', metrics.sent ?? 0],
    ['24h send limit', `${metrics.sendLimit?.count || 0}/${metrics.sendLimit?.limit || 50}`],
  ]

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={{
        background: 'linear-gradient(145deg, rgba(15,23,42,0.94), rgba(2,6,23,0.98))',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: 28,
        boxShadow: '0 28px 80px rgba(0,0,0,0.38)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <p className="sb-eyebrow" style={{ margin: 0 }}>🧠 Marketing & Sales COSA</p>
            <h1 style={{ color: '#fff', fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.04em', margin: '10px 0 0', fontWeight: 950 }}>
              AI does the work. Humans approve the decision.
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.68)', maxWidth: 760, lineHeight: 1.7, marginTop: 14 }}>
              This is the first COSA command console for SignalBoost: it collects outreach intelligence, queues finished work, and keeps execution behind approval, guardrails, daily limits, and a panic switch.
            </p>
          </div>
          <button onClick={load} disabled={loading || busy} style={{
            border: '1px solid rgba(255,195,0,0.4)',
            background: 'rgba(255,195,0,0.12)',
            color: GOLD,
            borderRadius: 12,
            padding: '11px 16px',
            fontWeight: 900,
            cursor: loading || busy ? 'not-allowed' : 'pointer',
            opacity: loading || busy ? 0.6 : 1,
          }}>
            {loading ? 'Loading...' : 'Refresh command data'}
          </button>
        </div>
      </section>

      {message && (
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.75)', color: '#fff', padding: '12px 16px', borderRadius: 14 }}>
          {message}
        </div>
      )}

      {briefing && (
        <Card style={{ background: 'linear-gradient(145deg, rgba(255,195,0,0.1), rgba(15,23,42,0.72))', border: '1px solid rgba(255,195,0,0.24)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <p className="sb-eyebrow" style={{ margin: 0 }}>Executive Briefing</p>
              <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24, lineHeight: 1.15 }}>{briefing.headline}</h2>
              <p style={{ color: GOLD, margin: '10px 0 0', fontWeight: 900 }}>{briefing.operating_principle}</p>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{formatDate(briefing.generated_at)}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 18 }}>
            {briefing.metrics.map(metric => (
              <InfoBlock key={metric.id} title={`${metric.label}: ${metric.value}`} body={metric.explanation} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(300px, 1.1fr)', gap: 16, marginTop: 18 }} className="cosa-grid">
            <div>
              <p className="sb-eyebrow" style={{ margin: 0 }}>Company goals</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {briefing.goals.map(goal => <GoalCard key={goal.id} goal={goal} />)}
              </div>
            </div>
            <div>
              <p className="sb-eyebrow" style={{ margin: 0 }}>Executive recommendations</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {briefing.recommendations.map(item => <ExecutiveRecommendationCard key={item.id} item={item} />)}
              </div>
            </div>
          </div>
        </Card>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        {metricCards.map(([label, value]) => (
          <Card key={String(label)}>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 900 }}>{label}</p>
            <p style={{ margin: '8px 0 0', color: '#fff', fontSize: 30, fontWeight: 950 }}>{String(value)}</p>
          </Card>
        ))}
      </section>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="sb-eyebrow" style={{ margin: 0 }}>Campaign queue</p>
            <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 20 }}>Recommendations become campaign work</h2>
            <p style={{ color: 'rgba(255,255,255,0.58)', margin: '8px 0 0', lineHeight: 1.6, maxWidth: 760 }}>
              COSA now has a campaign queue layer between executive recommendations and worker execution. Campaigns can be approved, rejected, queued, and drafted without publishing or sending anything automatically.
            </p>
          </div>
          <button disabled={busy} onClick={createStarterCampaign} style={primaryButton}>
            Create first campaign
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {loading && <p style={{ color: 'rgba(255,255,255,0.55)' }}>Loading campaign queue...</p>}
          {!loading && campaignQueue.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              No campaigns queued yet. Create one from the current COS recommendation, then approve it before any worker execution.
            </p>
          )}
          {campaignQueue.map(campaign => <CampaignQueueCard key={campaign.id} campaign={campaign} busy={busy} onPatch={patchCampaign} onGenerateDraft={generateDraft} />)}
        </div>
      </Card>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.85fr) minmax(360px, 1.4fr)', gap: 18, alignItems: 'start' }} className="cosa-grid">
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <p className="sb-eyebrow" style={{ margin: 0 }}>Approval queue</p>
              <h2 style={{ margin: '8px 0 0', color: '#fff', fontSize: 20, fontWeight: 900 }}>Review finished work</h2>
            </div>
            <span style={{ color: GOLD, fontWeight: 950 }}>{pendingRows.length}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {loading && <p style={{ color: 'rgba(255,255,255,0.55)' }}>Loading queued decisions...</p>}
            {!loading && pendingRows.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>No pending approvals right now. COSA will show finished campaigns, outreach drafts, or recommended actions here before execution.</p>
            )}
            {pendingRows.map(row => {
              const active = selected?.id === row.id
              return (
                <button key={row.id} onClick={() => setSelected(row)} style={{
                  textAlign: 'left',
                  border: active ? '1px solid rgba(255,195,0,0.65)' : '1px solid rgba(255,255,255,0.08)',
                  background: active ? 'rgba(255,195,0,0.09)' : 'rgba(255,255,255,0.04)',
                  color: '#fff',
                  borderRadius: 14,
                  padding: 14,
                  cursor: 'pointer',
                }}>
                  <strong style={{ display: 'block', fontSize: 14 }}>{row.business_name || 'Unnamed opportunity'}</strong>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>{row.source_platform || 'COSA'} · {formatDate(row.created_at)}</span>
                  <p style={{ margin: '8px 0 0', color: GOLD, fontSize: 12, fontWeight: 850 }}>{riskLabel(row)}</p>
                </button>
              )
            })}
          </div>
        </Card>

        <Card style={{ minHeight: 520 }}>
          {!selected && (
            <div style={{ minHeight: 420, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 48 }}>✅</div>
                <p>Select a queued COSA recommendation to approve, reject, or inspect.</p>
              </div>
            </div>
          )}

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p className="sb-eyebrow" style={{ margin: 0 }}>{selected.status || 'pending'} · {selected.source_platform || 'COSA'}</p>
                  <h2 style={{ color: '#fff', fontSize: 26, margin: '8px 0 0', lineHeight: 1.15 }}>{selected.business_name || 'Unnamed opportunity'}</h2>
                  {selected.business_url && <p style={{ color: 'rgba(255,255,255,0.55)', margin: '6px 0 0' }}>{selected.business_url}</p>}
                </div>
                <span style={{ height: 32, padding: '7px 11px', borderRadius: 999, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.35)', color: GOLD, fontSize: 12, fontWeight: 900 }}>
                  {riskLabel(selected)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <InfoBlock title="Analyzer" body={summarize(selected.analyzer_summary)} />
                <InfoBlock title="Predictive needs" body={summarize(selected.predictive_needs)} />
                <InfoBlock title="Business profile" body={summarize(selected.business_model_profile)} />
              </div>

              <InfoBlock title="Prepared outreach message" body={selected.outreach_message || 'No outreach draft attached yet.'} large />
              <InfoBlock title="Social / promo plan" body={[summarize(selected.social_plan, ''), summarize(selected.promo_plan, ''), summarize(selected.review_strategy, '')].filter(Boolean).join('\n\n') || 'No channel plan attached yet.'} large />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
                <button disabled={busy || selected.status !== 'pending'} onClick={() => patchSelected('rejected')} style={secondaryButton}>
                  Reject
                </button>
                <button disabled={busy || selected.status !== 'pending'} onClick={() => patchSelected('approved')} style={primaryButton}>
                  Approve next step
                </button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <Card>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Operating rule</p>
        <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 20 }}>Less data entry. More governance.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
          {[
            ['Low risk', 'COSA collects data, analyzes performance, prepares drafts, and updates internal reports automatically.'],
            ['Medium risk', 'COSA asks for approval before sending outreach, publishing content, or scheduling campaigns.'],
            ['High risk', 'COSA requires explicit owner approval before spending budget, changing prices, or contacting major partners.'],
          ].map(([title, body]) => <InfoBlock key={title} title={title} body={body} />)}
        </div>
      </Card>

      {completedRows.length > 0 && (
        <Card>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Recent decisions</p>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {completedRows.slice(0, 8).map(row => (
              <button key={row.id} onClick={() => setSelected(row)} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center',
                border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.035)', color: '#fff', borderRadius: 12, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
              }}>
                <span>{row.business_name || 'Unnamed opportunity'}</span>
                <span style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12 }}>{row.status} · {formatDate(row.created_at)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <style>{`
        @media (max-width: 920px) {
          .cosa-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

function GoalCard({ goal }: { goal: CompanyGoal }) {
  const percent = progressPercent(goal)

  return (
    <div style={{ background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#fff', fontSize: 14 }}>{goal.title}</strong>
          <p style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 1.55, margin: '6px 0 0' }}>{goal.description}</p>
        </div>
        <span style={{ color: GOLD, fontSize: 11, fontWeight: 950, textTransform: 'uppercase' }}>{goal.priority}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 12 }}>
        <div style={{ width: `${percent}%`, height: '100%', background: GOLD }} />
      </div>
      <p style={{ color: 'rgba(255,255,255,0.52)', margin: '8px 0 0', fontSize: 12 }}>
        {goal.kpi}: {goal.current}/{goal.target} {goal.unit} · {goal.status}
      </p>
    </div>
  )
}

function ExecutiveRecommendationCard({ item }: { item: ExecutiveBriefingItem }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#fff', fontSize: 14 }}>{item.title}</strong>
          <p style={{ color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 1.6, margin: '7px 0 0' }}>{item.summary}</p>
        </div>
        <span style={{ color: GOLD, fontSize: 11, fontWeight: 950, textTransform: 'uppercase' }}>{item.priority}</span>
      </div>
      <p style={{ color: GOLD, fontWeight: 900, margin: '10px 0 0', fontSize: 13 }}>{item.confidence}% confidence</p>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>{item.recommended_action}</p>
      {item.evidence.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.55 }}>
          {item.evidence.map((entry, index) => <li key={`${item.id}-${index}`}>{entry}</li>)}
        </ul>
      )}
    </div>
  )
}

function CampaignQueueCard({ campaign, busy, onPatch, onGenerateDraft }: { campaign: CampaignQueueRow; busy: boolean; onPatch: (id: string, status: 'approved' | 'rejected' | 'queued') => void; onGenerateDraft: (id: string) => void }) {
  const waitingApproval = campaign.status === 'waiting_approval' || campaign.status === 'draft'
  const canQueue = campaign.status === 'approved'
  const canDraft = campaign.status === 'approved' || campaign.status === 'queued' || campaign.status === 'running'
  const output = campaign.work_items?.find(item => item.output)?.output

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#fff', display: 'block' }}>{campaign.title}</strong>
          <span style={{ color: 'rgba(255,255,255,0.52)', fontSize: 12 }}>{campaign.channel || 'campaign'} · {campaign.status || 'waiting_approval'} · {formatDate(campaign.created_at)}</span>
          <p style={{ color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>{campaign.objective || 'No campaign objective attached.'}</p>
        </div>
        <span style={{ color: GOLD, fontSize: 11, fontWeight: 950, textTransform: 'uppercase' }}>{campaign.risk_level || 'medium'} risk</span>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 12, margin: '8px 0 0' }}>
        Work items: {campaign.work_items?.length || 0} · Languages: {(campaign.languages || []).join(', ') || 'en'}
      </p>
      {output && (
        <div style={{ marginTop: 14, border: '1px solid rgba(255,195,0,0.22)', borderRadius: 14, background: 'rgba(255,195,0,0.06)', padding: 14 }}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>YouTube draft generated</p>
          <h3 style={{ color: '#fff', margin: '8px 0 0', fontSize: 16 }}>{output.title || 'Generated campaign draft'}</h3>
          <p style={{ color: 'rgba(255,255,255,0.74)', lineHeight: 1.65, fontSize: 13 }}>{output.opening}</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.55, maxHeight: 360, overflow: 'auto' }}>{output.draft}</pre>
          {output.call_to_action && <p style={{ color: GOLD, fontWeight: 900, margin: '10px 0 0', fontSize: 13 }}>CTA: {output.call_to_action}</p>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {waitingApproval && <button disabled={busy} onClick={() => onPatch(campaign.id, 'rejected')} style={secondaryButton}>Reject</button>}
        {waitingApproval && <button disabled={busy} onClick={() => onPatch(campaign.id, 'approved')} style={primaryButton}>Approve campaign</button>}
        {canQueue && <button disabled={busy} onClick={() => onPatch(campaign.id, 'queued')} style={secondaryButton}>Queue worker</button>}
        {canDraft && !output && <button disabled={busy} onClick={() => onGenerateDraft(campaign.id)} style={primaryButton}>Generate YouTube Draft</button>}
      </div>
    </div>
  )
}

function InfoBlock({ title, body, large = false }: { title: string; body: string; large?: boolean }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.24)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: 14,
      minHeight: large ? 120 : 96,
    }}>
      <p style={{ margin: 0, color: GOLD, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 950 }}>{title}</p>
      <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{body}</p>
    </div>
  )
}

const primaryButton: React.CSSProperties = {
  border: 'none',
  background: GOLD,
  color: '#000',
  borderRadius: 12,
  padding: '11px 16px',
  fontWeight: 950,
  cursor: 'pointer',
}

const secondaryButton: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  borderRadius: 12,
  padding: '11px 16px',
  fontWeight: 850,
  cursor: 'pointer',
}
