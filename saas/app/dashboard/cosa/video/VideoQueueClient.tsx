'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { QueueVideoPlayer } from '@/lib/cos/ui/QueueVideoPlayer'
import { getVideoQueueCopy, type VideoQueueItemCopy } from '@/lib/cos/i18n/videoQueueCopy'
import { getVideoWorkflowCopy } from '@/lib/cos/i18n/videoWorkflowCopy'
import { ProductionJobsPanel } from './ProductionJobsPanel'

const GOLD = '#ffc300'

type CampaignStatus = 'need_approval' | 'approved_rendering' | 'rejected' | 'on_hold' | 'in_progress' | 'final_review' | 'published'

type Campaign = VideoQueueItemCopy & {
  workflow_status: CampaignStatus
  reject_reason?: string
}

function makeCampaigns(items: VideoQueueItemCopy[]): Campaign[] {
  return items.map((item) => ({
    ...item,
    workflow_status: item.status === 'published' ? 'published' : item.status === 'in_progress' ? 'in_progress' : 'need_approval',
  }))
}

function statusLabel(status: CampaignStatus, copy: ReturnType<typeof getVideoWorkflowCopy>) {
  if (status === 'need_approval') return copy.statusNeedApproval
  if (status === 'approved_rendering') return copy.statusApprovedRender
  if (status === 'rejected') return copy.statusRejected
  if (status === 'on_hold') return copy.statusOnHold
  if (status === 'in_progress') return copy.statusInProgress
  if (status === 'final_review') return copy.statusFinalReview
  return copy.statusPublished
}

