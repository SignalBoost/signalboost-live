'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type OutreachStatus = 'pending' | 'approved' | 'rejected' | 'sent'
type Filter = 'all' | OutreachStatus

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: OutreachStatus
  outreach_message?: string
  contact_email?: string | null
  created_at?: string
  approved_at?: string | null
  sent_at?: string | null
}

type ReleaseResult = {
  ok?: boolean
  alreadySent?: boolean
  providerAccepted?: boolean
  sentAt?: string
  reason?: string
  error?: string
  providerResult?: { id?: string; mode?: string }
  queueReconcile?: { ok?: boolean; usedStatusOnlyFallback?: boolean; error?: string | null }
}

type ContactsCopy = {
  eyebrow: string
  title: string
  subtitle: string
  discoverNew: string
  loadError: string
  genericLoadError: string
  loading: string
  empty: string
  analyzeFirst: string
  unnamedBusiness: string
  willSendTo: string
  noRecipient: string
  approveAndSend: string
  sendApproved: string
  sent: string
  reject: string
  rejected: string
  openEngine: string
  deliveryMonitor: string
  releaseBatch: string
  releasingBatch: string
  batchConfirm: string
  batchNone: string
  batchResult: string
  sendSucceeded: string
  alreadySent: string
  approvedNotSent: string
  rejectedNotice: string
  updateError: string
  showMore: string
  showLess: string
  filters: Record<Filter, string>
  statuses: Record<OutreachStatus, string>
}

const FILTERS: Filter[] = ['all', 'pending', 'approved', 'sent', 'rejected']

const STATUS_COLOR: Record<OutreachStatus, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  sent: '#7dd3fc',
  rejected: '#fca5a5',
}

