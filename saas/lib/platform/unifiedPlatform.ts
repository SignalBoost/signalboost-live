export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type AudienceRole = 'partner' | 'business_owner' | 'customer' | 'admin' | 'owner'

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
  { icon: '🧾', label: 'Logs', href: '/admin/system' },
  { icon: '📡', label: 'Outreach', href: '/admin/sales' },
  { icon: '🧠', label: 'Insights', href: '/admin/ai' },
  { icon: '🛡️', label: 'Role Management', href: '/admin/settings/roles' },
  { icon: '🛰️', label: 'Marketplace Monitor', href: '/admin/partners' },
  { icon: '🚀', label: 'SaaS Monitor', href: '/admin/saas' },
  { icon: '🤖', label: 'Concierge Monitor', href: '/admin/adm' },
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
  es: 'Puedo guiarte en Marketplace y en los módulos SaaS: Promocionar negocio, Reseñas, Calendario, Hojas de cálculo y Outreach. Dime tu rol y objetivo.',
  pt: 'Posso orientar você no Marketplace e nos módulos SaaS: Promover negócio, Avaliações, Calendário, Planilhas e Outreach. Diga seu papel e objetivo.',
  pl: 'Mogę pomóc w Marketplace oraz modułach SaaS: Promocja firmy, Opinie, Kalendarz, Arkusze i Outreach. Podaj swoją rolę i cel.',
  ru: 'Я помогу с Marketplace и SaaS-модулями: продвижение бизнеса, отзывы, календарь, таблицы и outreach. Укажите роль и цель.',
}

export function normalizeLocale(locale?: string): SupportedLocale {
  const code = String(locale || 'en').toLowerCase().split('-')[0]
  return SUPPORTED_LOCALES.includes(code as SupportedLocale) ? code as SupportedLocale : 'en'
}

export function inferAudienceRole(input: string): AudienceRole {
  const text = input.toLowerCase()
  if (/owner|admin|executive|finance|forecast|kpi/.test(text)) return 'owner'
  if (/partner|booking|marketplace|category/.test(text)) return 'partner'
  if (/customer|review|appointment|book/.test(text)) return 'customer'
  if (/promote|campaign|spreadsheet|calendar|outreach|business/.test(text)) return 'business_owner'
  return 'customer'
}

export function getConciergeAnswer(input: string, locale?: string, currentPage = '/') {
  const lang = normalizeLocale(locale)
  const role = inferAudienceRole(`${input} ${currentPage}`)
  const text = input.toLowerCase()
  const steps: string[] = []
  if (/forecast|financial|revenue|kpi|executive/.test(text)) {
    steps.push(`Open Executive cockpit: ${FINANCIAL_LEDGER.unifiedRevenue} unified revenue and engagement index ${KPI_DASHBOARD.unifiedEngagementIndex}.`)
    steps.push(`Review forecasts: ${FORECASTS.map(f => `${f.horizon} ${f.revenue}`).join(' • ')}.`)
    steps.push(`Recommendation: ${EXECUTIVE_RECOMMENDATIONS[0]}`)
  } else if (/review.*sentiment|sentiment.*review|testimonial|moderation|translate.*review/.test(text)) {
    steps.push('Open Reviews to filter by language, partner, product/service, date, rating, or AI relevance.')
    steps.push(`Use Admin Console review telemetry: locales ${REVIEW_ADMIN_TELEMETRY.localeVolume.join(', ')} and sentiment ${REVIEW_ADMIN_TELEMETRY.sentimentTrend.join(' / ')}.`)
    steps.push('For positive approved reviews, trigger an Outreach testimonial campaign and attach it to the CRM pipeline.')
  } else if (/outreach|campaign|crm|lead|opportunit|conversion|promotion|social|email/.test(text)) {
    steps.push('Choose a campaign type in Outreach: social post, email, partner notification, or promotion; connect it to Promote Business, Reviews, Calendar, and Spreadsheets when relevant.')
    steps.push(`Move CRM records through ${CRM_STAGES.map(s => s.stage).join(' → ')}.`)
    steps.push('Log campaign success, conversion rate, and revenue impact in Admin Console telemetry.')
  } else if (/marketplace|partner|category|booking/.test(text)) {
    steps.push('Search Marketplace categories, compare partner activity, and select a booking-ready partner.')
    steps.push('Use Concierge Monitor to capture language, intent, partner category, and booking outcome.')
    steps.push('If supply is missing, create a partner-notification campaign from Outreach Engine.')
  } else if (/review|calendar|spreadsheet|promote|saas|business/.test(text)) {
    steps.push('Open the SaaS module that matches the job: Promote Business, Reviews, Calendar, Spreadsheets, or Outreach.')
    steps.push('Follow the HMI checklist: goal → audience → content → approval → launch → telemetry.')
    steps.push('When an error appears, retry with the suggested fix and log the result for admins.')
  } else {
    steps.push(localizedFallbacks[lang])
    steps.push('HMI onboarding path: choose role → choose Marketplace or SaaS → approve next action → review telemetry.')
  }
  return { role, language: lang, reply: steps.map((step, index) => `${index + 1}. ${step}`).join('\n') }
}
