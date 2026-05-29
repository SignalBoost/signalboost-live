export type CockpitLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type ModuleSlug = 'promote-business' | 'reviews' | 'calendar' | 'spreadsheets' | 'outreach' | 'personal-assistant'

export const COCKPIT_LOCALES: CockpitLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

export const LOCALE_META: Record<CockpitLocale, { label: string; currency: string; region: string; dir: 'ltr' | 'rtl' }> = {
  en: { label: 'English', currency: 'USD', region: 'United States', dir: 'ltr' },
  es: { label: 'Español', currency: 'EUR', region: 'España', dir: 'ltr' },
  pt: { label: 'Português', currency: 'BRL', region: 'Brasil', dir: 'ltr' },
  pl: { label: 'Polski', currency: 'PLN', region: 'Polska', dir: 'ltr' },
  ru: { label: 'Русский', currency: 'USD', region: 'Global RU', dir: 'ltr' },
}

export const MODULE_SLUGS: ModuleSlug[] = ['promote-business', 'reviews', 'calendar', 'spreadsheets', 'outreach', 'personal-assistant']

export const MODULES: Record<ModuleSlug, {
  slug: ModuleSlug
  icon: string
  accent: string
  title: Record<CockpitLocale, string>
  subtitle: Record<CockpitLocale, string>
  telemetry: string[]
  workflows: string[]
  href: string
}> = {
  'promote-business': {
    slug: 'promote-business', icon: '🚀', accent: '#ffc300', href: '/modules/promote-business',
    title: { en: 'Promote Business', es: 'Promocionar negocio', pt: 'Promover negócio', pl: 'Promocja firmy', ru: 'Продвижение бизнеса' },
    subtitle: { en: 'Launch AI-guided campaigns for marketplace offers, local ads, and SaaS bundles from one cockpit.', es: 'Lanza campañas guiadas por IA para ofertas marketplace, anuncios locales y paquetes SaaS.', pt: 'Lance campanhas guiadas por IA para ofertas marketplace, anúncios locais e pacotes SaaS.', pl: 'Uruchamiaj kampanie AI dla ofert marketplace, reklam lokalnych i pakietów SaaS.', ru: 'Запускайте AI-кампании для marketplace, локальной рекламы и SaaS-пакетов.' },
    telemetry: ['Audience lock', 'Offer velocity', 'Approval gate', 'Revenue attribution'], workflows: ['Brief intake', 'Locale copy', 'Channel plan', 'Launch checklist'],
  },
  reviews: {
    slug: 'reviews', icon: '⭐', accent: '#f59e0b', href: '/modules/reviews',
    title: { en: 'Reviews', es: 'Reseñas', pt: 'Avaliações', pl: 'Opinie', ru: 'Отзывы' },
    subtitle: { en: 'Multi-locale review capture with sentiment analysis, moderation queues, and publish-ready proof.', es: 'Captura de reseñas multiidioma con sentimiento, moderación y prueba lista para publicar.', pt: 'Coleta multilíngue com sentimento, moderação e prova pronta para publicar.', pl: 'Wielojęzyczne opinie z analizą sentymentu, moderacją i gotowym dowodem.', ru: 'Многоязычные отзывы с анализом тональности, модерацией и публикацией.' },
    telemetry: ['Sentiment delta', 'Locale queue', 'Moderation SLA', 'Public proof'], workflows: ['Collect', 'Classify', 'Moderate', 'Publish'],
  },
  calendar: {
    slug: 'calendar', icon: '📅', accent: '#22c55e', href: '/modules/calendar',
    title: { en: 'Calendar', es: 'Calendario', pt: 'Calendário', pl: 'Kalendarz', ru: 'Календарь' },
    subtitle: { en: 'Localized scheduling, reminders, launch windows, and follow-up cadences with date-aware AI.', es: 'Agenda localizada, recordatorios, ventanas de lanzamiento y seguimientos con IA contextual.', pt: 'Agenda localizada, lembretes, janelas de lançamento e follow-ups com IA.', pl: 'Lokalne terminy, przypomnienia, okna startu i follow-upy sterowane AI.', ru: 'Локальное расписание, напоминания, окна запуска и follow-up с AI.' },
    telemetry: ['Next launch', 'Reminder health', 'No-show risk', 'Timezone sync'], workflows: ['Schedule', 'Remind', 'Reschedule', 'Report'],
  },
  spreadsheets: {
    slug: 'spreadsheets', icon: '📊', accent: '#1af0ff', href: '/modules/spreadsheets',
    title: { en: 'Spreadsheets', es: 'Hojas de cálculo', pt: 'Planilhas', pl: 'Arkusze', ru: 'Таблицы' },
    subtitle: { en: 'Collaborative cockpit tables for leads, campaigns, partner inventory, approvals, and CRM handoff.', es: 'Tablas colaborativas para leads, campañas, partners, aprobaciones y CRM.', pt: 'Tabelas colaborativas para leads, campanhas, parceiros, aprovações e CRM.', pl: 'Wspólne tabele dla leadów, kampanii, partnerów, akceptacji i CRM.', ru: 'Совместные таблицы для лидов, кампаний, партнёров, согласований и CRM.' },
    telemetry: ['Live rows', 'Conflict status', 'CRM mapping', 'Import quality'], workflows: ['Import', 'Normalize', 'Collaborate', 'Export'],
  },
  outreach: {
    slug: 'outreach', icon: '📡', accent: '#ff4fd8', href: '/modules/outreach',
    title: { en: 'Outreach', es: 'Outreach', pt: 'Outreach', pl: 'Outreach', ru: 'Outreach' },
    subtitle: { en: 'Communication hub for email, social, partner notifications, marketplace promos, and SaaS nurture.', es: 'Hub de comunicación para email, social, partners, promociones marketplace y SaaS.', pt: 'Hub de comunicação para email, social, parceiros, promoções marketplace e SaaS.', pl: 'Centrum email, social, partnerów, promocji marketplace i SaaS nurture.', ru: 'Центр email, соцсетей, партнёров, marketplace-промо и SaaS-прогрева.' },
    telemetry: ['Deliverability', 'Reply intent', 'CRM stage', 'Campaign forecast'], workflows: ['Draft', 'Segment', 'Approve', 'Send'],
  },
  'personal-assistant': {
    slug: 'personal-assistant', icon: '🧠', accent: '#a855f7', href: '/modules/personal-assistant',
    title: { en: 'Personal Assistant', es: 'Asistente personal', pt: 'Assistente pessoal', pl: 'Asystent osobisty', ru: 'Личный ассистент' },
    subtitle: { en: 'AI task manager that turns cockpit signals into prioritized actions, reminders, and executive summaries.', es: 'Gestor de tareas IA que convierte señales en acciones, recordatorios y resúmenes ejecutivos.', pt: 'Gerenciador IA que transforma sinais em ações, lembretes e resumos executivos.', pl: 'Menedżer zadań AI zamieniający sygnały w priorytety, przypomnienia i raporty.', ru: 'AI-менеджер задач превращает сигналы в приоритеты, напоминания и сводки.' },
    telemetry: ['Task priority', 'Blocked items', 'Reminder ETA', 'Executive summary'], workflows: ['Capture', 'Prioritize', 'Delegate', 'Close loop'],
  },
}

