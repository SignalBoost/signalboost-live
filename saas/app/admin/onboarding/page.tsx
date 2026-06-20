'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

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
    pill: 'Live onboarding analytics',
    title: 'Onboarding Command Center',
    subtitle: 'Completion, funnel drop-off, consent, tone, QA, feedback, A/B readiness.',
    eventsAnalyzed: (n: number) => `${n} events analyzed`,
    loading: 'Loading data…',
    kpi: {
      completionRate: 'Completion rate',
      completionSub: (done: number, total: number) => `${done} completed / ${total} profiled`,
      consentOptIn: 'Consent opt-in',
      consentSub: (n: number) => `${n} training consents captured`,
      skips: 'Skips',
      skipsSub: 'Skip button events across the flow',
      errors: 'Errors',
      errorsSub: 'Recent onboarding client/server errors',
    },
    funnel: 'Funnel drop-off by step',
    views: 'views',
    toneDistribution: 'Tone distribution',
    monitoring: 'Monitoring setup',
    monitoringItems: [
      'Analytics tracking: onboarding events are sent to the custom Supabase event table, plus Google Analytics, Mixpanel, and LogRocket when browser SDKs are present.',
      'Error logging: client exceptions are forwarded to Sentry and LogRocket when configured; recent database-backed errors are surfaced here.',
      'Performance monitoring: QA should validate Lighthouse mobile performance and compare event timestamps for slow step transitions.',
      'Feedback loop: yes/no feedback distribution appears below for post-onboarding satisfaction checks.',
      'Compliance & privacy: consent opt-in remains unchecked by default and is timestamped in user profile records.',
    ],
    deviceMix: 'Device mix',
    feedback: 'Feedback',
    qaScript: 'User-facing QA script',
    qaItems: [
      'Verify the skip button appears on every onboarding step and routes to the dashboard.',
      'Confirm profiling selections persist after reload and re-opening onboarding.',
      'Confirm consent is unchecked by default and only timestamps when opted in.',
      'Verify tone persistence appears in the confirmation summary and user profile settings.',
      'Test responsiveness at mobile, tablet, and desktop widths.',
      'Run performance and cross-browser checks in Chrome, Safari, Firefox, and Edge.',
    ],
    devChecklist: 'Developer verification checklist',
    devItems: [
      'Responsive units, fluid grids, touch-friendly 44px controls, and media queries are present.',
      'Glassmorphism panels and neon accents match SignalBoost visual language.',
      'Skip logic, profile upsert, consent handling, tone persistence, and analytics insert paths complete without console errors.',
      'Apprentice Workshop adapts copy and task depth from the stored IT level.',
      'Keyboard focus, semantic labels, color contrast, and reduced layout shift are verified.',
    ],
    recentEvents: 'Recent onboarding events',
    tableHeaders: ['Step', 'Action', 'Device', 'Browser', 'Timestamp'],
    noEvents: 'No onboarding events found yet.',
    abTitle: 'A/B testing layout',
    abDesc: (n: number) => `Use variant tags in onboarding_analytics.action values such as viewed_variant_a or viewed_variant_b, then compare completion, consent opt-in, and feedback response rates in this dashboard. Confirmation completions tracked: ${n}`,
  },
  es: {
    pill: 'Análisis de incorporación en vivo',
    title: 'Centro de mando de incorporación',
    subtitle: 'Finalización, abandono del embudo, consentimiento, tono, QA, retroalimentación, preparación A/B.',
    eventsAnalyzed: (n: number) => `${n} eventos analizados`,
    loading: 'Cargando datos…',
    kpi: {
      completionRate: 'Tasa de finalización',
      completionSub: (done: number, total: number) => `${done} completados / ${total} perfilados`,
      consentOptIn: 'Consentimiento',
      consentSub: (n: number) => `${n} consentimientos de entrenamiento capturados`,
      skips: 'Omisiones',
      skipsSub: 'Eventos del botón omitir en el flujo',
      errors: 'Errores',
      errorsSub: 'Errores recientes de cliente/servidor en incorporación',
    },
    funnel: 'Abandono del embudo por paso',
    views: 'vistas',
    toneDistribution: 'Distribución de tono',
    monitoring: 'Configuración de monitoreo',
    monitoringItems: [
      'Seguimiento de análisis: los eventos de incorporación se envían a la tabla de eventos de Supabase, además de Google Analytics, Mixpanel y LogRocket cuando los SDK del navegador están presentes.',
      'Registro de errores: las excepciones del cliente se reenvían a Sentry y LogRocket cuando están configurados; los errores recientes respaldados por la base de datos se muestran aquí.',
      'Monitoreo de rendimiento: el equipo de QA debe validar el rendimiento móvil de Lighthouse y comparar las marcas de tiempo de los eventos para transiciones de pasos lentas.',
      'Ciclo de retroalimentación: la distribución de retroalimentación sí/no aparece a continuación para verificaciones de satisfacción posteriores a la incorporación.',
      'Cumplimiento y privacidad: el consentimiento permanece desmarcado por defecto y se registra con marca de tiempo en los registros de perfil de usuario.',
    ],
    deviceMix: 'Distribución de dispositivos',
    feedback: 'Retroalimentación',
    qaScript: 'Script de QA para el usuario',
    qaItems: [
      'Verificar que el botón omitir aparece en cada paso de incorporación y redirige al panel.',
      'Confirmar que las selecciones de perfil persisten tras recargar y reabrir la incorporación.',
      'Confirmar que el consentimiento está desmarcado por defecto y solo registra marca de tiempo al aceptar.',
      'Verificar que la persistencia del tono aparece en el resumen de confirmación y en la configuración del perfil.',
      'Probar la capacidad de respuesta en anchos móvil, tableta y escritorio.',
      'Ejecutar comprobaciones de rendimiento y compatibilidad en Chrome, Safari, Firefox y Edge.',
    ],
    devChecklist: 'Lista de verificación para desarrolladores',
    devItems: [
      'Unidades responsivas, cuadrículas fluidas, controles táctiles de 44px y consultas de medios presentes.',
      'Los paneles de glassmorfismo y los acentos de neón coinciden con el lenguaje visual de SignalBoost.',
      'La lógica de omisión, upsert de perfil, manejo de consentimiento, persistencia de tono y rutas de inserción de análisis se completan sin errores de consola.',
      'El Taller de Aprendiz adapta el texto y la profundidad de la tarea desde el nivel de TI almacenado.',
      'Se verifican el foco del teclado, las etiquetas semánticas, el contraste de color y el desplazamiento de diseño reducido.',
    ],
    recentEvents: 'Eventos de incorporación recientes',
    tableHeaders: ['Paso', 'Acción', 'Dispositivo', 'Navegador', 'Marca de tiempo'],
    noEvents: 'Aún no se encontraron eventos de incorporación.',
    abTitle: 'Diseño de pruebas A/B',
    abDesc: (n: number) => `Use etiquetas de variante en los valores de onboarding_analytics.action como viewed_variant_a o viewed_variant_b, luego compare las tasas de finalización, consentimiento y retroalimentación en este panel. Confirmaciones completadas: ${n}`,
  },
  pt: {
    pill: 'Análise de integração ao vivo',
    title: 'Centro de comando de integração',
    subtitle: 'Conclusão, abandono do funil, consentimento, tom, QA, feedback, prontidão A/B.',
    eventsAnalyzed: (n: number) => `${n} eventos analisados`,
    loading: 'Carregando dados…',
    kpi: {
      completionRate: 'Taxa de conclusão',
      completionSub: (done: number, total: number) => `${done} concluídos / ${total} perfilados`,
      consentOptIn: 'Consentimento',
      consentSub: (n: number) => `${n} consentimentos de treinamento capturados`,
      skips: 'Ignorados',
      skipsSub: 'Eventos do botão ignorar no fluxo',
      errors: 'Erros',
      errorsSub: 'Erros recentes de cliente/servidor na integração',
    },
    funnel: 'Abandono do funil por etapa',
    views: 'visualizações',
    toneDistribution: 'Distribuição de tom',
    monitoring: 'Configuração de monitoramento',
    monitoringItems: [
      'Rastreamento de análises: os eventos de integração são enviados para a tabela de eventos personalizada do Supabase, além do Google Analytics, Mixpanel e LogRocket quando os SDKs do navegador estão presentes.',
      'Registro de erros: as exceções do cliente são encaminhadas ao Sentry e LogRocket quando configurados; erros recentes respaldados pelo banco de dados são exibidos aqui.',
      'Monitoramento de desempenho: o QA deve validar o desempenho móvel do Lighthouse e comparar os carimbos de data/hora dos eventos para transições de etapas lentas.',
      'Ciclo de feedback: a distribuição de feedback sim/não aparece abaixo para verificações de satisfação pós-integração.',
      'Conformidade e privacidade: o consentimento permanece desmarcado por padrão e é registrado com carimbo de data/hora nos registros de perfil do usuário.',
    ],
    deviceMix: 'Distribuição de dispositivos',
    feedback: 'Feedback',
    qaScript: 'Script de QA para o usuário',
    qaItems: [
      'Verificar se o botão ignorar aparece em cada etapa de integração e redireciona para o painel.',
      'Confirmar que as seleções de perfil persistem após recarregar e reabrir a integração.',
      'Confirmar que o consentimento está desmarcado por padrão e só registra carimbo de data/hora ao aceitar.',
      'Verificar se a persistência do tom aparece no resumo de confirmação e nas configurações do perfil do usuário.',
      'Testar a responsividade em larguras móvel, tablet e desktop.',
      'Executar verificações de desempenho e compatibilidade no Chrome, Safari, Firefox e Edge.',
    ],
    devChecklist: 'Lista de verificação para desenvolvedores',
    devItems: [
      'Unidades responsivas, grades fluidas, controles sensíveis ao toque de 44px e consultas de mídia presentes.',
      'Os painéis de glassmorfismo e os acentos neon correspondem à linguagem visual do SignalBoost.',
      'A lógica de ignorar, upsert de perfil, tratamento de consentimento, persistência de tom e caminhos de inserção de análises são concluídos sem erros de console.',
      'O Ateliê de Aprendiz adapta o texto e a profundidade da tarefa a partir do nível de TI armazenado.',
      'Foco do teclado, rótulos semânticos, contraste de cores e deslocamento de layout reduzido são verificados.',
    ],
    recentEvents: 'Eventos de integração recentes',
    tableHeaders: ['Etapa', 'Ação', 'Dispositivo', 'Navegador', 'Carimbo de data/hora'],
    noEvents: 'Nenhum evento de integração encontrado ainda.',
    abTitle: 'Layout de testes A/B',
    abDesc: (n: number) => `Use tags de variante nos valores de onboarding_analytics.action como viewed_variant_a ou viewed_variant_b, depois compare as taxas de conclusão, consentimento e feedback neste painel. Confirmações concluídas: ${n}`,
  },
  pl: {
    pill: 'Analityka onboardingu na żywo',
    title: 'Centrum dowodzenia onboardingiem',
    subtitle: 'Ukończenie, porzucenie lejka, zgoda, ton, QA, opinie, gotowość A/B.',
    eventsAnalyzed: (n: number) => `Przeanalizowano ${n} zdarzeń`,
    loading: 'Ładowanie danych…',
    kpi: {
      completionRate: 'Wskaźnik ukończenia',
      completionSub: (done: number, total: number) => `${done} ukończonych / ${total} profilowanych`,
      consentOptIn: 'Zgoda',
      consentSub: (n: number) => `${n} zgód na szkolenie przechwyconych`,
      skips: 'Pominięcia',
      skipsSub: 'Zdarzenia przycisku pomiń w przepływie',
      errors: 'Błędy',
      errorsSub: 'Ostatnie błędy klienta/serwera w onboardingu',
    },
    funnel: 'Porzucenie lejka według kroku',
    views: 'wyświetleń',
    toneDistribution: 'Rozkład tonu',
    monitoring: 'Konfiguracja monitorowania',
    monitoringItems: [
      'Śledzenie analityki: zdarzenia onboardingu są wysyłane do niestandardowej tabeli zdarzeń Supabase oraz do Google Analytics, Mixpanel i LogRocket, gdy SDK przeglądarki są obecne.',
      'Rejestrowanie błędów: wyjątki klienta są przekazywane do Sentry i LogRocket, gdy są skonfigurowane; ostatnie błędy z bazy danych są wyświetlane tutaj.',
      'Monitorowanie wydajności: QA powinien zweryfikować wydajność mobilną Lighthouse i porównać znaczniki czasu zdarzeń dla wolnych przejść między krokami.',
      'Pętla opinii: rozkład opinii tak/nie pojawia się poniżej dla sprawdzania satysfakcji po onboardingu.',
      'Zgodność i prywatność: zgoda pozostaje domyślnie niezaznaczona i jest oznaczana znacznikiem czasu w rekordach profilu użytkownika.',
    ],
    deviceMix: 'Rozkład urządzeń',
    feedback: 'Opinie',
    qaScript: 'Skrypt QA dla użytkownika',
    qaItems: [
      'Sprawdź, czy przycisk pomiń pojawia się na każdym kroku onboardingu i przekierowuje do panelu.',
      'Potwierdź, że wybory profilowania są zachowane po przeładowaniu i ponownym otwarciu onboardingu.',
      'Potwierdź, że zgoda jest domyślnie niezaznaczona i oznaczana znacznikiem czasu tylko po wyrażeniu zgody.',
      'Sprawdź, czy trwałość tonu pojawia się w podsumowaniu potwierdzenia i ustawieniach profilu użytkownika.',
      'Przetestuj responsywność na szerokościach mobilnych, tabletowych i desktopowych.',
      'Uruchom testy wydajności i zgodności w Chrome, Safari, Firefox i Edge.',
    ],
    devChecklist: 'Lista kontrolna dla deweloperów',
    devItems: [
      'Responsywne jednostki, płynne siatki, elementy sterowania przyjazne dla dotyku 44px i zapytania medialne są obecne.',
      'Panele glassmorfizmu i neonowe akcenty odpowiadają językowi wizualnemu SignalBoost.',
      'Logika pomijania, upsert profilu, obsługa zgody, trwałość tonu i ścieżki wstawiania analityki są kompletne bez błędów konsoli.',
      'Warsztat Ucznia dostosowuje tekst i głębokość zadania na podstawie zapisanego poziomu IT.',
      'Fokus klawiatury, semantyczne etykiety, kontrast kolorów i zmniejszone przesunięcie układu są zweryfikowane.',
    ],
    recentEvents: 'Ostatnie zdarzenia onboardingu',
    tableHeaders: ['Krok', 'Akcja', 'Urządzenie', 'Przeglądarka', 'Znacznik czasu'],
    noEvents: 'Nie znaleziono jeszcze żadnych zdarzeń onboardingu.',
    abTitle: 'Układ testów A/B',
    abDesc: (n: number) => `Użyj tagów wariantów w wartościach onboarding_analytics.action, takich jak viewed_variant_a lub viewed_variant_b, a następnie porównaj wskaźniki ukończenia, zgody i opinii w tym panelu. Potwierdzone ukończenia: ${n}`,
  },
  ru: {
    pill: 'Аналитика онбординга в реальном времени',
    title: 'Командный центр онбординга',
    subtitle: 'Завершение, отток воронки, согласие, тон, QA, обратная связь, готовность A/B.',
    eventsAnalyzed: (n: number) => `Проанализировано ${n} событий`,
    loading: 'Загрузка данных…',
    kpi: {
      completionRate: 'Коэффициент завершения',
      completionSub: (done: number, total: number) => `${done} завершено / ${total} профилировано`,
      consentOptIn: 'Согласие',
      consentSub: (n: number) => `${n} согласий на обучение получено`,
      skips: 'Пропуски',
      skipsSub: 'События кнопки пропуска в потоке',
      errors: 'Ошибки',
      errorsSub: 'Последние ошибки клиента/сервера в онбординге',
    },
    funnel: 'Отток воронки по шагам',
    views: 'просмотров',
    toneDistribution: 'Распределение тона',
    monitoring: 'Настройка мониторинга',
    monitoringItems: [
      'Отслеживание аналитики: события онбординга отправляются в пользовательскую таблицу событий Supabase, а также в Google Analytics, Mixpanel и LogRocket при наличии SDK браузера.',
      'Журналирование ошибок: исключения клиента пересылаются в Sentry и LogRocket при настройке; последние ошибки из базы данных отображаются здесь.',
      'Мониторинг производительности: QA должен проверить мобильную производительность Lighthouse и сравнить временные метки событий для медленных переходов между шагами.',
      'Цикл обратной связи: распределение ответов да/нет отображается ниже для проверки удовлетворённости после онбординга.',
      'Соответствие и конфиденциальность: согласие остаётся по умолчанию снятым и фиксируется с временной меткой в записях профиля пользователя.',
    ],
    deviceMix: 'Распределение устройств',
    feedback: 'Обратная связь',
    qaScript: 'Скрипт QA для пользователя',
    qaItems: [
      'Убедитесь, что кнопка пропуска отображается на каждом шаге онбординга и перенаправляет на панель.',
      'Подтвердите, что выборки профилирования сохраняются после перезагрузки и повторного открытия онбординга.',
      'Подтвердите, что согласие по умолчанию снято и фиксируется с временной меткой только при принятии.',
      'Убедитесь, что сохранение тона отображается в сводке подтверждения и настройках профиля пользователя.',
      'Протестируйте адаптивность на мобильных, планшетных и десктопных ширинах.',
      'Выполните проверки производительности и совместимости в Chrome, Safari, Firefox и Edge.',
    ],
    devChecklist: 'Контрольный список для разработчиков',
    devItems: [
      'Адаптивные единицы, гибкие сетки, сенсорные элементы управления 44px и медиазапросы присутствуют.',
      'Панели glassmorphism и неоновые акценты соответствуют визуальному языку SignalBoost.',
      'Логика пропуска, upsert профиля, обработка согласия, сохранение тона и пути вставки аналитики завершены без ошибок консоли.',
      'Мастерская ученика адаптирует текст и глубину задачи на основе сохранённого уровня IT.',
      'Проверены фокус клавиатуры, семантические метки, контрастность цветов и уменьшенное смещение макета.',
    ],
    recentEvents: 'Последние события онбординга',
    tableHeaders: ['Шаг', 'Действие', 'Устройство', 'Браузер', 'Временная метка'],
    noEvents: 'События онбординга пока не найдены.',
    abTitle: 'Макет A/B тестирования',
    abDesc: (n: number) => `Используйте теги вариантов в значениях onboarding_analytics.action, таких как viewed_variant_a или viewed_variant_b, затем сравните показатели завершения, согласия и обратной связи на этой панели. Подтверждённые завершения: ${n}`,
  },
}

