/**
 * saas/lib/i18n/auditPricingCopy.ts
 * Audit Project — standalone 5-language copy for the audit pricing page.
 * Self-contained: zero imports from the core SaaS i18n system.
 * Supported locales: en | es | pt | pl | ru
 */

export type AuditLocale = "en" | "es" | "pt" | "pl" | "ru";

export interface AuditTierCopy {
  name: string;
  description: string;
  auditLabel: string;
  ctaLabel: string;
  popularBadge: string;
  features: string[];
}

export interface AuditPageCopy {
  pageTitle: string;
  pageSubtitle: string;
  perMonth: string;
  notConfigured: string;
  contactSales: string;
  tiers: {
    audit_starter: AuditTierCopy;
    audit_growth: AuditTierCopy;
    audit_pro: AuditTierCopy;
    audit_enterprise: AuditTierCopy;
  };
}

// ─── English ────────────────────────────────────────────────────────────────

const EN: AuditPageCopy = {
  pageTitle: "Audit Project Plans",
  pageSubtitle: "Choose the audit tier that fits your workflow.",
  perMonth: "/mo",
  notConfigured: "This tier is not yet available. Please check back soon.",
  contactSales: "Contact Sales",
  tiers: {
    audit_starter: {
      name: "Audit Starter",
      description: "Perfect for freelancers and small teams getting started.",
      auditLabel: "3 Audits / month",
      ctaLabel: "Get Started",
      popularBadge: "",
      features: [
        "3 full site audits per month",
        "AI-generated recommendations",
        "PDF export",
        "Email support",
      ],
    },
    audit_growth: {
      name: "Audit Growth",
      description: "Ideal for growing agencies managing multiple clients.",
      auditLabel: "20 Audits / month",
      ctaLabel: "Start Growing",
      popularBadge: "Most Popular",
      features: [
        "20 full site audits per month",
        "Priority AI recommendations",
        "Branded PDF export",
        "White-label reports",
        "Priority email support",
      ],
    },
    audit_pro: {
      name: "Audit Pro",
      description: "For high-volume agencies and in-house SEO teams.",
      auditLabel: "100 Audits / month",
      ctaLabel: "Go Pro",
      popularBadge: "",
      features: [
        "100 full site audits per month",
        "Advanced AI insights",
        "Branded & white-label PDF export",
        "API access",
        "Dedicated account manager",
      ],
    },
    audit_enterprise: {
      name: "Audit Enterprise",
      description: "Unlimited audits for enterprise-scale operations.",
      auditLabel: "Unlimited Audits",
      ctaLabel: "Contact Sales",
      popularBadge: "",
      features: [
        "Unlimited site audits",
        "Custom AI models",
        "SSO & team management",
        "SLA guarantee",
        "Custom onboarding",
      ],
    },
  },
};

// ─── Spanish ─────────────────────────────────────────────────────────────────

const ES: AuditPageCopy = {
  pageTitle: "Planes de Auditoría",
  pageSubtitle: "Elige el nivel de auditoría que se adapta a tu flujo de trabajo.",
  perMonth: "/mes",
  notConfigured: "Este nivel aún no está disponible. Vuelve pronto.",
  contactSales: "Contactar Ventas",
  tiers: {
    audit_starter: {
      name: "Auditoría Starter",
      description: "Perfecto para freelancers y equipos pequeños.",
      auditLabel: "3 Auditorías / mes",
      ctaLabel: "Comenzar",
      popularBadge: "",
      features: [
        "3 auditorías completas por mes",
        "Recomendaciones generadas por IA",
        "Exportación en PDF",
        "Soporte por correo",
      ],
    },
    audit_growth: {
      name: "Auditoría Growth",
      description: "Ideal para agencias en crecimiento con múltiples clientes.",
      auditLabel: "20 Auditorías / mes",
      ctaLabel: "Crecer Ahora",
      popularBadge: "Más Popular",
      features: [
        "20 auditorías completas por mes",
        "Recomendaciones IA prioritarias",
        "Exportación PDF con marca",
        "Informes de marca blanca",
        "Soporte prioritario",
      ],
    },
    audit_pro: {
      name: "Auditoría Pro",
      description: "Para agencias de alto volumen y equipos SEO internos.",
      auditLabel: "100 Auditorías / mes",
      ctaLabel: "Ir a Pro",
      popularBadge: "",
      features: [
        "100 auditorías completas por mes",
        "Análisis avanzado de IA",
        "PDF con marca y marca blanca",
        "Acceso a API",
        "Gestor de cuenta dedicado",
      ],
    },
    audit_enterprise: {
      name: "Auditoría Enterprise",
      description: "Auditorías ilimitadas para operaciones a escala empresarial.",
      auditLabel: "Auditorías Ilimitadas",
      ctaLabel: "Contactar Ventas",
      popularBadge: "",
      features: [
        "Auditorías de sitios ilimitadas",
        "Modelos de IA personalizados",
        "SSO y gestión de equipos",
        "Garantía SLA",
        "Incorporación personalizada",
      ],
    },
  },
};

