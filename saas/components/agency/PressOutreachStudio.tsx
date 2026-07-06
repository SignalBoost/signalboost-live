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
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function PendingApprovalsTable({ campaigns, copy }: { campaigns: PressCampaign[]; copy: ReturnType<typeof getAgencyCopy>['pressOutreach'] }) {
  return (
    <section className="fathom-glass" style={panel} aria-labelledby="press-pending-title">
      <div style={sectionHead}>
        <span style={pill}>{copy.pendingBadge}</span>
        <h2 id="press-pending-title" style={h2}>{copy.pendingTitle}</h2>
      </div>
      {campaigns.length === 0 ? <p style={muted}>{copy.emptyPending}</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead><tr><th>{copy.target}</th><th>{copy.contact}</th><th>{copy.role}</th><th>{copy.updated}</th></tr></thead>
            <tbody>{campaigns.map((campaign) => <tr key={campaign.id}><td>{copy.targets[campaign.media_target_type]}</td><td>{campaign.publication_contact}</td><td>{copy.roles[campaign.created_by_role]}</td><td>{formatDate(campaign.updated_at)}</td></tr>)}</tbody>
          </table>
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
              <strong style={{ color: '#fff' }}>{copy.statuses[campaign.status]} · {copy.targets[campaign.media_target_type]}</strong>
              <p style={muted}>{campaign.publication_contact} · {formatDate(campaign.updated_at)}</p>
              <p style={{ ...muted, marginTop: 8 }}>{campaign.content_body.slice(0, 180)}{campaign.content_body.length > 180 ? '…' : ''}</p>
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

  useEffect(() => {
    let alive = true
    fetch('/api/agency/press-dispatch', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => { if (alive) setCampaigns(Array.isArray(json?.campaigns) ? json.campaigns : []) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const pending = useMemo(() => campaigns.filter((campaign) => campaign.status === 'pending_owner_review'), [campaigns])
  const history = useMemo(() => [...campaigns].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [campaigns])

  return (
    <main style={shell} aria-label={copy.ariaLabel}>
      <section className="fathom-glass" style={hero}>
        <p style={eyebrow}>{copy.eyebrow}</p>
        <h1 style={h1}>{copy.title}</h1>
        <p style={lead}>{copy.subtitle}</p>
        <div style={gridStats}>
          <div style={statCard}><span>{copy.pendingMetric}</span><strong>{pending.length}</strong></div>
          <div style={statCard}><span>{copy.publishedMetric}</span><strong>{campaigns.filter((campaign) => campaign.status === 'published').length}</strong></div>
          <div style={statCard}><span>{copy.modeMetric}</span><strong>{copy.freeOrganic}</strong></div>
        </div>
      </section>
      {loading ? <section className="fathom-glass" style={panel}><p style={muted}>{copy.loading}</p></section> : null}
      {!loading ? <div style={stackedGrid}><PendingApprovalsTable campaigns={pending} copy={copy} /><CampaignHistoryTimeline campaigns={history} copy={copy} /></div> : null}
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
const lead: CSSProperties = { maxWidth: 780, color: 'rgba(255,255,255,.72)', lineHeight: 1.7, fontSize: 16 }
const muted: CSSProperties = { margin: 0, color: 'rgba(255,255,255,.68)', lineHeight: 1.55 }
const pill: CSSProperties = { border: '1px solid rgba(244,114,182,.35)', borderRadius: 999, padding: '6px 10px', color: '#f9a8d4', background: 'rgba(244,114,182,.10)', fontSize: 12, fontWeight: 900 }
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', color: 'rgba(255,255,255,.78)' }
const timeline: CSSProperties = { display: 'grid', gap: 14 }
const timelineItem: CSSProperties = { position: 'relative', display: 'grid', gridTemplateColumns: '18px 1fr', gap: 12, padding: 14, border: '1px solid rgba(255,255,255,.10)', borderRadius: 16, background: 'rgba(255,255,255,.04)' }
const dot: CSSProperties = { width: 12, height: 12, borderRadius: 999, marginTop: 4, background: '#1af0ff', boxShadow: '0 0 24px rgba(26,240,255,.72)' }
