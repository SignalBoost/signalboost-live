'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Copy = {
  eyebrow: string
  title: string
  subtitle: string
  back: string
  refresh: string
  refreshing: string
  loadError: string
  configured: string
  missing: string
  resendKey: string
  webhook: string
  replyTo: string
  historicalSends: string
  queueSent: string
  approvedWaiting: string
  deliveryEvents: string
  replyRows: string
  checked: string
  accepted: string
  delivered: string
  opened: string
  clicked: string
  bounced: string
  complained: string
  recipient: string
  subject: string
  sentAt: string
  status: string
  opens: string
  clicks: string
  noHistory: string
  reconciliation: string
  fallback: string
  database: string
  provider: string
}

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: 'Resend delivery monitor',
    title: 'Verify what was really sent.',
    subtitle: 'This page reads the durable outreach_sends ledger, checks recent message IDs directly with Resend, reconciles stale Approved rows, and shows delivery, open, click, bounce, and reply-table evidence.',
    back: 'Back to Outreach Monitor', refresh: 'Sync Resend now', refreshing: 'Syncing…', loadError: 'Could not load outreach delivery history.',
    configured: 'Configured', missing: 'Missing', resendKey: 'Resend API key', webhook: 'Resend webhook', replyTo: 'Reply-to mailbox',
    historicalSends: 'Historical send records', queueSent: 'Queue marked sent', approvedWaiting: 'Approved waiting', deliveryEvents: 'Webhook events', replyRows: 'Reply records',
    checked: 'Recent checked', accepted: 'Accepted by Resend', delivered: 'Delivered', opened: 'Opened', clicked: 'Clicked', bounced: 'Bounced', complained: 'Complaints',
    recipient: 'Recipient', subject: 'Subject', sentAt: 'Sent at', status: 'Status', opens: 'Opens', clicks: 'Clicks', noHistory: 'No outreach_sends records were found.',
    reconciliation: 'Queue reconciliation', fallback: 'schema fallback', database: 'Database evidence', provider: 'Resend evidence',
  },
  es: {
    eyebrow: 'Monitor de entrega de Resend', title: 'Verifica qué se envió realmente.',
    subtitle: 'Esta página lee el registro durable outreach_sends, consulta los IDs recientes directamente en Resend, reconcilia filas Aprobadas obsoletas y muestra evidencia de entrega, apertura, clic, rebote y respuestas.',
    back: 'Volver al monitor de Outreach', refresh: 'Sincronizar Resend ahora', refreshing: 'Sincronizando…', loadError: 'No se pudo cargar el historial de entregas.',
    configured: 'Configurado', missing: 'Falta', resendKey: 'Clave API de Resend', webhook: 'Webhook de Resend', replyTo: 'Buzón de respuesta',
    historicalSends: 'Registros históricos de envío', queueSent: 'Cola marcada como enviada', approvedWaiting: 'Aprobados en espera', deliveryEvents: 'Eventos del webhook', replyRows: 'Registros de respuestas',
    checked: 'Recientes verificados', accepted: 'Aceptados por Resend', delivered: 'Entregados', opened: 'Abiertos', clicked: 'Clics', bounced: 'Rebotados', complained: 'Quejas',
    recipient: 'Destinatario', subject: 'Asunto', sentAt: 'Enviado', status: 'Estado', opens: 'Aperturas', clicks: 'Clics', noHistory: 'No se encontraron registros outreach_sends.',
    reconciliation: 'Reconciliación de cola', fallback: 'respaldo de esquema', database: 'Evidencia de base de datos', provider: 'Evidencia de Resend',
  },
  pt: {
    eyebrow: 'Monitor de entrega do Resend', title: 'Verifique o que foi realmente enviado.',
    subtitle: 'Esta página lê o ledger durável outreach_sends, consulta IDs recentes diretamente no Resend, reconcilia linhas Aprovadas desatualizadas e mostra evidências de entrega, abertura, clique, rejeição e respostas.',
    back: 'Voltar ao Monitor de Outreach', refresh: 'Sincronizar Resend agora', refreshing: 'Sincronizando…', loadError: 'Não foi possível carregar o histórico de entrega.',
    configured: 'Configurado', missing: 'Ausente', resendKey: 'Chave API do Resend', webhook: 'Webhook do Resend', replyTo: 'Caixa de resposta',
    historicalSends: 'Registros históricos de envio', queueSent: 'Fila marcada como enviada', approvedWaiting: 'Aprovados aguardando', deliveryEvents: 'Eventos do webhook', replyRows: 'Registros de respostas',
    checked: 'Recentes verificados', accepted: 'Aceitos pelo Resend', delivered: 'Entregues', opened: 'Abertos', clicked: 'Cliques', bounced: 'Rejeitados', complained: 'Reclamações',
    recipient: 'Destinatário', subject: 'Assunto', sentAt: 'Enviado em', status: 'Status', opens: 'Aberturas', clicks: 'Cliques', noHistory: 'Nenhum registro outreach_sends foi encontrado.',
    reconciliation: 'Reconciliação da fila', fallback: 'fallback de esquema', database: 'Evidência do banco', provider: 'Evidência do Resend',
  },
  pl: {
    eyebrow: 'Monitor dostarczania Resend', title: 'Sprawdź, co naprawdę wysłano.',
    subtitle: 'Ta strona czyta trwały rejestr outreach_sends, sprawdza ostatnie identyfikatory bezpośrednio w Resend, uzgadnia nieaktualne rekordy Zatwierdzone oraz pokazuje dowody dostarczeń, otwarć, kliknięć, odbić i odpowiedzi.',
    back: 'Wróć do monitora Outreach', refresh: 'Synchronizuj Resend', refreshing: 'Synchronizacja…', loadError: 'Nie udało się wczytać historii dostarczania.',
    configured: 'Skonfigurowano', missing: 'Brak', resendKey: 'Klucz API Resend', webhook: 'Webhook Resend', replyTo: 'Skrzynka odpowiedzi',
    historicalSends: 'Historyczne rekordy wysyłki', queueSent: 'Kolejka oznaczona jako wysłana', approvedWaiting: 'Zatwierdzone oczekujące', deliveryEvents: 'Zdarzenia webhooka', replyRows: 'Rekordy odpowiedzi',
    checked: 'Sprawdzone ostatnie', accepted: 'Przyjęte przez Resend', delivered: 'Dostarczone', opened: 'Otwarte', clicked: 'Kliknięte', bounced: 'Odbite', complained: 'Skargi',
    recipient: 'Odbiorca', subject: 'Temat', sentAt: 'Wysłano', status: 'Status', opens: 'Otwarcia', clicks: 'Kliknięcia', noHistory: 'Nie znaleziono rekordów outreach_sends.',
    reconciliation: 'Uzgodnienie kolejki', fallback: 'awaryjny schemat', database: 'Dowody bazy danych', provider: 'Dowody Resend',
  },
  ru: {
    eyebrow: 'Монитор доставки Resend', title: 'Проверьте, что действительно было отправлено.',
    subtitle: 'Страница читает журнал outreach_sends, проверяет последние идентификаторы напрямую в Resend, исправляет устаревшие статусы «Одобрено» и показывает данные о доставке, открытиях, кликах, возвратах и ответах.',
    back: 'Назад к монитору аутрича', refresh: 'Синхронизировать Resend', refreshing: 'Синхронизация…', loadError: 'Не удалось загрузить историю доставки.',
    configured: 'Настроено', missing: 'Отсутствует', resendKey: 'API-ключ Resend', webhook: 'Webhook Resend', replyTo: 'Адрес для ответов',
    historicalSends: 'Исторические записи отправки', queueSent: 'Очередь отмечена отправленной', approvedWaiting: 'Одобрено и ожидает', deliveryEvents: 'События webhook', replyRows: 'Записи ответов',
    checked: 'Проверено последних', accepted: 'Принято Resend', delivered: 'Доставлено', opened: 'Открыто', clicked: 'Клики', bounced: 'Возвращено', complained: 'Жалобы',
    recipient: 'Получатель', subject: 'Тема', sentAt: 'Отправлено', status: 'Статус', opens: 'Открытия', clicks: 'Клики', noHistory: 'Записи outreach_sends не найдены.',
    reconciliation: 'Сверка очереди', fallback: 'резерв схемы', database: 'Данные базы', provider: 'Данные Resend',
  },
}