const COPY: Record<string, ContactsCopy> = {
  en: {
    eyebrow: uiText('generatedUi.u_b450645debe2cf0a'),
    title: 'Your analyzed prospects, ready for human approval and release.',
    subtitle: 'Approve & Send is the human release gate. A successful Resend handoff moves the record to Sent; approved records that could not send remain visible with the exact reason.',
    discoverNew: uiText('generatedUi.u_87d381d081c06cd5'),
    loadError: uiText('generatedUi.u_c62c7867c77d5745'),
    genericLoadError: uiText('generatedUi.u_28fe0493daaa996f'),
    loading: uiText('generatedUi.u_9485587c4eb7c5d9'),
    empty: uiText('generatedUi.u_1440d19814f62330'),
    analyzeFirst: uiText('generatedUi.u_42706aa5940d64fd'),
    unnamedBusiness: uiText('generatedUi.u_7ce58cbf9a0b335b'),
    willSendTo: uiText('generatedUi.u_e2d9cd919167fa7d'),
    noRecipient: uiText('generatedUi.u_35c790a34659ac93'),
    approveAndSend: 'Approve & Send',
    sendApproved: 'Send approved',
    sent: 'Sent',
    reject: uiText('generatedUi.u_ab604a360777735f'),
    rejected: uiText('generatedUi.u_aea4a04a80426ed8'),
    openEngine: uiText('generatedUi.u_ab3746fe67822a78'),
    deliveryMonitor: 'Resend delivery',
    releaseBatch: 'Send approved batch (up to 10)',
    releasingBatch: 'Sending approved batch…',
    batchConfirm: 'Send up to 10 already-approved outreach emails now? Duplicate protection, the panic switch, message guardrails, and the 50-per-day limit remain active.',
    batchNone: 'There are no unsent approved records with usable email addresses.',
    batchResult: 'Batch complete: {sent} sent, {skipped} skipped.',
    sendSucceeded: 'Approved and accepted by Resend. The record is now Sent.',
    alreadySent: 'This email was already in the send ledger. Its queue status was reconciled to Sent without sending a duplicate.',
    approvedNotSent: 'Approved, but the email was not sent.',
    rejectedNotice: 'The outreach record was rejected. Nothing was sent.',
    updateError: 'The outreach update failed. Please try again.',
    showMore: uiText('generatedUi.u_89b73dc913ff887b'),
    showLess: uiText('generatedUi.u_3d7dddec86cab47b'),
    filters: { all: uiText('generatedUi.u_a52ace420f2175d0'), pending: uiText('generatedUi.u_331551b0de4157c9'), approved: uiText('generatedUi.u_87b42e40c2a290e0'), sent: 'Sent', rejected: uiText('generatedUi.u_aea4a04a80426ed8') },
    statuses: { pending: uiText('generatedUi.u_62a2fed3d6e08c44'), approved: uiText('generatedUi.u_2687f86ed6784b8a'), sent: 'sent', rejected: uiText('generatedUi.u_20cd938a2ea64f61') },
  },
  es: {
    eyebrow: 'Contactos', title: 'Tus prospectos analizados, listos para aprobación y envío humanos.',
    subtitle: 'Aprobar y enviar es la autorización humana. Una entrega aceptada por Resend pasa a Enviado; los aprobados que no pudieron salir siguen visibles con la razón exacta.',
    discoverNew: '+ Descubrir nuevo lead', loadError: 'No se pudieron cargar los contactos.', genericLoadError: 'Algo salió mal al cargar los contactos.', loading: 'Cargando contactos…', empty: 'Aún no hay leads aquí.', analyzeFirst: 'Analizar tu primer lead', unnamedBusiness: 'Negocio sin nombre', willSendTo: 'Se enviará a', noRecipient: 'No se encontró un correo publicado válido — no se puede enviar.',
    approveAndSend: 'Aprobar y enviar', sendApproved: 'Enviar aprobado', sent: 'Enviado', reject: 'Rechazar', rejected: 'Rechazado', openEngine: 'Abrir motor', deliveryMonitor: 'Entrega de Resend', releaseBatch: 'Enviar lote aprobado (hasta 10)', releasingBatch: 'Enviando lote aprobado…', batchConfirm: '¿Enviar ahora hasta 10 correos ya aprobados? Siguen activos la protección contra duplicados, el interruptor de emergencia, las reglas de seguridad y el límite diario de 50.', batchNone: 'No hay registros aprobados sin enviar con correos utilizables.', batchResult: 'Lote completado: {sent} enviados, {skipped} omitidos.', sendSucceeded: 'Aprobado y aceptado por Resend. El registro ahora figura como Enviado.', alreadySent: 'Este correo ya estaba en el registro de envíos. Se corrigió el estado a Enviado sin duplicarlo.', approvedNotSent: 'Aprobado, pero el correo no fue enviado.', rejectedNotice: 'El registro fue rechazado. No se envió nada.', updateError: 'No se pudo actualizar el registro. Inténtalo de nuevo.', showMore: 'Ver borrador completo', showLess: 'Ocultar borrador',
    filters: { all: 'Todos', pending: 'Pendientes', approved: 'Aprobados', sent: 'Enviados', rejected: 'Rechazados' }, statuses: { pending: 'pendiente', approved: 'aprobado', sent: 'enviado', rejected: 'rechazado' },
  },
  pt: {
    eyebrow: 'Contatos', title: 'Seus prospects analisados, prontos para aprovação e envio humanos.',
    subtitle: 'Aprovar e enviar é a liberação humana. Quando o Resend aceita o envio, o registro muda para Enviado; aprovados que não puderam sair permanecem visíveis com o motivo exato.',
    discoverNew: '+ Descobrir novo lead', loadError: 'Não foi possível carregar os contatos.', genericLoadError: 'Algo deu errado ao carregar os contatos.', loading: 'Carregando contatos…', empty: 'Ainda não há leads aqui.', analyzeFirst: 'Analisar seu primeiro lead', unnamedBusiness: 'Negócio sem nome', willSendTo: 'Será enviado para', noRecipient: 'Nenhum e-mail publicado válido foi encontrado — não pode ser enviado.',
    approveAndSend: 'Aprovar e enviar', sendApproved: 'Enviar aprovado', sent: 'Enviado', reject: 'Rejeitar', rejected: 'Rejeitado', openEngine: 'Abrir motor', deliveryMonitor: 'Entrega do Resend', releaseBatch: 'Enviar lote aprovado (até 10)', releasingBatch: 'Enviando lote aprovado…', batchConfirm: 'Enviar agora até 10 e-mails já aprovados? A proteção contra duplicatas, o interruptor de emergência, as regras de segurança e o limite diário de 50 continuam ativos.', batchNone: 'Não há registros aprovados e ainda não enviados com e-mails utilizáveis.', batchResult: 'Lote concluído: {sent} enviados, {skipped} ignorados.', sendSucceeded: 'Aprovado e aceito pelo Resend. O registro agora está como Enviado.', alreadySent: 'Este e-mail já estava no ledger de envios. O status foi reconciliado para Enviado sem duplicação.', approvedNotSent: 'Aprovado, mas o e-mail não foi enviado.', rejectedNotice: 'O registro foi rejeitado. Nada foi enviado.', updateError: 'Não foi possível atualizar o registro. Tente novamente.', showMore: 'Ver rascunho completo', showLess: 'Ocultar rascunho',
    filters: { all: 'Todos', pending: 'Pendentes', approved: 'Aprovados', sent: 'Enviados', rejected: 'Rejeitados' }, statuses: { pending: 'pendente', approved: 'aprovado', sent: 'enviado', rejected: 'rejeitado' },
  },
  pl: {
    eyebrow: 'Kontakty', title: 'Przeanalizowani potencjalni klienci gotowi do zatwierdzenia i wysłania przez człowieka.',
    subtitle: 'Zatwierdź i wyślij jest ludzką bramką wydania. Po przyjęciu przez Resend rekord przechodzi do Wysłane; zatwierdzone wiadomości, których nie udało się wysłać, pozostają widoczne z dokładnym powodem.',
    discoverNew: '+ Odkryj nowy lead', loadError: 'Nie można załadować kontaktów.', genericLoadError: 'Coś poszło nie tak podczas ładowania kontaktów.', loading: 'Ładowanie kontaktów…', empty: 'Nie ma tu jeszcze leadów.', analyzeFirst: 'Przeanalizuj pierwszy lead', unnamedBusiness: 'Firma bez nazwy', willSendTo: 'Zostanie wysłane do', noRecipient: 'Nie znaleziono prawidłowego publicznego adresu e-mail — wysyłka niemożliwa.',
    approveAndSend: 'Zatwierdź i wyślij', sendApproved: 'Wyślij zatwierdzone', sent: 'Wysłano', reject: 'Odrzuć', rejected: 'Odrzucony', openEngine: 'Otwórz silnik', deliveryMonitor: 'Dostawa Resend', releaseBatch: 'Wyślij zatwierdzoną partię (do 10)', releasingBatch: 'Wysyłanie zatwierdzonej partii…', batchConfirm: 'Wysłać teraz do 10 wcześniej zatwierdzonych wiadomości? Nadal działają zabezpieczenie przed duplikatami, wyłącznik awaryjny, reguły bezpieczeństwa i limit 50 dziennie.', batchNone: 'Brak niewysłanych zatwierdzonych rekordów z prawidłowymi adresami e-mail.', batchResult: 'Partia zakończona: wysłano {sent}, pominięto {skipped}.', sendSucceeded: 'Zatwierdzono i przyjęto przez Resend. Rekord ma teraz status Wysłano.', alreadySent: 'Wiadomość była już w rejestrze wysyłek. Status uzgodniono jako Wysłano bez duplikatu.', approvedNotSent: 'Zatwierdzono, ale wiadomość nie została wysłana.', rejectedNotice: 'Rekord został odrzucony. Nic nie wysłano.', updateError: 'Nie udało się zaktualizować rekordu. Spróbuj ponownie.', showMore: 'Pokaż pełny szkic', showLess: 'Ukryj szkic',
    filters: { all: 'Wszystkie', pending: 'Oczekujące', approved: 'Zatwierdzone', sent: 'Wysłane', rejected: 'Odrzucone' }, statuses: { pending: 'oczekuje', approved: 'zatwierdzony', sent: 'wysłany', rejected: 'odrzucony' },
  },
  ru: {
    eyebrow: 'Контакты', title: 'Проверенные потенциальные клиенты готовы к одобрению и отправке человеком.',
    subtitle: '«Одобрить и отправить» — это человеческое разрешение на выпуск. После принятия Resend запись получает статус «Отправлено»; одобренные письма, которые не удалось отправить, остаются видимыми с точной причиной.',
    discoverNew: '+ Найти новый лид', loadError: 'Не удалось загрузить контакты.', genericLoadError: 'Произошла ошибка при загрузке контактов.', loading: 'Загрузка контактов…', empty: 'Здесь пока нет лидов.', analyzeFirst: 'Проанализировать первый лид', unnamedBusiness: 'Компания без названия', willSendTo: 'Будет отправлено на', noRecipient: 'Действительный опубликованный адрес не найден — отправка невозможна.',
    approveAndSend: 'Одобрить и отправить', sendApproved: 'Отправить одобренное', sent: 'Отправлено', reject: 'Отклонить', rejected: 'Отклонено', openEngine: 'Открыть движок', deliveryMonitor: 'Доставка Resend', releaseBatch: 'Отправить одобренную партию (до 10)', releasingBatch: 'Отправка одобренной партии…', batchConfirm: 'Отправить сейчас до 10 ранее одобренных писем? Защита от дубликатов, аварийный выключатель, правила безопасности и лимит 50 в сутки остаются включены.', batchNone: 'Нет неотправленных одобренных записей с пригодными адресами.', batchResult: 'Партия завершена: отправлено {sent}, пропущено {skipped}.', sendSucceeded: 'Одобрено и принято Resend. Запись теперь имеет статус «Отправлено».', alreadySent: 'Письмо уже было в журнале отправок. Статус исправлен на «Отправлено» без дубликата.', approvedNotSent: 'Одобрено, но письмо не отправлено.', rejectedNotice: 'Запись отклонена. Ничего не отправлено.', updateError: 'Не удалось обновить запись. Повторите попытку.', showMore: 'Показать черновик', showLess: 'Скрыть черновик',
    filters: { all: 'Все', pending: 'Ожидают', approved: 'Одобрены', sent: 'Отправлены', rejected: 'Отклонены' }, statuses: { pending: 'ожидает', approved: 'одобрен', sent: 'отправлен', rejected: 'отклонён' },
  },
}

