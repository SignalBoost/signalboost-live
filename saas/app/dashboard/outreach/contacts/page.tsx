'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Status = 'pending' | 'approved' | 'sent' | 'rejected'
type Filter = 'all' | Status

type Lead = {
  id: string
  business_name?: string
  business_url?: string
  source_platform?: string
  status?: Status
  outreach_message?: string
  contact_email?: string | null
  created_at?: string
}

type Copy = {
  eyebrow: string; title: string; subtitle: string; all: string; pending: string; approved: string; sent: string; rejected: string
  discover: string; delivery: string; batch: string; batching: string; batchConfirm: string; noBatch: string; batchDone: string
  loading: string; loadError: string; empty: string; analyze: string; unnamed: string; recipient: string; noRecipient: string
  approveSend: string; sendApproved: string; reject: string; openEngine: string; show: string; hide: string; strategist: string
  sentNotice: string; alreadySent: string; notSent: string; rejectedNotice: string; updateError: string; previous: string; next: string
  statuses: Record<Status, string>
}

const COPY: Record<Lang, Copy> = {
  en: {
    eyebrow: 'Contacts', title: 'Your analyzed prospects, ready for human approval and release.', subtitle: 'Approve & Send is the human release gate. Resend acceptance moves the record to Sent; approved records that could not send remain visible with the exact reason.',
    all: 'All', pending: 'Pending', approved: 'Approved', sent: 'Sent', rejected: 'Rejected', discover: '+ Discover new lead', delivery: 'Resend delivery', batch: 'Send approved batch (up to 10)', batching: 'Sending approved batch…', batchConfirm: 'Send up to 10 already-approved outreach emails now? Duplicate protection, the panic switch, message guardrails, and the 50-per-day limit remain active.', noBatch: 'There are no unsent approved records with usable email addresses.', batchDone: 'Batch complete: {sent} sent, {skipped} skipped.',
    loading: 'Loading contacts…', loadError: 'The contacts could not be loaded.', empty: 'There are no prospects in this view.', analyze: 'Analyze your first lead', unnamed: 'Unnamed business', recipient: 'Will send to', noRecipient: 'No valid published email was found — this cannot be sent.', approveSend: 'Approve & Send', sendApproved: 'Send approved', reject: 'Reject', openEngine: 'Open engine', show: 'Show full draft', hide: 'Hide draft', strategist: '🧠 Strategist',
    sentNotice: 'Approved and accepted by Resend. The record is now Sent.', alreadySent: 'This email was already in the send ledger. Its queue status was reconciled to Sent without a duplicate.', notSent: 'Approved, but the email was not sent.', rejectedNotice: 'The record was rejected. Nothing was sent.', updateError: 'The outreach update failed. Please try again.', previous: 'Previous', next: 'Next',
    statuses: { pending: 'pending', approved: 'approved', sent: 'sent', rejected: 'rejected' },
  },
  es: {
    eyebrow: 'Contactos', title: 'Tus prospectos analizados, listos para aprobación y envío humanos.', subtitle: 'Aprobar y enviar es la autorización humana. La aceptación de Resend cambia el registro a Enviado; los aprobados que no pudieron salir siguen visibles con la razón exacta.',
    all: 'Todos', pending: 'Pendientes', approved: 'Aprobados', sent: 'Enviados', rejected: 'Rechazados', discover: '+ Descubrir nuevo lead', delivery: 'Entrega de Resend', batch: 'Enviar lote aprobado (hasta 10)', batching: 'Enviando lote aprobado…', batchConfirm: '¿Enviar ahora hasta 10 correos ya aprobados? Siguen activos la protección contra duplicados, el interruptor de emergencia, las reglas de seguridad y el límite diario de 50.', noBatch: 'No hay registros aprobados sin enviar con correos utilizables.', batchDone: 'Lote completado: {sent} enviados, {skipped} omitidos.',
    loading: 'Cargando contactos…', loadError: 'No se pudieron cargar los contactos.', empty: 'No hay prospectos en esta vista.', analyze: 'Analizar tu primer lead', unnamed: 'Negocio sin nombre', recipient: 'Se enviará a', noRecipient: 'No se encontró un correo publicado válido — no se puede enviar.', approveSend: 'Aprobar y enviar', sendApproved: 'Enviar aprobado', reject: 'Rechazar', openEngine: 'Abrir motor', show: 'Ver borrador completo', hide: 'Ocultar borrador', strategist: '🧠 Estratega',
    sentNotice: 'Aprobado y aceptado por Resend. El registro ahora figura como Enviado.', alreadySent: 'Este correo ya estaba en el registro de envíos. Se corrigió el estado a Enviado sin duplicarlo.', notSent: 'Aprobado, pero el correo no fue enviado.', rejectedNotice: 'El registro fue rechazado. No se envió nada.', updateError: 'No se pudo actualizar el registro. Inténtalo de nuevo.', previous: 'Anterior', next: 'Siguiente',
    statuses: { pending: 'pendiente', approved: 'aprobado', sent: 'enviado', rejected: 'rechazado' },
  },
  pt: {
    eyebrow: 'Contatos', title: 'Seus prospects analisados, prontos para aprovação e envio humanos.', subtitle: 'Aprovar e enviar é a liberação humana. Quando o Resend aceita, o registro muda para Enviado; aprovados que não puderam sair permanecem visíveis com o motivo exato.',
    all: 'Todos', pending: 'Pendentes', approved: 'Aprovados', sent: 'Enviados', rejected: 'Rejeitados', discover: '+ Descobrir novo lead', delivery: 'Entrega do Resend', batch: 'Enviar lote aprovado (até 10)', batching: 'Enviando lote aprovado…', batchConfirm: 'Enviar agora até 10 e-mails já aprovados? A proteção contra duplicatas, o interruptor de emergência, as regras de segurança e o limite diário de 50 continuam ativos.', noBatch: 'Não há registros aprovados e ainda não enviados com e-mails utilizáveis.', batchDone: 'Lote concluído: {sent} enviados, {skipped} ignorados.',
    loading: 'Carregando contatos…', loadError: 'Não foi possível carregar os contatos.', empty: 'Não há prospects nesta visualização.', analyze: 'Analisar seu primeiro lead', unnamed: 'Negócio sem nome', recipient: 'Será enviado para', noRecipient: 'Nenhum e-mail publicado válido foi encontrado — não pode ser enviado.', approveSend: 'Aprovar e enviar', sendApproved: 'Enviar aprovado', reject: 'Rejeitar', openEngine: 'Abrir motor', show: 'Ver rascunho completo', hide: 'Ocultar rascunho', strategist: '🧠 Estrategista',
    sentNotice: 'Aprovado e aceito pelo Resend. O registro agora está como Enviado.', alreadySent: 'Este e-mail já estava no ledger de envios. O status foi reconciliado para Enviado sem duplicação.', notSent: 'Aprovado, mas o e-mail não foi enviado.', rejectedNotice: 'O registro foi rejeitado. Nada foi enviado.', updateError: 'Não foi possível atualizar o registro. Tente novamente.', previous: 'Anterior', next: 'Próxima',
    statuses: { pending: 'pendente', approved: 'aprovado', sent: 'enviado', rejected: 'rejeitado' },
  },
  pl: {
    eyebrow: 'Kontakty', title: 'Przeanalizowani potencjalni klienci gotowi do zatwierdzenia i wysłania przez człowieka.', subtitle: 'Zatwierdź i wyślij jest ludzką bramką wydania. Po przyjęciu przez Resend rekord przechodzi do Wysłane; zatwierdzone wiadomości, których nie udało się wysłać, pozostają widoczne z dokładnym powodem.',
    all: 'Wszystkie', pending: 'Oczekujące', approved: 'Zatwierdzone', sent: 'Wysłane', rejected: 'Odrzucone', discover: '+ Odkryj nowy lead', delivery: 'Dostawa Resend', batch: 'Wyślij zatwierdzoną partię (do 10)', batching: 'Wysyłanie zatwierdzonej partii…', batchConfirm: 'Wysłać teraz do 10 wcześniej zatwierdzonych wiadomości? Nadal działają zabezpieczenie przed duplikatami, wyłącznik awaryjny, reguły bezpieczeństwa i limit 50 dziennie.', noBatch: 'Brak niewysłanych zatwierdzonych rekordów z prawidłowymi adresami e-mail.', batchDone: 'Partia zakończona: wysłano {sent}, pominięto {skipped}.',
    loading: 'Ładowanie kontaktów…', loadError: 'Nie można załadować kontaktów.', empty: 'Brak potencjalnych klientów w tym widoku.', analyze: 'Przeanalizuj pierwszy lead', unnamed: 'Firma bez nazwy', recipient: 'Zostanie wysłane do', noRecipient: 'Nie znaleziono prawidłowego publicznego adresu e-mail — wysyłka niemożliwa.', approveSend: 'Zatwierdź i wyślij', sendApproved: 'Wyślij zatwierdzone', reject: 'Odrzuć', openEngine: 'Otwórz silnik', show: 'Pokaż pełny szkic', hide: 'Ukryj szkic', strategist: '🧠 Strateg',
    sentNotice: 'Zatwierdzono i przyjęto przez Resend. Rekord ma teraz status Wysłano.', alreadySent: 'Wiadomość była już w rejestrze wysyłek. Status uzgodniono jako Wysłano bez duplikatu.', notSent: 'Zatwierdzono, ale wiadomość nie została wysłana.', rejectedNotice: 'Rekord został odrzucony. Nic nie wysłano.', updateError: 'Nie udało się zaktualizować rekordu. Spróbuj ponownie.', previous: 'Poprzednia', next: 'Następna',
    statuses: { pending: 'oczekuje', approved: 'zatwierdzony', sent: 'wysłany', rejected: 'odrzucony' },
  },
  ru: {
    eyebrow: 'Контакты', title: 'Проверенные потенциальные клиенты готовы к одобрению и отправке человеком.', subtitle: '«Одобрить и отправить» — это человеческое разрешение. После принятия Resend запись получает статус «Отправлено»; неотправленные одобренные письма остаются видимыми с точной причиной.',
    all: 'Все', pending: 'Ожидают', approved: 'Одобрены', sent: 'Отправлены', rejected: 'Отклонены', discover: '+ Найти новый лид', delivery: 'Доставка Resend', batch: 'Отправить одобренную партию (до 10)', batching: 'Отправка одобренной партии…', batchConfirm: 'Отправить сейчас до 10 ранее одобренных писем? Защита от дубликатов, аварийный выключатель, правила безопасности и лимит 50 в сутки остаются включены.', noBatch: 'Нет неотправленных одобренных записей с пригодными адресами.', batchDone: 'Партия завершена: отправлено {sent}, пропущено {skipped}.',
    loading: 'Загрузка контактов…', loadError: 'Не удалось загрузить контакты.', empty: 'В этом представлении нет потенциальных клиентов.', analyze: 'Проанализировать первый лид', unnamed: 'Компания без названия', recipient: 'Будет отправлено на', noRecipient: 'Действительный опубликованный адрес не найден — отправка невозможна.', approveSend: 'Одобрить и отправить', sendApproved: 'Отправить одобренное', reject: 'Отклонить', openEngine: 'Открыть движок', show: 'Показать черновик', hide: 'Скрыть черновик', strategist: '🧠 Стратег',
    sentNotice: 'Одобрено и принято Resend. Запись теперь имеет статус «Отправлено».', alreadySent: 'Письмо уже было в журнале отправок. Статус исправлен на «Отправлено» без дубликата.', notSent: 'Одобрено, но письмо не отправлено.', rejectedNotice: 'Запись отклонена. Ничего не отправлено.', updateError: 'Не удалось обновить запись. Повторите попытку.', previous: 'Назад', next: 'Далее',
    statuses: { pending: 'ожидает', approved: 'одобрен', sent: 'отправлен', rejected: 'отклонён' },
  },
}

