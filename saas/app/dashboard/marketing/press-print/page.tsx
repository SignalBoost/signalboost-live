'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

type Campaign = { id: string; title?: string; objective?: string; status?: string; metadata?: Record<string, any> }
type Decision = 'ok' | 'no' | 'staff' | 'published'

const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const

const channelLabels: Record<string, string> = {
  'online-newspapers': 'Digital newspaper',
  'print-newspapers': 'Print newspaper',
  'trade-press': 'IT magazine / trade press',
}

function channel(campaign: Campaign) {
  return String(campaign.metadata?.outreach_channel || campaign.metadata?.media_channel || '')
}

function review(campaign: Campaign) {
  return String(campaign.metadata?.press_print_review || 'PENDING').toUpperCase()
}

function stage(campaign: Campaign) {
  return String(campaign.metadata?.press_print_execution_stage || campaign.metadata?.press_print_execution?.stage || 'not_started')
}

function labelStage(value: string) {
  if (value === 'approved') return 'Ready to publish'
  if (value === 'package_prepared') return 'In progress'
  if (value === 'submitted') return 'In progress'
  if (value === 'published') return 'Completed'
  if (value === 'staff_support') return 'Staff support'
  if (value === 'on_hold') return 'On hold'
  if (value === 'rejected') return 'Rejected'
  return 'Needs review'
}

function Action({ id, decision, children, primary = false }: { id: string; decision: Decision; children: React.ReactNode; primary?: boolean }) {
  return <form method="post" action="/api/marketing/press-print/decision" style={{ display: 'inline-grid', gap: 8 }}><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value={decision} /><button style={primary ? primaryButton : secondaryButton}>{children}</button></form>
}

export default function PressPrintMediaPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/marketing/press-print', { cache: 'no-store' })
        const json = await res.json()
        if (live) setCampaigns((Array.isArray(json.campaigns) ? json.campaigns : []).filter((row: Campaign) => PRESS_PRINT_CHANNELS.includes(channel(row) as any)))
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [])

  return <main style={shell}>
    <section style={hero}>
      <p className="sb-eyebrow">Marketing + Sales</p>
      <h1 style={h1}>Press & Print Media</h1>
      <p style={body}>{t('marketingSales.pressPrint.description', 'One official workflow for digital newspapers, print newspapers, and IT magazines. The old separate newspaper and trade-press workflows have been removed.')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Link href="/dashboard/marketing/press-print/direct" className="sb-button-primary">{t('marketingSales.pressPrint.startStaffLedCampaign', 'Start staff-led campaign')}</Link></div>
    </section>

    {loading ? <p className="sb-body">Loading…</p> : null}
    {!loading && campaigns.length === 0 ? <section style={card}><p style={body}>No Press & Print Media campaigns yet.</p></section> : null}

    {campaigns.map((campaign) => {
      const currentReview = review(campaign)
      const currentStage = stage(campaign)
      const approved = currentReview === 'APPROVED'
      const completed = currentStage === 'published'
      const exec = campaign.metadata?.press_print_execution || {}
      return <section key={campaign.id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><p className="sb-eyebrow">{channelLabels[channel(campaign)] || 'Press media'}</p><h2 style={h2}>{campaign.title || 'Press campaign'}</h2><p style={body}>{campaign.objective || 'Campaign prepared inside Marketing + Sales.'}</p></div><strong style={pill}>{currentReview} · {labelStage(currentStage)}</strong></div>

        {!approved && !completed ? <div style={actions}><Action id={campaign.id} decision="ok" primary>Approve</Action><Action id={campaign.id} decision="no">Reject</Action><Action id={campaign.id} decision="staff">Needs staff help</Action></div> : null}

        <div style={workflowBox}>
          <h3 style={h3}>{completed ? 'Done' : approved ? 'Next step' : 'Approval needed'}</h3>
          {!approved && !completed ? <p style={body}>Review the campaign. If it looks correct, click Approve. After that, you will only need to confirm when it is actually published or placed.</p> : null}
          {approved && !completed ? <form method="post" action="/api/marketing/press-print/decision" style={simpleForm}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="decision" value="published" />
            <p style={body}>Now the campaign is approved. The only remaining step is to confirm when the article/ad has been placed. Add a link/date if you have one. For print media, the link can stay blank.</p>
            <input name="live_url" defaultValue={String(exec.live_url || '')} placeholder="Optional article/proof link" style={input} />
            <input name="publication_date" type="date" defaultValue={String(exec.publication_date || '')} style={input} />
            <button style={primaryButton}>Confirm published / completed</button>
          </form> : null}
          {completed ? <div style={doneBox}>
            <p style={body}>This campaign is already marked completed. No more action is needed here.</p>
            {exec.live_url ? <a href={String(exec.live_url)} target="_blank" rel="noreferrer" style={link}>Open published/proof link ↗</a> : null}
            {exec.publication_date ? <p style={body}>Publication date: {String(exec.publication_date)}</p> : null}
          </div> : null}
        </div>
      </section>
    })}
  </main>
}

const shell: CSSProperties = { maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 18 }
const hero: CSSProperties = { border: '1px solid rgba(244,114,182,.24)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const card: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 22, padding: 20, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))' }
const workflowBox: CSSProperties = { border: '1px solid rgba(56,189,248,.22)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(56,189,248,.06)' }
const doneBox: CSSProperties = { display: 'grid', gap: 8, maxWidth: 640, marginTop: 10 }
const actions: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }
const simpleForm: CSSProperties = { display: 'grid', gap: 10, maxWidth: 560, marginTop: 12 }
const body: CSSProperties = { color: 'rgba(255,255,255,.72)', lineHeight: 1.65, maxWidth: 860 }
const h1: CSSProperties = { color: '#fff', fontSize: 34, margin: '8px 0' }
const h2: CSSProperties = { color: '#fff', fontSize: 24, margin: '6px 0' }
const h3: CSSProperties = { color: '#fff', margin: 0, fontSize: 18 }
const pill: CSSProperties = { color: '#fde68a', border: '1px solid rgba(255,195,0,.35)', borderRadius: 999, padding: '8px 12px', alignSelf: 'start' }
const input: CSSProperties = { width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(15,23,42,.76)', color: '#fff', padding: '9px 10px' }
const primaryButton: CSSProperties = { border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const secondaryButton: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
const link: CSSProperties = { color: '#67e8f9', fontWeight: 850, textDecoration: 'underline' }