function copyFor(lang: string): ContactsCopy {
  return COPY[lang] || COPY.en
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template)
}

export default function OutreachContactsPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(3)

  useEffect(() => {
    function recalc() {
      setPageSize(Math.max(1, Math.floor((window.innerHeight - 440) / 215)))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || copy.loadError)
        setLeads([])
        return
      }
      setLeads(Array.isArray(data.outreach) ? data.outreach : [])
    } catch {
      setError(copy.genericLoadError)
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  function releaseNotice(release: ReleaseResult | null | undefined): string {
    if (release?.ok && release.alreadySent) return copy.alreadySent
    if (release?.ok) return copy.sendSucceeded
    const detail = release?.error ? ` ${release.error}` : ''
    return `${copy.approvedNotSent}${detail}`
  }

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/outreach/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok || !data.outreach) {
        setError(String(data?.error || copy.updateError))
        return
      }
      setNotice(status === 'approved' ? releaseNotice(data.release) : copy.rejectedNotice)
      await load()
      if (status === 'approved' && data.release?.ok) setFilter('sent')
    } catch {
      setError(copy.updateError)
    } finally {
      setBusyId('')
    }
  }

  async function releaseApprovedBatch() {
    const eligible = leads.filter(lead => lead.status === 'approved' && lead.contact_email).length
    if (!eligible) {
      setNotice(copy.batchNone)
      return
    }
    if (!window.confirm(copy.batchConfirm)) return

    setBatchBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/outreach/send-ready?send=1&limit=10', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setError(String(data?.error || copy.updateError))
        return
      }
      setNotice(interpolate(copy.batchResult, { sent: data.sent || 0, skipped: data.skipped || 0 }))
      await load()
      if ((data.sent || 0) > 0) setFilter('sent')
    } catch {
      setError(copy.updateError)
    } finally {
      setBatchBusy(false)
    }
  }

  const visible = filter === 'all' ? leads : leads.filter(lead => (lead.status || 'pending') === filter)
  const countByStatus = (status: OutreachStatus) => leads.filter(lead => (lead.status || 'pending') === status).length
  const atFirstPage = page === 0
  const atLastPage = (page + 1) * pageSize >= visible.length
  const hasMultiplePages = visible.length > pageSize

  function selectFilter(filterKey: Filter) {
    setFilter(filterKey)
    setPage(0)
  }

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(visible.length / pageSize) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [page, pageSize, visible.length])

  return (
    <main style={{ color: 'var(--text-primary)' }}>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div style={{ minWidth: 0 }}>
            <span className="sb-eyebrow">🗂️ {copy.eyebrow}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{copy.title}</h1>
            <p className="sb-caption" style={{ maxWidth: 760, margin: '6px 0 0' }}>{copy.subtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
              <div style={{ paddingTop: 0 }}><b className="gold">{leads.length}</b><span>{copy.filters.all}</span></div>
              <div style={{ paddingTop: 0 }}><b className="warn">{countByStatus('pending')}</b><span>{copy.filters.pending}</span></div>
              <div style={{ paddingTop: 0 }}><b className="ok">{countByStatus('approved')}</b><span>{copy.filters.approved}</span></div>
              <div style={{ paddingTop: 0 }}><b style={{ color: STATUS_COLOR.sent }}>{countByStatus('sent')}</b><span>{copy.filters.sent}</span></div>
              <div style={{ paddingTop: 0 }}><b style={{ color: STATUS_COLOR.rejected }}>{countByStatus('rejected')}</b><span>{copy.filters.rejected}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="sb-button-primary" disabled={batchBusy || countByStatus('approved') === 0} onClick={() => void releaseApprovedBatch()} style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '9px 16px', opacity: batchBusy || countByStatus('approved') === 0 ? .55 : 1 }}>
                {batchBusy ? copy.releasingBatch : copy.releaseBatch}
              </button>
              <Link className="sb-button-secondary" href="/admin/outreach/delivery" style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '9px 16px' }}>📬 {copy.deliveryMonitor}</Link>
              <Link className="sb-button-primary" href="/dashboard/outreach/discovery" style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '9px 16px' }}>{copy.discoverNew}</Link>
            </div>
          </div>
        </div>
      </header>

      <div className="sb-cta-row" style={{ marginBottom: 16 }}>
        {FILTERS.map(filterKey => (
          <button key={filterKey} type="button" onClick={() => selectFilter(filterKey)} className={filter === filterKey ? 'sb-button-primary' : 'sb-button-secondary'} style={{ fontSize: 12, padding: '7px 14px' }}>
            {copy.filters[filterKey]}
          </button>
        ))}
      </div>

      {notice ? <div className="sb-ai-feedback" style={{ marginBottom: 14 }}><strong>{notice}</strong></div> : null}
      {loading ? <p className="sb-body">{copy.loading}</p> : null}
      {error && !loading ? <p className="sb-caption" role="alert" style={{ color: '#fca5a5' }}>{error}</p> : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="sb-empty">
          <p className="sb-body" style={{ margin: 0 }}>{copy.empty}</p>
          <div className="sb-cta-row" style={{ justifyContent: 'center', marginTop: 14 }}><Link className="sb-button-primary" href="/dashboard/outreach/discovery">{copy.analyzeFirst}</Link></div>
        </div>
      ) : null}

      <section style={{ display: 'grid', gap: 12 }}>
        {visible.slice(page * pageSize, page * pageSize + pageSize).map(lead => {
          const status = lead.status || 'pending'
          const isBusy = busyId === lead.id
          const approveLabel = status === 'sent' ? copy.sent : status === 'approved' ? copy.sendApproved : copy.approveAndSend
          return (
            <article key={lead.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: `2px solid ${STATUS_COLOR[status]}`, padding: '12px 0 12px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 className="sb-h3" style={{ margin: 0 }}>{lead.business_name || copy.unnamedBusiness}</h2>
                  {lead.business_url ? <a href={lead.business_url} target="_blank" rel="noreferrer" className="sb-caption" style={{ color: '#7dd3fc' }}>{lead.business_url}</a> : null}
                  {lead.contact_email ? <p className="sb-caption" style={{ margin: '4px 0 0', fontWeight: 700, color: '#1af0ff' }}>{copy.willSendTo}: {lead.contact_email}</p> : <p className="sb-caption" style={{ margin: '4px 0 0', fontWeight: 700, color: '#f59e0b' }}>{copy.noRecipient}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {lead.source_platform === 'strategist' ? <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#c4b5fd', border: '1px solid rgba(196,181,253,.5)', borderRadius: 999, padding: '4px 10px' }}>🧠 Strategist</span> : null}
                  {lead.created_at ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{new Date(lead.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span> : null}
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}`, borderRadius: 999, padding: '4px 12px' }}>{copy.statuses[status]}</span>
                </div>
              </div>

              {lead.outreach_message ? (
                <div style={{ marginTop: 10 }}>
                  <p className="sb-body" style={expandedId === lead.id ? { fontSize: 13.5, margin: 0, whiteSpace: 'pre-wrap' } : { fontSize: 13.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lead.outreach_message}</p>
                  <button type="button" onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)} style={{ background: 'none', border: 'none', color: '#7dd3fc', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '6px 0 0', letterSpacing: '.04em' }}>
                    {expandedId === lead.id ? `${copy.showLess} ▴` : `${copy.showMore} ▾`}
                  </button>
                </div>
              ) : null}

              <div className="sb-cta-row" style={{ marginTop: 10 }}>
                <button className="sb-button-primary" type="button" style={{ fontSize: 12, padding: '7px 14px', opacity: isBusy || status === 'sent' || !lead.contact_email ? .55 : 1 }} disabled={isBusy || status === 'sent' || !lead.contact_email} onClick={() => void setStatus(lead.id, 'approved')}>{approveLabel}</button>
                <button className="sb-button-secondary" type="button" style={{ fontSize: 12, padding: '7px 14px' }} disabled={isBusy || status === 'rejected' || status === 'sent'} onClick={() => void setStatus(lead.id, 'rejected')}>{status === 'rejected' ? copy.rejected : copy.reject}</button>
                <Link className="sb-button-secondary" href="/dashboard/outreach/outreach" style={{ fontSize: 12, padding: '7px 14px' }}>{copy.openEngine}</Link>
              </div>
            </article>
          )
        })}
      </section>

      {hasMultiplePages ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
          <button type="button" className="sb-button-secondary" style={{ fontSize: 13, padding: '7px 16px', opacity: atFirstPage ? .4 : 1 }} disabled={atFirstPage} onClick={() => setPage(current => Math.max(0, current - 1))}>‹</button>
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{page + 1} / {Math.max(1, Math.ceil(visible.length / pageSize))}</span>
          <button type="button" className="sb-button-secondary" style={{ fontSize: 13, padding: '7px 16px', opacity: atLastPage ? .4 : 1 }} disabled={atLastPage} onClick={() => setPage(current => ((current + 1) * pageSize >= visible.length ? current : current + 1))}>›</button>
        </div>
      ) : null}
    </main>
  )
}
