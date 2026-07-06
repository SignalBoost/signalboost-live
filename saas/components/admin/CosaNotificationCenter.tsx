'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Campaign = { id: string; title?: string; channel?: string; status?: string; metadata?: Record<string, any>; work_items?: Array<{ output?: Record<string, unknown> }> }
type Props = { label: string; href: string; icon: string; active?: boolean }

const COPY: Record<Lang, Record<string, any>> = {
  en: { approvals: 'pending approvals', eyebrow: 'COSA notifications', title: 'Approval center', refresh: 'Refresh', none: 'No draft campaigns waiting for approval.', untitled: 'Untitled campaign', approve: 'Approve', edit: 'Request edits', reject: 'Reject', archive: 'Archive', publishing: 'Publishing confirmations', viewAll: 'View all in Marketing/Sales →', status: { draft: 'Draft', waiting_approval: 'Pending approval', approved: 'Approved', queued: 'Queued', running: 'Running', rejected: 'Rejected' }, channel: { youtube: 'YouTube', short_video: 'Short video', linkedin: 'LinkedIn', blog: 'Blog', email: 'Email', outreach: 'Outreach', landing_page: 'Landing page', review_campaign: 'Review campaign', campaign: 'Campaign' } },
  es: { approvals: 'aprobaciones pendientes', eyebrow: 'Notificaciones COSA', title: 'Centro de aprobaciones', refresh: 'Actualizar', none: 'No hay borradores de campaña esperando aprobación.', untitled: 'Campaña sin título', approve: 'Aprobar', edit: 'Pedir cambios', reject: 'Rechazar', archive: 'Archivar', publishing: 'Confirmaciones de publicación', viewAll: 'Ver todo en Marketing/Ventas →', status: { draft: 'Borrador', waiting_approval: 'Pendiente de aprobación', approved: 'Aprobado', queued: 'En cola', running: 'En ejecución', rejected: 'Rechazado' }, channel: { youtube: 'YouTube', short_video: 'Video corto', linkedin: 'LinkedIn', blog: 'Blog', email: 'Email', outreach: 'Alcance', landing_page: 'Página de destino', review_campaign: 'Campaña de reseñas', campaign: 'Campaña' } },
  pt: { approvals: 'aprovações pendentes', eyebrow: 'Notificações COSA', title: 'Centro de aprovações', refresh: 'Atualizar', none: 'Nenhum rascunho de campanha aguardando aprovação.', untitled: 'Campanha sem título', approve: 'Aprovar', edit: 'Pedir ajustes', reject: 'Rejeitar', archive: 'Arquivar', publishing: 'Confirmações de publicação', viewAll: 'Ver tudo em Marketing/Vendas →', status: { draft: 'Rascunho', waiting_approval: 'Aguardando aprovação', approved: 'Aprovado', queued: 'Na fila', running: 'Em execução', rejected: 'Rejeitado' }, channel: { youtube: 'YouTube', short_video: 'Vídeo curto', linkedin: 'LinkedIn', blog: 'Blog', email: 'Email', outreach: 'Alcance', landing_page: 'Página de destino', review_campaign: 'Campanha de avaliações', campaign: 'Campanha' } },
  pl: { approvals: 'oczekujące zatwierdzenia', eyebrow: 'Powiadomienia COSA', title: 'Centrum zatwierdzeń', refresh: 'Odśwież', none: 'Brak szkiców kampanii oczekujących na zatwierdzenie.', untitled: 'Kampania bez tytułu', approve: 'Zatwierdź', edit: 'Poproś o zmiany', reject: 'Odrzuć', archive: 'Archiwizuj', publishing: 'Potwierdzenia publikacji', viewAll: 'Zobacz wszystko w Marketing/Sprzedaż →', status: { draft: 'Szkic', waiting_approval: 'Oczekuje na zatwierdzenie', approved: 'Zatwierdzone', queued: 'W kolejce', running: 'W toku', rejected: 'Odrzucone' }, channel: { youtube: 'YouTube', short_video: 'Krótki film', linkedin: 'LinkedIn', blog: 'Blog', email: 'Email', outreach: 'Kontakt', landing_page: 'Strona docelowa', review_campaign: 'Kampania opinii', campaign: 'Kampania' } },
  ru: { approvals: 'ожидающие утверждения', eyebrow: 'Уведомления COSA', title: 'Центр утверждений', refresh: 'Обновить', none: 'Нет черновиков кампаний, ожидающих утверждения.', untitled: 'Кампания без названия', approve: 'Утвердить', edit: 'Запросить правки', reject: 'Отклонить', archive: 'В архив', publishing: 'Подтверждения публикации', viewAll: 'Открыть всё в Маркетинг/Продажи →', status: { draft: 'Черновик', waiting_approval: 'Ожидает утверждения', approved: 'Утверждено', queued: 'В очереди', running: 'Выполняется', rejected: 'Отклонено' }, channel: { youtube: 'YouTube', short_video: 'Короткое видео', linkedin: 'LinkedIn', blog: 'Блог', email: 'Email', outreach: 'Аутрич', landing_page: 'Лендинг', review_campaign: 'Кампания отзывов', campaign: 'Кампания' } },
}