export function VideoQueueClient() {
  const { lang } = useTranslation()
  const queueCopy = useMemo(() => getVideoQueueCopy(lang), [lang])
  const workflowCopy = useMemo(() => getVideoWorkflowCopy(lang), [lang])
  const [campaigns, setCampaigns] = useState<Campaign[]>(makeCampaigns(queueCopy.items))
  const [selectedId, setSelectedId] = useState(queueCopy.items[0].id)

  useEffect(() => {
    const next = makeCampaigns(queueCopy.items)
    setCampaigns(next)
    setSelectedId(next[0].id)
  }, [queueCopy])

  const selected = campaigns.find((item) => item.id === selectedId) || campaigns[0]

  const counts = useMemo(() => ({
    needs: campaigns.filter((item) => item.workflow_status === 'need_approval').length,
    rendering: campaigns.filter((item) => item.workflow_status === 'approved_rendering' || item.workflow_status === 'in_progress').length,
    published: campaigns.filter((item) => item.workflow_status === 'published').length,
  }), [campaigns])

  async function setWorkflowStatus(id: string, status: CampaignStatus) {
    const item = campaigns.find((current) => current.id === id)
    setCampaigns((current) => current.map((entry) => entry.id === id ? { ...entry, workflow_status: status } : entry))

    if (status !== 'approved_rendering' || !item) return

    try {
      await fetch('/api/cos/video-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          hook: item.hook,
          audience: item.niche,
          production_tier: 'enterprise',
          platforms: ['YouTube', 'Shorts', 'LinkedIn', 'TikTok', 'Instagram', 'Google Ads'],
          queue_immediately: true,
          concept_approved: true,
        }),
      })
    } catch {
      // Local state remains clear even when production persistence is not available yet.
    }
  }

  return (
    <main style={{ maxWidth: 1420, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{workflowCopy.pageEyebrow}</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 36, letterSpacing: '-0.045em' }}>{workflowCopy.pageTitle}</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 980 }}>{workflowCopy.pageIntro}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 16 }}>
          <Metric label={workflowCopy.statusNeedApproval} value={counts.needs} />
          <Metric label={workflowCopy.renderingStage} value={counts.rendering} />
          <Metric label={workflowCopy.statusPublished} value={counts.published} />
        </div>
      </section>

      <WorkflowStrip copy={workflowCopy} />

      <section className="videoWorkflowGrid" style={workflowGrid}>
        <LeftQueue campaigns={campaigns} selectedId={selected.id} copy={workflowCopy} onSelect={setSelectedId} />
        <CenterPreview campaign={selected} queueCopy={queueCopy} copy={workflowCopy} onStatus={setWorkflowStatus} />
        <RightMetadata campaign={selected} copy={workflowCopy} />
      </section>

      <BottomPublishingAnalytics campaign={selected} copy={workflowCopy} />
      <ProductionJobsPanel />

      <style>{`@media (max-width:1100px){.videoWorkflowGrid{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}

function WorkflowStrip({ copy }: { copy: ReturnType<typeof getVideoWorkflowCopy> }) {
  const steps = [copy.ideaGeneration, copy.approvalQueue, copy.renderingStage, copy.publishingStage, copy.monitoringDashboard]
  return <section style={workflowStrip}>{steps.map((step, index) => <div key={step} style={stepCard}><b>{index + 1}</b><span>{step}</span></div>)}</section>
}

function LeftQueue({ campaigns, selectedId, copy, onSelect }: { campaigns: Campaign[]; selectedId: string; copy: ReturnType<typeof getVideoWorkflowCopy>; onSelect: (id: string) => void }) {
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.leftPanelTitle}</p>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {campaigns.map((campaign) => (
          <button key={campaign.id} onClick={() => onSelect(campaign.id)} style={{ ...queueButton, border: campaign.id === selectedId ? '1px solid rgba(255,195,0,.62)' : queueButton.border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: 'rgba(255,255,255,.52)', fontSize: 12 }}>{campaign.aspect} · {campaign.duration}</span>
              <span style={{ color: GOLD, fontWeight: 900, fontSize: 11 }}>{statusLabel(campaign.workflow_status, copy)}</span>
            </div>
            <h3 style={{ color: '#fff', fontSize: 16, lineHeight: 1.25, margin: '8px 0 0' }}>{campaign.title}</h3>
            <p style={{ color: 'rgba(255,255,255,.56)', margin: '8px 0 0', fontSize: 12 }}>{copy.niche}: {campaign.niche}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

function CenterPreview({ campaign, queueCopy, copy, onStatus }: { campaign: Campaign; queueCopy: ReturnType<typeof getVideoQueueCopy>; copy: ReturnType<typeof getVideoWorkflowCopy>; onStatus: (id: string, status: CampaignStatus) => void }) {
  const canAct = campaign.workflow_status === 'need_approval' || campaign.workflow_status === 'on_hold'
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.centerPanelTitle}</p>
      <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24 }}>{campaign.title}</h2>
      <QueueVideoPlayer title={campaign.title} aspect={campaign.aspect} duration={campaign.duration} hero={campaign.hero} hook={campaign.hook} funnel={campaign.funnel} quality={campaign.quality} scenes={campaign.scenes} labels={{ qualityLabel: queueCopy.qualityLabel, sceneLabel: queueCopy.sceneLabel, playPreview: queueCopy.playPreview, pausePreview: queueCopy.pausePreview, nextScene: queueCopy.nextScene }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button onClick={() => onStatus(campaign.id, 'on_hold')} style={secondary}>{copy.hold}</button>
        {canAct && <button onClick={() => onStatus(campaign.id, 'rejected')} style={secondary}>{copy.reject}</button>}
        {canAct && <button onClick={() => onStatus(campaign.id, 'approved_rendering')} style={primary}>{copy.approveRendering}</button>}
      </div>
    </section>
  )
}

function RightMetadata({ campaign, copy }: { campaign: Campaign; copy: ReturnType<typeof getVideoWorkflowCopy> }) {
  const rows = [
    [copy.hook, campaign.hook], [copy.niche, campaign.niche], [copy.hero, campaign.hero], [copy.format, campaign.format], [copy.quality, String(campaign.quality)], [copy.platforms, 'YouTube · Shorts · LinkedIn · TikTok · Instagram'], [copy.monetization, campaign.funnel],
  ]
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.rightPanelTitle}</p>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {rows.map(([label, value]) => <div key={label} style={metaRow}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>
  )
}

function BottomPublishingAnalytics({ campaign, copy }: { campaign: Campaign; copy: ReturnType<typeof getVideoWorkflowCopy> }) {
  return (
    <section style={bottomPanel}>
      <div>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.bottomPanelTitle}</p>
        <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{copy.publishReady}</h2>
        <p style={{ color: 'rgba(255,255,255,.62)', lineHeight: 1.6, margin: '8px 0 0' }}>{campaign.funnel}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(90px,1fr))', gap: 8 }}>
        <Metric label={copy.views} value={0} />
        <Metric label={copy.clicks} value={0} />
        <Metric label={copy.comments} value={0} />
        <Metric label={copy.engagement} value="0%" />
        <Metric label={copy.revenue} value="$0" />
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div style={metric}><p style={{ color: 'rgba(255,255,255,.48)', fontSize: 11, margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{label}</p><p style={{ color: '#fff', fontSize: 26, fontWeight: 950, margin: '5px 0 0' }}>{value}</p></div>
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const workflowStrip: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }
const stepCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.18)', borderRadius: 16, padding: 14, background: 'rgba(15,23,42,.72)', color: '#fff', display: 'grid', gap: 6 }
const workflowGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(260px,.9fr) minmax(420px,1.3fr) minmax(260px,.9fr)', gap: 14, alignItems: 'start' }
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const queueButton: React.CSSProperties = { width: '100%', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.04)', textAlign: 'left', cursor: 'pointer' }
const metaRow: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.16)', display: 'grid', gap: 5, color: 'rgba(255,255,255,.68)' }
const bottomPanel: React.CSSProperties = { border: '1px solid rgba(255,195,0,.18)', borderRadius: 20, padding: 18, background: 'rgba(15,23,42,.74)', display: 'grid', gridTemplateColumns: 'minmax(280px,1fr) minmax(420px,1.2fr)', gap: 14, alignItems: 'center' }
const metric: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,.22)' }
const primary: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondary: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
