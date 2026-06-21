// saas/lib/i18n/auditPricingCopy.ts
// Audit pricing page copy — four commercial tiers, all 5 locales, self-contained.
// Reusable labels are localized; tier proper-names (Starter/Growth/Pro/Enterprise)
// are kept in English across locales by design (standard SaaS practice).

import { AUDIT_PRICING_CONFIG, formatCredits } from '@/lib/audit/pricingConfig'

type FlatCopy = Record<string, string>

export const AUDIT_PRICING_COPY: Record<string, FlatCopy> = {
  en: {
    'auditPricing.title': 'Audit Pricing',
    'auditPricing.subtitle': 'Deep security scans powered by advanced AI. Choose the plan that fits your team.',
    'auditPricing.perMonth': '/ mo',
    'auditPricing.popular': 'Most Popular',
    'auditPricing.cta.paid': 'Upgrade Now',
    'auditPricing.upgradeNotice': 'Upgrade is processed through Stripe. Pricing is not configured yet — check back soon.',
    'auditPricing.feat.audits': 'Audits / month',
    'auditPricing.feat.auditsUnlimited': 'Unlimited',
    'auditPricing.feat.maxFiles': 'Max files per run',
    'auditPricing.feat.history': 'Run history',
    'auditPricing.feat.historyDays': '{n} days',
    'auditPricing.feat.patch': 'AI patch generation',
    'auditPricing.feat.seats': 'Team seats',
    'auditPricing.feat.seatsUnlimited': 'Unlimited',
    'auditPricing.feat.support': 'Support',
    'auditPricing.support.email': 'Email',
    'auditPricing.support.priority': 'Priority',
    'auditPricing.support.dedicated': 'Dedicated',
  },
  es: {
    'auditPricing.title': 'Precios de Auditoría',
    'auditPricing.subtitle': 'Análisis de seguridad profundos con IA avanzada. Elige el plan que se adapta a tu equipo.',
    'auditPricing.perMonth': '/ mes',
    'auditPricing.popular': 'Más Popular',
    'auditPricing.cta.paid': 'Actualizar Ahora',
    'auditPricing.upgradeNotice': 'La actualización se procesa con Stripe. Los precios aún no están configurados — vuelve pronto.',
    'auditPricing.feat.audits': 'Auditorías / mes',
    'auditPricing.feat.auditsUnlimited': 'Ilimitadas',
    'auditPricing.feat.maxFiles': 'Máx. archivos por ejecución',
    'auditPricing.feat.history': 'Historial de ejecuciones',
    'auditPricing.feat.historyDays': '{n} días',
    'auditPricing.feat.patch': 'Generación de parches con IA',
    'auditPricing.feat.seats': 'Puestos del equipo',
    'auditPricing.feat.seatsUnlimited': 'Ilimitados',
    'auditPricing.feat.support': 'Soporte',
    'auditPricing.support.email': 'Correo electrónico',
    'auditPricing.support.priority': 'Prioritario',
    'auditPricing.support.dedicated': 'Dedicado',
  },
  pt: {
    'auditPricing.title': 'Preços de Auditoria',
    'auditPricing.subtitle': 'Análises de segurança profundas com IA avançada. Escolha o plano que se encaixa na sua equipe.',
    'auditPricing.perMonth': '/ mês',
    'auditPricing.popular': 'Mais Popular',
    'auditPricing.cta.paid': 'Atualizar Agora',
    'auditPricing.upgradeNotice': 'A atualização é processada pelo Stripe. Os preços ainda não estão configurados — volte em breve.',
    'auditPricing.feat.audits': 'Auditorias / mês',
    'auditPricing.feat.auditsUnlimited': 'Ilimitadas',
    'auditPricing.feat.maxFiles': 'Máx. arquivos por execução',
    'auditPricing.feat.history': 'Histórico de execuções',
    'auditPricing.feat.historyDays': '{n} dias',
    'auditPricing.feat.patch': 'Geração de correções com IA',
    'auditPricing.feat.seats': 'Assentos da equipe',
    'auditPricing.feat.seatsUnlimited': 'Ilimitados',
    'auditPricing.feat.support': 'Suporte',
    'auditPricing.support.email': 'E-mail',
    'auditPricing.support.priority': 'Prioritário',
    'auditPricing.support.dedicated': 'Dedicado',
  },
  pl: {
    'auditPricing.title': 'Cennik Audytu',
    'auditPricing.subtitle': 'Dogłębne skany bezpieczeństwa z zaawansowaną AI. Wybierz plan dopasowany do Twojego zespołu.',
    'auditPricing.perMonth': '/ mies.',
    'auditPricing.popular': 'Najpopularniejszy',
    'auditPricing.cta.paid': 'Ulepsz teraz',
    'auditPricing.upgradeNotice': 'Ulepszenie jest przetwarzane przez Stripe. Ceny nie są jeszcze skonfigurowane — sprawdź wkrótce.',
    'auditPricing.feat.audits': 'Audyty / miesiąc',
    'auditPricing.feat.auditsUnlimited': 'Nieograniczone',
    'auditPricing.feat.maxFiles': 'Maks. plików na uruchomienie',
    'auditPricing.feat.history': 'Historia uruchomień',
    'auditPricing.feat.historyDays': '{n} dni',
    'auditPricing.feat.patch': 'Generowanie poprawek AI',
    'auditPricing.feat.seats': 'Miejsca w zespole',
    'auditPricing.feat.seatsUnlimited': 'Nieograniczone',
    'auditPricing.feat.support': 'Wsparcie',
    'auditPricing.support.email': 'E-mail',
    'auditPricing.support.priority': 'Priorytetowe',
    'auditPricing.support.dedicated': 'Dedykowane',
  },
  ru: {
    'auditPricing.title': 'Цены на аудит',
    'auditPricing.subtitle': 'Глубокие проверки безопасности на передовом ИИ. Выберите план для вашей команды.',
    'auditPricing.perMonth': '/ мес.',
    'auditPricing.popular': 'Самый популярный',
    'auditPricing.cta.paid': 'Обновить сейчас',
    'auditPricing.upgradeNotice': 'Обновление обрабатывается через Stripe. Цены ещё не настроены — загляните позже.',
    'auditPricing.feat.audits': 'Аудиты / месяц',
    'auditPricing.feat.auditsUnlimited': 'Неограниченно',
    'auditPricing.feat.maxFiles': 'Макс. файлов за запуск',
    'auditPricing.feat.history': 'История запусков',
    'auditPricing.feat.historyDays': '{n} дней',
    'auditPricing.feat.patch': 'Генерация исправлений ИИ',
    'auditPricing.feat.seats': 'Места в команде',
    'auditPricing.feat.seatsUnlimited': 'Неограниченно',
    'auditPricing.feat.support': 'Поддержка',
    'auditPricing.support.email': 'Электронная почта',
    'auditPricing.support.priority': 'Приоритетная',
    'auditPricing.support.dedicated': 'Выделенная',
  },
}