// ─── Portuguese ───────────────────────────────────────────────────────────────

const PT: AuditPageCopy = {
  pageTitle: "Planos de Auditoria",
  pageSubtitle: "Escolha o nível de auditoria que se adapta ao seu fluxo de trabalho.",
  perMonth: "/mês",
  notConfigured: "Este nível ainda não está disponível. Volte em breve.",
  contactSales: "Contactar Vendas",
  tiers: {
    audit_starter: {
      name: "Auditoria Starter",
      description: "Perfeito para freelancers e pequenas equipas.",
      auditLabel: "3 Auditorias / mês",
      ctaLabel: "Começar",
      popularBadge: "",
      features: [
        "3 auditorias completas por mês",
        "Recomendações geradas por IA",
        "Exportação em PDF",
        "Suporte por e-mail",
      ],
    },
    audit_growth: {
      name: "Auditoria Growth",
      description: "Ideal para agências em crescimento com múltiplos clientes.",
      auditLabel: "20 Auditorias / mês",
      ctaLabel: "Crescer Agora",
      popularBadge: "Mais Popular",
      features: [
        "20 auditorias completas por mês",
        "Recomendações IA prioritárias",
        "Exportação PDF com marca",
        "Relatórios de marca branca",
        "Suporte prioritário",
      ],
    },
    audit_pro: {
      name: "Auditoria Pro",
      description: "Para agências de alto volume e equipas SEO internas.",
      auditLabel: "100 Auditorias / mês",
      ctaLabel: "Ir para Pro",
      popularBadge: "",
      features: [
        "100 auditorias completas por mês",
        "Análise avançada de IA",
        "PDF com marca e marca branca",
        "Acesso à API",
        "Gestor de conta dedicado",
      ],
    },
    audit_enterprise: {
      name: "Auditoria Enterprise",
      description: "Auditorias ilimitadas para operações em escala empresarial.",
      auditLabel: "Auditorias Ilimitadas",
      ctaLabel: "Contactar Vendas",
      popularBadge: "",
      features: [
        "Auditorias de sites ilimitadas",
        "Modelos de IA personalizados",
        "SSO e gestão de equipas",
        "Garantia SLA",
        "Integração personalizada",
      ],
    },
  },
};

// ─── Polish ───────────────────────────────────────────────────────────────────

