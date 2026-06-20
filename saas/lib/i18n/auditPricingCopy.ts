/**
 * saas/lib/i18n/auditPricingCopy.ts
 * All 5-language copy for the Audit Pricing page.
 * Fully self-contained — no imports from platform i18n or plan types.
 */

export type AuditLocale = "en" | "es" | "pt" | "pl" | "ru";

export interface AuditTierCopy {
  name: string;
  description: string;
  priceLabel: string;
  perMonth: string;
  auditBadge: string;
  ctaLabel: string;
  popular: string;
  features: readonly string[];
}

export interface AuditPageCopy {
  pageTitle: string;
  pageSubtitle: string;
  enterpriseCtaLabel: string;
  enterpriseCtaHref: string;
  notConfigured: string;
  loadingLabel: string;
  errorLabel: string;
  tiers: {
    starter: AuditTierCopy;
    growth: AuditTierCopy;
    pro: AuditTierCopy;
    enterprise: AuditTierCopy;
  };
}

const EN: AuditPageCopy = {
  pageTitle: "Audit Plans",
  pageSubtitle: "Full-site audits powered by AI. Pick the plan that fits your volume.",
  enterpriseCtaLabel: "Contact Sales",
  enterpriseCtaHref: "mailto:sales@signalboostapp.com",
  notConfigured: "This tier is not yet available. Please check back soon.",
  loadingLabel: "Processing…",
  errorLabel: "Something went wrong. Please try again.",
  tiers: {
    starter: {
      name: "Starter",
      description: "Perfect for freelancers and small sites.",
      priceLabel: "$29",
      perMonth: "/mo",
      auditBadge: "3 audits / mo",
      ctaLabel: "Get Started",
      popular: "",
      features: [
        "3 full site audits per month",
        "SEO & performance scoring",
        "Branded PDF export",
        "Email delivery",
        "5-language reports",
      ],
    },
    growth: {
      name: "Growth",
      description: "For growing agencies managing multiple clients.",
      priceLabel: "$79",
      perMonth: "/mo",
      auditBadge: "20 audits / mo",
      ctaLabel: "Get Started",
      popular: "Most Popular",
      features: [
        "20 full site audits per month",
        "Competitor benchmarking",
        "Priority processing",
        "Branded PDF export",
        "Email delivery",
        "5-language reports",
      ],
    },
    pro: {
      name: "Pro",
      description: "High-volume audits for power users and large agencies.",
      priceLabel: "$199",
      perMonth: "/mo",
      auditBadge: "100 audits / mo",
      ctaLabel: "Get Started",
      popular: "",
      features: [
        "100 full site audits per month",
        "White-label reports",
        "API access",
        "Competitor benchmarking",
        "Priority processing",
        "5-language reports",
      ],
    },
    enterprise: {
      name: "Enterprise",
      description: "Unlimited audits with dedicated support and SLA.",
      priceLabel: "$599",
      perMonth: "/mo",
      auditBadge: "Unlimited",
      ctaLabel: "Contact Sales",
      popular: "",
      features: [
        "Unlimited audits",
        "Dedicated account manager",
        "Custom integrations",
        "White-label reports",
        "API access",
        "SLA guarantee",
        "5-language reports",
      ],
    },
  },
};

const ES: AuditPageCopy = {
  pageTitle: "Planes de Auditoría",
  pageSubtitle: "Auditorías completas de sitios impulsadas por IA. Elige el plan que se adapte a tu volumen.",
  enterpriseCtaLabel: "Contactar Ventas",
  enterpriseCtaHref: "mailto:sales@signalboostapp.com",
  notConfigured: "Este nivel aún no está disponible. Por favor, vuelve pronto.",
  loadingLabel: "Procesando…",
  errorLabel: "Algo salió mal. Por favor, inténtalo de nuevo.",
  tiers: {
    starter: {
      name: "Inicial",
      description: "Perfecto para freelancers y sitios pequeños.",
      priceLabel: "$29",
      perMonth: "/mes",
      auditBadge: "3 auditorías / mes",
      ctaLabel: "Comenzar",
      popular: "",
      features: [
        "3 auditorías completas por mes",
        "Puntuación SEO y rendimiento",
        "Exportación PDF con marca",
        "Entrega por correo",
        "Informes en 5 idiomas",
      ],
    },
    growth: {
      name: "Crecimiento",
      description: "Para agencias en crecimiento con múltiples clientes.",
      priceLabel: "$79",
      perMonth: "/mes",
      auditBadge: "20 auditorías / mes",
      ctaLabel: "Comenzar",
      popular: "Más Popular",
      features: [
        "20 auditorías completas por mes",
        "Análisis de competidores",
        "Procesamiento prioritario",
        "Exportación PDF con marca",
        "Entrega por correo",
        "Informes en 5 idiomas",
      ],
    },
    pro: {
      name: "Pro",
      description: "Auditorías de alto volumen para usuarios avanzados.",
      priceLabel: "$199",
      perMonth: "/mes",
      auditBadge: "100 auditorías / mes",
      ctaLabel: "Comenzar",
      popular: "",
      features: [
        "100 auditorías completas por mes",
        "Informes de marca blanca",
        "Acceso a API",
        "Análisis de competidores",
        "Procesamiento prioritario",
        "Informes en 5 idiomas",
      ],
    },
    enterprise: {
      name: "Empresarial",
      description: "Auditorías ilimitadas con soporte dedicado y SLA.",
      priceLabel: "$599",
      perMonth: "/mes",
      auditBadge: "Ilimitado",
      ctaLabel: "Contactar Ventas",
      popular: "",
      features: [
        "Auditorías ilimitadas",
        "Gestor de cuenta dedicado",
        "Integraciones personalizadas",
        "Informes de marca blanca",
        "Acceso a API",
        "Garantía SLA",
        "Informes en 5 idiomas",
      ],
    },
  },
};