// ─── Structured contract consumed by the pricing page ────────────────────────

export type AuditLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export interface AuditTierCopy {
  popular?: string
  name: string
  description: string
  priceLabel: string
  perMonth: string
  features: string[]
  creditsLabel: string   // prominent credit allowance line (from pricingConfig)
  topupLabel?: string    // shown when the tier supports one-time top-ups
  ctaLabel: string
}

export interface AuditPageCopy {
  pageTitle: string
  pageSubtitle: string
  enterpriseCtaHref: string
  loadingLabel: string
  notConfigured: string
  errorLabel: string
  tiers: Record<string, AuditTierCopy>
}

// Numeric/structural facts per tier (mirror of pricingConfig, kept local so this
// module stays self-contained). NOTE: audits/files/history/seats are inferred
// defaults — adjust to taste; they are display-only here.
const TIER_FACTS: Record<string, {
  name: string; price: string; files: string; history: number; seats: string; support: string; popular?: boolean
}> = {
  starter:    { name: 'Starter',    price: '$29',  files: '20',        history: 30,  seats: '3',         support: 'email' },
  growth:     { name: 'Growth',     price: '$79',  files: '40',        history: 90,  seats: '10',        support: 'priority' },
  pro:        { name: 'Pro',        price: '$199', files: '60',        history: 180, seats: '25',        support: 'priority', popular: true },
  enterprise: { name: 'Enterprise', price: '$599', files: 'Unlimited', history: 365, seats: 'Unlimited', support: 'dedicated' },
}
const TIER_IDS = ['starter', 'growth', 'pro', 'enterprise']
const AUDITS_PER_MONTH: Record<string, string> = { starter: '20', growth: '100', pro: '300', enterprise: '' /* unlimited */ }
const SEATS_UNLIMITED = new Set(['enterprise'])

