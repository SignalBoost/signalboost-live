// saas/lib/i18n/unifiedPricingCopy.ts
// SINGLE localization bundle for the unified pricing storefront. One accessor —
// getUnifiedPricingCopy(lang) — returns shared chrome + all three lanes' copy in
// the active locale, so views contain ZERO hardcoded strings and no manual
// fallbacks. The audit lane's rich, already-shipped, locale-tested feature matrix
// is composed from auditPricingCopy (the proven source) rather than re-typed here.

import { getAuditPricingCopy, AuditLocale } from '@/lib/i18n/auditPricingCopy'
import { ProductLine } from '@/lib/config/unifiedPricingConfig'

export type PricingLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const LOCALES: PricingLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

export interface TierCopy {
  description: string
  features: string[]
  highlight?: string   // optional emphasised line (audit credits pill)
  topup?: string       // optional secondary line (audit top-ups)
}
export interface LaneCopy { tiers: Record<string, TierCopy> }

export interface SharedCopy {
  kicker: string
  pageTitle: string
  pageSubtitle: string
  perMonth: string
  popular: string
  cta: string
  contactSales: string
  loading: string
  error: string
  notConfigured: string
  disclaimer: string
  tabs: Record<ProductLine, string>
}

export interface UnifiedPricingCopy {
  shared: SharedCopy
  lanes: Record<ProductLine, LaneCopy>
}

// ─── Shared chrome (per locale) ──────────────────────────────────────────────
const SHARED: Record<PricingLocale, SharedCopy> = {
  en: {
    kicker: 'Pricing', pageTitle: 'Plans & Pricing',
    pageSubtitle: 'Choose the product and plan that fit your team.',
    perMonth: '/ mo', popular: 'Most Popular', cta: 'Upgrade Now', contactSales: 'Contact sales',
    loading: 'Processing…', error: 'Something went wrong. Please try again.',
    notConfigured: 'Upgrade is processed through Stripe. Pricing is not configured yet — check back soon.',
    disclaimer: 'SignalBoost provides automated compliance readiness mapping and cybersecurity posture analysis. It does not issue official compliance certifications.',
    tabs: { audit: 'Audit & Cybersecurity', platform: 'Core Platform', podcast: 'Podcast Suite' },
  },
  es: {
    kicker: 'Precios', pageTitle: 'Planes y precios',
    pageSubtitle: 'Elige el producto y el plan que se adapten a tu equipo.',
    perMonth: '/ mes', popular: 'Más Popular', cta: 'Actualizar Ahora', contactSales: 'Contactar con ventas',
    loading: 'Procesando…', error: 'Algo salió mal. Inténtalo de nuevo.',
    notConfigured: 'La actualización se procesa con Stripe. Los precios aún no están configurados — vuelve pronto.',
    disclaimer: 'SignalBoost ofrece mapeo automatizado de preparación para el cumplimiento y análisis de la postura de ciberseguridad. No emite certificaciones de cumplimiento oficiales.',
    tabs: { audit: 'Auditoría y ciberseguridad', platform: 'Plataforma principal', podcast: 'Suite de podcasts' },
  },
  pt: {
    kicker: 'Preços', pageTitle: 'Planos e preços',
    pageSubtitle: 'Escolha o produto e o plano que se encaixam na sua equipe.',
    perMonth: '/ mês', popular: 'Mais Popular', cta: 'Atualizar Agora', contactSales: 'Falar com vendas',
    loading: 'Processando…', error: 'Algo deu errado. Tente novamente.',
    notConfigured: 'A atualização é processada pelo Stripe. Os preços ainda não estão configurados — volte em breve.',
    disclaimer: 'A SignalBoost fornece mapeamento automatizado de prontidão para conformidade e análise da postura de cibersegurança. Não emite certificações de conformidade oficiais.',
    tabs: { audit: 'Auditoria e cibersegurança', platform: 'Plataforma principal', podcast: 'Suíte de podcasts' },
  },
  pl: {
    kicker: 'Cennik', pageTitle: 'Plany i ceny',
    pageSubtitle: 'Wybierz produkt i plan dopasowany do Twojego zespołu.',
    perMonth: '/ mies.', popular: 'Najpopularniejszy', cta: 'Ulepsz teraz', contactSales: 'Skontaktuj się z działem sprzedaży',
    loading: 'Przetwarzanie…', error: 'Coś poszło nie tak. Spróbuj ponownie.',
    notConfigured: 'Ulepszenie jest przetwarzane przez Stripe. Ceny nie są jeszcze skonfigurowane — sprawdź wkrótce.',
    disclaimer: 'SignalBoost zapewnia zautomatyzowane mapowanie gotowości do zgodności oraz analizę stanu cyberbezpieczeństwa. Nie wydaje oficjalnych certyfikatów zgodności.',
    tabs: { audit: 'Audyt i cyberbezpieczeństwo', platform: 'Platforma podstawowa', podcast: 'Pakiet podcastów' },
  },
  ru: {
    kicker: 'Цены', pageTitle: 'Планы и цены',
    pageSubtitle: 'Выберите продукт и план для вашей команды.',
    perMonth: '/ мес.', popular: 'Самый популярный', cta: 'Обновить сейчас', contactSales: 'Связаться с отделом продаж',
    loading: 'Обработка…', error: 'Что-то пошло не так. Попробуйте снова.',
    notConfigured: 'Обновление обрабатывается через Stripe. Цены ещё не настроены — загляните позже.',
    disclaimer: 'SignalBoost предоставляет автоматизированное картирование готовности к соответствию и анализ состояния кибербезопасности. Он не выдаёт официальные сертификаты соответствия.',
    tabs: { audit: 'Аудит и кибербезопасность', platform: 'Основная платформа', podcast: 'Пакет подкастов' },
  },
}

