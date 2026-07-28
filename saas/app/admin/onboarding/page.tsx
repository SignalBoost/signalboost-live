'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

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
    pill: uiText('generatedUi.u_aee2735a5fb9e042'),
    title: uiText('generatedUi.u_1fcedd455c25bdb0'),
    subtitle: uiText('generatedUi.u_88aa774e26be1cfb'),
    loading: uiText('generatedUi.u_d43f06e54f2af517'),
    eventsAnalyzed: (n: number) => `${n} events analyzed`,
    completionRate: uiText('generatedUi.u_85a9d6f416b2416e'),
    completionSub: (done: number, total: number) => `${done} completed / ${total} profiled`,
    consentOptIn: uiText('generatedUi.u_172e200a8b12c5ce'),
    consentSub: (n: number) => `${n} training consents captured`,
    skips: uiText('generatedUi.u_4a78e64f224e2f5c'),
    skipsSub: uiText('generatedUi.u_41b3228ef20bad46'),
    errors: uiText('generatedUi.u_cb702378f31507ef'),
    errorsSub: uiText('generatedUi.u_6a6d43af52a60240'),
    funnelTitle: uiText('generatedUi.u_ec87355207afcece'),
    views: uiText('generatedUi.u_74883614c4c79e12'),
    toneTitle: uiText('generatedUi.u_ebd41a176354b132'),
    monitoringTitle: uiText('generatedUi.u_cd947c60b57fc517'),
    monitoringItems: [
      uiText('generatedUi.u_2e234fda6b2a6761'),
      uiText('generatedUi.u_4775b33d8dd0405c'),
      uiText('generatedUi.u_e8311c2a15437912'),
      uiText('generatedUi.u_629d9124062d0108'),
      uiText('generatedUi.u_fceacc7f93149d3d'),
    ],
    deviceTitle: uiText('generatedUi.u_2a47cc0324d5b983'),
    feedbackTitle: uiText('generatedUi.u_aac77df347205252'),
    qaTitle: uiText('generatedUi.u_d393bc5672d356b4'),
    qaItems: [
      uiText('generatedUi.u_e20c448325ae09b8'),
      uiText('generatedUi.u_ee34be625e041e44'),
      uiText('generatedUi.u_0c29f166d9870274'),
      uiText('generatedUi.u_d561e5f96067ff6f'),
      uiText('generatedUi.u_90d4567ec7c57ddc'),
      uiText('generatedUi.u_79b36d80ffc019d5'),
    ],
    devTitle: uiText('generatedUi.u_e7154582ae3bde81'),
    devItems: [
      uiText('generatedUi.u_0f9a56700f74f955'),
      uiText('generatedUi.u_6fa9fdd809ea48e6'),
      uiText('generatedUi.u_e94aef9712ef962e'),
      uiText('generatedUi.u_52ad1f0ec3b197a5'),
      uiText('generatedUi.u_c19de7257527b6c8'),
    ],
    recentTitle: uiText('generatedUi.u_d034d55e1f5f11f7'),
    colStep: uiText('generatedUi.u_8e6a6cca7aae1d1e'),
    colAction: uiText('generatedUi.u_64cff1319d2fd2cb'),
    colDevice: uiText('generatedUi.u_6ba0bdeccb426d7b'),
    colBrowser: uiText('generatedUi.u_d31de1a5c5c8ba2a'),
    colTimestamp: uiText('generatedUi.u_115a2cc92c1097ac'),
    noEvents: uiText('generatedUi.u_b0518cd9481c9277'),
    abTitle: uiText('generatedUi.u_95f234501608e44b'),
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
      <style>{"\n        .dashboardShell { color: #fff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n        .dashboardShell .hero { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-end; border-bottom: 1px solid rgba(255,255,255,.09); padding-bottom: .8rem; margin-bottom: 1.1rem; }\n        .dashboardShell h1 { font-size: 22px; font-weight: 950; line-height: 1.1; letter-spacing: -.045em; margin: 4px 0 4px; color: #fff; }\n        .dashboardShell p, .dashboardShell span { color: rgba(255,255,255,.66); }\n        .dashboardShell .grid { display: grid; gap: 1rem; }\n        .dashboardShell .kpiGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 1rem; }\n        .dashboardShell .panelGrid { grid-template-columns: 1.2fr .8fr; align-items: start; }\n        .dashboardShell .card { border: 0; border-top: 1px solid rgba(255,255,255,.08); border-radius: 0; background: transparent; box-shadow: none; padding: .9rem 0 0; }\n        .dashboardShell .kpi { border-top: 0; border-left: 2px solid rgba(26,240,255,.4); padding: 0 0 0 .85rem; }\n        .dashboardShell .kpi strong { display: block; font-size: clamp(1.4rem, 3vw, 2rem); letter-spacing: -.03em; color: #9ff7ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }\n        .barRow { display: grid; grid-template-columns: 8rem 1fr 4rem; gap: .75rem; align-items: center; margin: .9rem 0; }\n        .barTrack { height: .8rem; border-radius: 999px; background: rgba(255,255,255,.09); overflow: hidden; }\n        .barFill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #ffc300); }\n        .donutList { display: grid; gap: .8rem; }\n        .legend { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,.09); padding-bottom: .6rem; }\n        .dot { display: inline-block; width: .65rem; height: .65rem; border-radius: 999px; margin-right: .4rem; }\n        .taskList { display: grid; gap: .65rem; padding: 0; margin: .5rem 0 0; list-style: none; }\n        .dashboardShell .taskList li { border: 0; border-top: 1px solid rgba(255,255,255,.07); border-left: 2px solid rgba(56,189,248,.4); padding: .7rem 0 .7rem .8rem; }\n        .statusPill { display: inline-flex; border-radius: 999px; padding: .35rem .65rem; background: rgba(34,197,94,.12); color: #86efac; font-size: .82rem; font-weight: 800; }\n        .table { width: 100%; border-collapse: collapse; font-size: .9rem; }\n        .table th, .table td { text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); padding: .75rem .5rem; }\n        .table th { color: rgba(255,255,255,.48); font-size: .75rem; text-transform: uppercase; letter-spacing: .12em; }\n        @media (max-width: 980px) { .kpiGrid, .panelGrid { grid-template-columns: 1fr 1fr; } .hero { align-items: flex-start; flex-direction: column; } }\n        @media (max-width: 680px) { .kpiGrid, .panelGrid { grid-template-columns: 1fr; } .barRow { grid-template-columns: 1fr; gap: .35rem; } }\n      "}</style>

      <section className="hero">
        <div>
          <span className="statusPill">{c.pill}</span>
          <h1>{c.title}</h1>
          <p style={{ fontSize: 13, margin: 0 }}>{c.subtitle}</p>
        </div>
        <p>{loading ? c.loading : c.eventsAnalyzed(events.length)}</p>
      </section>

      <section className="grid kpiGrid" aria-label={uiText('generatedUi.u_9808060006dfff73')}>
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