const panel: CSSProperties = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, background: 'rgba(15,23,42,.72)', padding: 18 }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }

export default function OutreachDeliveryPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Language
  const copy = COPY[l]
  const [selftest, setSelftest] = useState<any>(null)
  const [delivery, setDelivery] = useState<any>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [stateResponse, deliveryResponse] = await Promise.all([
        fetch('/api/admin/outreach/selftest', { cache: 'no-store' }),
        fetch('/api/admin/outreach/delivery-check?limit=25', { cache: 'no-store' }),
      ])
      const [state, provider] = await Promise.all([stateResponse.json(), deliveryResponse.json()])
      if (!stateResponse.ok || !state?.ok) throw new Error(state?.error || copy.loadError)
      if (!deliveryResponse.ok || !provider?.ok) throw new Error(provider?.error || copy.loadError)
      setSelftest(state)
      setDelivery(provider)
    } catch (reason: any) {
      setError(reason?.message || copy.loadError)
    } finally {
      setBusy(false)
    }
  }, [copy.loadError])

  useEffect(() => { void load() }, [load])

  const databaseCards = [
    [copy.historicalSends, selftest?.outreachSendsRows ?? 0],
    [copy.queueSent, selftest?.sentQueueRows ?? 0],
    [copy.approvedWaiting, selftest?.approvedDrafts ?? 0],
    [copy.deliveryEvents, selftest?.deliveryEventRows ?? 0],
    [copy.replyRows, selftest?.replyRows ?? 0],
  ]
  const providerCards = [
    [copy.checked, delivery?.checked ?? 0],
    [copy.accepted, delivery?.summary?.sentOrAccepted ?? 0],
    [copy.delivered, delivery?.summary?.delivered ?? 0],
    [copy.opened, delivery?.summary?.opened ?? 0],
    [copy.clicked, delivery?.summary?.clicked ?? 0],
    [copy.bounced, delivery?.summary?.bounced ?? 0],
    [copy.complained, delivery?.summary?.complained ?? 0],
  ]

  return (
    <main style={{ color: 'var(--text-primary)', display: 'grid', gap: 18, paddingBottom: 70 }}>
      <header className="sb-console">
        <span className="sb-eyebrow">📬 {copy.eyebrow}</span>
        <h1 className="sb-h2" style={{ marginTop: 8 }}>{copy.title}</h1>
        <p className="sb-body" style={{ maxWidth: 920 }}>{copy.subtitle}</p>
        <div className="sb-cta-row" style={{ marginTop: 14 }}>
          <button type="button" className="sb-button-primary" disabled={busy} onClick={() => void load()}>{busy ? copy.refreshing : copy.refresh}</button>
          <Link href="/admin/outreach" className="sb-button-secondary">{copy.back}</Link>
        </div>
      </header>

      {error ? <div style={{ ...panel, borderColor: 'rgba(252,165,165,.5)', color: '#fca5a5' }}>{error}</div> : null}

      <section style={panel}>
        <h2 className="sb-h3">{copy.database}</h2>
        <div style={grid}>
          {databaseCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}
        </div>
        <div style={{ ...grid, marginTop: 12 }}>
          <Config label={copy.resendKey} ok={Boolean(selftest?.resendKeyConfigured)} copy={copy} />
          <Config label={copy.webhook} ok={Boolean(selftest?.resendWebhookConfigured)} copy={copy} />
          <Config label={copy.replyTo} ok={Boolean(selftest?.replyToConfigured)} copy={copy} />
        </div>
      </section>

      <section style={panel}>
        <h2 className="sb-h3">{copy.provider}</h2>
        <div style={grid}>
          {providerCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}
        </div>
        <p className="sb-caption" style={{ marginTop: 12 }}>
          {copy.reconciliation}: {delivery?.summary?.queueReconciled ?? 0} · {copy.fallback}: {delivery?.summary?.statusOnlyFallbacks ?? 0}
        </p>
      </section>

      <section style={panel}>
        {!busy && Array.isArray(delivery?.results) && delivery.results.length === 0 ? <p className="sb-body">{copy.noHistory}</p> : null}
        <div style={{ display: 'grid', gap: 10 }}>
          {(delivery?.results || []).map((row: any) => (
            <article key={row.outreachSendId} style={{ borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: '#fff' }}>{row.subject || row.resendId || row.outreachSendId}</strong>
                  <p className="sb-caption" style={{ margin: '5px 0 0' }}>{copy.recipient}: {row.toEmail || '—'}</p>
                  <p className="sb-caption" style={{ margin: '3px 0 0' }}>{copy.sentAt}: {row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-block', border: '1px solid rgba(125,211,252,.45)', borderRadius: 999, padding: '4px 10px', color: row.status === 'bounced' || row.status === 'complained' ? '#fca5a5' : '#7dd3fc', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{row.status || 'unknown'}</span>
                  <p className="sb-caption" style={{ margin: '6px 0 0' }}>{copy.opens}: {row.openCount || 0} · {copy.clicks}: {row.clickCount || 0}</p>
                </div>
              </div>
              {row.error ? <p className="sb-caption" style={{ color: '#fca5a5', marginTop: 7 }}>{row.error}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 13, background: 'rgba(2,6,23,.45)' }}><b style={{ display: 'block', color: '#fff', fontSize: 25 }}>{value ?? 0}</b><span className="sb-caption">{label}</span></div>
}

function Config({ label, ok, copy }: { label: string; ok: boolean; copy: Copy }) {
  return <div style={{ border: `1px solid ${ok ? 'rgba(134,239,172,.35)' : 'rgba(252,165,165,.35)'}`, borderRadius: 14, padding: 13 }}><b style={{ display: 'block', color: ok ? '#86efac' : '#fca5a5' }}>{ok ? copy.configured : copy.missing}</b><span className="sb-caption">{label}</span></div>
}
