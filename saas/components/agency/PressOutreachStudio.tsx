'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { getAgencyCopy } from '@/lib/i18n/agencyCopy'

type PressCampaign = {
  id: string
  status: 'draft' | 'pending_owner_review' | 'approved' | 'published' | 'rejected'
  created_by_role: 'owner' | 'staff'
  media_target_type: 'newspaper_print' | 'magazine_print' | 'digital_press'
  publication_contact: string
  content_body: string
  processing_state: 'free_organic_distribution'
  updated_at: string
  source?: string | null
  channel?: string | null
  publication_name?: string | null
  editor_contact?: string | null
  headline?: string | null
  article_notes?: string | null
  cta_url?: string | null
  published_url?: string | null
  preview_sent_at?: string | null
  published_at?: string | null
}

type Decision = 'approve' | 'reject'

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function targetLabel(copy: ReturnType<typeof getAgencyCopy>['pressOutreach'], campaign: PressCampaign) {
  return copy.targets[campaign.media_target_type] || campaign.media_target_type
}

export function PendingApprovalsTable({
  campaigns,
  copy,
  saving,
  publishUrls,
  onUrlChange,
  onDecision,
}: {
  campaigns: PressCampaign[]
  copy: ReturnType<typeof getAgencyCopy>['pressOutreach']
  saving: string
  publishUrls: Record<string, string>
  onUrlChange: (id: string, value: string) => void
  onDecision: (campaign: PressCampaign, decision: Decision) => Promise<void>
}) {
  return (
    <section className="fathom-glass" style={panel} aria-labelledby="press-pending-title">
      <div style={sectionHead}>
        <span style={pill}>{copy.pendingBadge}</span>
        <h2 id="press-pending-title" style={h2}>Owner approval queue</h2>
      </div>
      {campaigns.length === 0 ? <p style={muted}>{copy.emptyPending}</p> : (
        <div style={cards}>
          {campaigns.map((campaign) => (
            <article key={campaign.id} style={approvalCard}>
              <div style={miniGrid}>
                <p style={field}><strong>Source</strong><span>{campaign.source || 'concierge_cos'}</span></p>
                <p style={field}><strong>Channel</strong><span>{campaign.channel || targetLabel(copy, campaign)}</span></p>
                <p style={field}><strong>Publication</strong><span>{campaign.publication_name || targetLabel(copy, campaign)}</span></p>
                <p style={field}><strong>Contact</strong><span>{campaign.editor_contact || campaign.publication_contact}</span></p>
              </div>
              <h3 style={h3}>{campaign.headline || 'Press & Print campaign preview'}</h3>
              <p style={muted}><strong style={{ color: '#fff' }}>CTA:</strong> {campaign.cta_url || 'https://saas.signalboostapp.com'}</p>
              <pre style={preview}>{campaign.content_body}</pre>
              <label style={label}>
                Optional published/proof URL
                <input
                  value={publishUrls[campaign.id] ?? campaign.published_url ?? ''}
                  onChange={(event) => onUrlChange(campaign.id, event.target.value)}
                  placeholder="https://publication.example/article-or-proof"
                  style={input}
                />
              </label>
              <div style={actions}>
                <button disabled={saving === campaign.id} style={primary} onClick={() => onDecision(campaign, 'approve')}>
                  {saving === campaign.id ? 'Saving…' : 'Approve & mark published'}
                </button>
                <button disabled={saving === campaign.id} style={danger} onClick={() => onDecision(campaign, 'reject')}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function CampaignHistoryTimeline({ campaigns, copy }: { campaigns: PressCampaign[]; copy: ReturnType<typeof getAgencyCopy>['pressOutreach'] }) {
  return (
    <section className="fathom-glass" style={panel} aria-labelledby="press-history-title">
      <div style={sectionHead}>
        <span style={pill}>{copy.historyBadge}</span>
        <h2 id="press-history-title" style={h2}>{copy.historyTitle}</h2>
      </div>
      <div style={timeline}>
        {campaigns.map((campaign) => (
          <article key={campaign.id} style={timelineItem}>
            <span style={dot} />
            <div>
              <strong style={{ color: '#fff' }}>{copy.statuses[campaign.status]} · {targetLabel(copy, campaign)}</strong>
              <p style={muted}>{campaign.publication_name || campaign.publication_contact} · {formatDate(campaign.updated_at)}</p>
              <p style={{ ...muted, marginTop: 8 }}>{(campaign.headline || campaign.content_body).slice(0, 180)}{(campaign.headline || campaign.content_body).length > 180 ? '…' : ''}</p>
              {campaign.published_url ? <a href={campaign.published_url} target="_blank" rel="noreferrer" style={link}>Published/proof link ↗</a> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function PressOutreachStudio() {
  const { lang } = useI18n()
  const copy = getAgencyCopy(lang).pressOutreach
  const [campaigns, setCampaigns] = useState<PressCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [notice, setNotice] = useState('')
  const [publishUrls, setPublishUrls] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/agency/press-dispatch', { cache: 'no-store' })
      const json = await res.json()
      setCampaigns(Array.isArray(json?.campaigns) ? json.campaigns : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function decide(campaign: PressCampaign, decision: Decision) {
    setSaving(campaign.id)
    setNotice('')
    try {
      const res = await fetch('/api/agency/press-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision,
          campaign_id: campaign.id,
          published_url: publishUrls[campaign.id] || campaign.published_url || '',
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Could not update press campaign.')
      setNotice(decision === 'approve' ? 'Approved. The owner proof email will include the published/proof link.' : 'Rejected. The campaign will not be published.')
      await load()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update press campaign.')
    } finally {
      setSaving('')
    }
  }

  const pending = useMemo(() => campaigns.filter((campaign) => campaign.status === 'pending_owner_review'), [campaigns])
  const history = useMemo(() => [...campaigns].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [campaigns])

  return (
    <main style={shell} aria-label={copy.ariaLabel}>
      <section className="fathom-glass" style={hero}>
        <p style={eyebrow}>{copy.eyebrow}</p>
        <h1 style={h1}>{copy.title}</h1>
        <p style={lead}>Concierge is the public face. COS prepares the campaign, locks it for owner approval, and only publishes after owner approval unless the owner manually created it.</p>
        <div style={gridStats}>
          <div style={statCard}><span>{copy.pendingMetric}</span><strong>{pending.length}</strong></div>
          <div style={statCard}><span>{copy.publishedMetric}</span><strong>{campaigns.filter((campaign) => campaign.status === 'published').length}</strong></div>
          <div style={statCard}><span>{copy.modeMetric}</span><strong>{copy.freeOrganic}</strong></div>
        </div>
      </section>
      {notice ? <section className="fathom-glass" style={panel}><p style={muted}>{notice}</p></section> : null}
      {loading ? <section className="fathom-glass" style={panel}><p style={muted}>{copy.loading}</p></section> : null}
      {!loading ? (
        <div style={stackedGrid}>
          <PendingApprovalsTable
            campaigns={pending}
            copy={copy}
            saving={saving}
            publishUrls={publishUrls}
            onUrlChange={(id, value) => setPublishUrls((current) => ({ ...current, [id]: value }))}
            onDecision={decide}
          />
          <CampaignHistoryTimeline campaigns={history} copy={copy} />
        </div>
      ) : null}
    </main>
  )
}

const shell: CSSProperties = { display: 'grid', gap: 18, maxWidth: 1180, margin: '0 auto' }
const hero: CSSProperties = { borderRadius: 26, padding: 24, border: '1px solid rgba(244,114,182,.28)', background: 'linear-gradient(135deg, rgba(15,23,42,.88), rgba(76,29,149,.34))', boxShadow: '0 24px 80px rgba(0,0,0,.32)', backdropFilter: 'blur(22px)' }
const panel: CSSProperties = { borderRadius: 22, padding: 20, border: '1px solid rgba(255,255,255,.12)', background: 'linear-gradient(145deg, rgba(3,7,18,.78), rgba(15,23,42,.64))', backdropFilter: 'blur(18px)' }
const stackedGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }
const gridStats: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 18 }
const statCard: CSSProperties = { display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 16, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.72)' }
const sectionHead: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }
const eyebrow: CSSProperties = { margin: 0, color: '#f472b6', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.16em' }
const h1: CSSProperties = { margin: '8px 0 0', color: '#fff', fontSize: 'clamp(30px, 5vw, 52px)', letterSpacing: '-.05em', lineHeight: 1 }
const h2: CSSProperties = { margin: 0, color: '#fff', fontSize: 22, letterSpacing: '-.03em' }
const h3: CSSProperties = { margin: '12px 0 8px', color: '#fff', fontSize: 20, letterSpacing: '-.02em' }
const lead: CSSProperties = { maxWidth: 780, color: 'rgba(255,255,255,.72)', lineHeight: 1.7, fontSize: 16 }
const muted: CSSProperties = { margin: 0, color: 'rgba(255,255,255,.68)', lineHeight: 1.55 }
const pill: CSSProperties = { border: '1px solid rgba(244,114,182,.35)', borderRadius: 999, padding: '6px 10px', color: '#f9a8d4', background: 'rgba(244,114,182,.10)', fontSize: 12, fontWeight: 900 }
const timeline: CSSProperties = { display: 'grid', gap: 14 }
const timelineItem: CSSProperties = { position: 'relative', display: 'grid', gridTemplateColumns: '18px 1fr', gap: 12, padding: 14, border: '1px solid rgba(255,255,255,.10)', borderRadius: 16, background: 'rgba(255,255,255,.04)' }
const dot: CSSProperties = { width: 12, height: 12, borderRadius: 999, marginTop: 4, background: '#1af0ff', boxShadow: '0 0 24px rgba(26,240,255,.72)' }
const cards: CSSProperties = { display: 'grid', gap: 14 }
const approvalCard: CSSProperties = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 16, background: 'rgba(255,255,255,.045)' }
const miniGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }
const field: CSSProperties = { margin: 0, display: 'grid', gap: 4, color: 'rgba(255,255,255,.66)', fontSize: 13 }
const preview: CSSProperties = { whiteSpace: 'pre-wrap', border: '1px solid rgba(56,189,248,.22)', borderRadius: 14, padding: 12, background: 'rgba(56,189,248,.06)', color: 'rgba(255,255,255,.78)', lineHeight: 1.55, fontFamily: 'inherit', maxHeight: 260, overflow: 'auto' }
const label: CSSProperties = { display: 'grid', gap: 8, color: 'rgba(255,255,255,.72)', fontSize: 13, marginTop: 12 }
const input: CSSProperties = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 12px', color: '#fff', background: 'rgba(15,23,42,.72)' }
const actions: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }
const primary: CSSProperties = { border: 'none', borderRadius: 12, padding: '10px 14px', background: '#ffc300', color: '#000', fontWeight: 900, cursor: 'pointer' }
const danger: CSSProperties = { border: '1px solid rgba(248,113,113,.35)', borderRadius: 12, padding: '10px 14px', background: 'rgba(248,113,113,.12)', color: '#fecaca', fontWeight: 900, cursor: 'pointer' }
const link: CSSProperties = { display: 'inline-flex', marginTop: 8, color: '#67e8f9', fontWeight: 800 }