const PT: AuditPageCopy = {
  pageTitle: "Planos de Auditoria",
  pageSubtitle: "Auditorias completas de sites com IA. Escolha o plano que se adapta ao seu volume.",
  enterpriseCtaLabel: "Falar com Vendas",
  enterpriseCtaHref: "mailto:sales@signalboostapp.com",
  notConfigured: "Este nível ainda não está disponível. Volte em breve.",
  loadingLabel: "Processando…",
  errorLabel: "Algo deu errado. Por favor, tente novamente.",
  tiers: {
    starter: {
      name: "Inicial",
      description: "Perfeito para freelancers e sites pequenos.",
      priceLabel: "$29",
      perMonth: "/mês",
      auditBadge: "3 auditorias / mês",
      ctaLabel: "Começar",
      popular: "",
      features: [
        "3 auditorias completas por mês",
        "Pontuação SEO e desempenho",
        "Exportação PDF com marca",
        "Entrega por e-mail",
        "Relatórios em 5 idiomas",
      ],
    },
    growth: {
      name: "Crescimento",
      description: "Para agências em crescimento com múltiplos clientes.",
      priceLabel: "$79",
      perMonth: "/mês",
      auditBadge: "20 auditorias / mês",
      ctaLabel: "Começar",
      popular: "Mais Popular",
      features: [
        "20 auditorias completas por mês",
        "Benchmarking de concorrentes",
        "Processamento prioritário",
        "Exportação PDF com marca",
        "Entrega por e-mail",
        "Relatórios em 5 idiomas",
      ],
    },
    pro: {
      name: "Pro",
      description: "Auditorias de alto volume para usuários avançados.",
      priceLabel: "$199",
      perMonth: "/mês",
      auditBadge: "100 auditorias / mês",
      ctaLabel: "Começar",
      popular: "",
      features: [
        "100 auditorias completas por mês",
        "Relatórios white-label",
        "Acesso à API",
        "Benchmarking de concorrentes",
        "Processamento prioritário",
        "Relatórios em 5 idiomas",
      ],
    },
    enterprise: {
      name: "Empresarial",
      description: "Auditorias ilimitadas com suporte dedicado e SLA.",
      priceLabel: "$599",
      perMonth: "/mês",
      auditBadge: "Ilimitado",
      ctaLabel: "Falar com Vendas",
      popular: "",
      features: [
        "Auditorias ilimitadas",
        "Gerente de conta dedicado",
        "Integrações personalizadas",
        "Relatórios white-label",
        "Acesso à API",
        "Garantia de SLA",
        "Relatórios em 5 idiomas",
      ],
    },
  },
};

