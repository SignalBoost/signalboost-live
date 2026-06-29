'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type OutreachRow = {
  id: string
  business_name: string
  business_url: string
  contact_email?: string | null
  source_platform: string
  status: string
  created_at: string
  analyzer_summary?: any
  business_model_profile?: any
  predictive_needs?: any
  outreach_message?: string
  website_json?: any
  review_strategy?: any
  social_plan?: any
  promo_plan?: any
}

type AdmData = {
  metrics: Record<string, any>
  recentOutreach: OutreachRow[]
  recentAiTasks: any[]
  recentSecurityEvents: any[]
  hmi: { summary: string; nextActions: string[] }
}

type CopyValue = string | ((s: string) => string)
type CopyDict = Record<string, CopyValue>

/** Resolve a COPY value — call it if it's a function, return it directly if it's a string. */
function t$(v: CopyValue, arg?: string): string {
  if (typeof v === 'function') return v(arg ?? '')
  return v
}

const COPY: Record<string, CopyDict> = {
  en: {
    eyebrow: 'ADM Console',
    heading: 'Dashboards → Security Logs → Outreach Control → Predictive Insights.',
    defaultSummary: 'AI outreach command center with human approval, predictive needs, and security visibility.',
    syncDigits: 'Sync Digits',
    enablePanic: 'Enable Panic Switch',
    disablePanic: 'Disable Panic Switch',
    pending: 'Pending',
    approved: 'Approved',
    sent: 'Sent',
    sends24h: '24h Sends',
    securityEyebrow: 'Security Logs',
    securityHeading: 'Safety before scale.',
    securityEvents: '24h events',
    recentSecurityEvents: 'Recent Security Events',
    outreachEyebrow: 'Outreach Control',
    analyzeHeading: 'Analyze a business.',
    analyzeHint: 'AI suggestion: start with businesses that show urgency but weak proof.',
    businessNamePlaceholder: 'Business name',
    urlPlaceholder: 'Public website or social URL',
    generateBtn: 'Generate Assets + Queue',
    approvalQueue: 'Approval Queue',
    generatedAssets: 'Generated Assets',
    approveBtn: 'Approve',
    rejectBtn: 'Reject',
    analyzer: 'Analyzer',
    profiler: 'Profiler',
    predictive: 'Predictive Intelligence',
    reviewStrategy: 'Review Strategy',
    socialPlan: 'Social Plan',
    promoCampaign: 'Promo Campaign',
    aiFeedbackTitle: 'AI feedback',
    aiFeedbackBody: 'This campaign looks strong for urgency, but you could add a testimonial before sending.',
    outreachMessage: 'Outreach Message',
    emailPlaceholder: 'Optional email recipient',
    sendNow: 'Send Now',
    noRecords: 'No outreach records yet.',
    predictiveInsights: 'Predictive Insights',
    aiMonitor: 'AI Behavior Monitor',
    loading: 'Loading ADM Console...',
    panicEnabled: 'Panic switch enabled.',
    panicDisabled: 'Panic switch disabled.',
    settingFailed: 'Setting update failed',
    digitsSynced: 'Digits sync processed',
    partnersLabel: 'partners.',
    digitsFailed: 'Digits sync failed',
    analyzed: 'Business analyzed and queued.',
    analysisFailed: 'Analysis failed',
    sendRecorded: 'Outreach send recorded.',
    sendFailed: 'Send failed',
    updateFailed: 'Update failed',
    outreachLabel: (s: string) => `Outreach ${s}.`,
  },
  es: {
    eyebrow: 'Consola ADM',
    heading: 'Paneles → Registros de seguridad → Control de alcance → Perspectivas predictivas.',
    defaultSummary: 'Centro de comando de alcance con IA, aprobación humana, necesidades predictivas y visibilidad de seguridad.',
    syncDigits: 'Sincronizar Digits',
    enablePanic: 'Activar interruptor de pánico',
    disablePanic: 'Desactivar interruptor de pánico',
    pending: 'Pendiente',
    approved: 'Aprobado',
    sent: 'Enviado',
    sends24h: 'Envíos 24h',
    securityEyebrow: 'Registros de seguridad',
    securityHeading: 'Seguridad antes de escalar.',
    securityEvents: 'Eventos 24h',
    recentSecurityEvents: 'Eventos de seguridad recientes',
    outreachEyebrow: 'Control de alcance',
    analyzeHeading: 'Analizar un negocio.',
    analyzeHint: 'Sugerencia IA: empieza con negocios que muestren urgencia pero poca prueba.',
    businessNamePlaceholder: 'Nombre del negocio',
    urlPlaceholder: 'URL pública del sitio web o red social',
    generateBtn: 'Generar activos + Cola',
    approvalQueue: 'Cola de aprobación',
    generatedAssets: 'Activos generados',
    approveBtn: 'Aprobar',
    rejectBtn: 'Rechazar',
    analyzer: 'Analizador',
    profiler: 'Perfilador',
    predictive: 'Inteligencia predictiva',
    reviewStrategy: 'Estrategia de reseñas',
    socialPlan: 'Plan social',
    promoCampaign: 'Campaña promocional',
    aiFeedbackTitle: 'Retroalimentación IA',
    aiFeedbackBody: 'Esta campaña es sólida en urgencia, pero podrías añadir un testimonio antes de enviar.',
    outreachMessage: 'Mensaje de alcance',
    emailPlaceholder: 'Destinatario de correo (opcional)',
    sendNow: 'Enviar ahora',
    noRecords: 'Aún no hay registros de alcance.',
    predictiveInsights: 'Perspectivas predictivas',
    aiMonitor: 'Monitor de comportamiento IA',
    loading: 'Cargando consola ADM...',
    panicEnabled: 'Interruptor de pánico activado.',
    panicDisabled: 'Interruptor de pánico desactivado.',
    settingFailed: 'Error al actualizar la configuración',
    digitsSynced: 'Sincronización Digits procesó',
    partnersLabel: 'socios.',
    digitsFailed: 'Error en sincronización Digits',
    analyzed: 'Negocio analizado y en cola.',
    analysisFailed: 'Error en el análisis',
    sendRecorded: 'Envío de alcance registrado.',
    sendFailed: 'Error al enviar',
    updateFailed: 'Error al actualizar',
    outreachLabel: (s: string) => `Alcance ${s}.`,
  },
  pt: {
    eyebrow: 'Console ADM',
    heading: 'Painéis → Registros de segurança → Controle de alcance → Perspectivas preditivas.',
    defaultSummary: 'Centro de comando de alcance com IA, aprovação humana, necessidades preditivas e visibilidade de segurança.',
    syncDigits: 'Sincronizar Digits',
    enablePanic: 'Ativar interruptor de pânico',
    disablePanic: 'Desativar interruptor de pânico',
    pending: 'Pendente',
    approved: 'Aprovado',
    sent: 'Enviado',
    sends24h: 'Envios 24h',
    securityEyebrow: 'Registros de segurança',
    securityHeading: 'Segurança antes de escalar.',
    securityEvents: 'Eventos 24h',
    recentSecurityEvents: 'Eventos de segurança recentes',
    outreachEyebrow: 'Controle de alcance',
    analyzeHeading: 'Analisar um negócio.',
    analyzeHint: 'Sugestão IA: comece com negócios que mostrem urgência mas pouca prova.',
    businessNamePlaceholder: 'Nome do negócio',
    urlPlaceholder: 'URL pública do site ou rede social',
    generateBtn: 'Gerar ativos + Fila',
    approvalQueue: 'Fila de aprovação',
    generatedAssets: 'Ativos gerados',
    approveBtn: 'Aprovar',
    rejectBtn: 'Rejeitar',
    analyzer: 'Analisador',
    profiler: 'Perfilador',
    predictive: 'Inteligência preditiva',
    reviewStrategy: 'Estratégia de avaliações',
    socialPlan: 'Plano social',
    promoCampaign: 'Campanha promocional',
    aiFeedbackTitle: 'Feedback IA',
    aiFeedbackBody: 'Esta campanha é forte em urgência, mas você poderia adicionar um depoimento antes de enviar.',
    outreachMessage: 'Mensagem de alcance',
    emailPlaceholder: 'Destinatário de e-mail (opcional)',
    sendNow: 'Enviar agora',
    noRecords: 'Nenhum registro de alcance ainda.',
    predictiveInsights: 'Perspectivas preditivas',
    aiMonitor: 'Monitor de comportamento IA',
    loading: 'Carregando console ADM...',
    panicEnabled: 'Interruptor de pânico ativado.',
    panicDisabled: 'Interruptor de pânico desativado.',
    settingFailed: 'Falha ao atualizar configuração',
    digitsSynced: 'Sincronização Digits processou',
    partnersLabel: 'parceiros.',
    digitsFailed: 'Falha na sincronização Digits',
    analyzed: 'Negócio analisado e na fila.',
    analysisFailed: 'Falha na análise',
    sendRecorded: 'Envio de alcance registrado.',
    sendFailed: 'Falha ao enviar',
    updateFailed: 'Falha ao atualizar',
    outreachLabel: (s: string) => `Alcance ${s}.`,
  },
  pl: {
    eyebrow: 'Konsola ADM',
    heading: 'Pulpity → Dzienniki bezpieczeństwa → Kontrola zasięgu → Prognostyczne spostrzeżenia.',
    defaultSummary: 'Centrum dowodzenia zasięgiem AI z ludzką akceptacją, prognozowaniem potrzeb i widocznością bezpieczeństwa.',
    syncDigits: 'Synchronizuj Digits',
    enablePanic: 'Włącz przełącznik paniki',
    disablePanic: 'Wyłącz przełącznik paniki',
    pending: 'Oczekujące',
    approved: 'Zatwierdzone',
    sent: 'Wysłane',
    sends24h: 'Wysyłki 24h',
    securityEyebrow: 'Dzienniki bezpieczeństwa',
    securityHeading: 'Bezpieczeństwo przed skalowaniem.',
    securityEvents: 'Zdarzenia 24h',
    recentSecurityEvents: 'Ostatnie zdarzenia bezpieczeństwa',
    outreachEyebrow: 'Kontrola zasięgu',
    analyzeHeading: 'Analizuj firmę.',
    analyzeHint: 'Sugestia AI: zacznij od firm wykazujących pilność, ale słabe dowody.',
    businessNamePlaceholder: 'Nazwa firmy',
    urlPlaceholder: 'Publiczny adres strony lub profilu społecznościowego',
    generateBtn: 'Generuj zasoby + Kolejka',
    approvalQueue: 'Kolejka zatwierdzeń',
    generatedAssets: 'Wygenerowane zasoby',
    approveBtn: 'Zatwierdź',
    rejectBtn: 'Odrzuć',
    analyzer: 'Analizator',
    profiler: 'Profiler',
    predictive: 'Inteligencja prognostyczna',
    reviewStrategy: 'Strategia recenzji',
    socialPlan: 'Plan społecznościowy',
    promoCampaign: 'Kampania promocyjna',
    aiFeedbackTitle: 'Informacja zwrotna AI',
    aiFeedbackBody: 'Ta kampania jest mocna pod względem pilności, ale możesz dodać referencję przed wysłaniem.',
    outreachMessage: 'Wiadomość zasięgowa',
    emailPlaceholder: 'Opcjonalny odbiorca e-mail',
    sendNow: 'Wyślij teraz',
    noRecords: 'Brak rekordów zasięgu.',
    predictiveInsights: 'Prognostyczne spostrzeżenia',
    aiMonitor: 'Monitor zachowania AI',
    loading: 'Ładowanie konsoli ADM...',
    panicEnabled: 'Przełącznik paniki włączony.',
    panicDisabled: 'Przełącznik paniki wyłączony.',
    settingFailed: 'Błąd aktualizacji ustawienia',
    digitsSynced: 'Synchronizacja Digits przetworzyła',
    partnersLabel: 'partnerów.',
    digitsFailed: 'Błąd synchronizacji Digits',
    analyzed: 'Firma przeanalizowana i w kolejce.',
    analysisFailed: 'Błąd analizy',
    sendRecorded: 'Wysyłka zasięgowa zarejestrowana.',
    sendFailed: 'Błąd wysyłki',
    updateFailed: 'Błąd aktualizacji',
    outreachLabel: (s: string) => `Zasięg ${s}.`,
  },
  ru: {
    eyebrow: 'Консоль ADM',
    heading: 'Панели → Журналы безопасности → Управление охватом → Прогностические данные.',
    defaultSummary: 'Командный центр охвата с ИИ, одобрением человека, прогнозированием потребностей и контролем безопасности.',
    syncDigits: 'Синхронизировать Digits',
    enablePanic: 'Включить аварийный переключатель',
    disablePanic: 'Отключить аварийный переключатель',
    pending: 'Ожидает',
    approved: 'Одобрено',
    sent: 'Отправлено',
    sends24h: 'Отправки за 24ч',
    securityEyebrow: 'Журналы безопасности',
    securityHeading: 'Безопасность прежде масштабирования.',
    securityEvents: 'События за 24ч',
    recentSecurityEvents: 'Последние события безопасности',
    outreachEyebrow: 'Управление охватом',
    analyzeHeading: 'Анализ бизнеса.',
    analyzeHint: 'Подсказка ИИ: начните с бизнесов, проявляющих срочность, но со слабыми доказательствами.',
    businessNamePlaceholder: 'Название бизнеса',
    urlPlaceholder: 'Публичный URL сайта или соцсети',
    generateBtn: 'Создать ресурсы + Очередь',
    approvalQueue: 'Очередь одобрений',
    generatedAssets: 'Созданные ресурсы',
    approveBtn: 'Одобрить',
    rejectBtn: 'Отклонить',
    analyzer: 'Анализатор',
    profiler: 'Профилировщик',
    predictive: 'Прогностический интеллект',
    reviewStrategy: 'Стратегия отзывов',
    socialPlan: 'Социальный план',
    promoCampaign: 'Промо-кампания',
    aiFeedbackTitle: 'Обратная связь ИИ',
    aiFeedbackBody: 'Кампания сильна по срочности, но стоит добавить отзыв перед отправкой.',
    outreachMessage: 'Сообщение охвата',
    emailPlaceholder: 'Необязательный получатель e-mail',
    sendNow: 'Отправить сейчас',
    noRecords: 'Записей охвата пока нет.',
    predictiveInsights: 'Прогностические данные',
    aiMonitor: 'Монитор поведения ИИ',
    loading: 'Загрузка консоли ADM...',
    panicEnabled: 'Аварийный переключатель включён.',
    panicDisabled: 'Аварийный переключатель отключён.',
    settingFailed: 'Ошибка обновления настройки',
    digitsSynced: 'Синхронизация Digits обработала',
    partnersLabel: 'партнёров.',
    digitsFailed: 'Ошибка синхронизации Digits',
    analyzed: 'Бизнес проанализирован и в очереди.',
    analysisFailed: 'Ошибка анализа',
    sendRecorded: 'Отправка охвата зарегистрирована.',
    sendFailed: 'Ошибка отправки',
    updateFailed: 'Ошибка обновления',
    outreachLabel: (s: string) => `Охват ${s}.`,
  },
}

