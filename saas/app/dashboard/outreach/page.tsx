'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import Link from 'next/link'
import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  status?: 'pending' | 'approved' | 'rejected'
  created_at?: string
  channel?: string
  outreach_channel?: string
  campaign_channel?: string
  media_channel?: string
  metadata?: { channel?: string; outreach_channel?: string; campaign_channel?: string }
}

type ChannelConfig = {
  eyebrow: string
  title: string
  body: string
  targets: string[]
  workflow: string[]
  ctaHref: string
  cta: string
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  rejected: '#fca5a5',
}

const CHANNELS: Record<string, ChannelConfig> = {
  'online-newspapers': {
    eyebrow: 'Digital news outreach',
    title: uiText('generatedUi.u_4200854c4b73b2e1'),
    body: uiText('generatedUi.u_afeb1260671e7efa'),
    targets: ['Local online newspapers', 'Regional digital newsrooms', 'Business news websites', 'Technology news portals', 'Industry newsletter editors'],
    workflow: ['Prepare pitch angle and proof points', 'Build editor/reporter contact list', 'Draft message and follow-up cadence', 'Review locally before sending', 'Track responses in the outreach pipeline'],
    ctaHref: '/dashboard/outreach/discovery?channel=online-newspapers',
    cta: 'Start digital newspaper list',
  },
  'print-newspapers': {
    eyebrow: 'Print newspaper outreach',
    title: uiText('generatedUi.u_4b152577f36cb01d'),
    body: uiText('generatedUi.u_cef0e6a46ef9caed'),
    targets: ['Local print newspapers', 'Community newspapers', 'Regional print business sections', 'Sunday feature editors', 'Print advertising desks'],
    workflow: ['Confirm print region and publication schedule', 'Prepare print-ready pitch or placement brief', 'Collect editorial or advertising contacts', 'Review local campaign message before outreach', 'Track print follow-up and placement status'],
    ctaHref: '/dashboard/outreach/discovery?channel=print-newspapers',
    cta: 'Start print newspaper list',
  },
  'trade-press': {
    eyebrow: 'Magazine / trade press outreach',
    title: uiText('generatedUi.u_c94378b5d4a3d184'),
    body: uiText('generatedUi.u_f3510e834f4525f5'),
    targets: ['IT trade magazines', 'SaaS and cloud publications', 'Cybersecurity magazines', 'MSP and channel publications', 'Startup and business technology magazines'],
    workflow: ['Define the technical audience and publication fit', 'Prepare founder/product angle and credibility proof', 'Build editor, contributor, and media-kit contacts', 'Review pitch and supporting assets inside Marketing + Sales', 'Track magazine outreach and follow-up dates'],
    ctaHref: '/dashboard/outreach/discovery?channel=trade-press',
    cta: 'Start trade press list',
  },
}

