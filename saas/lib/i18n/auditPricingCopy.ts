// saas/lib/i18n/auditPricingCopy.ts
// Audit pricing page copy — four commercial tiers, all 5 locales, self-contained.
// Reusable labels are localized; tier proper-names (Starter/Growth/Pro/Enterprise)
// are kept in English across locales by design (standard SaaS practice).
// v2: added credit-limit strings, ⚡ icon, and top-up availability notice per tier.

type FlatCopy = Record<string, string>

export const AUDIT_PRICING_COPY: Record<string, FlatCopy> = {
  en: {
    'auditPricing.title': 'Audit Pricing',
    'auditPricing.subtitle': 'Deep security scans powered by GPT-5.5. Choose the plan that fits your team.',
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
    // ── Credit limit lines (⚡ prefix added at render time) ──────────────────
    'auditPricing.feat.credits.starter':    '1,000 monthly audit/building credits',
    'auditPricing.feat.credits.growth':     '3,000 monthly audit/building credits',
    'auditPricing.feat.credits.pro':        '10,000 monthly audit/building credits',
    'auditPricing.feat.credits.enterprise': 'Custom high-volume building credits',
    // ── Top-up availability notice ───────────────────────────────────────────
    'auditPricing.feat.topup': 'Instant one-time credit top-ups available',
  },
  es: {
    'auditPricing.title': 'Precios de Auditoría',
    'auditPricing.subtitle': 'Análisis de seguridad profundos con GPT-5.5. Elige el plan que se adapta a tu equipo.',
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
    'auditPricing.feat.credits.starter':    '1.000 créditos mensuales de auditoría/construcción',
    'auditPricing.feat.credits.growth':     '3.000 créditos mensuales de auditoría/construcción',
    'auditPricing.feat.credits.pro':        '10.000 créditos mensuales de auditoría/construcción',
    'auditPricing.feat.credits.enterprise': 'Créditos de construcción de alto volumen personalizados',
    'auditPricing.feat.topup': 'Recargas de créditos únicas disponibles al instante',
  },
  pt: {
    'auditPricing.title': 'Preços de Auditoria',
    'auditPricing.subtitle': 'Análises de segurança profundas com GPT-5.5. Escolha o plano que se encaixa na sua equipe.',
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
    'auditPricing.feat.credits.starter':    '1.000 créditos mensais de auditoria/construção',
    'auditPricing.feat.credits.growth':     '3.000 créditos mensais de auditoria/construção',
    'auditPricing.feat.credits.pro':        '10.000 créditos mensais de auditoria/construção',
    'auditPricing.feat.credits.enterprise': 'Créditos de construção de alto volume personalizados',
    'auditPricing.feat.topup': 'Recargas avulsas de créditos disponíveis instantaneamente',
  },
  pl: {
    'auditPricing.title': 'Cennik Audytu',
    'auditPricing.subtitle': 'Dogłębne skany bezpieczeństwa z GPT-5.5. Wybierz plan dopasowany do Twojego zespołu.',
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
    'auditPricing.feat.credits.starter':    '1 000 miesięcznych kredytów audytu/budowania',
    'auditPricing.feat.credits.growth':     '3 000 miesięcznych kredytów audytu/budowania',
    'auditPricing.feat.credits.pro':        '10 000 miesięcznych kredytów audytu/budowania',
    'auditPricing.feat.credits.enterprise': 'Niestandardowe kredyty budowania o dużej skali',
    'auditPricing.feat.topup': 'Jednorazowe doładowania kredytów dostępne natychmiast',
  },
  ru: {
    'auditPricing.title': 'Цены на аудит',
    'auditPricing.subtitle': 'Глубокие проверки безопасности на GPT-5.5. Выберите план для вашей команды.',
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
    'auditPricing.feat.credits.starter':    '1 000 ежемесячных кредитов аудита/сборки',
    'auditPricing.feat.credits.growth':     '3 000 ежемесячных кредитов аудита/сборки',
    'auditPricing.feat.credits.pro':        '10 000 ежемесячных кредитов аудита/сборки',
    'auditPricing.feat.credits.enterprise': 'Индивидуальные кредиты сборки большого объёма',
    'auditPricing.feat.topup': 'Разовые пополнения кредитов доступны мгновенно',
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
  growth:     { name: 'Growth',     price: '$79',  files: '40',        history: 90,  seats: '10',        support: 'priority', popular: true },
  pro:        { name: 'Pro',        price: '$199', files: '60',        history: 180, seats: '25',        support: 'priority' },
  enterprise: { name: 'Enterprise', price: '$599', files: 'Unlimited', history: 365, seats: 'Unlimited', support: 'dedicated' },
}
const TIER_IDS = ['starter', 'growth', 'pro', 'enterprise']
const AUDITS_PER_MONTH: Record<string, string> = { starter: '20', growth: '100', pro: '300', enterprise: '' /* unlimited */ }
const SEATS_UNLIMITED = new Set(['enterprise'])
// Tiers that show the instant top-up notice (Enterprise has custom credits — no topup line).
const TOPUP_TIERS = new Set(['starter', 'growth', 'pro'])

// Strings not present in the flat dictionary, per locale.
const EXTRA: Record<AuditLocale, { loading: string; error: string; enterpriseHref: string; desc: Record<string, string> }> = {
  en: { loading: 'Processing…', error: 'Something went wrong. Please try again.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        desc: { starter: 'For solo builders shipping often.', growth: 'For teams auditing continuously.', pro: 'High-volume scanning for busy teams.', enterprise: 'Unlimited scale with dedicated support.' } },
  es: { loading: 'Procesando…', error: 'Algo salió mal. Inténtalo de nuevo.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        desc: { starter: 'Para creadores que publican a menudo.', growth: 'Para equipos que auditan sin parar.', pro: 'Escaneo de alto volumen para equipos ocupados.', enterprise: 'Escala ilimitada con soporte dedicado.' } },
  pt: { loading: 'Processando…', error: 'Algo deu errado. Tente novamente.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        desc: { starter: 'Para criadores que publicam com frequência.', growth: 'Para equipes que auditam continuamente.', pro: 'Varredura de alto volume para equipes ocupadas.', enterprise: 'Escala ilimitada com suporte dedicado.' } },
  pl: { loading: 'Przetwarzanie…', error: 'Coś poszło nie tak. Spróbuj ponownie.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        desc: { starter: 'Dla twórców publikujących często.', growth: 'Dla zespołów audytujących bez przerwy.', pro: 'Skanowanie dużej skali dla zajętych zespołów.', enterprise: 'Nieograniczona skala i dedykowane wsparcie.' } },
  ru: { loading: 'Обработка…', error: 'Что-то пошло не так. Попробуйте снова.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        desc: { starter: 'Для авторов, которые часто публикуют.', growth: 'Для команд, аудитирующих постоянно.', pro: 'Высокообъёмное сканирование для занятых команд.', enterprise: 'Безграничный масштаб и выделенная поддержка.' } },
}

export function getAuditPricingCopy(lang: string): AuditPageCopy {
  const loc: AuditLocale = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as AuditLocale
  const L = AUDIT_PRICING_COPY[loc] || AUDIT_PRICING_COPY.en
  const X = EXTRA[loc]

  const tiers: Record<string, AuditTierCopy> = {}
  for (const id of TIER_IDS) {
    const f = TIER_FACTS[id]
    const audits = AUDITS_PER_MONTH[id] || L['auditPricing.feat.auditsUnlimited']
    const seats = SEATS_UNLIMITED.has(id) ? L['auditPricing.feat.seatsUnlimited'] : f.seats
    const files = f.files === 'Unlimited' ? L['auditPricing.feat.auditsUnlimited'] : f.files
    const historyDays = L['auditPricing.feat.historyDays'].replace('{n}', String(f.history))

    // ── Credit limit line — ⚡ prefix makes it scannable at a glance ─────────
    const creditLine = `⚡ ${L[`auditPricing.feat.credits.${id}`]}`

    const features: string[] = [
      // Credit limit is the FIRST feature — most important buying signal.
      creditLine,
      `${audits} · ${L['auditPricing.feat.audits']}`,
      `${files} · ${L['auditPricing.feat.maxFiles']}`,
      `${historyDays} · ${L['auditPricing.feat.history']}`,
      L['auditPricing.feat.patch'],
      `${seats} · ${L['auditPricing.feat.seats']}`,
      `${L['auditPricing.support.' + f.support]} · ${L['auditPricing.feat.support']}`,
    ]

    // Append top-up notice for all non-Enterprise tiers.
    if (TOPUP_TIERS.has(id)) {
      features.push(`⚡ ${L['auditPricing.feat.topup']}`)
    }

    tiers[id] = {
      popular: f.popular ? L['auditPricing.popular'] : undefined,
      name: f.name, // tier proper-name kept in English by design
      description: X.desc[id],
      priceLabel: f.price,
      perMonth: L['auditPricing.perMonth'],
      features,
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