const pendingStatuses = new Set(['draft', 'waiting_approval'])
const ASSET_READY_KEY = 'signalboost.concierge.assetReady'
const ASSET_READY_SEEN_KEY = 'signalboost.cosa.assetReadySeen'
// A campaign counts as a finished COS Core v1 asset once the GitHub Actions
// FFmpeg worker has burned the brand banner and written voicedUrl.
const isBrandedAssetReady = (campaign: Campaign) => {
  const video = campaign.metadata?.video
  return Boolean(video && video.branded === true && video.voicedUrl)
}
const lk = (raw: string): Lang => (['en', 'es', 'pt', 'pl', 'ru'].includes(raw) ? raw : 'en') as Lang
const hasReviewDraft = (campaign: Campaign) => Boolean(campaign.work_items?.some(item => item.output))
const labelFrom = (map: Record<string, string>, key?: string, fallback = '') => map[key || ''] || key || fallback
function thumbnail(campaign: Campaign) { return campaign.channel === 'youtube' ? '▶️' : campaign.channel === 'short_video' ? '🎬' : campaign.channel === 'linkedin' ? '💼' : campaign.channel === 'email' || campaign.channel === 'outreach' ? '✉️' : '📣' }

export default function CosaNotificationCenter({ label, href, icon, active }: Props) {
  const { lang } = useI18n()
  const c = COPY[lk(lang)]
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/cos/campaign-queue?limit=25', { cache: 'no-store' })
      const json = await response.json().catch(() => null)
      setCampaigns(Array.isArray(json?.campaigns) ? json.campaigns : [])
    } catch { setCampaigns([]) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // When a newly finished branded asset lands in the approval queue, notify the
  // Concierge exactly once per campaign (seen ids persisted in localStorage) so
  // it can deep-link the owner to the financial approval card.
  useEffect(() => {
    if (!campaigns.length) return
    try {
      const seenRaw = window.localStorage.getItem(ASSET_READY_SEEN_KEY)
      const seen: string[] = Array.isArray(JSON.parse(seenRaw || '[]')) ? JSON.parse(seenRaw || '[]') : []
      const ready = campaigns.filter(campaign => pendingStatuses.has(campaign.status || '') && isBrandedAssetReady(campaign))
      const fresh = ready.filter(campaign => !seen.includes(campaign.id))
      if (!fresh.length) return
      const next = fresh[0]
      window.localStorage.setItem(ASSET_READY_KEY, JSON.stringify({ campaignId: next.id, title: next.title || '' }))
      window.localStorage.setItem(ASSET_READY_SEEN_KEY, JSON.stringify([...seen, ...fresh.map(campaign => campaign.id)].slice(-100)))
      window.dispatchEvent(new Event('signalboost:concierge-asset-ready'))
    } catch { /* localStorage unavailable — skip notification */ }
  }, [campaigns])

  const pending = useMemo(() => campaigns.filter(campaign => pendingStatuses.has(campaign.status || '') && hasReviewDraft(campaign)), [campaigns])
  const publishing = useMemo(() => campaigns.filter(campaign => campaign.status === 'queued' || campaign.status === 'running').slice(0, 3), [campaigns])
  const count = pending.length

  async function act(campaign: Campaign, action: 'approve' | 'request_edits' | 'reject' | 'archive') {
    setActingId(campaign.id)
    try {
      await fetch('/api/cos/campaign-notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: campaign.id, action }) })
      await load()
    } catch { await load() } finally { setActingId(null) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
        <Link href={href} className="sb-sidebar__link" style={active ? { background: 'rgba(26,240,255,.14)', color: '#fff', borderColor: 'rgba(26,240,255,.42)', boxShadow: '0 0 24px rgba(26,240,255,.14)' } : undefined}><span aria-hidden="true">{icon}</span><span>{label}</span></Link>
        <button type="button" aria-label={`${count} ${c.approvals}`} onClick={() => { setOpen(current => !current); if (!open) load() }} style={{ minWidth: 32, height: 26, borderRadius: 999, border: count ? '1px solid rgba(248,113,113,.7)' : '1px solid rgba(255,255,255,.14)', background: count ? 'rgba(248,113,113,.18)' : 'rgba(255,255,255,.06)', color: count ? '#fecaca' : 'rgba(255,255,255,.62)', fontSize: 11, fontWeight: 950, cursor: 'pointer' }}>{count || '0'}</button>
      </div>
      {open && <div style={{ position: 'absolute', zIndex: 50, left: 0, top: 'calc(100% + 8px)', width: 360, maxWidth: 'calc(100vw - 32px)', background: 'rgba(2,6,23,.98)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 18, boxShadow: '0 28px 90px rgba(0,0,0,.55)', padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><p style={{ margin: 0, color: '#ffc300', fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 950 }}>{c.eyebrow}</p><h3 style={{ margin: '5px 0 0', color: '#fff', fontSize: 16 }}>{c.title}</h3></div><button type="button" onClick={load} disabled={loading} style={smallButton}>{loading ? '...' : c.refresh}</button></div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {pending.length === 0 && <p style={{ color: 'rgba(255,255,255,.58)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{c.none}</p>}
          {pending.slice(0, 4).map(campaign => <div key={campaign.id} style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.045)', borderRadius: 14, padding: 12 }}><Link href={`/dashboard/cosa?campaign=${campaign.id}`} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 10, textDecoration: 'none' }}><div style={{ height: 44, borderRadius: 12, background: 'linear-gradient(145deg, rgba(255,195,0,.22), rgba(26,240,255,.12))', display: 'grid', placeItems: 'center', fontSize: 22 }}>{thumbnail(campaign)}</div><div><strong style={{ color: '#fff', fontSize: 13, lineHeight: 1.35 }}>{campaign.title || c.untitled}</strong><p style={{ color: '#fecaca', fontSize: 11, fontWeight: 850, margin: '5px 0 0' }}>{labelFrom(c.status, campaign.status, c.status.draft)} · {labelFrom(c.channel, campaign.channel, c.channel.campaign)}</p></div></Link><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}><button disabled={actingId === campaign.id} onClick={() => act(campaign, 'approve')} style={actionButton}>{c.approve}</button><button disabled={actingId === campaign.id} onClick={() => act(campaign, 'request_edits')} style={actionButton}>{c.edit}</button><button disabled={actingId === campaign.id} onClick={() => act(campaign, 'reject')} style={dangerButton}>{c.reject}</button><button disabled={actingId === campaign.id} onClick={() => act(campaign, 'archive')} style={mutedButton}>{c.archive}</button></div></div>)}
          {publishing.length > 0 && <div style={{ borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 10 }}><p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 950 }}>{c.publishing}</p>{publishing.map(campaign => <Link key={campaign.id} href={`/dashboard/cosa?campaign=${campaign.id}`} style={{ display: 'block', color: 'rgba(255,255,255,.72)', fontSize: 12, textDecoration: 'none', marginBottom: 6 }}>{campaign.title || c.untitled} · {labelFrom(c.status, campaign.status)}</Link>)}</div>}
        </div>
        <Link href="/dashboard/cosa" style={{ display: 'block', marginTop: 12, color: '#ffc300', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}>{c.viewAll}</Link>
      </div>}
    </div>
  )
}

const smallButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 9, padding: '6px 8px', fontSize: 11, fontWeight: 850, cursor: 'pointer' }
const actionButton: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#000', borderRadius: 9, padding: '7px 9px', fontSize: 11, fontWeight: 950, cursor: 'pointer' }
const dangerButton: React.CSSProperties = { ...actionButton, background: 'rgba(248,113,113,.18)', color: '#fecaca', border: '1px solid rgba(248,113,113,.38)' }
const mutedButton: React.CSSProperties = { ...actionButton, background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.72)', border: '1px solid rgba(255,255,255,.12)' }
