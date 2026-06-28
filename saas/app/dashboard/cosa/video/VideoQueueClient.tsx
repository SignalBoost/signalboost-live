'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
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
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [generationMessage, setGenerationMessage] = useState('')

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

  async function createCosaCampaign() {
    setCreatingCampaign(true)
    setGenerationMessage('')
    try {
      const res = await fetch('/api/cos/video-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok || !json.ok || !json.campaign) throw new Error(json.error || workflowCopy.generatedByCosa)
      const campaign = json.campaign
      const next: Campaign = {
        id: String(campaign.id),
        title: String(campaign.title),
        aspect: String(campaign.aspect || '16:9'),
        duration: String(campaign.duration || '0:30'),
        niche: String(campaign.niche || ''),
        format: String(campaign.format || ''),
        hero: String(campaign.hero || ''),
        quality: Number(campaign.quality || 82),
        status: 'needs_approval',
        hook: String(campaign.hook || ''),
        funnel: String(campaign.funnel || ''),
        scenes: Array.isArray(campaign.scenes) ? campaign.scenes.map(String) : [],
        workflow_status: 'need_approval',
      }
      setCampaigns((current) => [next, ...current])
      setSelectedId(next.id)
      setGenerationMessage(workflowCopy.generatedByCosa)
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : workflowCopy.generatedByCosa)
    } finally {
      setCreatingCampaign(false)
    }
  }

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
    <main style={pageShell}>
      <section style={commandHeader}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{workflowCopy.pageEyebrow}</p>
          <h1 style={{ color: '#fff', margin: '6px 0 0', fontSize: 28, letterSpacing: '-0.04em' }}>{workflowCopy.pageTitle}</h1>
          <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.55, margin: '8px 0 0', maxWidth: 820 }}>{workflowCopy.pageIntro}</p>
        </div>
        <div style={headerRight}>
          <div style={metricStrip}>
            <Metric label={workflowCopy.statusNeedApproval} value={counts.needs} />
            <Metric label={workflowCopy.renderingStage} value={counts.rendering} />
            <Metric label={workflowCopy.statusPublished} value={counts.published} />
          </div>
          <button onClick={createCosaCampaign} disabled={creatingCampaign} style={primary}>{creatingCampaign ? workflowCopy.creatingCampaign : workflowCopy.createCampaign}</button>
          {generationMessage && <p style={{ color: GOLD, fontSize: 12, margin: 0, fontWeight: 850 }}>{generationMessage}</p>}
        </div>
      </section>

      <section style={workflowStrip}>
        {[workflowCopy.ideaGeneration, workflowCopy.approvalQueue, workflowCopy.renderingStage, workflowCopy.publishingStage, workflowCopy.monitoringDashboard].map((step, index) => (
          <div key={step} style={stepCard}><b>{index + 1}</b><span>{step}</span></div>
        ))}
      </section>

      <section className="videoBoardGrid" style={boardGrid}>
        <section style={panel}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{workflowCopy.leftPanelTitle}</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
            {campaigns.map((campaign) => (
              <button key={campaign.id} onClick={() => setSelectedId(campaign.id)} style={{ ...queueButton, border: campaign.id === selected.id ? '1px solid rgba(255,195,0,.62)' : queueButton.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12 }}>{campaign.aspect} · {campaign.duration}</span>
                  <span style={statusBadge}>{statusLabel(campaign.workflow_status, workflowCopy)}</span>
                </div>
                <h3 style={{ color: '#fff', fontSize: 16, lineHeight: 1.25, margin: '8px 0 0' }}>{campaign.title}</h3>
                <p style={{ color: 'rgba(255,255,255,.56)', margin: '8px 0 0', fontSize: 12 }}>{workflowCopy.niche}: {campaign.niche}</p>
              </button>
            ))}
          </div>
        </section>

        <section style={panel}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{workflowCopy.centerPanelTitle}</p>
          <DraftPreviewFrame campaign={selected} copy={workflowCopy} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={() => setWorkflowStatus(selected.id, 'on_hold')} style={secondary}>{workflowCopy.hold}</button>
            {(selected.workflow_status === 'need_approval' || selected.workflow_status === 'on_hold') && <button onClick={() => setWorkflowStatus(selected.id, 'rejected')} style={secondary}>{workflowCopy.reject}</button>}
            {(selected.workflow_status === 'need_approval' || selected.workflow_status === 'on_hold') && <button onClick={() => setWorkflowStatus(selected.id, 'approved_rendering')} style={primary}>{workflowCopy.approveRendering}</button>}
          </div>
        </section>

        <section style={panel}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{workflowCopy.rightPanelTitle}</p>
          <MetadataRows campaign={selected} copy={workflowCopy} />
        </section>

        <section style={bottomPanel}>
          <div>
            <p className="sb-eyebrow" style={{ margin: 0 }}>{workflowCopy.bottomPanelTitle}</p>
            <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 21 }}>{workflowCopy.publishReady}</h2>
            <p style={{ color: 'rgba(255,255,255,.62)', lineHeight: 1.6, margin: '8px 0 0' }}>{selected.funnel}</p>
          </div>
          <div style={analyticsGrid}>
            <Metric label={workflowCopy.views} value={0} />
            <Metric label={workflowCopy.clicks} value={0} />
            <Metric label={workflowCopy.comments} value={0} />
            <Metric label={workflowCopy.engagement} value="0%" />
            <Metric label={workflowCopy.revenue} value="$0" />
          </div>
        </section>
      </section>

      <ProductionJobsPanel />
      <style>{`@media (max-width:1100px){.videoBoardGrid{grid-template-columns:1fr!important}.videoBoardGrid > section{grid-column:auto!important}}`}</style>
    </main>
  )
}