const PL: AuditPageCopy = {
  pageTitle: "Plany Audytu",
  pageSubtitle: "Wybierz poziom audytu dopasowany do Twojego przepływu pracy.",
  perMonth: "/mies.",
  notConfigured: "Ten poziom nie jest jeszcze dostępny. Wróć wkrótce.",
  contactSales: "Kontakt ze sprzedażą",
  tiers: {
    audit_starter: {
      name: "Audyt Starter",
      description: "Idealny dla freelancerów i małych zespołów.",
      auditLabel: "3 Audyty / mies.",
      ctaLabel: "Zacznij",
      popularBadge: "",
      features: [
        "3 pełne audyty miesięcznie",
        "Rekomendacje generowane przez AI",
        "Eksport do PDF",
        "Wsparcie e-mail",
      ],
    },
    audit_growth: {
      name: "Audyt Growth",
      description: "Idealny dla rozwijających się agencji z wieloma klientami.",
      auditLabel: "20 Audytów / mies.",
      ctaLabel: "Rozwijaj się",
      popularBadge: "Najpopularniejszy",
      features: [
        "20 pełnych audytów miesięcznie",
        "Priorytetowe rekomendacje AI",
        "Eksport PDF z marką",
        "Raporty white-label",
        "Priorytetowe wsparcie",
      ],
    },
    audit_pro: {
      name: "Audyt Pro",
      description: "Dla agencji o dużym wolumenie i wewnętrznych zespołów SEO.",
      auditLabel: "100 Audytów / mies.",
      ctaLabel: "Przejdź na Pro",
      popularBadge: "",
      features: [
        "100 pełnych audytów miesięcznie",
        "Zaawansowane analizy AI",
        "PDF z marką i white-label",
        "Dostęp do API",
        "Dedykowany opiekun konta",
      ],
    },
    audit_enterprise: {
      name: "Audyt Enterprise",
      description: "Nieograniczone audyty dla operacji w skali korporacyjnej.",
      auditLabel: "Nieograniczone Audyty",
      ctaLabel: "Kontakt ze sprzedażą",
      popularBadge: "",
      features: [
        "Nieograniczone audyty stron",
        "Niestandardowe modele AI",
        "SSO i zarządzanie zespołem",
        "Gwarancja SLA",
        "Niestandardowe wdrożenie",
      ],
    },
  },
};

// ─── Russian ──────────────────────────────────────────────────────────────────

const RU: AuditPageCopy = {
  pageTitle: "Планы аудита",
  pageSubtitle: "Выберите уровень аудита, подходящий для вашего рабочего процесса.",
  perMonth: "/мес.",
  notConfigured: "Этот уровень пока недоступен. Загляните позже.",
  contactSales: "Связаться с отделом продаж",
  tiers: {
    audit_starter: {
      name: "Аудит Starter",
      description: "Идеально для фрилансеров и небольших команд.",
      auditLabel: "3 аудита / мес.",
      ctaLabel: "Начать",
      popularBadge: "",
      features: [
        "3 полных аудита в месяц",
        "Рекомендации на основе ИИ",
        "Экспорт в PDF",
        "Поддержка по электронной почте",
      ],
    },
    audit_growth: {
      name: "Аудит Growth",
      description: "Идеально для растущих агентств с несколькими клиентами.",
      auditLabel: "20 аудитов / мес.",
      ctaLabel: "Начать рост",
      popularBadge: "Самый популярный",
      features: [
        "20 полных аудитов в месяц",
        "Приоритетные рекомендации ИИ",
        "Экспорт PDF с брендом",
        "Отчёты white-label",
        "Приоритетная поддержка",
      ],
    },
    audit_pro: {
      name: "Аудит Pro",
      description: "Для высоконагруженных агентств и внутренних SEO-команд.",
      auditLabel: "100 аудитов / мес.",
      ctaLabel: "Перейти на Pro",
      popularBadge: "",
      features: [
        "100 полных аудитов в месяц",
        "Расширенная аналитика ИИ",
        "PDF с брендом и white-label",
        "Доступ к API",
        "Персональный менеджер",
      ],
    },
    audit_enterprise: {
      name: "Аудит Enterprise",
      description: "Неограниченные аудиты для корпоративных операций.",
      auditLabel: "Неограниченные аудиты",
      ctaLabel: "Связаться с отделом продаж",
      popularBadge: "",
      features: [
        "Неограниченные аудиты сайтов",
        "Пользовательские модели ИИ",
        "SSO и управление командой",
        "Гарантия SLA",
        "Индивидуальное внедрение",
      ],
    },
  },
};

// ─── Locale map & accessor ────────────────────────────────────────────────────

const LOCALE_MAP: Record<AuditLocale, AuditPageCopy> = { en: EN, es: ES, pt: PT, pl: PL, ru: RU };

/**
 * Returns the full audit pricing copy for the requested locale.
 * Falls back to English if the locale is unrecognised.
 */
export function getAuditPricingCopy(locale: AuditLocale): AuditPageCopy {
  return LOCALE_MAP[locale] ?? EN;
}