const COPY: Record<string, any> = {
  en: {
    eyebrow: uiText('generatedUi.u_fb03f7ab12994d23'),
    title: uiText('generatedUi.u_fa71896028ef1ce7'),
    subtitle: uiText('generatedUi.u_64512354001f3cd3'),
    loadError: uiText('generatedUi.u_a9d7cfaf09f16d9e'),
    genericLoadError: uiText('generatedUi.u_ce99d53db27af017'),
    loading: uiText('generatedUi.u_ba3bbbe10d8bef66'),
    sendsLeft: uiText('generatedUi.u_37a94d88c760122d'),
    totalLeads: uiText('generatedUi.u_695e6ffcabe33d3b'),
    pending: uiText('generatedUi.u_331551b0de4157c9'),
    approved: uiText('generatedUi.u_87b42e40c2a290e0'),
    rejected: uiText('generatedUi.u_aea4a04a80426ed8'),
    recentLeads: uiText('generatedUi.u_e1ea62d4ee3bf37b'),
    channelLeads: uiText('generatedUi.u_067e02faca1c1daa'),
    viewAll: uiText('generatedUi.u_9a780508debbfbcd'),
    noLeadsStart: uiText('generatedUi.u_22dfdb419a0c8609'),
    noChannelLeads: uiText('generatedUi.u_587777deedcb303d'),
    discoveryLink: uiText('generatedUi.u_80fc402133201fbe'),
    unnamedBusiness: uiText('generatedUi.u_7ce58cbf9a0b335b'),
    tools: [
      { icon: '🔎', title: uiText('generatedUi.u_d3121f52072997f3'), desc: uiText('generatedUi.u_f637c2cb4f275395'), href: uiText('generatedUi.u_6beec517d3c367ca') },
      { icon: '📇', title: uiText('generatedUi.u_7ae8b550d6d56b2e'), desc: uiText('generatedUi.u_4596a470ff2d855f'), href: uiText('generatedUi.u_7fe275943d3aba3a') },
      { icon: '📊', title: uiText('generatedUi.u_c1bce6ac24bdd1f5'), desc: uiText('generatedUi.u_b3d73e22ae2ad116'), href: uiText('generatedUi.u_c4ac0fc6ef9ce312') },
      { icon: '⚙️', title: uiText('generatedUi.u_03f652da02dd35a2'), desc: uiText('generatedUi.u_327de4e9fa15f596'), href: uiText('generatedUi.u_0cef07364a886698') },
    ],
    statuses: { pending: uiText('generatedUi.u_62a2fed3d6e08c44'), approved: uiText('generatedUi.u_2687f86ed6784b8a'), rejected: uiText('generatedUi.u_20cd938a2ea64f61') },
  },
  pt: {
    eyebrow: 'Email Outreach', title: 'Seu centro de comando de email outreach.', subtitle: 'Analise negócios, revise leads de email preparados por IA e mova prospects pelo pipeline de email — tudo em um só lugar.', loadError: 'Não foi possível carregar os dados de email outreach.', genericLoadError: 'Algo deu errado ao carregar o email outreach.', loading: 'Carregando…', sendsLeft: 'envios de email restantes hoje', totalLeads: 'Total de leads de email', pending: 'Pendentes', approved: 'Aprovados', rejected: 'Rejeitados', recentLeads: 'Leads de email recentes', channelLeads: 'Registros do canal', viewAll: 'Ver todos →', noLeadsStart: 'Ainda não há leads de email. Comece com', noChannelLeads: 'Ainda não existem registros para este canal. Inicie a lista do canal para criar os primeiros registros de campanha.', discoveryLink: 'Descoberta', unnamedBusiness: 'Negócio sem nome',
    tools: [
      { icon: '🔎', title: 'Descoberta de Email', desc: 'Analise um novo negócio e coloque um lead de email na fila.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Contatos de Email', desc: 'Revise leads de email analisados.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline de Email', desc: 'Acompanhe prospects de email por estágio.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Motor de Email', desc: 'Transforme um lead em campanha de email.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: { pending: 'pendente', approved: 'aprovado', rejected: 'rejeitado' },
  },
}

function copyFor(lang: string) {
  return COPY[lang] || COPY.en
}

function leadChannel(lead: Lead) {
  return lead.channel || lead.outreach_channel || lead.campaign_channel || lead.media_channel || lead.metadata?.channel || lead.metadata?.outreach_channel || lead.metadata?.campaign_channel || ''
}

export default function OutreachHubPage() {
  return (
    <Suspense fallback={<main style={{ color: 'var(--text-primary)' }}><p className="sb-body">{uiText('generatedUi.u_ba3bbbe10d8bef66')}</p></main>}>
      <OutreachHubContent />
    </Suspense>
  )
}

function OutreachHubContent() {
  const { lang } = useI18n()
  const searchParams = useSearchParams()
  const channelKey = searchParams.get('channel') || ''
  const selectedChannel = CHANNELS[channelKey]
  const copy = copyFor(lang)
  const [leads, setLeads] = useState<Lead[]>([])
  const [sendLimit, setSendLimit] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (!res.ok) setError(data?.error || copy.loadError)
        setLeads(Array.isArray(data.outreach) ? data.outreach : [])
        setSendLimit(data.sendLimit ?? null)
      } catch {
        if (active) setError(copy.genericLoadError)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [copy.genericLoadError, copy.loadError])

  const scopedLeads = selectedChannel ? leads.filter((lead) => leadChannel(lead) === channelKey) : leads
  const count = (status: string) => scopedLeads.filter((lead) => (lead.status || 'pending') === status).length
  const stats = [
    { label: selectedChannel ? copy.channelLeads : copy.totalLeads, value: scopedLeads.length, accent: '#fff' },
    { label: copy.pending, value: count('pending'), accent: STATUS_COLOR.pending },
    { label: copy.approved, value: count('approved'), accent: STATUS_COLOR.approved },
    { label: copy.rejected, value: count('rejected'), accent: STATUS_COLOR.rejected },
  ]
  const recent = scopedLeads.slice(0, 5)
  const remaining = typeof sendLimit?.remaining === 'number' ? sendLimit.remaining : null
  const dailyLimit = typeof sendLimit?.limit === 'number' ? sendLimit.limit : null

  return (
    <main style={{ color: 'var(--text-primary)' }}>
      <header className="sb-console">
        <span className="sb-eyebrow">📡 {selectedChannel?.eyebrow || copy.eyebrow}</span>
        <h1>{selectedChannel?.title || copy.title}</h1>
        <p className="sb-body">{selectedChannel?.body || copy.subtitle}</p>
        <div className="sb-telemetry">
          {stats.map((stat) => <div key={stat.label}><b style={{ color: stat.accent }}>{stat.value}</b><span>{stat.label}</span></div>)}
          {!selectedChannel && remaining !== null && dailyLimit !== null ? <div><b className="gold">{remaining}/{dailyLimit}</b><span>{copy.sendsLeft}</span></div> : null}
        </div>
      </header>

      {selectedChannel ? <ChannelWorkspace channel={selectedChannel} noRecords={scopedLeads.length === 0 && !loading ? copy.noChannelLeads : ''} /> : null}
      {loading ? <p className="sb-body">{copy.loading}</p> : null}
      {error && !loading ? <p className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 24 }}>
        {copy.tools.map((tool: any) => (
          <Link key={tool.title} href={selectedChannel ? `${tool.href}?channel=${channelKey}` : tool.href} style={{ borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: '2px solid rgba(26,240,255,.4)', padding: '14px 0 14px 14px', textDecoration: 'none', color: '#fff', display: 'block' }}>
            <div style={{ fontSize: 20 }}>{tool.icon}</div>
            <h2 className="sb-h3" style={{ margin: '8px 0 4px', fontSize: 15 }}>{tool.title}</h2>
            <p className="sb-body" style={{ fontSize: 13, margin: 0 }}>{tool.desc}</p>
          </Link>
        ))}
      </section>

      <section style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 16, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 className="sb-h3" style={{ margin: 0 }}>{copy.recentLeads}</h2>
          <Link className="sb-caption" href={selectedChannel ? `/dashboard/outreach/contacts?channel=${channelKey}` : '/dashboard/outreach/contacts'} style={{ color: '#7dd3fc' }}>{copy.viewAll}</Link>
        </div>
        {recent.length === 0 && !loading ? (
          <p className="sb-body" style={{ margin: 0 }}>{selectedChannel ? copy.noChannelLeads : <>{copy.noLeadsStart} <Link href="/dashboard/outreach/discovery" style={{ color: '#7dd3fc' }}>{copy.discoveryLink}</Link>.</>}</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recent.map((lead) => {
              const status = lead.status || 'pending'
              return <div key={lead.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.business_name || lead.business_url || copy.unnamedBusiness}</span><span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: STATUS_COLOR[status] }}>{copy.statuses[status] || status}</span></div>
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function ChannelWorkspace({ channel, noRecords }: { channel: ChannelConfig; noRecords: string }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, margin: '18px 0 24px' }}>
      <article style={channelCard}><h2 className="sb-h3" style={{ marginTop: 0 }}><LocalizedText fallback={uiText('generatedUi.u_0e0154e35983d31a')} /></h2><ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>{channel.targets.map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article style={channelCard}><h2 className="sb-h3" style={{ marginTop: 0 }}><LocalizedText fallback={uiText('generatedUi.u_2a033dda9bd803f5')} /></h2><ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>{channel.workflow.map((item) => <li key={item}>{item}</li>)}</ol>{noRecords ? <p className="sb-caption" style={{ color: '#fde68a', marginTop: 12 }}>{noRecords}</p> : null}<Link href={channel.ctaHref} className="sb-button-primary" style={{ display: 'inline-flex', marginTop: 14, textDecoration: 'none' }}>{channel.cta}</Link></article>
    </section>
  )
}

const channelCard: CSSProperties = { border: '1px solid rgba(244,114,182,.26)', borderRadius: 18, padding: 18, background: 'linear-gradient(145deg, rgba(3,7,18,.86), rgba(15,23,42,.72))', backdropFilter: 'blur(16px)' }
