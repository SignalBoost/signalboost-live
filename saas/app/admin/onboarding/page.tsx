'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type AnalyticsEvent = {
  event_id: string
  user_id: string | null
  step_name: string | null
  action: string | null
  timestamp: string | null
  device_type: string | null
  browser: string | null
}

type UserProfile = {
  user_id: string
  role: string | null
  it_level: string | null
  tone_preference: string | null
  consent_ai_training: boolean | null
  onboarding_completed: boolean | null
  onboarding_completed_at: string | null
}

type ErrorLog = {
  error_id: string
  error_type: string | null
  timestamp: string | null
  device_type: string | null
}

type Feedback = {
  feedback_id: string
  response: string | null
  timestamp: string | null
}

const COPY = {
  en: {
    pill: uiCopy('u_6332e49d5fab708e'),
    title: uiCopy('u_5c7e5e748eef6e87'),
    subtitle: uiCopy('u_2e6dd41395393a11'),
    loading: uiCopy('u_eebfd7706acfab0c'),
    eventsAnalyzed: (n: number) => `${n} events analyzed`,
    completionRate: uiCopy('u_01898fb46b162deb'),
    completionSub: (done: number, total: number) => `${done} completed / ${total} profiled`,
    consentOptIn: uiCopy('u_6c6c04190a9c4e40'),
    consentSub: (n: number) => `${n} training consents captured`,
    skips: uiCopy('u_9b865c6ef2913603'),
    skipsSub: uiCopy('u_5726fbd871080c8b'),
    errors: uiCopy('u_70c0ac905f601d02'),
    errorsSub: uiCopy('u_8ec2f3ad5d9f29de'),
    funnelTitle: uiCopy('u_e99e0653ba6e3aa3'),
    views: uiCopy('u_aee9bc9b20c01086'),
    toneTitle: uiCopy('u_6c7fa35e5e0ecc8f'),
    monitoringTitle: uiCopy('u_6ff7fd175144e798'),
    monitoringItems: [
      uiCopy('u_6affe4796769ce92'),
      uiCopy('u_b5e91bc0aa062393'),
      uiCopy('u_4b0e6e2ed4d016f3'),
      uiCopy('u_80e7a58a013b2c09'),
      uiCopy('u_0a119ab1a437753f'),
    ],
    deviceTitle: uiCopy('u_a93748e48712ebec'),
    feedbackTitle: uiCopy('u_2a98eb2eae746356'),
    qaTitle: uiCopy('u_f2967b85feeb57bf'),
    qaItems: [
      uiCopy('u_e102a2e0da357eaa'),
      uiCopy('u_98e0dd453081b673'),
      uiCopy('u_fe74f5ee2496c2e0'),
      uiCopy('u_6ffa9f0286db8e39'),
      uiCopy('u_27e2007896f5627d'),
      uiCopy('u_80d59b0762725663'),
    ],
    devTitle: uiCopy('u_62bfb9c32dbde2cd'),
    devItems: [
      uiCopy('u_8eec1b192768c8c4'),
      uiCopy('u_8e33ef47c4b0991f'),
      uiCopy('u_285f9a622d2b5f05'),
      uiCopy('u_14a48920f82d1286'),
      uiCopy('u_d1ff5bf25e1a8786'),
    ],
    recentTitle: uiCopy('u_444fe86a1cb24ae0'),
    colStep: uiCopy('u_0e5afc7e8c7542e5'),
    colAction: uiCopy('u_481ea8b25a1240fa'),
    colDevice: uiCopy('u_053ee3f798480a34'),
    colBrowser: uiCopy('u_738511273250d9e1'),
    colTimestamp: uiCopy('u_011e533d920ecf7a'),
    noEvents: uiCopy('u_1d6474d6b360fc97'),
    abTitle: uiCopy('u_81ec5b6500caa491'),
    abDesc: (n: number) => `Use variant tags in onboarding_analytics.action values such as viewed_variant_a or viewed_variant_b, then compare completion, consent opt-in, and feedback response rates in this dashboard. Confirmation completions tracked: ${n}`,
  },
  es: {
    pill: 'Análisis de incorporación en vivo',
    title: 'Centro de mando de incorporación',
    subtitle: 'Tasa de finalización, abandono del embudo, consentimiento, tono, QA, retroalimentación.',
    loading: 'Cargando datos…',
    eventsAnalyzed: (n: number) => `${n} eventos analizados`,
    completionRate: 'Tasa de finalización',
    completionSub: (done: number, total: number) => `${done} completados / ${total} perfilados`,
    consentOptIn: 'Consentimiento',
    consentSub: (n: number) => `${n} consentimientos de entrenamiento capturados`,
    skips: 'Omisiones',
    skipsSub: 'Eventos del botón omitir en el flujo',
    errors: 'Errores',
    errorsSub: 'Errores recientes de cliente/servidor',
    funnelTitle: 'Abandono del embudo por paso',
    views: 'vistas',
    toneTitle: 'Distribución de tono',
    monitoringTitle: 'Configuración de monitoreo',
    monitoringItems: [
      'Seguimiento de análisis: los eventos se envían a la tabla de Supabase, Google Analytics, Mixpanel y LogRocket.',
      'Registro de errores: las excepciones se reenvían a Sentry y LogRocket cuando están configurados.',
      'Monitoreo de rendimiento: valide el rendimiento móvil de Lighthouse y compare marcas de tiempo.',
      'Bucle de retroalimentación: la distribución sí/no aparece a continuación.',
      'Cumplimiento y privacidad: el consentimiento está desmarcado por defecto y se registra con marca de tiempo.',
    ],
    deviceTitle: 'Distribución de dispositivos',
    feedbackTitle: 'Retroalimentación',
    qaTitle: 'Script de QA para el usuario',
    qaItems: [
      'Verificar que el botón omitir aparezca en cada paso y redirija al panel.',
      'Confirmar que las selecciones de perfil persisten tras recargar.',
      'Confirmar que el consentimiento está desmarcado por defecto.',
      'Verificar que la preferencia de tono aparezca en el resumen de confirmación.',
      'Probar la capacidad de respuesta en anchos móvil, tableta y escritorio.',
      'Ejecutar pruebas de rendimiento en Chrome, Safari, Firefox y Edge.',
    ],
    devTitle: 'Lista de verificación del desarrollador',
    devItems: [
      'Unidades responsivas, cuadrículas fluidas y controles táctiles de 44px presentes.',
      'Paneles de glassmorphism y acentos de neón coinciden con el lenguaje visual de SignalBoost.',
      'Lógica de omisión, upsert de perfil, manejo de consentimiento y persistencia de tono sin errores.',
      'Apprentice Workshop adapta el contenido según el nivel de TI almacenado.',
      'Foco de teclado, etiquetas semánticas, contraste de color y desplazamiento de diseño verificados.',
    ],
    recentTitle: 'Eventos de incorporación recientes',
    colStep: 'Paso',
    colAction: 'Acción',
    colDevice: 'Dispositivo',
    colBrowser: 'Navegador',
    colTimestamp: 'Marca de tiempo',
    noEvents: 'Aún no se encontraron eventos de incorporación.',
    abTitle: 'Diseño de pruebas A/B',
    abDesc: (n: number) => `Use etiquetas de variante como viewed_variant_a o viewed_variant_b y compare tasas de finalización, consentimiento y retroalimentación. Confirmaciones rastreadas: ${n}`,
  },
  pt: {
    pill: 'Análise de integração ao vivo',
    title: 'Centro de comando de integração',
    subtitle: 'Taxa de conclusão, abandono do funil, consentimento, tom, QA, feedback.',
    loading: 'Carregando dados…',
    eventsAnalyzed: (n: number) => `${n} eventos analisados`,
    completionRate: 'Taxa de conclusão',
    completionSub: (done: number, total: number) => `${done} concluídos / ${total} perfilados`,
    consentOptIn: 'Consentimento',
    consentSub: (n: number) => `${n} consentimentos de treinamento capturados`,
    skips: 'Pulos',
    skipsSub: 'Eventos do botão pular no fluxo',
    errors: 'Erros',
    errorsSub: 'Erros recentes de cliente/servidor',
    funnelTitle: 'Abandono do funil por etapa',
    views: 'visualizações',
    toneTitle: 'Distribuição de tom',
    monitoringTitle: 'Configuração de monitoramento',
    monitoringItems: [
      'Rastreamento de análises: eventos enviados à tabela Supabase, Google Analytics, Mixpanel e LogRocket.',
      'Registro de erros: exceções encaminhadas ao Sentry e LogRocket quando configurados.',
      'Monitoramento de desempenho: valide o desempenho móvel do Lighthouse e compare timestamps.',
      'Loop de feedback: distribuição sim/não exibida abaixo.',
      'Conformidade e privacidade: consentimento desmarcado por padrão e registrado com timestamp.',
    ],
    deviceTitle: 'Distribuição de dispositivos',
    feedbackTitle: 'Feedback',
    qaTitle: 'Script de QA para o usuário',
    qaItems: [
      'Verificar se o botão pular aparece em cada etapa e redireciona ao painel.',
      'Confirmar que as seleções de perfil persistem após recarregar.',
      'Confirmar que o consentimento está desmarcado por padrão.',
      'Verificar que a preferência de tom aparece no resumo de confirmação.',
      'Testar responsividade em larguras móvel, tablet e desktop.',
      'Executar testes de desempenho no Chrome, Safari, Firefox e Edge.',
    ],
    devTitle: 'Lista de verificação do desenvolvedor',
    devItems: [
      'Unidades responsivas, grades fluidas e controles táteis de 44px presentes.',
      'Painéis de glassmorphism e acentos neon correspondem à linguagem visual do SignalBoost.',
      'Lógica de pulo, upsert de perfil, tratamento de consentimento e persistência de tom sem erros.',
      'Apprentice Workshop adapta o conteúdo com base no nível de TI armazenado.',
      'Foco de teclado, rótulos semânticos, contraste de cor e deslocamento de layout verificados.',
    ],
    recentTitle: 'Eventos de integração recentes',
    colStep: 'Etapa',
    colAction: 'Ação',
    colDevice: 'Dispositivo',
    colBrowser: 'Navegador',
    colTimestamp: 'Timestamp',
    noEvents: 'Nenhum evento de integração encontrado ainda.',
    abTitle: 'Layout de testes A/B',
    abDesc: (n: number) => `Use tags de variante como viewed_variant_a ou viewed_variant_b e compare taxas de conclusão, consentimento e feedback. Confirmações rastreadas: ${n}`,
  },
  pl: {
    pill: 'Analityka wdrożenia na żywo',
    title: 'Centrum dowodzenia wdrożeniem',
    subtitle: 'Wskaźnik ukończenia, porzucenia lejka, zgoda, ton, QA, opinie.',
    loading: 'Ładowanie danych…',
    eventsAnalyzed: (n: number) => `Przeanalizowano ${n} zdarzeń`,
    completionRate: 'Wskaźnik ukończenia',
    completionSub: (done: number, total: number) => `${done} ukończonych / ${total} sprofilowanych`,
    consentOptIn: 'Zgoda',
    consentSub: (n: number) => `${n} zgód na szkolenie`,
    skips: 'Pominięcia',
    skipsSub: 'Zdarzenia przycisku pomiń w przepływie',
    errors: 'Błędy',
    errorsSub: 'Ostatnie błędy klienta/serwera',
    funnelTitle: 'Porzucenia lejka według kroku',
    views: 'wyświetleń',
    toneTitle: 'Rozkład tonu',
    monitoringTitle: 'Konfiguracja monitorowania',
    monitoringItems: [
      'Śledzenie analityki: zdarzenia wysyłane do tabeli Supabase, Google Analytics, Mixpanel i LogRocket.',
      'Rejestrowanie błędów: wyjątki przekazywane do Sentry i LogRocket gdy skonfigurowane.',
      'Monitorowanie wydajności: sprawdź wydajność mobilną Lighthouse i porównaj znaczniki czasu.',
      'Pętla opinii: rozkład tak/nie wyświetlany poniżej.',
      'Zgodność i prywatność: zgoda domyślnie odznaczona i oznaczona znacznikiem czasu.',
    ],
    deviceTitle: 'Rozkład urządzeń',
    feedbackTitle: 'Opinie',
    qaTitle: 'Skrypt QA dla użytkownika',
    qaItems: [
      'Sprawdź, czy przycisk pomiń pojawia się na każdym kroku i przekierowuje do panelu.',
      'Potwierdź, że wybory profilu są zachowane po przeładowaniu.',
      'Potwierdź, że zgoda jest domyślnie odznaczona.',
      'Sprawdź, czy preferencja tonu pojawia się w podsumowaniu potwierdzenia.',
      'Przetestuj responsywność na szerokościach mobilnych, tabletowych i desktopowych.',
      'Uruchom testy wydajności w Chrome, Safari, Firefox i Edge.',
    ],
    devTitle: 'Lista kontrolna dewelopera',
    devItems: [
      'Responsywne jednostki, płynne siatki i elementy dotykowe 44px obecne.',
      'Panele glassmorphism i akcenty neonowe odpowiadają językowi wizualnemu SignalBoost.',
      'Logika pomijania, upsert profilu, obsługa zgody i trwałość tonu bez błędów.',
      'Apprentice Workshop dostosowuje treść na podstawie zapisanego poziomu IT.',
      'Fokus klawiatury, etykiety semantyczne, kontrast kolorów i przesunięcie układu zweryfikowane.',
    ],
    recentTitle: 'Ostatnie zdarzenia wdrożenia',
    colStep: 'Krok',
    colAction: 'Akcja',
    colDevice: 'Urządzenie',
    colBrowser: 'Przeglądarka',
    colTimestamp: 'Znacznik czasu',
    noEvents: 'Nie znaleziono jeszcze zdarzeń wdrożenia.',
    abTitle: 'Układ testów A/B',
    abDesc: (n: number) => `Użyj tagów wariantów takich jak viewed_variant_a lub viewed_variant_b i porównaj wskaźniki ukończenia, zgody i opinii. Śledzone potwierdzenia: ${n}`,
  },
  ru: {
    pill: 'Аналитика онбординга в реальном времени',
    title: 'Центр управления онбордингом',
    subtitle: 'Завершение, воронка, согласие, тон, QA, обратная связь.',
    loading: 'Загрузка данных…',
    eventsAnalyzed: (n: number) => `Проанализировано ${n} событий`,
    completionRate: 'Процент завершения',
    completionSub: (done: number, total: number) => `${done} завершено / ${total} в профиле`,
    consentOptIn: 'Согласие',
    consentSub: (n: number) => `${n} согласий на обучение`,
    skips: 'Пропуски',
    skipsSub: 'События кнопки «Пропустить» в потоке',
    errors: 'Ошибки',
    errorsSub: 'Последние ошибки клиента/сервера',
    funnelTitle: 'Отток воронки по шагам',
    views: 'просмотров',
    toneTitle: 'Распределение тона',
    monitoringTitle: 'Настройка мониторинга',
    monitoringItems: [
      'Отслеживание аналитики: события отправляются в таблицу Supabase, Google Analytics, Mixpanel и LogRocket.',
      'Журнал ошибок: исключения пересылаются в Sentry и LogRocket при наличии настройки.',
      'Мониторинг производительности: проверьте мобильную производительность Lighthouse и сравните временные метки.',
      'Цикл обратной связи: распределение да/нет отображается ниже.',
      'Соответствие и конфиденциальность: согласие по умолчанию не отмечено и фиксируется с временной меткой.',
    ],
    deviceTitle: 'Распределение устройств',
    feedbackTitle: 'Обратная связь',
    qaTitle: 'Сценарий QA для пользователя',
    qaItems: [
      'Убедитесь, что кнопка «Пропустить» отображается на каждом шаге и ведёт на панель.',
      'Подтвердите, что выборки профиля сохраняются после перезагрузки.',
      'Подтвердите, что согласие по умолчанию не отмечено.',
      'Убедитесь, что предпочтение тона отображается в сводке подтверждения.',
      'Проверьте адаптивность на мобильных, планшетных и десктопных ширинах.',
      'Запустите тесты производительности в Chrome, Safari, Firefox и Edge.',
    ],
    devTitle: 'Контрольный список разработчика',
    devItems: [
      'Адаптивные единицы, гибкие сетки и сенсорные элементы 44px присутствуют.',
      'Панели glassmorphism и неоновые акценты соответствуют визуальному языку SignalBoost.',
      'Логика пропуска, upsert профиля, обработка согласия и сохранение тона без ошибок.',
      'Apprentice Workshop адаптирует контент на основе сохранённого уровня IT.',
      'Фокус клавиатуры, семантические метки, контрастность цветов и сдвиг макета проверены.',
    ],
    recentTitle: 'Последние события онбординга',
    colStep: 'Шаг',
    colAction: 'Действие',
    colDevice: 'Устройство',
    colBrowser: 'Браузер',
    colTimestamp: 'Временная метка',
    noEvents: 'События онбординга ещё не найдены.',
    abTitle: 'Макет A/B-тестирования',
    abDesc: (n: number) => `Используйте теги вариантов, например viewed_variant_a или viewed_variant_b, и сравните показатели завершения, согласия и обратной связи. Отслежено подтверждений: ${n}`,
  },
}

