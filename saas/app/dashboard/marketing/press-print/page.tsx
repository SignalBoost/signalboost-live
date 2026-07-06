'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type CampaignStatus = 'draft' | 'waiting_approval' | 'approved' | 'queued' | 'running' | 'completed' | 'measured' | 'learned' | 'rejected'
type PressChannel = 'online-newspapers' | 'print-newspapers' | 'trade-press'
type PressAction = 'APPROVED' | 'REJECTED' | 'ON_HOLD' | 'STAFF_SUPPORT'

type Campaign = {
  id: string
  title?: string
  objective?: string
  audience?: string
  channel?: string
  status?: CampaignStatus
  created_at?: string
  metadata?: Record<string, any>
}

type Copy = {
  eyebrow: string
  title: string
  subtitle: string
  empty: string
  pending: string
  approved: string
  rejected: string
  hold: string
  approve: string
  reject: string
  putHold: string
  preview: string
  tracking: string
  qr: string
  analytics: string
  clicks: string
  reach: string
  conversions: string
  digital: string
  print: string
  trade: string
  openCosa: string
  startStaff: string
}

const COPY: Record<string, Copy> = {
  en: { eyebrow: 'Press & Print Media', title: 'Local review for newspapers and magazines.', subtitle: 'COSA-created campaigns and staff-started newspaper, print, and IT magazine campaigns appear here for visual review before release.', empty: 'No Press & Print Media campaigns are waiting here yet. Start one directly here or ask COSA to start one.', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', hold: 'On hold', approve: 'Approve', reject: 'Reject', putHold: 'Put on hold', preview: 'Visual ad preview', tracking: 'Tracking URL with UTM', qr: 'Dynamic QR placement', analytics: 'Channel analytics', clicks: 'Clicks', reach: 'Reach', conversions: 'Conversions', digital: 'Digital newspaper', print: 'Print newspaper', trade: 'Magazine / trade press', openCosa: 'Open COSA Campaign Console', startStaff: 'Start staff-led campaign' },
  pt: { eyebrow: 'Press & Print Media', title: 'Revisão local para jornais e revistas.', subtitle: 'Campanhas criadas pelo COSA e campanhas iniciadas pela equipe para jornais, impressos e revistas de TI aparecem aqui para revisão visual antes da liberação.', empty: 'Nenhuma campanha Press & Print Media aguardando aqui ainda. Inicie uma diretamente aqui ou peça ao COSA para iniciar.', pending: 'Aguardando revisão', approved: 'Aprovado', rejected: 'Rejeitado', hold: 'Em espera', approve: 'Aprovar', reject: 'Rejeitar', putHold: 'Colocar em espera', preview: 'Preview visual do anúncio', tracking: 'URL rastreável com UTM', qr: 'QR dinâmico no layout', analytics: 'Analytics do canal', clicks: 'Cliques', reach: 'Alcance', conversions: 'Conversões', digital: 'Jornal digital', print: 'Jornal impresso', trade: 'Revista / trade press', openCosa: 'Abrir COSA Campaign Console', startStaff: 'Iniciar campanha pela equipe' },
  es: { eyebrow: 'Press & Print Media', title: 'Revisión local para periódicos y revistas.', subtitle: 'Campañas creadas por COSA y campañas iniciadas por el equipo aparecen aquí para revisión visual antes de liberar.', empty: 'Aún no hay campañas Press & Print Media aquí. Inicia una directamente o pide a COSA iniciar una.', pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', hold: 'En espera', approve: 'Aprobar', reject: 'Rechazar', putHold: 'Poner en espera', preview: 'Vista visual del anuncio', tracking: 'URL con UTM', qr: 'QR dinámico', analytics: 'Analytics del canal', clicks: 'Clics', reach: 'Alcance', conversions: 'Conversiones', digital: 'Periódico digital', print: 'Periódico impreso', trade: 'Revista / trade press', openCosa: 'Abrir COSA Campaign Console', startStaff: 'Iniciar campaña por equipo' },
  pl: { eyebrow: 'Press & Print Media', title: 'Lokalny przegląd gazet i magazynów.', subtitle: 'Kampanie COSA i kampanie zespołu pojawiają się tutaj do wizualnego przeglądu.', empty: 'Brak kampanii. Uruchom jedną tutaj albo poproś COSA.', pending: 'Oczekuje', approved: 'Zatwierdzone', rejected: 'Odrzucone', hold: 'Wstrzymane', approve: 'Zatwierdź', reject: 'Odrzuć', putHold: 'Wstrzymaj', preview: 'Podgląd reklamy', tracking: 'URL z UTM', qr: 'Dynamiczny QR', analytics: 'Analityka', clicks: 'Kliknięcia', reach: 'Zasięg', conversions: 'Konwersje', digital: 'Gazeta cyfrowa', print: 'Gazeta drukowana', trade: 'Magazyn / trade press', openCosa: 'Otwórz COSA Campaign Console', startStaff: 'Uruchom kampanię zespołu' },
  ru: { eyebrow: 'Press & Print Media', title: 'Локальный просмотр газет и журналов.', subtitle: 'Кампании COSA и кампании команды появляются здесь для визуального просмотра.', empty: 'Пока нет кампаний. Начните одну здесь или попросите COSA.', pending: 'Ожидает', approved: 'Одобрено', rejected: 'Отклонено', hold: 'На паузе', approve: 'Одобрить', reject: 'Отклонить', putHold: 'Пауза', preview: 'Preview объявления', tracking: 'URL с UTM', qr: 'Динамический QR', analytics: 'Аналитика', clicks: 'Клики', reach: 'Охват', conversions: 'Конверсии', digital: 'Цифровая газета', print: 'Печатная газета', trade: 'Журнал / trade press', openCosa: 'Открыть COSA Campaign Console', startStaff: 'Начать кампанию команды' },
}

const CHANNELS: Record<PressChannel, { labelKey: keyof Pick<Copy, 'digital' | 'print' | 'trade'>; accent: string }> = {
  'online-newspapers': { labelKey: 'digital', accent: '#38bdf8' },
  'print-newspapers': { labelKey: 'print', accent: '#facc15' },
  'trade-press': { labelKey: 'trade', accent: '#f472b6' },
}

function channelFor(campaign: Campaign): PressChannel | null {
  const value = String(campaign.metadata?.outreach_channel || campaign.metadata?.media_channel || '').trim()
  return value === 'online-newspapers' || value === 'print-newspapers' || value === 'trade-press' ? value : null
}

function trackingUrl(campaign: Campaign, channel: PressChannel) {
  const url = new URL('https://saas.signalboostapp.com/agency')
  url.searchParams.set('utm_source', channel)
  url.searchParams.set('utm_medium', channel === 'print-newspapers' ? 'qr_print' : 'press_media')
  url.searchParams.set('utm_campaign', campaign.id)
  url.searchParams.set('utm_content', 'press_print_preview')
  return url.toString()
}

function reviewLabel(copy: Copy, campaign: Campaign) {
  const review = String(campaign.metadata?.press_print_review || '').toUpperCase()
  if (campaign.metadata?.staff_support_mode === true) return 'Staff support active'
  if (review === 'APPROVED') return copy.approved
  if (campaign.status === 'rejected' || review === 'REJECTED') return copy.rejected
  if (review === 'ON_HOLD' || campaign.status === 'draft') return copy.hold
  return copy.pending
}

export default function PressPrintMediaPage() {
  const { lang } = useI18n()
  const copy = COPY[lang] || COPY.en
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/cos/campaign-queue', { cache: 'no-store' })
      const json = await res.json()
      setCampaigns(Array.isArray(json?.campaigns) ? json.campaigns : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pressCampaigns = useMemo(() => campaigns.filter(channelFor), [campaigns])

  async function patch(campaign: Campaign, action: PressAction) {
    const status: CampaignStatus = action === 'REJECTED' ? 'rejected' : 'draft'
    const metadata = {
      ...(campaign.metadata || {}),
      press_print_review: action === 'STAFF_SUPPORT' ? 'ON_HOLD' : action,
      press_print_reviewed_at: new Date().toISOString(),
      press_print_review_scope: 'local_marketing_workspace',
      staff_support_available: true,
      staff_support_mode: action === 'STAFF_SUPPORT' ? true : campaign.metadata?.staff_support_mode,
      staff_support_started_at: action === 'STAFF_SUPPORT' ? new Date().toISOString() : campaign.metadata?.staff_support_started_at,
    }
    setBusy(campaign.id + action)
    setMessage(`${campaign.title || campaign.id}: ${action}`)
    setCampaigns((prev) => prev.map((row) => row.id === campaign.id ? { ...row, status, metadata } : row))
    try {
      const res = await fetch('/api/cos/campaign-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: campaign.id, status, metadata }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Update failed')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed')
      await load()
    } finally {
      setBusy('')
    }
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.eyebrow}</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>{copy.title}</h1>
        <p style={body}>{copy.subtitle}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Link href="/dashboard/marketing/press-print/direct" className="sb-button-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>{copy.startStaff}</Link>
          <Link href="/dashboard/cosa" className="sb-button-secondary" style={{ textDecoration: 'none', display: 'inline-flex' }}>{copy.openCosa}</Link>
        </div>
      </section>
      {message ? <p className="sb-caption" style={{ color: '#fde68a' }}>{message}</p> : null}
      {loading ? <p className="sb-body">Loading…</p> : null}
      {!loading && pressCampaigns.length === 0 ? <section style={card}><p style={body}>{copy.empty}</p></section> : null}
      {pressCampaigns.map((campaign) => {
        const channel = channelFor(campaign) as PressChannel
        const channelMeta = CHANNELS[channel]
        const url = trackingUrl(campaign, channel)
        const analytics = campaign.metadata?.press_print_analytics || {}
        const staffActive = campaign.metadata?.staff_support_mode === true
        return (
          <section key={campaign.id} style={{ ...card, borderColor: `${channelMeta.accent}55` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="sb-eyebrow" style={{ color: channelMeta.accent, margin: 0 }}>{copy[channelMeta.labelKey]}</p>
                <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 24 }}>{campaign.title || copy.preview}</h2>
                <p style={body}>{campaign.objective || campaign.audience || 'Press and print campaign prepared by Marketing + Sales.'}</p>
              </div>
              <strong style={{ color: staffActive ? '#fde68a' : channelMeta.accent }}>{reviewLabel(copy, campaign)}</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(240px, .8fr)', gap: 16, marginTop: 16 }}>
              <article style={mockup}>
                <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.preview}</p>
                <div style={{ marginTop: 12, background: '#f8fafc', color: '#111827', borderRadius: 12, padding: 18, minHeight: 280 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #111827', paddingBottom: 8, marginBottom: 16 }}><b>{channel === 'trade-press' ? 'TECH BUSINESS REVIEW' : 'THE SIGNAL DAILY'}</b><span>{new Date().toLocaleDateString()}</span></div>
                  <h3 style={{ fontSize: 28, margin: '0 0 10px', lineHeight: 1.05 }}>{campaign.title || 'SignalBoost helps companies turn work into approved action'}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55 }}>{campaign.objective || 'AI-assisted marketing, audit, cybersecurity, and business growth workflows in one platform.'}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, alignItems: 'end', marginTop: 18 }}><p style={{ fontSize: 12, margin: 0 }}>Visit saas.signalboostapp.com · Campaign ID {campaign.id.slice(0, 8)}</p><div style={{ border: '6px solid #111827', height: 86, display: 'grid', placeItems: 'center', fontSize: 10, textAlign: 'center' }}>{copy.qr}</div></div>
                </div>
              </article>
              <aside style={sidePanel}>
                <h3 className="sb-h3">{copy.tracking}</h3><p style={{ ...body, wordBreak: 'break-all' }}>{url}</p>
                <h3 className="sb-h3">{copy.analytics}</h3><Metric label={copy.clicks} value={Number(analytics.clicks || 0)} /><Metric label={copy.reach} value={Number(analytics.reach || 0)} /><Metric label={copy.conversions} value={Number(analytics.conversions || 0)} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}><button disabled={Boolean(busy)} onClick={() => patch(campaign, 'APPROVED')} style={primary}>{copy.approve}</button><button disabled={Boolean(busy)} onClick={() => patch(campaign, 'REJECTED')} style={secondary}>{copy.reject}</button><button disabled={Boolean(busy)} onClick={() => patch(campaign, 'ON_HOLD')} style={secondary}>{copy.putHold}</button></div>
                <div style={staffBox}><h3 className="sb-h3" style={{ marginTop: 0 }}>Staff support mode</h3><p style={body}>Use this if the campaign needs person-to-person publication handling, media-kit review, layout adjustment, or final delivery coordination.</p><ol style={{ margin: '8px 0 12px', paddingLeft: 18, color: 'rgba(255,255,255,.72)', lineHeight: 1.65 }}><li>Confirm publication contact and deadline.</li><li>Adjust ad dimensions and media requirements.</li><li>Prepare the final layout package.</li><li>Keep the decision in Marketing + Sales.</li></ol><button disabled={Boolean(busy)} onClick={() => patch(campaign, 'STAFF_SUPPORT')} style={staffActive ? primary : secondary}>{staffActive ? 'Staff support active' : 'Use staff support'}</button></div>
              </aside>
            </div>
          </section>
        )
      })}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  const width = Math.max(4, Math.min(100, value))
  return <div style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 13 }}><span>{label}</span><b>{value}</b></div><div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ width: `${width}%`, height: '100%', background: '#1af0ff' }} /></div></div>
}

const heroCard: CSSProperties = { border: '1px solid rgba(244,114,182,.24)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const card: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 22, padding: 20, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))', backdropFilter: 'blur(18px)' }
const mockup: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 18, padding: 16, background: 'rgba(255,255,255,.04)' }
const sidePanel: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 18, padding: 16, background: 'rgba(0,0,0,.18)' }
const staffBox: CSSProperties = { border: '1px solid rgba(255,195,0,.20)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(255,195,0,.06)' }
const body: CSSProperties = { color: 'rgba(255,255,255,.70)', lineHeight: 1.65, maxWidth: 860 }
const primary: CSSProperties = { border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const secondary: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