function DraftPreviewFrame({ campaign, copy }: { campaign: Campaign; copy: ReturnType<typeof getVideoWorkflowCopy> }) {
  return (
    <div style={previewFrame}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <span style={statusBadge}>{statusLabel(campaign.workflow_status, copy)}</span>
        <span style={{ color: GOLD, fontWeight: 950, fontSize: 12 }}>{campaign.aspect} · {campaign.duration}</span>
      </div>
      <h2 style={{ color: '#fff', fontSize: 26, lineHeight: 1.12, margin: '18px 0 0' }}>{campaign.title}</h2>
      <p style={{ color: GOLD, fontWeight: 950, margin: '12px 0 0' }}>{copy.hook}</p>
      <p style={{ color: '#fff', fontSize: 20, lineHeight: 1.35, margin: '6px 0 0' }}>“{campaign.hook}”</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        {campaign.scenes.map((scene, index) => <div key={scene} style={sceneRow}>{index + 1}. {scene}</div>)}
      </div>
    </div>
  )
}

function MetadataRows({ campaign, copy }: { campaign: Campaign; copy: ReturnType<typeof getVideoWorkflowCopy> }) {
  const rows = [[copy.hook, campaign.hook], [copy.niche, campaign.niche], [copy.hero, campaign.hero], [copy.format, campaign.format], [copy.quality, String(campaign.quality)], [copy.platforms, 'YouTube · Shorts · LinkedIn · TikTok · Instagram'], [copy.monetization, campaign.funnel]]
  return <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>{rows.map(([label, value]) => <div key={label} style={metaRow}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div style={metric}><p style={{ color: 'rgba(255,255,255,.48)', fontSize: 10, margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{label}</p><p style={{ color: '#fff', fontSize: 22, fontWeight: 950, margin: '4px 0 0' }}>{value}</p></div>
}

const pageShell: React.CSSProperties = { maxWidth: 1500, margin: '0 auto', display: 'grid', gap: 12 }
const commandHeader: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 22, padding: 18, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))', display: 'grid', gridTemplateColumns: 'minmax(320px,1fr) minmax(360px,.75fr)', gap: 14, alignItems: 'center' }
const headerRight: React.CSSProperties = { display: 'grid', gap: 10 }
const metricStrip: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }
const workflowStrip: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }
const stepCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.18)', borderRadius: 14, padding: 10, background: 'rgba(15,23,42,.72)', color: '#fff', display: 'grid', gap: 4, minHeight: 58 }
const boardGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(270px,.85fr) minmax(420px,1.2fr) minmax(280px,.9fr)', gap: 12, alignItems: 'start' }
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 16, background: 'rgba(15,23,42,.72)' }
const queueButton: React.CSSProperties = { width: '100%', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.04)', textAlign: 'left', cursor: 'pointer' }
const statusBadge: React.CSSProperties = { color: '#020617', background: GOLD, borderRadius: 999, padding: '5px 8px', fontWeight: 950, fontSize: 10, textTransform: 'uppercase' }
const previewFrame: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 16, padding: 16, background: 'radial-gradient(circle at 20% 18%, rgba(255,195,0,.13), transparent 34%), rgba(0,0,0,.2)', marginTop: 14, minHeight: 330 }
const metaRow: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.16)', display: 'grid', gap: 5, color: 'rgba(255,255,255,.68)' }
const bottomPanel: React.CSSProperties = { gridColumn: '1 / -1', border: '1px solid rgba(255,195,0,.18)', borderRadius: 18, padding: 16, background: 'rgba(15,23,42,.74)', display: 'grid', gridTemplateColumns: 'minmax(280px,1fr) minmax(420px,1.2fr)', gap: 14, alignItems: 'center' }
const analyticsGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 8 }
const metric: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.22)' }
const sceneRow: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)', lineHeight: 1.45 }
const primary: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondary: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