// ─── Core Platform / website lane (real copy from the marketing page, translated) ─
const WEBSITE: Record<PricingLocale, LaneCopy> = {
  en: { tiers: {
    launch:  { description: 'For solo operators and small businesses', features: ['5-language platform: EN, PT, ES, PL, RU', '1 published website plus optimization tools', 'Canvas Video Studio with AI captions and MP4 export', 'Podcast launch and optimization workspace', 'Reviews, calendar, basic outreach, and assistant'] },
    growth:  { description: 'For growing businesses and small teams', features: ['Everything in Launch', 'Up to 5 websites/projects, deeper optimization', 'Video Studio templates, brand styling, higher usage', 'CoWork workspace, spreadsheets, reviews & outreach suite', 'Content planning, campaigns, and assistant workflows'] },
    command: { description: 'For agencies, teams, and serious operators', features: ['Everything in Growth', 'Expanded/unlimited websites and advanced workflows', 'Advanced video, larger usage pool, priority rendering', 'Team workspace, brand kit, white label, sales pipeline', 'Connectors, API path, dedicated onboarding & priority support'] },
  } },
  es: { tiers: {
    launch:  { description: 'Para operadores individuales y pequeñas empresas', features: ['Plataforma en 5 idiomas: EN, PT, ES, PL, RU', '1 sitio web publicado más herramientas de optimización', 'Canvas Video Studio con subtítulos por IA y exportación MP4', 'Espacio de lanzamiento y optimización de podcasts', 'Reseñas, calendario, prospección básica y asistente'] },
    growth:  { description: 'Para empresas en crecimiento y equipos pequeños', features: ['Todo lo de Launch', 'Hasta 5 sitios/proyectos, optimización más profunda', 'Plantillas de Video Studio, estilo de marca, mayor uso', 'Espacio CoWork, hojas de cálculo, suite de reseñas y prospección', 'Planificación de contenido, campañas y flujos del asistente'] },
    command: { description: 'Para agencias, equipos y operadores exigentes', features: ['Todo lo de Growth', 'Sitios ampliados/ilimitados y flujos avanzados', 'Video avanzado, mayor volumen de uso, renderizado prioritario', 'Espacio de equipo, kit de marca, marca blanca, pipeline de ventas', 'Conectores, ruta de API, incorporación dedicada y soporte prioritario'] },
  } },
  pt: { tiers: {
    launch:  { description: 'Para operadores individuais e pequenas empresas', features: ['Plataforma em 5 idiomas: EN, PT, ES, PL, RU', '1 site publicado mais ferramentas de otimização', 'Canvas Video Studio com legendas por IA e exportação MP4', 'Espaço de lançamento e otimização de podcasts', 'Avaliações, calendário, prospecção básica e assistente'] },
    growth:  { description: 'Para empresas em crescimento e equipes pequenas', features: ['Tudo do Launch', 'Até 5 sites/projetos, otimização mais profunda', 'Modelos do Video Studio, identidade de marca, maior uso', 'Espaço CoWork, planilhas, suíte de avaliações e prospecção', 'Planejamento de conteúdo, campanhas e fluxos do assistente'] },
    command: { description: 'Para agências, equipes e operadores exigentes', features: ['Tudo do Growth', 'Sites ampliados/ilimitados e fluxos avançados', 'Vídeo avançado, maior volume de uso, renderização prioritária', 'Espaço de equipe, kit de marca, marca branca, pipeline de vendas', 'Conectores, caminho de API, onboarding dedicado e suporte prioritário'] },
  } },
  pl: { tiers: {
    launch:  { description: 'Dla samodzielnych operatorów i małych firm', features: ['Platforma w 5 językach: EN, PT, ES, PL, RU', '1 opublikowana strona plus narzędzia optymalizacji', 'Canvas Video Studio z napisami AI i eksportem MP4', 'Przestrzeń do uruchamiania i optymalizacji podcastów', 'Opinie, kalendarz, podstawowy outreach i asystent'] },
    growth:  { description: 'Dla rosnących firm i małych zespołów', features: ['Wszystko z Launch', 'Do 5 stron/projektów, głębsza optymalizacja', 'Szablony Video Studio, stylizacja marki, większe zużycie', 'Przestrzeń CoWork, arkusze, pakiet opinii i outreachu', 'Planowanie treści, kampanie i przepływy asystenta'] },
    command: { description: 'Dla agencji, zespołów i wymagających operatorów', features: ['Wszystko z Growth', 'Rozszerzone/nielimitowane strony i zaawansowane przepływy', 'Zaawansowane wideo, większa pula użycia, priorytetowy rendering', 'Przestrzeń zespołu, brand kit, white label, lejek sprzedaży', 'Konektory, ścieżka API, dedykowane wdrożenie i priorytetowe wsparcie'] },
  } },
  ru: { tiers: {
    launch:  { description: 'Для индивидуальных операторов и малого бизнеса', features: ['Платформа на 5 языках: EN, PT, ES, PL, RU', '1 опубликованный сайт плюс инструменты оптимизации', 'Canvas Video Studio с ИИ-субтитрами и экспортом MP4', 'Пространство для запуска и оптимизации подкастов', 'Отзывы, календарь, базовый аутрич и ассистент'] },
    growth:  { description: 'Для растущего бизнеса и небольших команд', features: ['Всё из Launch', 'До 5 сайтов/проектов, более глубокая оптимизация', 'Шаблоны Video Studio, фирменный стиль, больший объём', 'Пространство CoWork, таблицы, набор отзывов и аутрича', 'Планирование контента, кампании и сценарии ассистента'] },
    command: { description: 'Для агентств, команд и серьёзных операторов', features: ['Всё из Growth', 'Расширенные/безлимитные сайты и продвинутые сценарии', 'Продвинутое видео, больший пул использования, приоритетный рендеринг', 'Командное пространство, бренд-кит, white label, воронка продаж', 'Коннекторы, путь API, выделенный онбординг и приоритетная поддержка'] },
  } },
}