const statusColors: Record<string, { border: string; background: string; color: string }> = {
  pending:  { border: 'rgba(245,158,11,0.4)',  background: 'rgba(245,158,11,0.1)',  color: '#fde68a' },
  approved: { border: 'rgba(16,185,129,0.4)',  background: 'rgba(16,185,129,0.1)',  color: '#6ee7b7' },
  sent:     { border: 'rgba(59,130,246,0.4)',  background: 'rgba(59,130,246,0.1)',  color: '#93c5fd' },
  rejected: { border: 'rgba(239,68,68,0.4)',   background: 'rgba(239,68,68,0.1)',   color: '#fca5a5' },
}

export default function AdmConsoleClient() {
  const { lang: activeLang } = useI18n()
  const t = COPY[(activeLang in COPY ? activeLang : 'en')]

  const [data, setData] = useState<AdmData | null>(null)
  const [selected, setSelected] = useState<OutreachRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [sendEmail, setSendEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/adm', { cache: 'no-store' })
    const json = await res.json()
    if (res.ok) {
      setData(json)
      setSelected((current) => current ? json.recentOutreach.find((row: OutreachRow) => row.id === current.id) || current : json.recentOutreach[0] || null)
    } else {
      setMessage(json.error || 'Failed to load ADM Console')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setSendEmail(selected?.contact_email || '') }, [selected])

  const predictedNeeds = useMemo(() => {
    const needs = data?.recentOutreach.flatMap(row => row.predictive_needs?.likely_next_needs || []) || []
    return needs.reduce((acc: Record<string, number>, item: any) => {
      acc[item.need] = (acc[item.need] || 0) + 1
      return acc
    }, {})
  }, [data])

  async function patchOutreach(id: string, status: string) {
    setBusy(true)
    const res = await fetch('/api/outreach/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const json = await res.json()
    setMessage(res.ok ? t$(t.outreachLabel, status) : json.error || t$(t.updateFailed))
    setBusy(false)
    await load()
  }

  async function sendSelected() {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_id: selected.id, channel: sendEmail ? 'email' : 'manual', to_email: sendEmail || undefined }),
    })
    const json = await res.json()
    setMessage(res.ok ? (json.emailed ? `Emailed to ${json.recipient || sendEmail}` : 'Recorded only — no email was sent') : json.error || t$(t.sendFailed))
    setBusy(false)
    await load()
  }

  async function runManualAnalysis() {
    setBusy(true)
    const res = await fetch('/api/outreach/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_url: sourceUrl, business_name: businessName, source_platform: 'manual' }),
    })
    const json = await res.json()
    setMessage(res.ok ? t$(t.analyzed) : json.error || t$(t.analysisFailed))
    setBusy(false)
    if (res.ok) { setSourceUrl(''); setBusinessName('') }
    await load()
  }

  async function syncDigits() {
    setBusy(true)
    const res = await fetch('/api/outreach/digits/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    })
    const json = await res.json()
    setMessage(res.ok ? `${t$(t.digitsSynced)} ${json.processed || 0} ${t$(t.partnersLabel)}` : json.error || t$(t.digitsFailed))
    setBusy(false)
    await load()
  }

  async function togglePanic(value: boolean) {
    setBusy(true)
    const res = await fetch('/api/admin/adm', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_sending_disabled: value }),
    })
    const json = await res.json()
    setMessage(res.ok ? (value ? t$(t.panicEnabled) : t$(t.panicDisabled)) : json.error || t$(t.settingFailed))
    setBusy(false)
    await load()
  }

  if (loading) return (
    <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, color: 'rgba(255,255,255,0.6)' }}>
      {t$(t.loading)}
    </div>
  )

  const dashboardMetrics = [
    [t$(t.pending),  data?.metrics.pending],
    [t$(t.approved), data?.metrics.approved],
    [t$(t.sent),     data?.metrics.sent],
    [t$(t.sends24h), `${data?.metrics.sendLimit?.count || 0}/${data?.metrics.sendLimit?.limit || 50}`],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(160deg,rgba(15,23,42,0.92),rgba(3,7,18,0.96))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <span className="sb-eyebrow">{t$(t.eyebrow)}</span>
            <h1 className="sb-h2" style={{ marginTop: 12 }}>{t$(t.heading)}</h1>
            <p className="sb-body" style={{ maxWidth: 680 }}>{data?.hmi.summary || t$(t.defaultSummary)}</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button disabled={busy} onClick={syncDigits} className="sb-button-secondary" style={{ opacity: busy ? 0.5 : 1 }}>{t$(t.syncDigits)}</button>
            <button disabled={busy} onClick={() => togglePanic(!data?.metrics.panicSwitch)} className="sb-button-primary" style={{ border: 'none', opacity: busy ? 0.5 : 1 }}>
              {data?.metrics.panicSwitch ? t$(t.disablePanic) : t$(t.enablePanic)}
            </button>
          </div>
        </div>
      </section>

      {/* Message banner */}
      {message && (
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 20px', fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
          {message}
        </div>
      )}

      {/* Metric cards */}
      <section aria-label="Dashboards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16 }}>
        {dashboardMetrics.map(([label, value]) => (
          <div key={String(label)} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', margin: 0 }}>{label}</p>
            <p style={{ marginTop: 8, fontSize: 30, fontWeight: 900, color: '#fff', margin: '8px 0 0' }}>{value ?? 0}</p>
          </div>
        ))}
      </section>

      {/* Security logs */}
      <section aria-label="Security Logs" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span className="sb-eyebrow">{t$(t.securityEyebrow)}</span>
            <h2 className="sb-h3" style={{ marginTop: 8 }}>{t$(t.securityHeading)}</h2>
          </div>
          <span style={{ borderRadius: 999, border: '1px solid rgba(26,240,255,0.3)', padding: '4px 12px', fontSize: 12, color: 'rgba(26,240,255,0.85)' }}>
            {t$(t.securityEvents)}: {data?.metrics.security24h ?? 0}
          </span>
        </div>
        <InfoCard title={t$(t.recentSecurityEvents)} data={data?.recentSecurityEvents.slice(0, 5)} />
      </section>

      {/* Outreach control */}
      <section aria-label="Outreach Control" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Analyze form */}
          <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
            <span className="sb-eyebrow">{t$(t.outreachEyebrow)}</span>
            <h2 className="sb-h3" style={{ marginTop: 8 }}>{t$(t.analyzeHeading)}</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>{t$(t.analyzeHint)}</p>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={t$(t.businessNamePlaceholder)} className="sb-input" style={{ width: '100%', borderRadius: 12, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder={t$(t.urlPlaceholder)} className="sb-input" style={{ width: '100%', borderRadius: 12, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
              <button disabled={busy || !sourceUrl} onClick={runManualAnalysis} className="sb-button-primary" style={{ width: '100%', border: 'none', opacity: busy || !sourceUrl ? 0.5 : 1 }}>{t$(t.generateBtn)}</button>
            </div>
          </div>

          {/* Approval queue */}
          <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
            <h3 className="sb-h3">{t$(t.approvalQueue)}</h3>
            <div style={{ marginTop: 16, maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {data?.recentOutreach.map(row => {
                const isSelected = selected?.id === row.id
                return (
                  <button key={row.id} onClick={() => setSelected(row)} style={{ width: '100%', borderRadius: 12, border: isSelected ? '1px solid rgba(255,195,0,0.5)' : '1px solid rgba(255,255,255,0.08)', background: isSelected ? 'rgba(255,195,0,0.08)' : 'rgba(0,0,0,0.2)', padding: 12, textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontWeight: 600, color: '#fff', margin: 0, fontSize: 14 }}>{row.business_name}</p>
                      {(() => {
                        const sc = statusColors[row.status] || { border: 'rgba(100,116,139,0.5)', background: 'transparent', color: 'rgba(255,255,255,0.5)' }
                        return (
                          <span style={{ borderRadius: 999, border: `1px solid ${sc.border}`, background: sc.background, color: sc.color, padding: '2px 8px', fontSize: 11 }}>
                            {row.status}
                          </span>
                        )
                      })()}
                    </div>
                    <p style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.source_platform} · {row.business_url}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right column — detail panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selected ? (
            <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <span className="sb-eyebrow">{t$(t.generatedAssets)}</span>
                  <h3 style={{ marginTop: 8, fontSize: 20, fontWeight: 600, color: '#fff' }}>{selected.business_name}</h3>
                  <p style={{ marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>{selected.business_url}</p>
                  <p style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: selected.contact_email ? '#1af0ff' : '#f59e0b' }}>{selected.contact_email ? `Will send to: ${selected.contact_email}` : 'No recipient email found — this draft cannot be sent.'}</p>
                  <p style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{selected.analyzer_summary?.hmi_summary}</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button disabled={busy || selected.status === 'approved'} onClick={() => patchOutreach(selected.id, 'approved')} className="sb-button-primary" style={{ border: 'none', opacity: busy || selected.status === 'approved' ? 0.5 : 1 }}>{t$(t.approveBtn)}</button>
                  <button disabled={busy || selected.status === 'rejected'} onClick={() => patchOutreach(selected.id, 'rejected')} style={{ borderRadius: 999, background: '#dc2626', padding: '8px 16px', fontSize: 14, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', opacity: busy || selected.status === 'rejected' ? 0.5 : 1 }}>{t$(t.rejectBtn)}</button>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
                <InfoCard title={t$(t.analyzer)}       data={selected.analyzer_summary} />
                <InfoCard title={t$(t.profiler)}        data={selected.business_model_profile} />
                <InfoCard title={t$(t.predictive)}      data={selected.predictive_needs} />
                <InfoCard title={t$(t.reviewStrategy)}  data={selected.review_strategy} />
                <InfoCard title={t$(t.socialPlan)}      data={selected.social_plan} />
                <InfoCard title={t$(t.promoCampaign)}   data={selected.promo_plan} />
              </div>

              {/* AI feedback */}
              <div className="sb-ai-feedback" style={{ marginTop: 20 }}>
                <strong>{t$(t.aiFeedbackTitle)}</strong>
                <p>{t$(t.aiFeedbackBody)}</p>
              </div>

              {/* Outreach message + send */}
              <div style={{ marginTop: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: 16 }}>
                <h4 style={{ fontWeight: 600, color: '#fff', margin: 0 }}>{t$(t.outreachMessage)}</h4>
                <p style={{ marginTop: 12, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>{selected.outreach_message}</p>
                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder={t$(t.emailPlaceholder)} className="sb-input" style={{ flex: 1, minWidth: 180, borderRadius: 12, padding: '10px 12px', fontSize: 14 }} />
                  <button disabled={busy || selected.status !== 'approved'} onClick={sendSelected} className="sb-button-secondary" style={{ opacity: busy || selected.status !== 'approved' ? 0.5 : 1 }}>{t$(t.sendNow)}</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 32, color: 'rgba(255,255,255,0.4)' }}>
              {t$(t.noRecords)}
            </div>
          )}
        </div>
      </section>

      {/* Predictive insights */}
      <section aria-label="Predictive Insights" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        <InfoCard title={t$(t.predictiveInsights)} data={predictedNeeds} />
        <InfoCard title={t$(t.aiMonitor)}          data={data?.recentAiTasks.slice(0, 5)} />
      </section>
    </div>
  )
}

function InfoCard({ title, data }: { title: string; data: any }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: 16 }}>
      <h4 style={{ fontWeight: 600, color: '#fff', margin: 0 }}>{title}</h4>
      <pre style={{ marginTop: 12, maxHeight: 288, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.5)' }}>
        {JSON.stringify(data || {}, null, 2)}
      </pre>
    </div>
  )
}
