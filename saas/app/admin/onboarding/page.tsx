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
    badge: 'Live onboarding analytics',
    title: 'Onboarding Command Center',
    subtitle: 'Completion, funnel drop-off, consent, tone, QA, feedback, A/B readiness.',
    eventsAnalyzed: (n: number) => `${n} events analyzed`,
    loading: 'Loading data…',
    completionRate: 'Completion rate',
    completionSub: (done: number, total: number) => `${done} completed / ${total} profiled`,
    consentOptIn: 'Consent opt-in',
    consentSub: (n: number) => `${n} training consents captured`,
    skips: 'Skips',
    skipsSub: 'Skip button events across the flow',
    errors: 'Errors',
    errorsSub: 'Recent onboarding client/server errors',
    funnelTitle: 'Funnel drop-off by step',
    views: 'views',
    toneTitle: 'Tone distribution',
    monitoringTitle: 'Monitoring setup',
    monitoringItems: [
      'Analytics tracking: onboarding events are sent to the custom Supabase event table, plus Google Analytics, Mixpanel, and LogRocket when browser SDKs are present.',
      'Error logging: client exceptions are forwarded to Sentry and LogRocket when configured; recent database-backed errors are surfaced here.',
      'Performance monitoring: QA should validate Lighthouse mobile performance and compare event timestamps for slow step transitions.',
      'Feedback loop: yes/no feedback distribution appears below for post-onboarding satisfaction checks.',
      'Compliance & privacy: consent opt-in remains unchecked by default and is timestamped in user profile records.',
    ],
    deviceTitle: 'Device mix',
    feedbackTitle: 'Feedback',
    qaTitle: 'User-facing QA script',
    qaItems: [
      'Verify the skip button appears on every onboarding step and routes to the dashboard.',
      'Confirm profiling selections persist after reload and re-opening onboarding.',
      'Confirm consent is unchecked by default and only timestamps when opted in.',
      'Verify tone persistence appears in the confirmation summary and user profile settings.',
      'Test responsiveness at mobile, tablet, and desktop widths.',
      'Run performance and cross-browser checks in Chrome, Safari, Firefox, and Edge.',
    ],
    devTitle: 'Developer verification checklist',
    devItems: [
      'Responsive units, fluid grids, touch-friendly 44px controls, and media queries are present.',
      'Glassmorphism panels and neon accents match SignalBoost visual language.',
      'Skip logic, profile upsert, consent handling, tone persistence, and analytics insert paths complete without console errors.',
      'Apprentice Workshop adapts copy and task depth from the stored IT level.',
      'Keyboard focus, semantic labels, color contrast, and reduced layout shift are verified.',
    ],
    recentTitle: 'Recent onboarding events',
    colStep: 'Step',
    colAction: 'Action',
    colDevice: 'Device',
    colBrowser: 'Browser',
    colTimestamp: 'Timestamp',
    noEvents: 'No onboarding events found yet.',
    abTitle: 'A/B testing layout',
    abDesc: 'Use variant tags in onboarding_analytics.action values such as viewed_variant_a or viewed_variant_b, then compare completion, consent opt-in, and feedback response rates in this dashboard.',
    abConfirmed: (n: number) => `Confirmation completions tracked: ${n}`,
  },
  es: {
    badge: 'Análisis de incorporación en vivo',
    title: 'Centro de mando de incorporación',
    subtitle: 'Finalización, abandono del embudo, consentimiento, tono, QA, comentarios y preparación A/B.',
    eventsAnalyzed: (n: number) => `${n} eventos analizados`,
    loading: 'Cargando datos…',
    completionRate: 'Tasa de finalización',
    completionSub: (done: number, total: number) => `${done} completados / ${total} perfilados`,
    consentOptIn: 'Consentimiento',
    consentSub: (n: number) => `${n} consentimientos de entrenamiento capturados`,
    skips: 'Omisiones',
    skipsSub: 'Eventos del botón omitir en el flujo',
    errors: 'Errores',
    errorsSub: 'Errores recientes de cliente/servidor en incorporación',
    funnelTitle: 'Abandono del embudo por paso',
    views: 'vistas',
    toneTitle: 'Distribución de tono',
    monitoringTitle: 'Configuración de monitoreo',
    monitoringItems: [
      'Seguimiento de análisis: los eventos de incorporación se envían a la tabla de eventos personalizada de Supabase, además de Google Analytics, Mixpanel y LogRocket cuando los SDK del navegador están presentes.',
      'Registro de errores: las excepciones del cliente se reenvían a Sentry y LogRocket cuando están configurados; los errores recientes respaldados por la base de datos se muestran aquí.',
      'Monitoreo de rendimiento: el equipo de QA debe validar el rendimiento móvil de Lighthouse y comparar las marcas de tiempo de los eventos para transiciones lentas entre pasos.',
      'Ciclo de retroalimentación: la distribución de retroalimentación sí/no aparece a continuación para verificaciones de satisfacción posteriores a la incorporación.',
      'Cumplimiento y privacidad: el consentimiento permanece desmarcado de forma predeterminada y se registra con marca de tiempo en los registros de perfil de usuario.',
    ],
    deviceTitle: 'Distribución de dispositivos',
    feedbackTitle: 'Retroalimentación',
    qaTitle: 'Script de QA para el usuario',
    qaItems: [
      'Verificar que el botón omitir aparezca en cada paso de incorporación y redirija al panel.',
      'Confirmar que las selecciones de perfil persisten después de recargar y volver a abrir la incorporación.',
      'Confirmar que el consentimiento está desmarcado por defecto y solo registra marca de tiempo al aceptar.',
      'Verificar que la persistencia del tono aparezca en el resumen de confirmación y en la configuración del perfil de usuario.',
      'Probar la capacidad de respuesta en anchos móviles, tableta y escritorio.',
      'Ejecutar verificaciones de rendimiento y compatibilidad entre navegadores en Chrome, Safari, Firefox y Edge.',
    ],
    devTitle: 'Lista de verificación del desarrollador',
    devItems: [
      'Unidades responsivas, cuadrículas fluidas, controles táctiles de 44px y consultas de medios presentes.',
      'Los paneles de glassmorfismo y los acentos de neón coinciden con el lenguaje visual de SignalBoost.',
      'La lógica de omisión, el upsert de perfil, el manejo del consentimiento, la persistencia del tono y las rutas de inserción de análisis se completan sin errores de consola.',
      'El Taller de Aprendiz adapta el texto y la profundidad de las tareas según el nivel de TI almacenado.',
      'Se verifican el enfoque del teclado, las etiquetas semánticas, el contraste de color y el desplazamiento de diseño reducido.',
    ],
    recentTitle: 'Eventos de incorporación recientes',
    colStep: 'Paso',
    colAction: 'Acción',
    colDevice: 'Dispositivo',
    colBrowser: 'Navegador',
    colTimestamp: 'Fecha/hora',
    noEvents: 'Aún no se encontraron eventos de incorporación.',
    abTitle: 'Diseño de pruebas A/B',
    abDesc: 'Usa etiquetas de variante en los valores de onboarding_analytics.action como viewed_variant_a o viewed_variant_b, luego compara las tasas de finalización, consentimiento y retroalimentación en este panel.',
    abConfirmed: (n: number) => `Finalizaciones de confirmación rastreadas: ${n}`,
  },
  pt: {
    badge: 'Análise de integração ao vivo',
    title: 'Centro de comando de integração',
    subtitle: 'Conclusão, abandono do funil, consentimento, tom, QA, feedback e prontidão A/B.',
    eventsAnalyzed: (n: number) => `${n} eventos analisados`,
    loading: 'Carregando dados…',
    completionRate: 'Taxa de conclusão',
    completionSub: (done: number, total: number) => `${done} concluídos / ${total} perfilados`,
    consentOptIn: 'Consentimento',
    consentSub: (n: number) => `${n} consentimentos de treinamento capturados`,
    skips: 'Ignorados',
    skipsSub: 'Eventos do botão ignorar no fluxo',
    errors: 'Erros',
    errorsSub: 'Erros recentes de cliente/servidor na integração',
    funnelTitle: 'Abandono do funil por etapa',
    views: 'visualizações',
    toneTitle: 'Distribuição de tom',
    monitoringTitle: 'Configuração de monitoramento',
    monitoringItems: [
      'Rastreamento de análises: os eventos de integração são enviados para a tabela de eventos personalizada do Supabase, além do Google Analytics, Mixpanel e LogRocket quando os SDKs do navegador estão presentes.',
      'Registro de erros: as exceções do cliente são encaminhadas para o Sentry e LogRocket quando configurados; erros recentes com suporte de banco de dados são exibidos aqui.',
      'Monitoramento de desempenho: o QA deve validar o desempenho móvel do Lighthouse e comparar os carimbos de data/hora dos eventos para transições lentas entre etapas.',
      'Ciclo de feedback: a distribuição de feedback sim/não aparece abaixo para verificações de satisfação pós-integração.',
      'Conformidade e privacidade: o consentimento permanece desmarcado por padrão e é registrado com carimbo de data/hora nos registros de perfil do usuário.',
    ],
    deviceTitle: 'Distribuição de dispositivos',
    feedbackTitle: 'Feedback',
    qaTitle: 'Script de QA para o usuário',
    qaItems: [
      'Verificar se o botão ignorar aparece em cada etapa de integração e redireciona para o painel.',
      'Confirmar que as seleções de perfil persistem após recarregar e reabrir a integração.',
      'Confirmar que o consentimento está desmarcado por padrão e só registra carimbo de data/hora ao aceitar.',
      'Verificar se a persistência do tom aparece no resumo de confirmação e nas configurações do perfil do usuário.',
      'Testar a responsividade em larguras de celular, tablet e desktop.',
      'Executar verificações de desempenho e compatibilidade entre navegadores no Chrome, Safari, Firefox e Edge.',
    ],
    devTitle: 'Lista de verificação do desenvolvedor',
    devItems: [
      'Unidades responsivas, grades fluidas, controles amigáveis ao toque de 44px e consultas de mídia presentes.',
      'Os painéis de glassmorfismo e os acentos neon correspondem à linguagem visual do SignalBoost.',
      'A lógica de ignorar, o upsert de perfil, o tratamento de consentimento, a persistência de tom e os caminhos de inserção de análises são concluídos sem erros de console.',
      'O Ateliê de Aprendiz adapta o texto e a profundidade das tarefas com base no nível de TI armazenado.',
      'Foco do teclado, rótulos semânticos, contraste de cores e deslocamento de layout reduzido são verificados.',
    ],
    recentTitle: 'Eventos de integração recentes',
    colStep: 'Etapa',
    colAction: 'Ação',
    colDevice: 'Dispositivo',
    colBrowser: 'Navegador',
    colTimestamp: 'Data/hora',
    noEvents: 'Nenhum evento de integração encontrado ainda.',
    abTitle: 'Layout de testes A/B',
    abDesc: 'Use tags de variante nos valores de onboarding_analytics.action como viewed_variant_a ou viewed_variant_b, depois compare as taxas de conclusão, consentimento e feedback neste painel.',
    abConfirmed: (n: number) => `Conclusões de confirmação rastreadas: ${n}`,
  },
  pl: {
    badge: 'Analityka wdrożenia na żywo',
    title: 'Centrum dowodzenia wdrożeniem',
    subtitle: 'Ukończenie, porzucenie lejka, zgoda, ton, QA, opinie i gotowość A/B.',
    eventsAnalyzed: (n: number) => `Przeanalizowano ${n} zdarzeń`,
    loading: 'Ładowanie danych…',
    completionRate: 'Wskaźnik ukończenia',
    completionSub: (done: number, total: number) => `${done} ukończonych / ${total} sprofilowanych`,
    consentOptIn: 'Zgoda',
    consentSub: (n: number) => `Przechwycono ${n} zgód na szkolenie`,
    skips: 'Pominięcia',
    skipsSub: 'Zdarzenia przycisku pomiń w przepływie',
    errors: 'Błędy',
    errorsSub: 'Ostatnie błędy klienta/serwera przy wdrożeniu',
    funnelTitle: 'Porzucenie lejka według kroku',
    views: 'wyświetleń',
    toneTitle: 'Rozkład tonu',
    monitoringTitle: 'Konfiguracja monitorowania',
    monitoringItems: [
      'Śledzenie analityki: zdarzenia wdrożenia są wysyłane do niestandardowej tabeli zdarzeń Supabase oraz do Google Analytics, Mixpanel i LogRocket, gdy dostępne są SDK przeglądarki.',
      'Rejestrowanie błędów: wyjątki klienta są przekazywane do Sentry i LogRocket, gdy są skonfigurowane; ostatnie błędy z bazy danych są wyświetlane tutaj.',
      'Monitorowanie wydajności: QA powinien sprawdzić wydajność mobilną Lighthouse i porównać znaczniki czasu zdarzeń dla wolnych przejść między krokami.',
      'Pętla opinii: rozkład opinii tak/nie pojawia się poniżej w celu sprawdzenia satysfakcji po wdrożeniu.',
      'Zgodność i prywatność: zgoda pozostaje domyślnie niezaznaczona i jest opatrzona znacznikiem czasu w rekordach profilu użytkownika.',
    ],
    deviceTitle: 'Rozkład urządzeń',
    feedbackTitle: 'Opinie',
    qaTitle: 'Skrypt QA dla użytkownika',
    qaItems: [
      'Sprawdź, czy przycisk pomiń pojawia się na każdym kroku wdrożenia i przekierowuje do panelu.',
      'Potwierdź, że wybory profilowania są zachowywane po ponownym załadowaniu i otwarciu wdrożenia.',
      'Potwierdź, że zgoda jest domyślnie niezaznaczona i tylko rejestruje znacznik czasu po wyrażeniu zgody.',
      'Sprawdź, czy trwałość tonu pojawia się w podsumowaniu potwierdzenia i ustawieniach profilu użytkownika.',
      'Przetestuj responsywność na szerokościach mobilnych, tabletowych i desktopowych.',
      'Uruchom testy wydajności i zgodności między przeglądarkami w Chrome, Safari, Firefox i Edge.',
    ],
    devTitle: 'Lista kontrolna dewelopera',
    devItems: [
      'Responsywne jednostki, płynne siatki, przyjazne dla dotyku kontrolki 44px i zapytania mediów są obecne.',
      'Panele glassmorfizmu i neonowe akcenty odpowiadają językowi wizualnemu SignalBoost.',
      'Logika pomijania, upsert profilu, obsługa zgody, trwałość tonu i ścieżki wstawiania analityki są kompletne bez błędów konsoli.',
      'Warsztat Ucznia dostosowuje treść i głębokość zadań na podstawie zapisanego poziomu IT.',
      'Fokus klawiatury, etykiety semantyczne, kontrast kolorów i zmniejszone przesunięcie układu są zweryfikowane.',
    ],
    recentTitle: 'Ostatnie zdarzenia wdrożenia',
    colStep: 'Krok',
    colAction: 'Akcja',
    colDevice: 'Urządzenie',
    colBrowser: 'Przeglądarka',
    colTimestamp: 'Data/godzina',
    noEvents: 'Nie znaleziono jeszcze zdarzeń wdrożenia.',
    abTitle: 'Układ testów A/B',
    abDesc: 'Użyj tagów wariantów w wartościach onboarding_analytics.action, takich jak viewed_variant_a lub viewed_variant_b, a następnie porównaj wskaźniki ukończenia, zgody i opinii w tym panelu.',
    abConfirmed: (n: number) => `Śledzone ukończenia potwierdzenia: ${n}`,
  },
  ru: {
    badge: 'Аналитика онбординга в реальном времени',
    title: 'Центр управления онбордингом',
    subtitle: 'Завершение, отток воронки, согласие, тон, QA, обратная связь и готовность к A/B.',
    eventsAnalyzed: (n: number) => `Проанализировано ${n} событий`,
    loading: 'Загрузка данных…',
    completionRate: 'Процент завершения',
    completionSub: (done: number, total: number) => `${done} завершено / ${total} профилировано`,
    consentOptIn: 'Согласие',
    consentSub: (n: number) => `Получено ${n} согласий на обучение`,
    skips: 'Пропуски',
    skipsSub: 'События кнопки «пропустить» в потоке',
    errors: 'Ошибки',
    errorsSub: 'Последние ошибки клиента/сервера при онбординге',
    funnelTitle: 'Отток воронки по шагам',
    views: 'просмотров',
    toneTitle: 'Распределение тона',
    monitoringTitle: 'Настройка мониторинга',
    monitoringItems: [
      'Отслеживание аналитики: события онбординга отправляются в пользовательскую таблицу событий Supabase, а также в Google Analytics, Mixpanel и LogRocket при наличии SDK браузера.',
      'Журналирование ошибок: исключения клиента пересылаются в Sentry и LogRocket при настройке; последние ошибки из базы данных отображаются здесь.',
      'Мониторинг производительности: QA должен проверить мобильную производительность Lighthouse и сравнить временные метки событий для медленных переходов между шагами.',
      'Цикл обратной связи: распределение ответов «да/нет» отображается ниже для проверки удовлетворённости после онбординга.',
      'Соответствие и конфиденциальность: согласие по умолчанию не отмечено и фиксируется с временной меткой в записях профиля пользователя.',
    ],
    deviceTitle: 'Распределение устройств',
    feedbackTitle: 'Обратная связь',
    qaTitle: 'Сценарий QA для пользователя',
    qaItems: [
      'Убедитесь, что кнопка «пропустить» отображается на каждом шаге онбординга и перенаправляет на панель управления.',
      'Подтвердите, что выборы профилирования сохраняются после перезагрузки и повторного открытия онбординга.',
      'Подтвердите, что согласие по умолчанию не отмечено и фиксирует временную метку только при принятии.',
      'Убедитесь, что сохранение тона отображается в сводке подтверждения и настройках профиля пользователя.',
      'Проверьте адаптивность на мобильных, планшетных и настольных ширинах.',
      'Выполните проверки производительности и совместимости браузеров в Chrome, Safari, Firefox и Edge.',
    ],
    devTitle: 'Контрольный список разработчика',
    devItems: [
      'Адаптивные единицы, гибкие сетки, удобные для касания элементы управления 44px и медиазапросы присутствуют.',
      'Панели стекломорфизма и неоновые акценты соответствуют визуальному языку SignalBoost.',
      'Логика пропуска, upsert профиля, обработка согласия, сохранение тона и пути вставки аналитики завершены без ошибок консоли.',
      'Мастерская ученика адаптирует текст и глубину задач на основе сохранённого уровня IT.',
      'Проверены фокус клавиатуры, семантические метки, контрастность цветов и уменьшенное смещение макета.',
    ],
    recentTitle: 'Последние события онбординга',
    colStep: 'Шаг',
    colAction: 'Действие',
    colDevice: 'Устройство',
    colBrowser: 'Браузер',
    colTimestamp: 'Дата/время',
    noEvents: 'События онбординга пока не найдены.',
    abTitle: 'Макет A/B тестирования',
    abDesc: 'Используйте теги вариантов в значениях onboarding_analytics.action, например viewed_variant_a или viewed_variant_b, затем сравните показатели завершения, согласия и обратной связи на этой панели.',
    abConfirmed: (n: number) => `Отслеживаемые завершения подтверждения: ${n}`,
  },
}

function getLang(): keyof typeof COPY {
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
          <span className="statusPill">{c.badge}</span>
          <h1>{c.title}</h1>
          <p style={{ fontSize: 13, margin: 0 }}>{c.subtitle}</p>
        </div>
        <p>{loading ? c.loading : c.eventsAnalyzed(events.length)}</p>
      </section>

      <section className="grid kpiGrid" aria-label="Onboarding KPIs">
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
              <div className="barTrack"><div className="barFill" style={{ width: percent(stepViews[step] || 0, maxStepViews) }} /></div>
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
            {c.monitoringItems.map((item, i) => <li key={i}>{item}</li>)}
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
            {c.qaItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>

        <div className="card">
          <h2>{c.devTitle}</h2>
          <ul className="taskList">
            {c.devItems.map((item, i) => <li key={i}>{item}</li>)}
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
            {!events.length && <tr><td colSpan={5}>{c.noEvents}</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>{c.abTitle}</h2>
        <p>{c.abDesc}</p>
        <p>{c.abConfirmed(completedEvents.length)}</p>
      </section>
    </main>
  )
}
