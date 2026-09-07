export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type AudienceRole = 'partner' | 'business_owner' | 'customer' | 'admin' | 'owner'
export type ConciergeIntent = 'marketplace' | 'saas' | 'video_edit' | 'caption_overlay' | 'video_export' | 'support'

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

export const DESIGN_TOKENS = {
  typography: { display: 'clamp(3rem, 7vw, 6.25rem)', h1: 'clamp(2.4rem, 5vw, 4.5rem)', h2: 'clamp(1.85rem, 3vw, 3rem)', body: '1rem', mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  spacing: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem', xxl: '4rem' },
  colors: { void: '#030712', cockpit: '#07111f', cyan: '#1af0ff', gold: '#ffc300', magenta: '#ff4fd8', green: '#4ade80', text: '#f8fafc', muted: '#94a3b8', danger: '#fb7185' },
  shadows: { panel: '0 30px 90px rgba(0,0,0,.36)', cyanGlow: '0 0 42px rgba(26,240,255,.22)', goldGlow: '0 0 42px rgba(255,195,0,.24)' },
  glass: { surface: 'linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.035))', border: '1px solid rgba(255,255,255,.14)', blur: 'blur(22px)' },
} as const

export const UNIFIED_NAV = [
  { icon: '🛰️', label: 'Marketplace', href: '/', description: 'partners, categories, bookings' },
  { icon: '🚀', label: 'Promote', href: '/dashboard/promote', description: 'campaign creation' },
  { icon: '⭐', label: 'Reviews', href: '/dashboard/reviews', description: 'review collection' },
  { icon: '📅', label: 'Calendar', href: '/dashboard/outreach/outreach', description: 'scheduled launches' },
  { icon: '📊', label: 'Spreadsheets', href: '/dashboard/data', description: 'imports and CRM lists' },
  { icon: '📡', label: 'Outreach', href: '/dashboard/outreach/pipeline', description: 'pipeline and campaigns' },
  { icon: '🧭', label: 'Admin', href: '/admin', description: 'owner cockpit' },
]

export const ADMIN_SIDEBAR = [
  { icon: '🌌', label: 'Overview', href: '/admin' },
  { icon: '🧾', label: 'Logs', href: '/admin/logs' },
  { icon: '📡', label: 'Outreach', href: '/admin/outreach' },
  { icon: '📣', label: 'Marketing + Sales', href: '/admin/marketing-sales' },
  { icon: '🧠', label: 'Insights', href: '/admin/ai' },
  { icon: '🛡️', label: 'Role Management', href: '/admin/settings/roles' },
  { icon: '🛰️', label: 'Marketplace Monitor', href: '/admin/partners' },
  { icon: '🚀', label: 'SaaS Monitor', href: '/admin/saas' },
  { icon: '🤖', label: 'Concierge Monitor', href: '/admin/adm' },
  { icon: '⚖️', label: 'Governance', href: '/admin/governance' },
  { icon: '🕒', label: 'Timeline', href: '/admin/timeline' },
]

export const COCKPIT_PANELS = [
  { title: 'Partner activity', value: '184 tracked signals', status: 'Marketplace partner clicks, bookings, reviews, and category gaps.' },
  { title: 'SaaS usage', value: '72% module adoption', status: 'Promote Business, Reviews, Calendar, Spreadsheets, and Outreach usage.' },
  { title: 'Marketplace traffic', value: '31K visits', status: 'Engagement, search terms, conversion clicks, and region overlays.' },
  { title: 'Security logs', value: '0 critical', status: 'Owner/admin access, role changes, API failures, and approval gates.' },
  { title: 'API health', value: '99.98% nominal', status: 'AI, Supabase, Vercel, email, outreach, and webhook monitors.' },
  { title: 'Concierge telemetry', value: '612 guided sessions', status: 'Queries, language, audience role, recommended flow, and outcome.' },
]

export const REVIEW_ADMIN_TELEMETRY = {
  localeVolume: ['en', 'es', 'pt', 'pl', 'ru'],
  sentimentTrend: ['positive', 'neutral', 'negative'],
  moderationWorkflow: ['flagged', 'pending', 'approved', 'rejected'],
  outreachTrigger: 'Positive approved reviews create testimonial campaign opportunities in CRM',
}

export const CRM_STAGES = [
  { stage: 'Leads', probability: 0.22, automation: 'Concierge captures marketplace/SaaS intent and suggests first campaign.' },
  { stage: 'Opportunities', probability: 0.48, automation: 'Outreach Engine drafts social posts, emails, promotions, and partner notifications.' },
  { stage: 'Conversions', probability: 0.74, automation: 'Pipeline logs approvals, bookings, revenue impact, and follow-up tasks.' },
] as const

export const FORECASTS = [
  { horizon: '7 days', revenue: '$18.4K', campaignSuccess: '68%', churnRisk: 'Low', upsellLikelihood: '41%' },
  { horizon: '30 days', revenue: '$74.2K', campaignSuccess: '72%', churnRisk: 'Medium watch', upsellLikelihood: '53%' },
  { horizon: '90 days', revenue: '$231.8K', campaignSuccess: '76%', churnRisk: 'Partner cohort review', upsellLikelihood: '61%' },
]

export const FINANCIAL_LEDGER = { unifiedRevenue: '$96.7K', marketplaceRevenue: '$42.5K', saasRevenue: '$54.2K', partnerPayouts: '$17.9K', subscriptionLedger: '$38.4K MRR' }
export const KPI_DASHBOARD = { marketplace: ['Engagement +18%', 'Bookings +12%', 'Reviews +23%'], saas: ['User growth +16%', 'Module adoption 72%', 'Productivity impact 31h saved'], unifiedEngagementIndex: '87/100' }
export const EXECUTIVE_RECOMMENDATIONS = ['Launch a 7-day partner-notification campaign for high-intent marketplace categories.', 'Bundle Promote Business + Reviews for SaaS users with high outreach activity.', 'Schedule an admin review of medium churn-risk partners before the 30-day forecast window closes.']

const localizedFallbacks: Record<SupportedLocale, string> = {
  en: 'I can guide you across Marketplace partners, categories, bookings, and SaaS modules like Promote Business, Reviews, Calendar, Spreadsheets, and Outreach. Start by telling me your role and goal.',
  es: 'Puedo orientarte sobre socios, categorías y reservas de Marketplace, además de los módulos SaaS como Promocionar negocio, Reseñas, Calendario, Hojas de cálculo y Outreach. Empieza por decirme cuál es tu función y qué quieres conseguir.',
  pt: 'Posso orientar você sobre parceiros, categorias e reservas do Marketplace, além dos módulos SaaS, como Promover negócio, Avaliações, Calendário, Planilhas e Outreach. Comece dizendo qual é a sua função e o que você quer alcançar.',
  pl: 'Mogę pomóc w sprawach dotyczących partnerów, kategorii i rezerwacji w Marketplace, a także modułów SaaS, takich jak Promocja firmy, Opinie, Kalendarz, Arkusze i Outreach. Na początek napisz, jaka jest Twoja rola i co chcesz osiągnąć.',
  ru: 'Я могу помочь с партнёрами, категориями и бронированиями в Marketplace, а также с SaaS-модулями: продвижением бизнеса, отзывами, календарём, таблицами и Outreach. Для начала расскажите, какова ваша роль и чего вы хотите добиться.',
}

const textByLocale: Record<SupportedLocale, {
  videoExport: string[]
  videoEdit: string[]
  review: string[]
  outreach: string[]
  marketplace: string[]
  saas: string[]
  onboarding: string
}> = {
  en: {
    videoExport: ['Open Video Studio, confirm your subscription status, and queue the caption-burn export from the Export MP4 panel.', 'The JobQueueController sends heavy FFmpeg work to the video worker, while StorageController saves source videos and final renders.', 'SubscriptionChecker blocks free/demo exports; BillingHandler records Stripe/PayPal metered overage events when usage exceeds quota.'],
    videoEdit: ['Open Video Studio to upload the source video, generate SRT/VTT captions, and load them into the canvas timeline.', 'Drag the active caption overlay on the canvas, then adjust font, color, size, background, and animation controls.', 'OutputValidator keeps caption/export payloads JSON-safe before JobQueueController enqueues transcoder work.'],
    review: ['Open Reviews to filter by language, partner, product/service, date, rating, or AI relevance.', `Use Admin Console review telemetry: locales ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} and sentiment ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'For positive approved reviews, trigger an Outreach testimonial campaign and attach it to the CRM pipeline.'],
    outreach: ['Choose a campaign type in Outreach: social post, email, partner notification, or promotion; connect it to Promote Business, Reviews, Calendar, and Spreadsheets when relevant.', `Move CRM records through ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Log campaign success, conversion rate, and revenue impact in Admin Console telemetry.'],
    marketplace: ['Search Marketplace categories, compare partner activity, and select a booking-ready partner.', 'Use Concierge Monitor to capture language, intent, partner category, and booking outcome.', 'If supply is missing, create a partner-notification campaign from Outreach Engine.'],
    saas: ['Open the SaaS module that matches the job: Promote Business, Reviews, Calendar, Spreadsheets, or Outreach.', 'Follow the HMI checklist: goal → audience → content → approval → launch → telemetry.', 'When an error appears, retry with the suggested fix and log the result for admins.'],
    onboarding: 'HMI onboarding path: choose role → choose Marketplace or SaaS → approve next action → review telemetry.',
  },
  es: {
    videoExport: ['Abre Video Studio, confirma el estado de tu suscripción y pon en cola la exportación con subtítulos incrustados desde el panel Export MP4.', 'JobQueueController envía el trabajo pesado de FFmpeg al worker de vídeo, mientras StorageController guarda el vídeo de origen y los renders finales.', 'SubscriptionChecker bloquea las exportaciones del plan gratuito/demo; BillingHandler registra los cargos por uso adicional de Stripe/PayPal cuando se supera la cuota.'],
    videoEdit: ['Abre Video Studio para subir el vídeo de origen, generar subtítulos SRT/VTT y cargarlos en la línea de tiempo del lienzo.', 'Arrastra el subtítulo activo sobre el lienzo y ajusta la fuente, el color, el tamaño, el fondo y la animación.', 'OutputValidator mantiene seguros los payloads JSON de subtítulos y exportación antes de que JobQueueController ponga el trabajo de transcodificación en cola.'],
    review: ['Abre Reseñas para filtrar por idioma, socio, producto o servicio, fecha, puntuación o relevancia de IA.', `Consulta la telemetría de reseñas en Admin Console: idiomas ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} y sentimiento ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Para reseñas positivas ya aprobadas, inicia una campaña testimonial en Outreach y vincúlala al pipeline de CRM.'],
    outreach: ['Elige en Outreach el tipo de campaña: publicación social, correo electrónico, notificación a socios o promoción; conéctala con Promocionar negocio, Reseñas, Calendario y Hojas de cálculo cuando corresponda.', `Mueve los registros del CRM por las etapas ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Registra en Admin Console el resultado de la campaña, la tasa de conversión y el impacto en ingresos.'],
    marketplace: ['Busca categorías en Marketplace, compara la actividad de los socios y selecciona uno que permita realizar la reserva.', 'Usa Concierge Monitor para registrar el idioma, la intención, la categoría del socio y el resultado de la reserva.', 'Si falta oferta, crea una campaña de notificación a socios desde Outreach Engine.'],
    saas: ['Abre el módulo SaaS que corresponda al trabajo: Promocionar negocio, Reseñas, Calendario, Hojas de cálculo u Outreach.', 'Sigue la secuencia HMI: objetivo → audiencia → contenido → aprobación → lanzamiento → telemetría.', 'Si aparece un error, aplica la corrección sugerida, vuelve a intentarlo y registra el resultado para los administradores.'],
    onboarding: 'Ruta inicial de HMI: elige tu función → elige Marketplace o SaaS → aprueba la siguiente acción → revisa la telemetría.',
  },
  pt: {
    videoExport: ['Abra o Video Studio, confirme o status da sua assinatura e coloque na fila a exportação com legendas incorporadas pelo painel Export MP4.', 'O JobQueueController envia o processamento pesado do FFmpeg para o worker de vídeo, enquanto o StorageController salva o vídeo de origem e as renderizações finais.', 'O SubscriptionChecker bloqueia exportações no plano gratuito/demo; o BillingHandler registra cobranças adicionais do Stripe/PayPal quando o uso ultrapassa a franquia.'],
    videoEdit: ['Abra o Video Studio para enviar o vídeo de origem, gerar legendas SRT/VTT e carregá-las na linha do tempo do canvas.', 'Arraste a legenda ativa no canvas e ajuste fonte, cor, tamanho, fundo e animação.', 'O OutputValidator mantém os payloads de legenda e exportação seguros para JSON antes de o JobQueueController colocar a transcodificação na fila.'],
    review: ['Abra Avaliações para filtrar por idioma, parceiro, produto ou serviço, data, nota ou relevância de IA.', `Consulte a telemetria de avaliações no Admin Console: idiomas ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} e sentimento ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Para avaliações positivas já aprovadas, inicie uma campanha de depoimentos no Outreach e vincule-a ao pipeline de CRM.'],
    outreach: ['Escolha no Outreach o tipo de campanha: publicação em rede social, e-mail, notificação a parceiros ou promoção; conecte-a a Promover negócio, Avaliações, Calendário e Planilhas quando fizer sentido.', `Mova os registros do CRM pelas etapas ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Registre no Admin Console o resultado da campanha, a taxa de conversão e o impacto na receita.'],
    marketplace: ['Pesquise categorias no Marketplace, compare a atividade dos parceiros e selecione um parceiro pronto para reservas.', 'Use o Concierge Monitor para registrar idioma, intenção, categoria do parceiro e resultado da reserva.', 'Se estiver faltando oferta, crie uma campanha de notificação a parceiros no Outreach Engine.'],
    saas: ['Abra o módulo SaaS adequado ao trabalho: Promover negócio, Avaliações, Calendário, Planilhas ou Outreach.', 'Siga o fluxo HMI: objetivo → público → conteúdo → aprovação → lançamento → telemetria.', 'Se ocorrer um erro, aplique a correção sugerida, tente novamente e registre o resultado para os administradores.'],
    onboarding: 'Fluxo inicial do HMI: escolha a função → escolha Marketplace ou SaaS → aprove a próxima ação → revise a telemetria.',
  },
  pl: {
    videoExport: ['Otwórz Video Studio, sprawdź stan subskrypcji i dodaj do kolejki eksport z wtopionymi napisami w panelu Export MP4.', 'JobQueueController przekazuje wymagające operacje FFmpeg do workera wideo, a StorageController zapisuje film źródłowy i końcowe rendery.', 'SubscriptionChecker blokuje eksport w planie bezpłatnym/demo; BillingHandler rejestruje w Stripe/PayPal opłaty za użycie ponad limit.'],
    videoEdit: ['Otwórz Video Studio, prześlij film źródłowy, wygeneruj napisy SRT/VTT i wczytaj je na oś czasu.', 'Przeciągnij aktywną warstwę napisów na kanwie, a następnie dostosuj krój pisma, kolor, rozmiar, tło i animację.', 'OutputValidator sprawdza, czy dane napisów i eksportu są bezpieczne dla JSON, zanim JobQueueController doda transkodowanie do kolejki.'],
    review: ['Otwórz moduł Opinie i filtruj wpisy według języka, partnera, produktu lub usługi, daty, oceny albo trafności określonej przez AI.', `W Admin Console sprawdź telemetrię opinii: języki ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} oraz sentyment ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Dla zatwierdzonych pozytywnych opinii uruchom kampanię z rekomendacjami w Outreach i powiąż ją z pipeline’em CRM.'],
    outreach: ['W Outreach wybierz typ kampanii: post w mediach społecznościowych, e-mail, powiadomienie dla partnerów albo promocję; w razie potrzeby połącz ją z modułami Promocja firmy, Opinie, Kalendarz i Arkusze.', `Przenoś rekordy CRM przez etapy ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'W Admin Console zapisuj wynik kampanii, współczynnik konwersji i wpływ na przychody.'],
    marketplace: ['Przeszukaj kategorie w Marketplace, porównaj aktywność partnerów i wybierz partnera, u którego można dokonać rezerwacji.', 'W Concierge Monitor zapisuj język, intencję użytkownika, kategorię partnera i wynik rezerwacji.', 'Jeśli brakuje odpowiedniej oferty, utwórz w Outreach Engine kampanię powiadamiającą partnerów.'],
    saas: ['Otwórz moduł SaaS odpowiedni do zadania: Promocja firmy, Opinie, Kalendarz, Arkusze albo Outreach.', 'Przejdź przez proces HMI: cel → odbiorcy → treść → zatwierdzenie → uruchomienie → telemetria.', 'Jeśli pojawi się błąd, zastosuj sugerowaną poprawkę, ponów próbę i zapisz wynik dla administratorów.'],
    onboarding: 'Ścieżka startowa HMI: wybierz rolę → wybierz Marketplace albo SaaS → zatwierdź następną czynność → sprawdź telemetrię.',
  },
  ru: {
    videoExport: ['Откройте Video Studio, проверьте статус подписки и поставьте в очередь экспорт с вшитыми субтитрами через панель Export MP4.', 'JobQueueController передаёт ресурсоёмкую обработку FFmpeg видеоворкеру, а StorageController сохраняет исходное видео и итоговые рендеры.', 'SubscriptionChecker блокирует экспорт на бесплатном/демо-тарифе; BillingHandler регистрирует в Stripe/PayPal оплату использования сверх лимита.'],
    videoEdit: ['Откройте Video Studio, загрузите исходное видео, создайте субтитры SRT/VTT и добавьте их на временную шкалу.', 'Перетащите активный слой субтитров на холсте, затем настройте шрифт, цвет, размер, фон и анимацию.', 'OutputValidator проверяет безопасность данных субтитров и экспорта для JSON, прежде чем JobQueueController поставит транскодирование в очередь.'],
    review: ['Откройте раздел отзывов и фильтруйте записи по языку, партнёру, продукту или услуге, дате, оценке либо релевантности, определённой ИИ.', `В Admin Console используйте телеметрию отзывов: языки ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} и тональность ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Для одобренных положительных отзывов запустите в Outreach кампанию с отзывами клиентов и свяжите её с CRM-процессом.'],
    outreach: ['В Outreach выберите тип кампании: публикацию в соцсетях, письмо, уведомление партнёрам или промоакцию; при необходимости свяжите её с модулями продвижения бизнеса, отзывов, календаря и таблиц.', `Перемещайте записи CRM по этапам ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Записывайте в Admin Console результат кампании, конверсию и влияние на выручку.'],
    marketplace: ['Найдите нужную категорию в Marketplace, сравните активность партнёров и выберите партнёра, у которого доступно бронирование.', 'Используйте Concierge Monitor, чтобы фиксировать язык, намерение пользователя, категорию партнёра и результат бронирования.', 'Если подходящего предложения нет, создайте в Outreach Engine кампанию уведомления партнёров.'],
    saas: ['Откройте SaaS-модуль, соответствующий задаче: продвижение бизнеса, отзывы, календарь, таблицы или Outreach.', 'Следуйте процессу HMI: цель → аудитория → контент → одобрение → запуск → телеметрия.', 'Если возникнет ошибка, примените предложенное исправление, повторите попытку и сохраните результат для администраторов.'],
    onboarding: 'Начальный путь HMI: выберите роль → выберите Marketplace или SaaS → подтвердите следующее действие → проверьте телеметрию.',
  },
}

export function normalizeLocale(locale?: string): SupportedLocale {
  const code = String(locale || 'en').toLowerCase().split('-')[0]
  return SUPPORTED_LOCALES.includes(code as SupportedLocale) ? code as SupportedLocale : 'en'
}

export function inferAudienceRole(input: string): AudienceRole {
  const text = input.toLowerCase()
  if (/owner|admin|executive|finance|forecast|kpi|właściciel|administrator|финанс|владелец|propietario|administrador|proprietário/.test(text)) return 'owner'
  if (/partner|booking|marketplace|category|partner|rezerwac|kategor|партн|бронир|категор|socio|reserva|categoría|parceiro|reserva|categoria/.test(text)) return 'partner'
  if (/customer|review|appointment|book|klient|opini|клиент|отзыв|cliente|reseña|avaliaç/.test(text)) return 'customer'
  if (/promote|campaign|spreadsheet|calendar|outreach|business|promoc|kampani|arkusz|kalendar|кампан|таблиц|календар|negócio|planilh/.test(text)) return 'business_owner'
  return 'customer'
}

export function classifyConciergeIntent(input: string, currentPage = '/'): ConciergeIntent {
  const text = `${input} ${currentPage}`.toLowerCase()
  if (/export|render|download.*mp4|burn.*caption|ffmpeg|transcod|eksport|renderow|pobierz.*mp4|экспорт|рендер|скача.*mp4|exportar|renderizar|baixar.*mp4|descargar.*mp4/.test(text)) return 'video_export'
  if (/caption|subtitle|srt|vtt|overlay|drag.*text|napis|podpis|субтитр|legenda|subtítulo/.test(text)) return 'caption_overlay'
  if (/video|clip|canvas editor|timeline|film|wideo|klip|видео|ролик|vídeo/.test(text)) return 'video_edit'
  if (/marketplace|partner|category|booking|rezerwac|kategor|партн|бронир|категор|socio|reserva|categoría|parceiro|categoria/.test(text)) return 'marketplace'
  if (/review|calendar|spreadsheet|promote|saas|business|outreach|opini|kalendar|arkusz|promoc|отзыв|календар|таблиц|reseña|calendario|hoja|avaliaç|planilh/.test(text)) return 'saas'
  return 'support'
}

export function getConciergeAnswer(input: string, locale?: string, currentPage = '/') {
  const lang = normalizeLocale(locale)
  const role = inferAudienceRole(`${input} ${currentPage}`)
  const intent = classifyConciergeIntent(input, currentPage)
  const text = input.toLowerCase()
  const copy = textByLocale[lang]
  const steps: string[] = []

  if (intent === 'video_export') {
    steps.push(...copy.videoExport)
  } else if (intent === 'caption_overlay' || intent === 'video_edit') {
    steps.push(...copy.videoEdit)
  } else if (/forecast|financial|revenue|kpi|executive|prognoz|przych|finans|прогноз|выруч|финанс|pronóstico|ingres|previsão|receita/.test(text)) {
    if (lang === 'pl') {
      steps.push(`Otwórz panel Executive: łączny przychód ${FINANCIAL_LEDGER.unifiedRevenue}, a indeks zaangażowania ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Sprawdź prognozy: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Następnie przejrzyj rekomendacje operacyjne i wybierz działanie na podstawie aktualnych danych, a nie wartości zapamiętanych przez model.')
    } else if (lang === 'ru') {
      steps.push(`Откройте панель Executive: совокупная выручка ${FINANCIAL_LEDGER.unifiedRevenue}, индекс вовлечённости ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Проверьте прогнозы: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Затем изучите операционные рекомендации и выбирайте действие по актуальным данным, а не по значениям из памяти модели.')
    } else if (lang === 'es') {
      steps.push(`Abre el panel Executive: ingresos unificados ${FINANCIAL_LEDGER.unifiedRevenue} e índice de interacción ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Revisa las previsiones: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Después, revisa las recomendaciones operativas y decide con datos actuales, no con cifras recordadas por el modelo.')
    } else if (lang === 'pt') {
      steps.push(`Abra o painel Executive: receita unificada de ${FINANCIAL_LEDGER.unifiedRevenue} e índice de engajamento ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Confira as previsões: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Depois, analise as recomendações operacionais e decida com base em dados atuais, não em números lembrados pelo modelo.')
    } else {
      steps.push(`Open Executive cockpit: ${FINANCIAL_LEDGER.unifiedRevenue} unified revenue and engagement index ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Review forecasts: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push(`Recommendation: ${EXECUTIVE_RECOMMENDATIONS[0]}`)
    }
  } else if (/review.*sentiment|sentiment.*review|testimonial|moderation|translate.*review|opini|sentyment|отзыв|тональност|reseña|sentimiento|avaliaç|sentimento/.test(text)) {
    steps.push(...copy.review)
  } else if (/outreach|campaign|crm|lead|opportunit|conversion|promotion|social|email|kampani|promoc|конверс|кампан|correo|campaña|promoção/.test(text)) {
    steps.push(...copy.outreach)
  } else if (intent === 'marketplace') {
    steps.push(...copy.marketplace)
  } else if (intent === 'saas') {
    steps.push(...copy.saas)
  } else {
    steps.push(localizedFallbacks[lang])
    steps.push(copy.onboarding)
  }

  return { role, language: lang, intent, pipeline: ['IntentClassifier','SubscriptionChecker','JobQueueController','StorageController','BillingHandler','ModelCaller','OutputValidator','Translator'], reply: steps.map((step, index) => `${index + 1}. ${step}`).join('\n') }
}