const FILTERS: Filter[] = ['all', 'pending', 'approved', 'sent', 'rejected']
const COLORS: Record<Status, string> = { pending: '#fde68a', approved: '#86efac', sent: '#7dd3fc', rejected: '#fca5a5' }

function fill(template: string, values: Record<string, number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template)
}

export default function OutreachContactsPage() {
  const { lang } = useI18n()
  const copy = COPY[(lang in COPY ? lang : 'en') as Lang]
  const [leads, setLeads] = useState<Lead[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 3

  async function load() {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/outreach/queue?limit=100', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || copy.loadError)
      setLeads(Array.isArray(data?.outreach) ? data.outreach : [])
    } catch (reason: any) {
      setError(reason?.message || copy.loadError); setLeads([])
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => filter === 'all' ? leads : leads.filter(row => (row.status || 'pending') === filter), [filter, leads])
  const counts = useMemo(() => ({
    all: leads.length,
    pending: leads.filter(row => (row.status || 'pending') === 'pending').length,
    approved: leads.filter(row => row.status === 'approved').length,
    sent: leads.filter(row => row.status === 'sent').length,
    rejected: leads.filter(row => row.status === 'rejected').length,
  }), [leads])
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusyId(id); setError(''); setNotice('')
    try {
      const response = await fetch('/api/outreach/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
      const data = await response.json()
      if (!response.ok || !data?.outreach) throw new Error(data?.error || copy.updateError)
      if (status === 'rejected') setNotice(copy.rejectedNotice)
      else if (data?.release?.ok && data?.release?.alreadySent) setNotice(copy.alreadySent)
      else if (data?.release?.ok) setNotice(copy.sentNotice)
      else setNotice(`${copy.notSent}${data?.release?.error ? ` ${data.release.error}` : ''}`)
      await load()
      if (status === 'approved' && data?.release?.ok) { setFilter('sent'); setPage(0) }
    } catch (reason: any) { setError(reason?.message || copy.updateError) }
    finally { setBusyId('') }
  }

  async function sendBatch() {
    if (!counts.approved) { setNotice(copy.noBatch); return }
    if (!window.confirm(copy.batchConfirm)) return
    setBatchBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/outreach/send-ready?send=1&limit=10', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data?.ok) throw new Error(data?.error || copy.updateError)
      setNotice(fill(copy.batchDone, { sent: data.sent || 0, skipped: data.skipped || 0 }))
      await load()
      if ((data.sent || 0) > 0) { setFilter('sent'); setPage(0) }
    } catch (reason: any) { setError(reason?.message || copy.updateError) }
    finally { setBatchBusy(false) }
  }

  return <main style={{ color: 'var(--text-primary)' }}>
    <header className="sb-console" style={{ paddingBottom: 12 }}>
      <div className="sb-console__row">
        <div><span className="sb-eyebrow">🗂️ {copy.eyebrow}</span><h1 style={{ fontSize: 22, margin: '4px 0' }}>{copy.title}</h1><p className="sb-caption" style={{ maxWidth: 760 }}>{copy.subtitle}</p></div>
        <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
          <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
            {FILTERS.map(key => <div key={key} style={{ paddingTop: 0 }}><b style={{ color: key === 'all' ? '#ffc300' : key === 'rejected' ? COLORS.rejected : key === 'sent' ? COLORS.sent : undefined }}>{counts[key]}</b><span>{copy[key]}</span></div>)}
          </div>
          <div className="sb-cta-row">
            <button type="button" className="sb-button-primary" disabled={batchBusy || !counts.approved} onClick={() => void sendBatch()}>{batchBusy ? copy.batching : copy.batch}</button>
            <Link className="sb-button-secondary" href="/admin/outreach/delivery">📬 {copy.delivery}</Link>
            <Link className="sb-button-primary" href="/dashboard/outreach/discovery">{copy.discover}</Link>
          </div>
        </div>
      </div>
    </header>

    <div className="sb-cta-row" style={{ marginBottom: 16 }}>{FILTERS.map(key => <button key={key} type="button" className={filter === key ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => { setFilter(key); setPage(0) }}>{copy[key]}</button>)}</div>
    {notice ? <div className="sb-ai-feedback" style={{ marginBottom: 14 }}><strong>{notice}</strong></div> : null}
    {loading ? <p className="sb-body">{copy.loading}</p> : null}
    {error ? <p role="alert" className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p> : null}
    {!loading && !error && !visible.length ? <div className="sb-empty"><p className="sb-body">{copy.empty}</p><Link className="sb-button-primary" href="/dashboard/outreach/discovery">{copy.analyze}</Link></div> : null}

    <section style={{ display: 'grid', gap: 12 }}>
      {visible.slice(page * pageSize, page * pageSize + pageSize).map(lead => {
        const status = lead.status || 'pending'; const busy = busyId === lead.id
        return <article key={lead.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: `2px solid ${COLORS[status]}`, padding: '12px 0 12px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><h2 className="sb-h3" style={{ margin: 0 }}>{lead.business_name || copy.unnamed}</h2>{lead.business_url ? <a href={lead.business_url} target="_blank" rel="noreferrer" className="sb-caption" style={{ color: '#7dd3fc' }}>{lead.business_url}</a> : null}<p className="sb-caption" style={{ color: lead.contact_email ? '#1af0ff' : '#f59e0b', fontWeight: 700 }}>{lead.contact_email ? `${copy.recipient}: ${lead.contact_email}` : copy.noRecipient}</p></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{lead.source_platform === 'strategist' ? <span style={{ color: '#c4b5fd' }}>{copy.strategist}</span> : null}<span style={{ border: `1px solid ${COLORS[status]}`, color: COLORS[status], borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800 }}>{copy.statuses[status]}</span></div>
          </div>
          {lead.outreach_message ? <div><p className="sb-body" style={expandedId === lead.id ? { whiteSpace: 'pre-wrap' } : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lead.outreach_message}</p><button type="button" onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)} style={{ background: 'none', border: 0, color: '#7dd3fc', cursor: 'pointer' }}>{expandedId === lead.id ? copy.hide : copy.show}</button></div> : null}
          <div className="sb-cta-row" style={{ marginTop: 10 }}>
            <button type="button" className="sb-button-primary" disabled={busy || status === 'sent' || !lead.contact_email} onClick={() => void decide(lead.id, 'approved')}>{status === 'sent' ? copy.sent : status === 'approved' ? copy.sendApproved : copy.approveSend}</button>
            <button type="button" className="sb-button-secondary" disabled={busy || status === 'sent' || status === 'rejected'} onClick={() => void decide(lead.id, 'rejected')}>{status === 'rejected' ? copy.rejected : copy.reject}</button>
            <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">{copy.openEngine}</Link>
          </div>
        </article>
      })}
    </section>

    {pages > 1 ? <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}><button type="button" className="sb-button-secondary" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>{copy.previous}</button><span>{page + 1} / {pages}</span><button type="button" className="sb-button-secondary" disabled={page + 1 >= pages} onClick={() => setPage(value => Math.min(pages - 1, value + 1))}>{copy.next}</button></div> : null}
  </main>
}