function getLang(): keyof typeof COPY {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language?.slice(0, 2)
  if (lang === 'es') return 'es'
  if (lang === 'pt') return 'pt'
  if (lang === 'pl') return 'pl'
  if (lang === 'ru') return 'ru'
  return 'en'
}

const STEP_ORDER = ['welcome', 'profiling', 'consent', 'tone', 'confirmation']
const COLORS = ['#38bdf8', '#ffc300', '#a78bfa', '#22c55e', '#fb7185']

function percent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function groupCount(items: Array<Record<string, string | null>>, key: string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const group = item[key] || 'unknown'
    acc[group] = (acc[group] || 0) + 1
    return acc
  }, {})
}

export default function OnboardingAnalyticsDashboardPage() {
  const { lang: activeLang } = useI18n()
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]

  useEffect(() => {
    async function loadDashboard() {
      const [eventResult, profileResult, errorResult, feedbackResult] = await Promise.all([
        supabase.from('onboarding_analytics').select('*').order('timestamp', { ascending: false }).limit(500),
        supabase.from('user_profile').select('*').order('onboarding_completed_at', { ascending: false }).limit(500),
        supabase.from('error_logs').select('error_id,error_type,timestamp,device_type').order('timestamp', { ascending: false }).limit(50),
        supabase.from('feedback').select('feedback_id,response,timestamp').order('timestamp', { ascending: false }).limit(100),
      ])

      setEvents((eventResult.data || []) as AnalyticsEvent[])
      setProfiles((profileResult.data || []) as UserProfile[])
      setErrors((errorResult.data || []) as ErrorLog[])
      setFeedback((feedbackResult.data || []) as Feedback[])
      setLoading(false)
    }

    loadDashboard()
  }, [])

  const completedProfiles = profiles.filter((profile) => profile.onboarding_completed)
  const consentedProfiles = profiles.filter((profile) => profile.consent_ai_training)
  const viewedEvents = events.filter((event) => event.action === 'viewed')
  const completedEvents = events.filter((event) => event.action === 'completed')
  const skippedEvents = events.filter((event) => event.action === 'skipped')

  const stepViews = useMemo(() => groupCount(viewedEvents as Array<Record<string, string | null>>, 'step_name'), [viewedEvents])
  const toneDistribution = useMemo(() => groupCount(profiles as unknown as Array<Record<string, string | null>>, 'tone_preference'), [profiles])
  const deviceDistribution = useMemo(() => groupCount(events as unknown as Array<Record<string, string | null>>, 'device_type'), [events])
  const feedbackDistribution = useMemo(() => groupCount(feedback as unknown as Array<Record<string, string | null>>, 'response'), [feedback])
  const maxStepViews = Math.max(1, ...Object.values(stepViews))

  return (
    <main className="dashboardShell">
      <style>{uiCopy('u_2312443420a697e4')}</style>

      <section className="hero">
        <div>
          <span className="statusPill">{c.pill}</span>
          <h1>{c.title}</h1>
          <p style={{ fontSize: 13, margin: 0 }}>{c.subtitle}</p>
        </div>
        <p>{loading ? c.loading : c.eventsAnalyzed(events.length)}</p>
      </section>

      <section className="grid kpiGrid" aria-label={uiCopy('u_572631b0979b36ed')}>
        <div className="card kpi">
          <span>{c.completionRate}</span>
          <strong>{percent(completedProfiles.length, profiles.length)}</strong>
          <p>{c.completionSub(completedProfiles.length, profiles.length)}</p>
        </div>
        <div className="card kpi">
          <span>{c.consentOptIn}</span>
          <strong>{percent(consentedProfiles.length, profiles.length)}</strong>
          <p>{c.consentSub(consentedProfiles.length)}</p>
        </div>
        <div className="card kpi">
          <span>{c.skips}</span>
          <strong>{skippedEvents.length}</strong>
          <p>{c.skipsSub}</p>
        </div>
        <div className="card kpi">
          <span>{c.errors}</span>
          <strong>{errors.length}</strong>
          <p>{c.errorsSub}</p>
        </div>
      </section>

      <section className="grid panelGrid">
        <div className="card">
          <h2>{c.funnelTitle}</h2>
          {STEP_ORDER.map((step, index) => (
            <div className="barRow" key={step}>
              <strong>{index + 1}. {step}</strong>
              <div className="barTrack">
                <div className="barFill" style={{ width: percent(stepViews[step] || 0, maxStepViews) }} />
              </div>
              <span>{stepViews[step] || 0} {c.views}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>{c.toneTitle}</h2>
          <div className="donutList">
            {Object.entries(toneDistribution).map(([tone, count], index) => (
              <div className="legend" key={tone}>
                <span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{tone}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>{c.monitoringTitle}</h2>
          <ul className="taskList">
            {c.monitoringItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>{c.deviceTitle}</h2>
          <div className="donutList">
            {Object.entries(deviceDistribution).map(([device, count], index) => (
              <div className="legend" key={device}>
                <span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{device}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <h2 style={{ marginTop: '1.25rem' }}>{c.feedbackTitle}</h2>
          <div className="donutList">
            {Object.entries(feedbackDistribution).map(([response, count], index) => (
              <div className="legend" key={response}>
                <span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{response}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>{c.qaTitle}</h2>
          <ul className="taskList">
            {c.qaItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>{c.devTitle}</h2>
          <ul className="taskList">
            {c.devItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>{c.recentTitle}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{c.colStep}</th>
              <th>{c.colAction}</th>
              <th>{c.colDevice}</th>
              <th>{c.colBrowser}</th>
              <th>{c.colTimestamp}</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 10).map((event) => (
              <tr key={event.event_id}>
                <td>{event.step_name}</td>
                <td>{event.action}</td>
                <td>{event.device_type}</td>
                <td>{event.browser}</td>
                <td>{event.timestamp}</td>
              </tr>
            ))}
            {!events.length && (
              <tr><td colSpan={5}>{c.noEvents}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>{c.abTitle}</h2>
        <p>{c.abDesc(completedEvents.length)}</p>
      </section>
    </main>
  )
}
