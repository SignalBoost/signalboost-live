'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'

type Campaign = { id: string; title?: string; objective?: string; status?: string; metadata?: Record<string, any> }
type Decision = 'ok' | 'no' | 'staff' | 'submitted' | 'published'
const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const
const channelLabels: Record<string, string> = { 'online-newspapers': uiCopy('u_62a60fd8c3c42e2d'), 'print-newspapers': uiCopy('u_bbe3728fc6af94ff'), 'trade-press': uiCopy('u_b435219b4c960aaf') }
function channel(campaign: Campaign) { return String(campaign.metadata?.outreach_channel || campaign.metadata?.media_channel || '') }
function review(campaign: Campaign) { return String(campaign.metadata?.press_print_review || 'PENDING').toUpperCase() }
function stage(campaign: Campaign) { return String(campaign.metadata?.press_print_execution_stage || campaign.metadata?.press_print_execution?.stage || 'not_started') }
function labelStage(value: string) { if (value === 'approved') return 'Ready to submit'; if (value === 'submitted_to_publisher') return 'Submitted to publisher'; if (value === 'published') return 'Published / completed'; if (value === 'staff_support') return 'Staff support'; if (value === 'on_hold') return 'On hold'; if (value === 'rejected') return 'Rejected'; if (value === 'stopped') return 'Stopped'; if (value === 'target_selection_required') return 'Publisher target required'; return 'Needs review' }
function Action({ id, decision, children, primary = false }: { id: string; decision: Decision; children: React.ReactNode; primary?: boolean }) { return <form method="post" action="/api/marketing/press-print/decision" style={{ display: 'inline-grid', gap: 8 }}><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value={decision} /><button style={primary ? primaryButton : secondaryButton}>{children}</button></form> }
export default function PressPrintMediaPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()
  useEffect(() => { let live = true; (async () => { try { const res = await fetch('/api/marketing/press-print', { cache: 'no-store' }); const json = await res.json(); if (live) setCampaigns((Array.isArray(json.campaigns) ? json.campaigns : []).filter((row: Campaign) => PRESS_PRINT_CHANNELS.includes(channel(row) as any))) } finally { if (live) setLoading(false) } })(); return () => { live = false } }, [])
  return <main style={shell}>
    <section style={hero}><p className="sb-eyebrow">{uiCopy('u_5a5a7608f47a9d05')}</p><h1 style={h1}><LocalizedText fallback={uiCopy('u_60151c7220de5f53')} /></h1><p style={body}>{t('marketingSales.pressPrint.description', uiCopy('u_a2520480f75254d6'))}</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Link href="/dashboard/marketing/press-print/direct" className="sb-button-primary">{t('marketingSales.pressPrint.startStaffLedCampaign', uiCopy('u_12bc6b9e32324c96'))}</Link></div></section>
    {loading ? <p className="sb-body">{uiCopy('u_08c829b69d279361')}</p> : null}
    {!loading && campaigns.length === 0 ? <section style={card}><p style={body}><LocalizedText fallback={uiCopy('u_ac804ba67952ac92')} /></p></section> : null}
    {campaigns.map((campaign) => { const currentReview = review(campaign), currentStage = stage(campaign), approved = currentReview === 'APPROVED', submitted = currentStage === 'submitted_to_publisher' || campaign.metadata?.publisher_submission_status === 'submitted', completed = currentStage === 'published', exec = campaign.metadata?.press_print_execution || {}; const publisher = String(campaign.metadata?.publisher_name || campaign.metadata?.publication_name || ''), publisherEmail = String(campaign.metadata?.publisher_email || ''), publisherForm = String(campaign.metadata?.publisher_submission_form_url || ''), sourceUrl = String(campaign.metadata?.publisher_discovery_source_url || ''); const hasPublisherTarget = Boolean(publisher && (publisherEmail || publisherForm)), paidRequested = campaign.metadata?.automation_mode === 'automated_paid_user_requested'; return <section key={campaign.id} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><p className="sb-eyebrow">{channelLabels[channel(campaign)] || uiCopy('u_de1911ee3da85d53')}</p><h2 style={h2}>{String(campaign.title || uiCopy('u_ef3555d987673a65')).slice(0, 120)}</h2><p style={{ ...body, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>{String(campaign.objective || uiCopy('u_dc12240cfe9d9388')).slice(0, 300)}{String(campaign.objective || '').length > 300 ? '…' : ''}</p></div><strong style={pill}>{currentReview} · {labelStage(currentStage)}</strong></div>
      <div style={targetBox}><h3 style={h3}>{paidRequested ? uiCopy('u_6ccb578e09fffa91') : uiCopy('u_0ea216a655770434')}</h3>{hasPublisherTarget ? <p style={body}>{uiCopy('u_c1404671d65f3132')}<strong>{publisher}</strong><br /><LocalizedText fallback={uiCopy('u_7f66baa9e6573b1c')} /><strong>{publisherEmail ? uiCopy('u_2134e21d9c54c66d') : paidRequested ? uiCopy('u_7b974633a972f711') : uiCopy('u_4c63b21c1ff1f505')}</strong><br />{uiCopy('u_2bb0151582297546')}{publisherEmail || publisherForm}{sourceUrl ? <><br />{uiCopy('u_a06a05426f00b57b')}{sourceUrl}</> : null}{paidRequested ? <><br /><strong>{uiCopy('u_08b54154a390be4e')}</strong>{uiCopy('u_cc8f3a67db481606')}</> : null}</p> : <p style={body}><LocalizedText fallback={uiCopy('u_7e0a47b7a761e687')} /></p>}</div>
      {!approved && !completed ? <div style={actions}><Action id={campaign.id} decision="ok" primary>{uiCopy('u_364edb7e20c544e4')}</Action><Action id={campaign.id} decision="no">{uiCopy('u_b1ea36b770418ffb')}</Action><Action id={campaign.id} decision="staff"><LocalizedText fallback={uiCopy('u_be7b0fcfcd54f787')} /></Action></div> : null}
      <div style={workflowBox}><h3 style={h3}>{completed ? uiCopy('u_767f93e67c478766') : submitted ? uiCopy('u_054dbc81c7a64f96') : approved ? uiCopy('u_72a2fdb5abbc3098') : uiCopy('u_35452a8c9a4296f6')}</h3>{!approved && !completed ? <p style={body}>{uiCopy('u_4ed69aaa8390b402')}{paidRequested ? uiCopy('u_d039dd3642dc33cd') : uiCopy('u_83b317efb5f5286b')}{uiCopy('u_2c8992f7f7f4a9b2')}</p> : null}{approved && !submitted && !completed ? <div style={simpleForm}><p style={body}><LocalizedText fallback={uiCopy('u_4f060fc1c3f984b0')} /></p>{hasPublisherTarget ? <Action id={campaign.id} decision="submitted" primary><LocalizedText fallback={uiCopy('u_4374ad0fc62280bc')} /></Action> : <p style={body}><LocalizedText fallback={uiCopy('u_62eef566982ddb01')} /></p>}</div> : null}{submitted && !completed ? <form method="post" action="/api/marketing/press-print/decision" style={simpleForm}><input type="hidden" name="id" value={campaign.id} /><input type="hidden" name="decision" value="published" /><p style={body}><LocalizedText fallback={uiCopy('u_f1dc88283af78e4e')} /></p><input name="live_url" defaultValue={String(exec.live_url || '')} placeholder={uiCopy('u_875a2d461746594c')} style={input} /><input name="publication_date" type="date" defaultValue={String(exec.publication_date || '')} style={input} /><button style={primaryButton}><LocalizedText fallback={uiCopy('u_c3a0d80fffb45332')} /></button></form> : null}{completed ? <div style={doneBox}><p style={body}><LocalizedText fallback={uiCopy('u_c5806efa04ac13ad')} /></p>{exec.live_url ? <a href={String(exec.live_url)} target="_blank" rel="noreferrer" style={link}>{uiCopy('u_4d43c38c912de15a')}</a> : null}{exec.publication_date ? <p style={body}>{uiCopy('u_c6bfdd3f8a4cb396')}{String(exec.publication_date)}</p> : null}</div> : null}</div>
    </section> })}
  </main>
}
const shell: CSSProperties = { maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 18 }
const hero: CSSProperties = { border: '1px solid rgba(244,114,182,.24)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const card: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 22, padding: 20, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))' }
const workflowBox: CSSProperties = { border: '1px solid rgba(56,189,248,.22)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(56,189,248,.06)' }
const targetBox: CSSProperties = { border: '1px solid rgba(250,204,21,.22)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(250,204,21,.06)' }
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
