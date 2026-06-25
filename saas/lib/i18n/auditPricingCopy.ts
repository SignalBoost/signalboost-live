// saas/lib/i18n/auditPricingCopy.ts
// Audit/security pricing page copy — four commercial tiers, all 5 locales,
// self-contained. Reusable labels are localized; tier proper-names
// (Starter/Growth/Pro/Enterprise) are kept in English across locales by design.
//
// Tier positioning (commercial packaging):
//   Growth  ($79)  — static code auditing + UX integrity. No patch gen, no cyber.
//   Pro     ($199) — everything in Growth + AI-assisted Git patch generation.
//   Ent.    ($599) — everything in Pro + the live cybersecurity suite
//                    (vulnerability mapping, continuous threat assessment,
//                     dependency exploit tracking).

import { AUDIT_PRICING_CONFIG, formatCredits } from '@/lib/audit/pricingConfig'

type FlatCopy = Record<string, string>

export const AUDIT_PRICING_COPY: Record<string, FlatCopy> = {
  en: {
    'auditPricing.kicker': 'Audit',
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
    'auditPricing.kicker': 'Auditoría',
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
    'auditPricing.kicker': 'Auditoria',
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
    'auditPricing.kicker': 'Audyt',
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
    'auditPricing.kicker': 'Аудит',
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
  creditsLabel: string
  topupLabel?: string
  ctaLabel: string
}

export interface AuditPageCopy {
  pageKicker: string
  pageTitle: string
  pageSubtitle: string
  enterpriseCtaHref: string
  loadingLabel: string
  notConfigured: string
  errorLabel: string
  tiers: Record<string, AuditTierCopy>
  complianceDisclaimer: string
}

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

const EXTRA: Record<AuditLocale, { loading: string; error: string; enterpriseHref: string; topup: string; desc: Record<string, string> }> = {
  en: { loading: 'Processing…', error: 'Something went wrong. Please try again.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Instant one-time credit top-ups available',
        desc: { starter: 'For solo builders shipping often.', growth: 'Static auditing baseline for growing teams.', pro: 'Adds AI-assisted Git patch generation.', enterprise: 'Adds the full live cybersecurity suite.' } },
  es: { loading: 'Procesando…', error: 'Algo salió mal. Inténtalo de nuevo.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recargas instantáneas de créditos disponibles',
        desc: { starter: 'Para creadores que publican a menudo.', growth: 'Base de auditoría estática para equipos en crecimiento.', pro: 'Añade generación de parches Git asistida por IA.', enterprise: 'Añade la suite completa de ciberseguridad en vivo.' } },
  pt: { loading: 'Processando…', error: 'Algo deu errado. Tente novamente.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recargas instantâneas de créditos disponíveis',
        desc: { starter: 'Para criadores que publicam com frequência.', growth: 'Base de auditoria estática para equipes em crescimento.', pro: 'Adiciona geração de correções Git assistida por IA.', enterprise: 'Adiciona a suíte completa de cibersegurança em tempo real.' } },
  pl: { loading: 'Przetwarzanie…', error: 'Coś poszło nie tak. Spróbuj ponownie.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Dostępne natychmiastowe, jednorazowe doładowania kredytów',
        desc: { starter: 'Dla twórców publikujących często.', growth: 'Bazowy audyt statyczny dla rosnących zespołów.', pro: 'Dodaje generowanie poprawek Git wspomagane przez AI.', enterprise: 'Dodaje pełny pakiet cyberbezpieczeństwa na żywo.' } },
  ru: { loading: 'Обработка…', error: 'Что-то пошло не так. Попробуйте снова.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Доступны мгновенные разовые пополнения кредитов',
        desc: { starter: 'Для авторов, которые часто публикуют.', growth: 'Базовый статический аудит для растущих команд.', pro: 'Добавляет генерацию Git-патчей с помощью ИИ.', enterprise: 'Добавляет полный пакет кибербезопасности в реальном времени.' } },
}

// Static repository auditing scope (always included; ✓). Growth = standard, Pro =
// full static, Enterprise = full + custom rulesets.
const REPO_AUDIT_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: { starter: '✓ Core repository auditing', growth: '✓ Standard static code auditing', pro: '✓ Full static code auditing', enterprise: '✓ Full static auditing + custom rulesets' },
  es: { starter: '✓ Auditoría básica del repositorio', growth: '✓ Auditoría estática estándar del código', pro: '✓ Auditoría estática completa del código', enterprise: '✓ Auditoría estática completa + reglas personalizadas' },
  pt: { starter: '✓ Auditoria básica do repositório', growth: '✓ Auditoria estática padrão do código', pro: '✓ Auditoria estática completa do código', enterprise: '✓ Auditoria estática completa + regras personalizadas' },
  pl: { starter: '✓ Podstawowy audyt repozytorium', growth: '✓ Standardowy statyczny audyt kodu', pro: '✓ Pełny statyczny audyt kodu', enterprise: '✓ Pełny audyt statyczny + własne reguły' },
  ru: { starter: '✓ Базовый аудит репозитория', growth: '✓ Стандартный статический аудит кода', pro: '✓ Полный статический аудит кода', enterprise: '✓ Полный статический аудит + свои правила' },
}