// Strings not present in the flat dictionary, per locale.
const EXTRA: Record<AuditLocale, { loading: string; error: string; enterpriseHref: string; topup: string; desc: Record<string, string> }> = {
  en: { loading: 'Processing…', error: 'Something went wrong. Please try again.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Instant one-time credit top-ups available',
        desc: { starter: 'For solo builders shipping often.', growth: 'For teams auditing continuously.', pro: 'High-volume scanning for busy teams.', enterprise: 'Unlimited scale with dedicated support.' } },
  es: { loading: 'Procesando…', error: 'Algo salió mal. Inténtalo de nuevo.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recargas instantáneas de créditos disponibles',
        desc: { starter: 'Para creadores que publican a menudo.', growth: 'Para equipos que auditan sin parar.', pro: 'Escaneo de alto volumen para equipos ocupados.', enterprise: 'Escala ilimitada con soporte dedicado.' } },
  pt: { loading: 'Processando…', error: 'Algo deu errado. Tente novamente.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recargas instantâneas de créditos disponíveis',
        desc: { starter: 'Para criadores que publicam com frequência.', growth: 'Para equipes que auditam continuamente.', pro: 'Varredura de alto volume para equipes ocupadas.', enterprise: 'Escala ilimitada com suporte dedicado.' } },
  pl: { loading: 'Przetwarzanie…', error: 'Coś poszło nie tak. Spróbuj ponownie.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Dostępne natychmiastowe, jednorazowe doładowania kredytów',
        desc: { starter: 'Dla twórców publikujących często.', growth: 'Dla zespołów audytujących bez przerwy.', pro: 'Skanowanie dużej skali dla zajętych zespołów.', enterprise: 'Nieograniczona skala i dedykowane wsparcie.' } },
  ru: { loading: 'Обработка…', error: 'Что-то пошло не так. Попробуйте снова.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Доступны мгновенные разовые пополнения кредитов',
        desc: { starter: 'Для авторов, которые часто публикуют.', growth: 'Для команд, аудитирующих постоянно.', pro: 'Высокообъёмное сканирование для занятых команд.', enterprise: 'Безграничный масштаб и выделенная поддержка.' } },
}