export const MARKETPLACE_CATEGORIES = [
  { icon: '✈️', key: 'Flights', signal: 'fare anomaly scan', href: '/services/promote-business' },
  { icon: '🏨', key: 'Hotels', signal: 'occupancy + review blend', href: '/services/collect-reviews' },
  { icon: '📶', key: 'eSIM', signal: 'traveler connectivity', href: '/services/build-website' },
  { icon: '🗺️', key: 'Tours', signal: 'local experience match', href: '/services/create-videos' },
  { icon: '🚗', key: 'Cars', signal: 'availability telemetry', href: '/services/improve-website' },
  { icon: '🛒', key: 'Marketplace', signal: 'partner supply gaps', href: '/admin/partners' },
]

export const PRICING_TIERS = [
  { key: 'ignite', monthly: 19, modules: ['promote-business', 'reviews'] as ModuleSlug[], highlighted: false },
  { key: 'orbit', monthly: 49, modules: ['promote-business', 'reviews', 'calendar', 'spreadsheets'] as ModuleSlug[], highlighted: true },
  { key: 'mission', monthly: 149, modules: MODULE_SLUGS, highlighted: false },
]

export const COCKPIT_COPY: Record<CockpitLocale, {
  searchPlaceholder: string
  conciergePrompt: string
  conciergeReply: string
  pricingTitle: string
  pricingSubtitle: string
  moduleCta: string
  perMonth: string
  lastSyncLabel: string
}> = {
  en: { searchPlaceholder: 'Ask Concierge AI: flights to Lisbon, hotel reviews, eSIM, launch campaign…', conciergePrompt: 'Concierge AI online', conciergeReply: 'Tell me your destination, business goal, language, or campaign. I will route Marketplace and SaaS signals into the next safest action.', pricingTitle: 'Unified SaaS pricing cockpit', pricingSubtitle: 'Tiered modules with direct mission links, locale currency, and launch-ready CTAs.', moduleCta: 'Open module', perMonth: '/month', lastSyncLabel: 'Last telemetry sync' },
  es: { searchPlaceholder: 'Pregunta al Concierge IA: vuelos a Lisboa, reseñas, eSIM, campaña…', conciergePrompt: 'Concierge IA activo', conciergeReply: 'Dime destino, objetivo, idioma o campaña. Enrutaré señales Marketplace y SaaS hacia la acción segura.', pricingTitle: 'Cockpit unificado de precios SaaS', pricingSubtitle: 'Módulos por niveles con enlaces directos, moneda local y CTAs listos.', moduleCta: 'Abrir módulo', perMonth: '/mes', lastSyncLabel: 'Última sincronización' },
  pt: { searchPlaceholder: 'Pergunte ao Concierge IA: voos para Lisboa, avaliações, eSIM, campanha…', conciergePrompt: 'Concierge IA online', conciergeReply: 'Diga destino, meta, idioma ou campanha. Vou rotear sinais Marketplace e SaaS para a próxima ação segura.', pricingTitle: 'Cockpit unificado de preços SaaS', pricingSubtitle: 'Módulos em tiers com links diretos, moeda local e CTAs prontos.', moduleCta: 'Abrir módulo', perMonth: '/mês', lastSyncLabel: 'Última sincronização' },
  pl: { searchPlaceholder: 'Zapytaj Concierge AI: loty do Lizbony, opinie, eSIM, kampania…', conciergePrompt: 'Concierge AI online', conciergeReply: 'Podaj cel podróży, biznes, język lub kampanię. Połączę Marketplace i SaaS w bezpieczny następny krok.', pricingTitle: 'Ujednolicony cockpit cen SaaS', pricingSubtitle: 'Moduły tierowe z linkami, lokalną walutą i gotowymi CTA.', moduleCta: 'Otwórz moduł', perMonth: '/mies.', lastSyncLabel: 'Ostatnia synchronizacja' },
  ru: { searchPlaceholder: 'Спросите Concierge AI: рейсы в Лиссабон, отзывы, eSIM, кампания…', conciergePrompt: 'Concierge AI онлайн', conciergeReply: 'Укажите направление, бизнес-цель, язык или кампанию. Я свяжу Marketplace и SaaS в безопасный следующий шаг.', pricingTitle: 'Единый cockpit цен SaaS', pricingSubtitle: 'Модули по уровням с прямыми ссылками, валютой и готовыми CTA.', moduleCta: 'Открыть модуль', perMonth: '/мес.', lastSyncLabel: 'Последняя синхронизация' },
}

export function normalizeCockpitLocale(locale?: string): CockpitLocale {
  const code = String(locale || 'en').toLowerCase().split('-')[0]
  return COCKPIT_LOCALES.includes(code as CockpitLocale) ? code as CockpitLocale : 'en'
}

export function formatMissionCurrency(locale: CockpitLocale, amount: number) {
  const meta = LOCALE_META[locale]
  return new Intl.NumberFormat(locale, { style: 'currency', currency: meta.currency, maximumFractionDigits: 0 }).format(amount)
}

export function formatMissionDate(locale: CockpitLocale, date = new Date('2026-05-29T12:00:00Z')) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