// UX integrity checks. Included from Growth up (✓); Starter excluded (❌).
const UX_INTEGRITY_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: { starter: '❌ UX integrity checks', growth: '✓ UX integrity checks', pro: '✓ UX integrity checks', enterprise: '✓ UX integrity checks (priority)' },
  es: { starter: '❌ Comprobaciones de integridad de UX', growth: '✓ Comprobaciones de integridad de UX', pro: '✓ Comprobaciones de integridad de UX', enterprise: '✓ Comprobaciones de integridad de UX (prioritarias)' },
  pt: { starter: '❌ Verificações de integridade de UX', growth: '✓ Verificações de integridade de UX', pro: '✓ Verificações de integridade de UX', enterprise: '✓ Verificações de integridade de UX (prioritárias)' },
  pl: { starter: '❌ Kontrole integralności UX', growth: '✓ Kontrole integralności UX', pro: '✓ Kontrole integralności UX', enterprise: '✓ Kontrole integralności UX (priorytet)' },
  ru: { starter: '❌ Проверки целостности UX', growth: '✓ Проверки целостности UX', pro: '✓ Проверки целостности UX', enterprise: '✓ Проверки целостности UX (приоритет)' },
}

// AI-assisted Git patch generation. Unlocked at Pro (✓); Starter & Growth read-only (❌).
const PATCH_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: { starter: '❌ Read-only reports (no AI patch generation)', growth: '❌ Read-only reports (no AI patch generation)', pro: '✓ AI-assisted Git patch generation (PR patches)', enterprise: '✓ AI-assisted Git patch generation (unlimited)' },
  es: { starter: '❌ Informes de solo lectura (sin generación de parches con IA)', growth: '❌ Informes de solo lectura (sin generación de parches con IA)', pro: '✓ Generación de parches Git asistida por IA (parches PR)', enterprise: '✓ Generación de parches Git asistida por IA (ilimitada)' },
  pt: { starter: '❌ Relatórios somente leitura (sem geração de correções com IA)', growth: '❌ Relatórios somente leitura (sem geração de correções com IA)', pro: '✓ Geração de correções Git assistida por IA (correções PR)', enterprise: '✓ Geração de correções Git assistida por IA (ilimitada)' },
  pl: { starter: '❌ Raporty tylko do odczytu (bez generowania poprawek AI)', growth: '❌ Raporty tylko do odczytu (bez generowania poprawek AI)', pro: '✓ Generowanie poprawek Git wspomagane przez AI (poprawki PR)', enterprise: '✓ Generowanie poprawek Git wspomagane przez AI (bez limitu)' },
  ru: { starter: '❌ Отчёты только для чтения (без генерации патчей ИИ)', growth: '❌ Отчёты только для чтения (без генерации патчей ИИ)', pro: '✓ Генерация Git-патчей с помощью ИИ (PR-патчи)', enterprise: '✓ Генерация Git-патчей с помощью ИИ (без ограничений)' },
}