// Per-tier patch-generation line (strictly gated). A leading ✓/❌ is rendered by
// the pricing page as a coloured mark; Starter is read-only (no patch generation).
const PATCH_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: {
    starter:    '❌ Read-Only Reports (No AI patch generation)',
    growth:     '❌ No AI patch generation (Pro and up)',
    pro:        '✓ High-Volume AI Patch Generation & Automated Remediation (60 max files)',
    enterprise: '✓ Unlimited AI Patch Generation & Automated Remediation',
  },
  es: {
    starter:    '❌ Informes de solo lectura (sin generación de parches con IA)',
    growth:     '❌ Sin generación de parches con IA (Pro o superior)',
    pro:        '✓ Generación de parches con IA de alto volumen y remediación automatizada (60 archivos máx.)',
    enterprise: '✓ Generación de parches con IA ilimitada y remediación automatizada',
  },
  pt: {
    starter:    '❌ Relatórios somente leitura (sem geração de correções com IA)',
    growth:     '❌ Sem geração de correções com IA (Pro ou superior)',
    pro:        '✓ Geração de correções com IA de alto volume e remediação automatizada (60 arquivos máx.)',
    enterprise: '✓ Geração de correções com IA ilimitada e remediação automatizada',
  },
  pl: {
    starter:    '❌ Raporty tylko do odczytu (bez generowania poprawek AI)',
    growth:     '❌ Brak generowania poprawek AI (Pro i wyżej)',
    pro:        '✓ Wysokowydajne generowanie poprawek AI i automatyczna naprawa (maks. 60 plików)',
    enterprise: '✓ Nieograniczone generowanie poprawek AI i automatyczna naprawa',
  },
  ru: {
    starter:    '❌ Отчёты только для чтения (без генерации исправлений ИИ)',
    growth:     '❌ Без генерации исправлений ИИ (Pro и выше)',
    pro:        '✓ Высокообъёмная генерация исправлений ИИ и автоматическое исправление (до 60 файлов)',
    enterprise: '✓ Неограниченная генерация исправлений ИИ и автоматическое исправление',
  },
}

export function getAuditPricingCopy(lang: string): AuditPageCopy {
  const loc: AuditLocale = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as AuditLocale
  const L = AUDIT_PRICING_COPY[loc] || AUDIT_PRICING_COPY.en
  const X = EXTRA[loc]

  const creditsById: Record<string, { credits: number | null; topup: boolean }> = {}
  for (const t of AUDIT_PRICING_CONFIG.tiers) creditsById[t.id] = { credits: t.monthlyCredits, topup: t.topupAvailable }

  const tiers: Record<string, AuditTierCopy> = {}
  for (const id of TIER_IDS) {
    const f = TIER_FACTS[id]
    const audits = AUDITS_PER_MONTH[id] || L['auditPricing.feat.auditsUnlimited']
    const seats = SEATS_UNLIMITED.has(id) ? L['auditPricing.feat.seatsUnlimited'] : f.seats
    const files = f.files === 'Unlimited' ? L['auditPricing.feat.auditsUnlimited'] : f.files
    const historyDays = L['auditPricing.feat.historyDays'].replace('{n}', String(f.history))
    const features: string[] = [
      `${audits} · ${L['auditPricing.feat.audits']}`,
      `${files} · ${L['auditPricing.feat.maxFiles']}`,
      `${historyDays} · ${L['auditPricing.feat.history']}`,
      (PATCH_BY_TIER[loc] && PATCH_BY_TIER[loc][id]) || L['auditPricing.feat.patch'],
      `${seats} · ${L['auditPricing.feat.seats']}`,
      `${L['auditPricing.support.' + f.support]} · ${L['auditPricing.feat.support']}`,
    ]
    tiers[id] = {
      popular: f.popular ? L['auditPricing.popular'] : undefined,
      name: f.name, // tier proper-name kept in English by design
      description: X.desc[id],
      priceLabel: f.price,
      perMonth: L['auditPricing.perMonth'],
      features,
      creditsLabel: formatCredits(creditsById[id] ? creditsById[id].credits : null),
      topupLabel: creditsById[id] && creditsById[id].topup ? X.topup : undefined,
      ctaLabel: L['auditPricing.cta.paid'],
    }
  }

  return {
    pageTitle: L['auditPricing.title'],
    pageSubtitle: L['auditPricing.subtitle'],
    enterpriseCtaHref: X.enterpriseHref,
    loadingLabel: X.loading,
    notConfigured: L['auditPricing.upgradeNotice'],
    errorLabel: X.error,
    tiers,
  }
}