const PL: AuditPageCopy = {
  pageTitle: "Plany Audytu",
  pageSubtitle: "Pełne audyty stron zasilane przez AI. Wybierz plan dopasowany do Twojego wolumenu.",
  enterpriseCtaLabel: "Skontaktuj się ze sprzedażą",
  enterpriseCtaHref: "mailto:sales@signalboostapp.com",
  notConfigured: "Ten poziom nie jest jeszcze dostępny. Sprawdź ponownie wkrótce.",
  loadingLabel: "Przetwarzanie…",
  errorLabel: "Coś poszło nie tak. Spróbuj ponownie.",
  tiers: {
    starter: {
      name: "Starter",
      description: "Idealny dla freelancerów i małych stron.",
      priceLabel: "$29",
      perMonth: "/mies.",
      auditBadge: "3 audyty / mies.",
      ctaLabel: "Rozpocznij",
      popular: "",
      features: [
        "3 pełne audyty miesięcznie",
        "Ocena SEO i wydajności",
        "Eksport PDF z brandingiem",
        "Dostarczanie e-mailem",
        "Raporty w 5 językach",
      ],
    },
    growth: {
      name: "Wzrost",
      description: "Dla rozwijających się agencji obsługujących wielu klientów.",
      priceLabel: "$79",
      perMonth: "/mies.",
      auditBadge: "20 audytów / mies.",
      ctaLabel: "Rozpocznij",
      popular: "Najpopularniejszy",
      features: [
        "20 pełnych audytów miesięcznie",
        "Benchmarking konkurencji",
        "Priorytetowe przetwarzanie",
        "Eksport PDF z brandingiem",
        "Dostarczanie e-mailem",
        "Raporty w 5 językach",
      ],
    },
    pro: {
      name: "Pro",
      description: "Audyty o dużym wolumenie dla zaawansowanych użytkowników.",
      priceLabel: "$199",
      perMonth: "/mies.",
      auditBadge: "100 audytów / mies.",
      ctaLabel: "Rozpocznij",
      popular: "",
      features: [
        "100 pełnych audytów miesięcznie",
        "Raporty white-label",
        "Dostęp do API",
        "Benchmarking konkurencji",
        "Priorytetowe przetwarzanie",
        "Raporty w 5 językach",
      ],
    },
    enterprise: {
      name: "Korporacyjny",
      description: "Nieograniczone audyty z dedykowanym wsparciem i SLA.",
      priceLabel: "$599",
      perMonth: "/mies.",
      auditBadge: "Nieograniczony",
      ctaLabel: "Skontaktuj się ze sprzedażą",
      popular: "",
      features: [
        "Nieograniczone audyty",
        "Dedykowany opiekun konta",
        "Niestandardowe integracje",
        "Raporty white-label",
        "Dostęp do API",
        "Gwarancja SLA",
        "Raporty w 5 językach",
      ],
    },
  },
};

const RU: AuditPageCopy = {
  pageTitle: "Тарифы аудита",
  pageSubtitle: "Полный аудит сайтов на базе ИИ. Выберите план под ваш объём.",
  enterpriseCtaLabel: "Связаться с отделом продаж",
  enterpriseCtaHref: "mailto:sales@signalboostapp.com",
  notConfigured: "Этот уровень пока недоступен. Зайдите позже.",
  loadingLabel: "Обработка…",
  errorLabel: "Что-то пошло не так. Пожалуйста, попробуйте снова.",
  tiers: {
    starter: {
      name: "Стартер",
      description: "Идеально для фрилансеров и небольших сайтов.",
      priceLabel: "$29",
      perMonth: "/мес.",
      auditBadge: "3 аудита / мес.",
      ctaLabel: "Начать",
      popular: "",
      features: [
        "3 полных аудита в месяц",
        "Оценка SEO и производительности",
        "Экспорт PDF с брендингом",
        "Доставка по электронной почте",
        "Отчёты на 5 языках",
      ],
    },
    growth: {
      name: "Рост",
      description: "Для растущих агентств с несколькими клиентами.",
      priceLabel: "$79",
      perMonth: "/мес.",
      auditBadge: "20 аудитов / мес.",
      ctaLabel: "Начать",
      popular: "Самый популярный",
      features: [
        "20 полных аудитов в месяц",
        "Сравнительный анализ конкурентов",
        "Приоритетная обработка",
        "Экспорт PDF с брендингом",
        "Доставка по электронной почте",
        "Отчёты на 5 языках",
      ],
    },
    pro: {
      name: "Про",
      description: "Аудиты большого объёма для опытных пользователей.",
      priceLabel: "$199",
      perMonth: "/мес.",
      auditBadge: "100 аудитов / мес.",
      ctaLabel: "Начать",
      popular: "",
      features: [
        "100 полных аудитов в месяц",
        "Отчёты под белой этикеткой",
        "Доступ к API",
        "Сравнительный анализ конкурентов",
        "Приоритетная обработка",
        "Отчёты на 5 языках",
      ],
    },
    enterprise: {
      name: "Корпоративный",
      description: "Неограниченные аудиты с выделенной поддержкой и SLA.",
      priceLabel: "$599",
      perMonth: "/мес.",
      auditBadge: "Неограниченно",
      ctaLabel: "Связаться с отделом продаж",
      popular: "",
      features: [
        "Неограниченные аудиты",
        "Выделенный менеджер аккаунта",
        "Индивидуальные интеграции",
        "Отчёты под белой этикеткой",
        "Доступ к API",
        "Гарантия SLA",
        "Отчёты на 5 языках",
      ],
    },
  },
};

const COPY_MAP: Record<AuditLocale, AuditPageCopy> = { en: EN, es: ES, pt: PT, pl: PL, ru: RU };

export function getAuditPricingCopy(locale: AuditLocale): AuditPageCopy {
  return COPY_MAP[locale] ?? COPY_MAP.en;
}