// Live cybersecurity suite — ENTERPRISE ONLY. Enterprise gets three ✓ lines;
// every lower tier shows a single ❌ "Enterprise-gated" line.
const CYBER_ENTERPRISE: Record<AuditLocale, string[]> = {
  en: ['✓ Live cybersecurity vulnerability mapping', '✓ Continuous cybersecurity threat assessment', '✓ Dependency exploit tracking'],
  es: ['✓ Mapeo en vivo de vulnerabilidades de ciberseguridad', '✓ Evaluación continua de amenazas de ciberseguridad', '✓ Seguimiento de exploits en dependencias'],
  pt: ['✓ Mapeamento de vulnerabilidades de cibersegurança em tempo real', '✓ Avaliação contínua de ameaças de cibersegurança', '✓ Rastreamento de exploits em dependências'],
  pl: ['✓ Mapowanie podatności cyberbezpieczeństwa na żywo', '✓ Ciągła ocena zagrożeń cyberbezpieczeństwa', '✓ Śledzenie exploitów w zależnościach'],
  ru: ['✓ Картирование уязвимостей кибербезопасности в реальном времени', '✓ Непрерывная оценка угроз кибербезопасности', '✓ Отслеживание эксплойтов в зависимостях'],
}
const CYBER_LOCKED: Record<AuditLocale, string> = {
  en: '❌ Live cybersecurity suite (Enterprise)',
  es: '❌ Suite de ciberseguridad en vivo (Enterprise)',
  pt: '❌ Suíte de cibersegurança em tempo real (Enterprise)',
  pl: '❌ Pakiet cyberbezpieczeństwa na żywo (Enterprise)',
  ru: '❌ Пакет кибербезопасности в реальном времени (Enterprise)',
}

// Base-of-page compliance safeguard (localized). Rendered once below the grid.
const DISCLAIMER: Record<AuditLocale, string> = {
  en: 'SignalBoost provides automated compliance readiness mapping and cybersecurity posture analysis. It does not issue official compliance certifications.',
  es: 'SignalBoost ofrece mapeo automatizado de preparación para el cumplimiento y análisis de la postura de ciberseguridad. No emite certificaciones de cumplimiento oficiales.',
  pt: 'A SignalBoost fornece mapeamento automatizado de prontidão para conformidade e análise da postura de cibersegurança. Não emite certificações de conformidade oficiais.',
  pl: 'SignalBoost zapewnia zautomatyzowane mapowanie gotowości do zgodności oraz analizę stanu cyberbezpieczeństwa. Nie wydaje oficjalnych certyfikatów zgodności.',
  ru: 'SignalBoost предоставляет автоматизированное картирование готовности к соответствию и анализ состояния кибербезопасности. Он не выдаёт официальные сертификаты соответствия.',
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
    const isEnterprise = id === 'enterprise'
    const audits = AUDITS_PER_MONTH[id] || L['auditPricing.feat.auditsUnlimited']
    const seats = SEATS_UNLIMITED.has(id) ? L['auditPricing.feat.seatsUnlimited'] : f.seats
    const files = f.files === 'Unlimited' ? L['auditPricing.feat.auditsUnlimited'] : f.files
    const historyDays = L['auditPricing.feat.historyDays'].replace('{n}', String(f.history))

    // Cybersecurity suite: three ✓ lines on Enterprise; one ❌ gate line otherwise.
    const cyber = isEnterprise ? CYBER_ENTERPRISE[loc] : [CYBER_LOCKED[loc]]

    const features: string[] = [
      `${audits} · ${L['auditPricing.feat.audits']}`,
      `${files} · ${L['auditPricing.feat.maxFiles']}`,
      `${historyDays} · ${L['auditPricing.feat.history']}`,
      REPO_AUDIT_BY_TIER[loc][id],
      UX_INTEGRITY_BY_TIER[loc][id],
      PATCH_BY_TIER[loc][id],
      ...cyber,
      `${seats} · ${L['auditPricing.feat.seats']}`,
      `${L['auditPricing.support.' + f.support]} · ${L['auditPricing.feat.support']}`,
    ].filter(Boolean)

    tiers[id] = {
      popular: f.popular ? L['auditPricing.popular'] : undefined,
      name: f.name,
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
    pageKicker: L['auditPricing.kicker'],
    pageTitle: L['auditPricing.title'],
    pageSubtitle: L['auditPricing.subtitle'],
    enterpriseCtaHref: X.enterpriseHref,
    loadingLabel: X.loading,
    notConfigured: L['auditPricing.upgradeNotice'],
    errorLabel: X.error,
    tiers,
    complianceDisclaimer: DISCLAIMER[loc] || DISCLAIMER.en,
  }
}
