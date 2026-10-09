export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
export type AudienceRole = 'partner' | 'business_owner' | 'customer' | 'admin' | 'owner'
export type ConciergeIntent = 'marketplace' | 'saas' | 'video_edit' | 'caption_overlay' | 'video_export' | 'support'

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']

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
  { icon: '🧬', label: 'Models', href: '/admin/models' },
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
  localeVolume: ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'],
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
  en: 'I could not complete that general request through the reasoning engine. Please try again.',
  es: 'No pude completar esa solicitud general mediante el motor de razonamiento. Inténtalo de nuevo.',
  pt: 'Não consegui concluir essa solicitação geral pelo mecanismo de raciocínio. Tente novamente.',
  pl: 'Nie udało mi się obsłużyć tego ogólnego pytania przez silnik rozumowania. Spróbuj ponownie.',
  ru: 'Мне не удалось обработать этот общий запрос через механизм рассуждения. Попробуйте ещё раз.',
  de: 'Ich konnte diese allgemeine Anfrage über die Reasoning-Engine nicht abschließen. Bitte versuchen Sie es erneut.',
  fr: 'Je n’ai pas pu traiter cette demande générale via le moteur de raisonnement. Veuillez réessayer.',
  it: 'Non sono riuscito a completare questa richiesta generale tramite il motore di ragionamento. Riprova.',
  ja: '推論エンジンでこの一般的なリクエストを完了できませんでした。もう一度お試しください。',
  ko: '추론 엔진을 통해 해당 일반 요청을 완료하지 못했습니다. 다시 시도하세요.',
  ar: 'تعذّر عليّ إكمال هذا الطلب العام عبر محرك الاستدلال. يُرجى المحاولة مرة أخرى.',
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
  de: {
    videoExport: ['Öffnen Sie Video Studio, prüfen Sie Ihren Abonnementstatus und stellen Sie den Export mit eingebrannten Untertiteln im Bereich „Export MP4“ in die Warteschlange.', 'Der JobQueueController sendet rechenintensive FFmpeg-Aufgaben an den Video-Worker, während der StorageController Quellvideos und finale Renderings speichert.', 'SubscriptionChecker blockiert Exporte im Free-/Demo-Plan; BillingHandler erfasst verbrauchsabhängige Mehrnutzungsereignisse über Stripe/PayPal, wenn die Nutzung das Kontingent überschreitet.'],
    videoEdit: ['Öffnen Sie Video Studio, um das Quellvideo hochzuladen, SRT/VTT-Untertitel zu generieren und sie in die Canvas-Zeitleiste zu laden.', 'Ziehen Sie das aktive Untertitel-Overlay auf der Arbeitsfläche und passen Sie dann Schriftart, Farbe, Größe, Hintergrund und Animation an.', 'OutputValidator hält Untertitel-/Export-Payloads JSON-sicher, bevor der JobQueueController Transcoder-Aufgaben in die Warteschlange stellt.'],
    review: ['Öffnen Sie „Bewertungen“, um nach Sprache, Partner, Produkt/Dienstleistung, Datum, Bewertung oder KI-Relevanz zu filtern.', `Nutzen Sie die Bewertungstelemetrie der Admin Console: Sprachen ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} und Stimmung ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Starten Sie für positive, freigegebene Bewertungen eine Outreach-Testimonial-Kampagne und verknüpfen Sie sie mit der CRM-Pipeline.'],
    outreach: ['Wählen Sie in Outreach einen Kampagnentyp: Social-Media-Beitrag, E-Mail, Partnerbenachrichtigung oder Promotion; verbinden Sie ihn bei Bedarf mit „Unternehmen bewerben“, „Bewertungen“, „Kalender“ und „Tabellen“.', `Bewegen Sie CRM-Datensätze durch ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Erfassen Sie Kampagnenerfolg, Konversionsrate und Umsatzwirkung in der Telemetrie der Admin Console.'],
    marketplace: ['Durchsuchen Sie Marketplace-Kategorien, vergleichen Sie Partneraktivitäten und wählen Sie einen buchungsbereiten Partner aus.', 'Nutzen Sie den Concierge-Monitor, um Sprache, Absicht, Partnerkategorie und Buchungsergebnis zu erfassen.', 'Wenn kein Angebot vorhanden ist, erstellen Sie über die Outreach Engine eine Partnerbenachrichtigungskampagne.'],
    saas: ['Öffnen Sie das SaaS-Modul, das zur Aufgabe passt: Unternehmen bewerben, Bewertungen, Kalender, Tabellen oder Outreach.', 'Folgen Sie der HMI-Checkliste: Ziel → Zielgruppe → Inhalt → Freigabe → Start → Telemetrie.', 'Wenn ein Fehler auftritt, versuchen Sie es mit der vorgeschlagenen Korrektur erneut und protokollieren Sie das Ergebnis für Administratoren.'],
    onboarding: 'HMI-Onboarding-Pfad: Rolle wählen → Marketplace oder SaaS wählen → nächste Aktion freigeben → Telemetrie prüfen.',
  },
  fr: {
    videoExport: ['Ouvrez Video Studio, vérifiez l’état de votre abonnement et mettez en file d’attente l’export avec sous-titres incrustés depuis le panneau Export MP4.', 'Le JobQueueController envoie les traitements FFmpeg lourds au worker vidéo, tandis que le StorageController enregistre les vidéos sources et les rendus finaux.', 'SubscriptionChecker bloque les exports des offres gratuites/démo ; BillingHandler enregistre les dépassements facturés à l’usage via Stripe/PayPal lorsque l’utilisation dépasse le quota.'],
    videoEdit: ['Ouvrez Video Studio pour importer la vidéo source, générer des sous-titres SRT/VTT et les charger dans la timeline du canevas.', 'Faites glisser la superposition de sous-titre active sur le canevas, puis ajustez la police, la couleur, la taille, l’arrière-plan et l’animation.', 'OutputValidator garantit que les payloads de sous-titres/d’export restent compatibles JSON avant que le JobQueueController ne mette en file d’attente le transcodage.'],
    review: ['Ouvrez Avis pour filtrer par langue, partenaire, produit/service, date, note ou pertinence IA.', `Utilisez la télémétrie des avis de l’Admin Console : langues ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} et sentiment ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Pour les avis positifs approuvés, lancez une campagne de témoignages dans Outreach et associez-la au pipeline CRM.'],
    outreach: ['Choisissez un type de campagne dans Outreach : publication sociale, e-mail, notification aux partenaires ou promotion ; associez-la à Promouvoir l’entreprise, Avis, Calendrier et Feuilles de calcul le cas échéant.', `Faites progresser les fiches CRM à travers ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Enregistrez le succès de la campagne, le taux de conversion et l’impact sur le chiffre d’affaires dans la télémétrie de l’Admin Console.'],
    marketplace: ['Parcourez les catégories du Marketplace, comparez l’activité des partenaires et sélectionnez un partenaire prêt à accepter des réservations.', 'Utilisez le moniteur Concierge pour enregistrer la langue, l’intention, la catégorie de partenaire et le résultat de la réservation.', 'Si l’offre est insuffisante, créez une campagne de notification aux partenaires depuis Outreach Engine.'],
    saas: ['Ouvrez le module SaaS adapté à la tâche : Promouvoir l’entreprise, Avis, Calendrier, Feuilles de calcul ou Outreach.', 'Suivez la checklist HMI : objectif → audience → contenu → approbation → lancement → télémétrie.', 'Si une erreur apparaît, réessayez avec la correction suggérée et consignez le résultat pour les administrateurs.'],
    onboarding: 'Parcours d’onboarding HMI : choisir un rôle → choisir Marketplace ou SaaS → approuver l’action suivante → consulter la télémétrie.',
  },
  it: {
    videoExport: ['Apri Video Studio, verifica lo stato del tuo abbonamento e metti in coda l’esportazione con sottotitoli impressi dal pannello Export MP4.', 'Il JobQueueController invia il lavoro FFmpeg pesante al worker video, mentre lo StorageController salva i video sorgente e i render finali.', 'SubscriptionChecker blocca le esportazioni dei piani free/demo; BillingHandler registra gli eventi di eccedenza a consumo su Stripe/PayPal quando l’utilizzo supera la quota.'],
    videoEdit: ['Apri Video Studio per caricare il video sorgente, generare sottotitoli SRT/VTT e inserirli nella timeline del canvas.', 'Trascina l’overlay del sottotitolo attivo sul canvas, poi regola carattere, colore, dimensione, sfondo e animazione.', 'OutputValidator mantiene i payload di sottotitoli/esportazione sicuri per JSON prima che il JobQueueController metta in coda il lavoro di transcodifica.'],
    review: ['Apri Recensioni per filtrare per lingua, partner, prodotto/servizio, data, valutazione o pertinenza AI.', `Usa la telemetria delle recensioni dell’Admin Console: lingue ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} e sentiment ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'Per le recensioni positive approvate, avvia una campagna di testimonianze in Outreach e collegala alla pipeline CRM.'],
    outreach: ['Scegli un tipo di campagna in Outreach: post social, email, notifica ai partner o promozione; collegala a Promuovi attività, Recensioni, Calendario e Fogli di calcolo quando pertinente.', `Sposta i record del CRM attraverso ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'Registra il successo della campagna, il tasso di conversione e l’impatto sui ricavi nella telemetria dell’Admin Console.'],
    marketplace: ['Cerca nelle categorie del Marketplace, confronta l’attività dei partner e seleziona un partner pronto per la prenotazione.', 'Usa il monitor Concierge per registrare lingua, intento, categoria del partner ed esito della prenotazione.', 'Se manca l’offerta, crea una campagna di notifica ai partner da Outreach Engine.'],
    saas: ['Apri il modulo SaaS adatto all’attività: Promuovi attività, Recensioni, Calendario, Fogli di calcolo o Outreach.', 'Segui la checklist HMI: obiettivo → pubblico → contenuto → approvazione → lancio → telemetria.', 'Se compare un errore, riprova con la correzione suggerita e registra il risultato per gli amministratori.'],
    onboarding: 'Percorso di onboarding HMI: scegli il ruolo → scegli Marketplace o SaaS → approva l’azione successiva → controlla la telemetria.',
  },
  ja: {
    videoExport: ['Video Studio を開き、サブスクリプションの状態を確認してから、Export MP4 パネルで字幕焼き込みエクスポートをキューに追加してください。', 'JobQueueController は重い FFmpeg 処理を動画ワーカーに送り、StorageController は元動画と最終レンダリングを保存します。', 'SubscriptionChecker は無料/デモプランのエクスポートをブロックし、利用量が上限を超えた場合は BillingHandler が Stripe/PayPal の従量課金超過イベントを記録します。'],
    videoEdit: ['Video Studio を開いて元動画をアップロードし、SRT/VTT 字幕を生成してキャンバスのタイムラインに読み込みます。', 'キャンバス上でアクティブな字幕オーバーレイをドラッグし、フォント、色、サイズ、背景、アニメーションを調整します。', 'OutputValidator は、JobQueueController がトランスコード処理をキューに追加する前に、字幕/エクスポートのペイロードを JSON セーフに保ちます。'],
    review: ['レビューを開き、言語、パートナー、製品/サービス、日付、評価、AI 関連度で絞り込みます。', `Admin Console のレビューテレメトリを使用します:言語 ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')}、センチメント ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}。`, '承認済みの肯定的なレビューについては、Outreach の推薦キャンペーンを開始し、CRM パイプラインに紐付けます。'],
    outreach: ['Outreach でキャンペーンの種類(ソーシャル投稿、メール、パートナー通知、プロモーション)を選び、必要に応じてビジネス宣伝、レビュー、カレンダー、スプレッドシートと連携します。', `CRM レコードを ${CRM_STAGES.map(s => s.stage).join(' → ')} に沿って進めます。`, 'キャンペーンの成果、コンバージョン率、収益への影響を Admin Console のテレメトリに記録します。'],
    marketplace: ['Marketplace のカテゴリを検索し、パートナーの活動を比較して、予約可能なパートナーを選択します。', 'コンシェルジュモニターを使用して、言語、意図、パートナーカテゴリ、予約結果を記録します。', '供給が不足している場合は、Outreach Engine からパートナー通知キャンペーンを作成します。'],
    saas: ['作業に合った SaaS モジュールを開きます:ビジネス宣伝、レビュー、カレンダー、スプレッドシート、Outreach。', 'HMI チェックリストに従います:目標 → オーディエンス → コンテンツ → 承認 → 公開 → テレメトリ。', 'エラーが表示された場合は、提案された修正で再試行し、結果を管理者向けに記録します。'],
    onboarding: 'HMI オンボーディングの流れ:役割を選択 → Marketplace または SaaS を選択 → 次のアクションを承認 → テレメトリを確認。',
  },
  ko: {
    videoExport: ['Video Studio를 열고 구독 상태를 확인한 다음, Export MP4 패널에서 자막 삽입 내보내기를 대기열에 추가하세요.', 'JobQueueController는 무거운 FFmpeg 작업을 비디오 워커로 보내고, StorageController는 원본 비디오와 최종 렌더링을 저장합니다.', 'SubscriptionChecker는 무료/데모 내보내기를 차단하며, 사용량이 할당량을 초과하면 BillingHandler가 Stripe/PayPal 종량제 초과 사용 이벤트를 기록합니다.'],
    videoEdit: ['Video Studio를 열어 원본 비디오를 업로드하고 SRT/VTT 자막을 생성한 뒤 캔버스 타임라인에 불러오세요.', '캔버스에서 활성 자막 오버레이를 드래그한 다음 글꼴, 색상, 크기, 배경, 애니메이션 설정을 조정하세요.', 'OutputValidator는 JobQueueController가 트랜스코더 작업을 대기열에 추가하기 전에 자막/내보내기 페이로드를 JSON 안전 상태로 유지합니다.'],
    review: ['리뷰를 열어 언어, 파트너, 제품/서비스, 날짜, 평점 또는 AI 관련성으로 필터링하세요.', `Admin Console 리뷰 텔레메트리를 사용하세요: 언어 ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')}, 감정 ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, '승인된 긍정 리뷰의 경우 Outreach 추천 후기 캠페인을 시작하고 CRM 파이프라인에 연결하세요.'],
    outreach: ['Outreach에서 캠페인 유형(소셜 게시물, 이메일, 파트너 알림 또는 프로모션)을 선택하고, 필요한 경우 비즈니스 홍보, 리뷰, 캘린더, 스프레드시트와 연결하세요.', `CRM 레코드를 ${CRM_STAGES.map(s => s.stage).join(' → ')} 단계로 이동하세요.`, '캠페인 성과, 전환율 및 매출 영향을 Admin Console 텔레메트리에 기록하세요.'],
    marketplace: ['Marketplace 카테고리를 검색하고 파트너 활동을 비교한 뒤 예약 가능한 파트너를 선택하세요.', '컨시어지 모니터를 사용해 언어, 의도, 파트너 카테고리 및 예약 결과를 기록하세요.', '공급이 부족하면 Outreach Engine에서 파트너 알림 캠페인을 만드세요.'],
    saas: ['작업에 맞는 SaaS 모듈을 여세요: 비즈니스 홍보, 리뷰, 캘린더, 스프레드시트 또는 Outreach.', 'HMI 체크리스트를 따르세요: 목표 → 대상 → 콘텐츠 → 승인 → 출시 → 텔레메트리.', '오류가 나타나면 제안된 수정 사항으로 다시 시도하고 관리자를 위해 결과를 기록하세요.'],
    onboarding: 'HMI 온보딩 경로: 역할 선택 → Marketplace 또는 SaaS 선택 → 다음 작업 승인 → 텔레메트리 검토.',
  },
  ar: {
    videoExport: ['افتح Video Studio وتأكّد من حالة اشتراكك، ثم أضف تصدير الترجمة المدمجة إلى قائمة الانتظار من لوحة Export MP4.', 'يرسل JobQueueController مهام FFmpeg الثقيلة إلى عامل الفيديو، بينما يحفظ StorageController مقاطع الفيديو المصدرية والعروض النهائية.', 'يحظر SubscriptionChecker عمليات التصدير في الخطة المجانية/التجريبية، ويسجّل BillingHandler أحداث الاستخدام الزائد المحتسبة عبر Stripe/PayPal عندما يتجاوز الاستخدام الحصة.'],
    videoEdit: ['افتح Video Studio لرفع الفيديو المصدر وإنشاء ترجمات SRT/VTT وتحميلها في المخطط الزمني للوحة.', 'اسحب طبقة الترجمة النشطة على اللوحة، ثم اضبط الخط واللون والحجم والخلفية وعناصر التحكم في الحركة.', 'يحافظ OutputValidator على أمان حمولات الترجمة/التصدير بصيغة JSON قبل أن يضيف JobQueueController مهام التحويل إلى قائمة الانتظار.'],
    review: ['افتح التقييمات للتصفية حسب اللغة أو الشريك أو المنتج/الخدمة أو التاريخ أو التقييم أو الصلة بالذكاء الاصطناعي.', `استخدم بيانات القياس عن بُعد للتقييمات في Admin Console: اللغات ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} والمشاعر ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`, 'بالنسبة إلى التقييمات الإيجابية المعتمدة، أطلق حملة شهادات عبر Outreach واربطها بمسار CRM.'],
    outreach: ['اختر نوع الحملة في Outreach: منشور اجتماعي أو بريد إلكتروني أو إشعار للشركاء أو عرض ترويجي؛ واربطها بـ«الترويج للأعمال» و«التقييمات» و«التقويم» و«جداول البيانات» عند الحاجة.', `انقل سجلات CRM عبر ${CRM_STAGES.map(s => s.stage).join(' → ')}.`, 'سجّل نجاح الحملة ومعدل التحويل والأثر على الإيرادات في بيانات القياس عن بُعد في Admin Console.'],
    marketplace: ['ابحث في فئات Marketplace وقارن نشاط الشركاء واختر شريكًا جاهزًا للحجز.', 'استخدم مراقب Concierge لتسجيل اللغة والنية وفئة الشريك ونتيجة الحجز.', 'إذا كان العرض غير متوفر، فأنشئ حملة إشعار للشركاء من Outreach Engine.'],
    saas: ['افتح وحدة SaaS المناسبة للمهمة: الترويج للأعمال أو التقييمات أو التقويم أو جداول البيانات أو Outreach.', 'اتبع قائمة تحقق HMI: الهدف ← الجمهور ← المحتوى ← الموافقة ← الإطلاق ← القياس عن بُعد.', 'عند ظهور خطأ، أعد المحاولة باستخدام الإصلاح المقترح وسجّل النتيجة للمسؤولين.'],
    onboarding: 'مسار التهيئة في HMI: اختر الدور ← اختر Marketplace أو SaaS ← وافق على الإجراء التالي ← راجع بيانات القياس عن بُعد.',
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
  if (/marketplace|partner|category|booking|rezerwac|kategor|партн|бронир|категор|socio|reserva|categoría|parceiro|reserva|categoria/.test(text)) return 'marketplace'
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
  } else if (/forecast|financial|revenue|kpi|executive|prognoz|przych|finans|прогноз|выруч|финанс|pronóstico|ingres|previsão|receita|prognose|umsatz|einnahmen|finanz|prévision|chiffre d’affaires|chiffre d'affaires|revenu|financ|previsione|ricav|fatturato|finanzi|予測|売上|収益|財務|예측|매출|수익|재무|توقع|إيراد|مالي/.test(text)) {
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
    } else if (lang === 'de') {
      steps.push(`Öffnen Sie das Executive-Cockpit: Gesamtumsatz ${FINANCIAL_LEDGER.unifiedRevenue} und Engagement-Index ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Prüfen Sie die Prognosen: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Prüfen Sie anschließend die operativen Empfehlungen und entscheiden Sie anhand aktueller Daten, nicht anhand von Werten aus dem Gedächtnis des Modells.')
    } else if (lang === 'fr') {
      steps.push(`Ouvrez le cockpit Executive : chiffre d’affaires unifié de ${FINANCIAL_LEDGER.unifiedRevenue} et indice d’engagement ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Consultez les prévisions : ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Examinez ensuite les recommandations opérationnelles et décidez à partir des données actuelles, et non de chiffres mémorisés par le modèle.')
    } else if (lang === 'it') {
      steps.push(`Apri il cockpit Executive: ricavi unificati ${FINANCIAL_LEDGER.unifiedRevenue} e indice di coinvolgimento ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Controlla le previsioni: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('Poi esamina le raccomandazioni operative e decidi in base ai dati attuali, non ai valori ricordati dal modello.')
    } else if (lang === 'ja') {
      steps.push(`Executive コックピットを開きます:統合売上 ${FINANCIAL_LEDGER.unifiedRevenue}、エンゲージメント指数 ${KPI_DASHBOARD.unifiedEngagementIndex}。`)
      steps.push(`予測を確認します:${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}。`)
      steps.push('次に運用上の推奨事項を確認し、モデルが記憶している数値ではなく最新のデータに基づいて判断してください。')
    } else if (lang === 'ko') {
      steps.push(`Executive 콕핏을 여세요: 통합 매출 ${FINANCIAL_LEDGER.unifiedRevenue}, 참여 지수 ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`예측을 검토하세요: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('그런 다음 운영 권장 사항을 검토하고, 모델이 기억하는 수치가 아닌 최신 데이터를 바탕으로 결정하세요.')
    } else if (lang === 'ar') {
      steps.push(`افتح لوحة Executive: الإيرادات الموحدة ${FINANCIAL_LEDGER.unifiedRevenue} ومؤشر التفاعل ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`راجع التوقعات: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push('بعد ذلك راجع التوصيات التشغيلية واتخذ القرار بناءً على البيانات الحالية، لا على الأرقام التي يتذكرها النموذج.')
    } else {
      steps.push(`Open Executive cockpit: ${FINANCIAL_LEDGER.unifiedRevenue} unified revenue and engagement index ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
      steps.push(`Review forecasts: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
      steps.push(`Recommendation: ${EXECUTIVE_RECOMMENDATIONS[0]}`)
    }
  } else if (/review.*sentiment|sentiment.*review|testimonial|moderation|translate.*review|opini|sentyment|отзыв|тональност|reseña|sentimiento|avaliaç|sentimento|bewertung|stimmung|avis client|recension|レビュー|口コミ|感情|리뷰|감정|مراجع|تقييم|مشاعر/.test(text)) {
    steps.push(...copy.review)
  } else if (/outreach|campaign|crm|lead|opportunit|conversion|promotion|social|email|kampani|promoc|конверс|кампан|correo|campaña|promoção|kampagne|werbung|campagne|campagna|promozione|キャンペーン|コンバージョン|プロモーション|캠페인|전환|프로모션|حملة|حملات|ترويج|تحويل/.test(text)) {
    steps.push(...copy.outreach)
  } else if (intent === 'marketplace') {
    steps.push(...copy.marketplace)
  } else if (intent === 'saas') {
    steps.push(...copy.saas)
  } else {
    steps.push(localizedFallbacks[lang])
  }

  return { role, language: lang, intent, pipeline: ['IntentClassifier','SubscriptionChecker','JobQueueController','StorageController','BillingHandler','ModelCaller','OutputValidator','Translator'], reply: steps.map((step, index) => `${index + 1}. ${step}`).join('\n') }
}