// ─── Podcast Suite lane ──────────────────────────────────────────────────────
// Real names/prices/checkout are wired in the catalog. No per-tier FEATURE copy
// exists anywhere in the codebase, so features are intentionally left EMPTY here
// rather than fabricated — fill these with real specs and they localize cleanly.
const PODCAST: Record<PricingLocale, LaneCopy> = {
  en: { tiers: {
    indie:   { description: 'For independent podcasters', features: [] },
    pro:     { description: 'For growing shows', features: [] },
    network: { description: 'For multi-show networks', features: [] },
  } },
  es: { tiers: {
    indie:   { description: 'Para podcasters independientes', features: [] },
    pro:     { description: 'Para programas en crecimiento', features: [] },
    network: { description: 'Para redes de varios programas', features: [] },
  } },
  pt: { tiers: {
    indie:   { description: 'Para podcasters independentes', features: [] },
    pro:     { description: 'Para programas em crescimento', features: [] },
    network: { description: 'Para redes de vários programas', features: [] },
  } },
  pl: { tiers: {
    indie:   { description: 'Dla niezależnych podcasterów', features: [] },
    pro:     { description: 'Dla rosnących programów', features: [] },
    network: { description: 'Dla sieci wielu programów', features: [] },
  } },
  ru: { tiers: {
    indie:   { description: 'Для независимых подкастеров', features: [] },
    pro:     { description: 'Для растущих шоу', features: [] },
    network: { description: 'Для сетей из нескольких шоу', features: [] },
  } },
}

function normalizeLocale(lang: string): PricingLocale {
  const short = (lang || 'en').toLowerCase().slice(0, 2)
  return (LOCALES as string[]).includes(short) ? (short as PricingLocale) : 'en'
}

// Single accessor consumed by the storefront. Audit lane is composed from the
// proven auditPricingCopy matrix (descriptions, ✓/❌ feature lines, credits pill,
// top-up line); website/podcast come from the bundles above.
export function getUnifiedPricingCopy(lang: string): UnifiedPricingCopy {
  const loc = normalizeLocale(lang)
  const audit = getAuditPricingCopy(loc as AuditLocale)

  const auditLane: LaneCopy = { tiers: {} }
  for (const id of Object.keys(audit.tiers)) {
    const tc = audit.tiers[id]
    auditLane.tiers[id] = {
      description: tc.description,
      features: tc.features,
      highlight: tc.creditsLabel,
      topup: tc.topupLabel,
    }
  }

  return {
    shared: SHARED[loc],
    lanes: { audit: auditLane, platform: WEBSITE[loc], podcast: PODCAST[loc] },
  }
}
