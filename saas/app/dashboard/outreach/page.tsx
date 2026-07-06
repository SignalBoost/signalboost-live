'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

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
    title: 'Online newspaper and digital publisher campaign',
    body: 'Plan outreach to online newspapers, local digital newsrooms, business news sites, and technology news portals. This channel tracks only digital newspaper/publication campaign records.',
    targets: ['Local online newspapers', 'Regional digital newsrooms', 'Business news websites', 'Technology news portals', 'Industry newsletter editors'],
    workflow: ['Prepare pitch angle and proof points', 'Build editor/reporter contact list', 'Draft message and follow-up cadence', 'Review locally before sending', 'Track responses in the outreach pipeline'],
    ctaHref: '/dashboard/outreach/discovery?channel=online-newspapers',
    cta: 'Start digital newspaper list',
  },
  'print-newspapers': {
    eyebrow: 'Print newspaper outreach',
    title: 'Offline newspaper placement planning',
    body: 'Plan outreach to non-digital newspapers: print editions, local papers, community papers, and traditional editorial or advertising desks. This channel starts at zero until print-newspaper campaign records are created.',
    targets: ['Local print newspapers', 'Community newspapers', 'Regional print business sections', 'Sunday feature editors', 'Print advertising desks'],
    workflow: ['Confirm print region and publication schedule', 'Prepare print-ready pitch or placement brief', 'Collect editorial or advertising contacts', 'Review local campaign message before outreach', 'Track print follow-up and placement status'],
    ctaHref: '/dashboard/outreach/discovery?channel=print-newspapers',
    cta: 'Start print newspaper list',
  },
  'trade-press': {
    eyebrow: 'Magazine / trade press outreach',
    title: 'IT-specialized magazine and trade publication campaign',
    body: 'Plan outreach to IT-specialized magazines, SaaS publications, cybersecurity magazines, MSP/channel publications, startup media, and business technology trade press. This channel has its own targets, workflow, and counts.',
    targets: ['IT trade magazines', 'SaaS and cloud publications', 'Cybersecurity magazines', 'MSP and channel publications', 'Startup and business technology magazines'],
    workflow: ['Define the technical audience and publication fit', 'Prepare founder/product angle and credibility proof', 'Build editor, contributor, and media-kit contacts', 'Review pitch and supporting assets inside Marketing + Sales', 'Track magazine outreach and follow-up dates'],
    ctaHref: '/dashboard/outreach/discovery?channel=trade-press',
    cta: 'Start trade press list',
  },
}

const COPY: Record<string, any> = {
  en: {
    eyebrow: 'Outreach',
    title: 'Your outreach command center.',
    subtitle: 'Analyze businesses, review AI-prepared leads, and move prospects through the pipeline — all from one place.',
    loadError: 'Could not load outreach data.',
    genericLoadError: 'Something went wrong loading outreach.',
    loading: 'Loading…',
    sendsLeft: 'sends left today',
    totalLeads: 'Total leads',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    recentLeads: 'Recent leads',
    channelLeads: 'Channel records',
    viewAll: 'View all →',
    noLeadsStart: 'No leads yet. Start with',
    noChannelLeads: 'No records exist for this channel yet. Start the channel list to create the first campaign records.',
    discoveryLink: 'Discovery',
    unnamedBusiness: 'Unnamed business',
    tools: [
      { icon: '🔎', title: 'Discovery', desc: 'Analyze a new business and queue it.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Contacts', desc: 'Review analyzed leads.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Track prospects by stage.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Engine', desc: 'Turn a lead into a campaign.', href: '/dashboard/outreach/outreach' },
    ],
    statuses: { pending: 'pending', approved: 'approved', rejected: 'rejected' },
  },
  pt: {
    eyebrow: 'Prospecção', title: 'Seu centro de comando de prospecção.', subtitle: 'Analise negócios, revise leads preparados por IA e mova prospects pelo pipeline — tudo em um só lugar.', loadError: 'Não foi possível carregar os dados de prospecção.', genericLoadError: 'Algo deu errado ao carregar a prospecção.', loading: 'Carregando…', sendsLeft: 'envios restantes hoje', totalLeads: 'Total de leads', pending: 'Pendentes', approved: 'Aprovados', rejected: 'Rejeitados', recentLeads: 'Leads recentes', channelLeads: 'Registros do canal', viewAll: 'Ver todos →', noLeadsStart: 'Ainda não há leads. Comece com', noChannelLeads: 'Ainda não existem registros para este canal. Inicie a lista do canal para criar os primeiros registros de campanha.', discoveryLink: 'Descoberta', unnamedBusiness: 'Negócio sem nome',
    tools: [
      { icon: '🔎', title: 'Descoberta', desc: 'Analise um novo negócio e coloque-o na fila.', href: '/dashboard/outreach/discovery' },
      { icon: '📇', title: 'Contatos', desc: 'Revise leads analisados.', href: '/dashboard/outreach/contacts' },
      { icon: '📊', title: 'Pipeline', desc: 'Acompanhe prospects por estágio.', href: '/dashboard/outreach/pipeline' },
      { icon: '⚙️', title: 'Motor', desc: 'Transforme um lead em campanha.', href: '/dashboard/outreach/outreach' },
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
    <Suspense fallback={<main style={{ color: 'var(--text-primary)' }}><p className="sb-body">Loading…</p></main>}>
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
      <article style={channelCard}><h2 className="sb-h3" style={{ marginTop: 0 }}>Target publication types</h2><ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>{channel.targets.map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article style={channelCard}><h2 className="sb-h3" style={{ marginTop: 0 }}>Channel workflow</h2><ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>{channel.workflow.map((item) => <li key={item}>{item}</li>)}</ol>{noRecords ? <p className="sb-caption" style={{ color: '#fde68a', marginTop: 12 }}>{noRecords}</p> : null}<Link href={channel.ctaHref} className="sb-button-primary" style={{ display: 'inline-flex', marginTop: 14, textDecoration: 'none' }}>{channel.cta}</Link></article>
    </section>
  )
}

const channelCard: CSSProperties = { border: '1px solid rgba(244,114,182,.26)', borderRadius: 18, padding: 18, background: 'linear-gradient(145deg, rgba(3,7,18,.86), rgba(15,23,42,.72))', backdropFilter: 'blur(16px)' }