function getLang(): keyof typeof COPY {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language.slice(0, 2)
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
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const c = COPY[getLang()]

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
      <style>{`
        .dashboardShell { color: #fff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        .dashboardShell .hero { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-end; border-bottom: 1px solid rgba(255,255,255,.09); padding-bottom: .8rem; margin-bottom: 1.1rem; }
        .dashboardShell h1 { font-size: 22px; font-weight: 950; line-height: 1.1; letter-spacing: -.045em; margin: 4px 0 4px; color: #fff; }
        .dashboardShell p, .dashboardShell span { color: rgba(255,255,255,.66); }
        .dashboardShell .grid { display: grid; gap: 1rem; }
        .dashboardShell .kpiGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 1rem; }
        .dashboardShell .panelGrid { grid-template-columns: 1.2fr .8fr; align-items: start; }
        .dashboardShell .card { border: 0; border-top: 1px solid rgba(255,255,255,.08); border-radius: 0; background: transparent; box-shadow: none; padding: .9rem 0 0; }
        .dashboardShell .kpi { border-top: 0; border-left: 2px solid rgba(26,240,255,.4); padding: 0 0 0 .85rem; }
        .dashboardShell .kpi strong { display: block; font-size: clamp(1.4rem, 3vw, 2rem); letter-spacing: -.03em; color: #9ff7ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .barRow { display: grid; grid-template-columns: 8rem 1fr 4rem; gap: .75rem; align-items: center; margin: .9rem 0; }
        .barTrack { height: .8rem; border-radius: 999px; background: rgba(255,255,255,.09); overflow: hidden; }
        .barFill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #ffc300); }
        .donutList { display: grid; gap: .8rem; }
        .legend { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,.09); padding-bottom: .6rem; }
        .dot { display: inline-block; width: .65rem; height: .65rem; border-radius: 999px; margin-right: .4rem; }
        .taskList { display: grid; gap: .65rem; padding: 0; margin: .5rem 0 0; list-style: none; }
        .dashboardShell .taskList li { border: 0; border-top: 1px solid rgba(255,255,255,.07); border-left: 2px solid rgba(56,189,248,.4); padding: .7rem 0 .7rem .8rem; }
        .statusPill { display: inline-flex; border-radius: 999px; padding: .35rem .65rem; background: rgba(34,197,94,.12); color: #86efac; font-size: .82rem; font-weight: 800; }
        .table { width: 100%; border-collapse: collapse; font-size: .9rem; }
        .table th, .table td { text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); padding: .75rem .5rem; }
        .table th { color: rgba(255,255,255,.48); font-size: .75rem; text-transform: uppercase; letter-spacing: .12em; }
        @media (max-width: 980px) { .kpiGrid, .panelGrid { grid-template-columns: 1fr 1fr; } .hero { align-items: flex-start; flex-direction: column; } }
        @media (max-width: 680px) { .kpiGrid, .panelGrid { grid-template-columns: 1fr; } .barRow { grid-template-columns: 1fr; gap: .35rem; } }
      `}</style>

      <section className="hero">
        <div>
          <span className="statusPill">{c.pill}</span>
          <h1>{c.title}</h1>
          <p style={{ fontSize: 13, margin: 0 }}>{c.subtitle}</p>
        </div>
        <p>{loading ? c.loading : c.eventsAnalyzed(events.length)}</p>
      </section>

      <section className="grid kpiGrid" aria-label="Onboarding KPIs">
        <div className="card kpi">
          <span>{c.kpi.completionRate}</span>
          <strong>{percent(completedProfiles.length, profiles.length)}</strong>
          <p>{c.kpi.completionSub(completedProfiles.length, profiles.length)}</p>
        </div>
        <div className="card kpi">
          <span>{c.kpi.consentOptIn}</span>
          <strong>{percent(consentedProfiles.length, profiles.length)}</strong>
          <p>{c.kpi.consentSub(consentedProfiles.length)}</p>
        </div>
        <div className="card kpi">
          <span>{c.kpi.skips}</span>
          <strong>{skippedEvents.length}</strong>
          <p>{c.kpi.skipsSub}</p>
        </div>
        <div className="card kpi">
          <span>{c.kpi.errors}</span>
          <strong>{errors.length}</strong>
          <p>{c.kpi.errorsSub}</p>
        </div>
      </section>

      <section className="grid panelGrid">
        <div className="card">
          <h2>{c.funnel}</h2>
          {STEP_ORDER.map((step, index) => (
            <div className="barRow" key={step}>
              <strong>{index + 1}. {step}</strong>
              <div className="barTrack"><div className="barFill" style={{ width: percent(stepViews[step] || 0, maxStepViews) }} /></div>
              <span>{stepViews[step] || 0} {c.views}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>{c.toneDistribution}</h2>
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
          <h2>{c.monitoring}</h2>
          <ul className="taskList">
            {c.monitoringItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>

        <div className="card">
          <h2>{c.deviceMix}</h2>
          <div className="donutList">
            {Object.entries(deviceDistribution).map(([device, count], index) => (
              <div className="legend" key={device}>
                <span><i className="dot" style={{ background: COLORS[index % COLORS.length] }} />{device}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <h2 style={{ marginTop: '1.25rem' }}>{c.feedback}</h2>
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
          <h2>{c.qaScript}</h2>
          <ul className="taskList">
            {c.qaItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>

        <div className="card">
          <h2>{c.devChecklist}</h2>
          <ul className="taskList">
            {c.devItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>{c.recentEvents}</h2>
        <table className="table">
          <thead>
            <tr>{c.tableHeaders.map((h) => <th key={h}>{h}</th>)}</tr>
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
            {!events.length && <tr><td colSpan={5}>{c.noEvents}</td></tr>}
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
