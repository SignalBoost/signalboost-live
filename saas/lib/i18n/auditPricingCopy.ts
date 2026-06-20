/**
 * Audit Project — Multi-language Pricing Copy
 * Self-contained. No imports from the core SaaS i18n system.
 * Covers EN, ES, PT, PL, RU.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditTierCopy {
  name: string;
  priceLabel: string;
  perPeriod: string;
  auditLabel: string;
  description: string;
  features: string[];
  ctaLabel: string;
}

export interface AuditPageCopy {
  pageTitle: string;
  pageSubtitle: string;
  popularBadge: string;
  enterpriseCtaLabel: string;
  enterpriseCtaHref: string;
  notConfiguredNotice: string;
  errorGeneric: string;
  tiers: {
    audit_starter: AuditTierCopy;
    audit_growth: AuditTierCopy;
    audit_pro: AuditTierCopy;
    audit_enterprise: AuditTierCopy;
  };
}

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const EN: AuditPageCopy = {
  pageTitle: 'Audit Project Plans',
  pageSubtitle: 'Choose the audit volume that fits your business.',
  popularBadge: 'Most Popular',
  enterpriseCtaLabel: 'Contact Sales',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  notConfiguredNotice: 'This tier is not yet available for checkout. Please check back soon.',
  errorGeneric: 'Something went wrong. Please try again.',
  tiers: {
    audit_starter: {
      name: 'Audit Starter',
      priceLabel: '$29',
      perPeriod: '/mo',
      auditLabel: '3 Audits / month',
      description: 'Perfect for freelancers and solo operators.',
      features: [
        '3 full site audits per month',
        'AI-powered recommendations',
        'PDF export',
        'Email support',
      ],
      ctaLabel: 'Get Started',
    },
    audit_growth: {
      name: 'Audit Growth',
      priceLabel: '$79',
      perPeriod: '/mo',
      auditLabel: '20 Audits / month',
      description: 'Built for growing agencies and small teams.',
      features: [
        '20 full site audits per month',
        'AI-powered recommendations',
        'PDF + CSV export',
        'Priority email support',
        'Team sharing',
      ],
      ctaLabel: 'Get Started',
    },
    audit_pro: {
      name: 'Audit Pro',
      priceLabel: '$199',
      perPeriod: '/mo',
      auditLabel: '100 Audits / month',
      description: 'For professional agencies running high-volume audits.',
      features: [
        '100 full site audits per month',
        'AI-powered recommendations',
        'PDF + CSV + JSON export',
        'Dedicated support',
        'Team sharing',
        'White-label reports',
      ],
      ctaLabel: 'Get Started',
    },
    audit_enterprise: {
      name: 'Audit Enterprise',
      priceLabel: '$599',
      perPeriod: '/mo',
      auditLabel: 'Unlimited Audits',
      description: 'Unlimited capacity for enterprise and large-scale operations.',
      features: [
        'Unlimited site audits',
        'AI-powered recommendations',
        'All export formats',
        'Dedicated account manager',
        'Custom integrations',
        'SLA guarantee',
        'White-label reports',
      ],
      ctaLabel: 'Contact Sales',
    },
  },
};

// ---------------------------------------------------------------------------
// Spanish
// ---------------------------------------------------------------------------

const ES: AuditPageCopy = {
  pageTitle: 'Planes del Proyecto de Auditoría',
  pageSubtitle: 'Elige el volumen de auditorías que se adapte a tu negocio.',
  popularBadge: 'Más Popular',
  enterpriseCtaLabel: 'Contactar Ventas',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  notConfiguredNotice: 'Este nivel aún no está disponible para pago. Vuelve pronto.',
  errorGeneric: 'Algo salió mal. Por favor intenta de nuevo.',
  tiers: {
    audit_starter: {
      name: 'Audit Starter',
      priceLabel: '$29',
      perPeriod: '/mes',
      auditLabel: '3 Auditorías / mes',
      description: 'Perfecto para freelancers y operadores independientes.',
      features: [
        '3 auditorías completas por mes',
        'Recomendaciones con IA',
        'Exportación PDF',
        'Soporte por correo',
      ],
      ctaLabel: 'Comenzar',
    },
    audit_growth: {
      name: 'Audit Growth',
      priceLabel: '$79',
      perPeriod: '/mes',
      auditLabel: '20 Auditorías / mes',
      description: 'Diseñado para agencias en crecimiento y equipos pequeños.',
      features: [
        '20 auditorías completas por mes',
        'Recomendaciones con IA',
        'Exportación PDF + CSV',
        'Soporte prioritario',
        'Compartir en equipo',
      ],
      ctaLabel: 'Comenzar',
    },
    audit_pro: {
      name: 'Audit Pro',
      priceLabel: '$199',
      perPeriod: '/mes',
      auditLabel: '100 Auditorías / mes',
      description: 'Para agencias profesionales con alto volumen de auditorías.',
      features: [
        '100 auditorías completas por mes',
        'Recomendaciones con IA',
        'Exportación PDF + CSV + JSON',
        'Soporte dedicado',
        'Compartir en equipo',
        'Informes de marca blanca',
      ],
      ctaLabel: 'Comenzar',
    },
    audit_enterprise: {
      name: 'Audit Enterprise',
      priceLabel: '$599',
      perPeriod: '/mes',
      auditLabel: 'Auditorías Ilimitadas',
      description: 'Capacidad ilimitada para empresas y operaciones a gran escala.',
      features: [
        'Auditorías ilimitadas',
        'Recomendaciones con IA',
        'Todos los formatos de exportación',
        'Gestor de cuenta dedicado',
        'Integraciones personalizadas',
        'Garantía SLA',
        'Informes de marca blanca',
      ],
      ctaLabel: 'Contactar Ventas',
    },
  },
};

// ---------------------------------------------------------------------------
// Portuguese
// ---------------------------------------------------------------------------

const PT: AuditPageCopy = {
  pageTitle: 'Planos do Projeto de Auditoria',
  pageSubtitle: 'Escolha o volume de auditorias que se adapta ao seu negócio.',
  popularBadge: 'Mais Popular',
  enterpriseCtaLabel: 'Falar com Vendas',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  notConfiguredNotice: 'Este plano ainda não está disponível para pagamento. Volte em breve.',
  errorGeneric: 'Algo deu errado. Por favor, tente novamente.',
  tiers: {
    audit_starter: {
      name: 'Audit Starter',
      priceLabel: '$29',
      perPeriod: '/mês',
      auditLabel: '3 Auditorias / mês',
      description: 'Perfeito para freelancers e operadores individuais.',
      features: [
        '3 auditorias completas por mês',
        'Recomendações com IA',
        'Exportação PDF',
        'Suporte por e-mail',
      ],
      ctaLabel: 'Começar',
    },
    audit_growth: {
      name: 'Audit Growth',
      priceLabel: '$79',
      perPeriod: '/mês',
      auditLabel: '20 Auditorias / mês',
      description: 'Criado para agências em crescimento e pequenas equipes.',
      features: [
        '20 auditorias completas por mês',
        'Recomendações com IA',
        'Exportação PDF + CSV',
        'Suporte prioritário',
        'Compartilhamento em equipe',
      ],
      ctaLabel: 'Começar',
    },
    audit_pro: {
      name: 'Audit Pro',
      priceLabel: '$199',
      perPeriod: '/mês',
      auditLabel: '100 Auditorias / mês',
      description: 'Para agências profissionais com alto volume de auditorias.',
      features: [
        '100 auditorias completas por mês',
        'Recomendações com IA',
        'Exportação PDF + CSV + JSON',
        'Suporte dedicado',
        'Compartilhamento em equipe',
        'Relatórios white-label',
      ],
      ctaLabel: 'Começar',
    },
    audit_enterprise: {
      name: 'Audit Enterprise',
      priceLabel: '$599',
      perPeriod: '/mês',
      auditLabel: 'Auditorias Ilimitadas',
      description: 'Capacidade ilimitada para empresas e operações em grande escala.',
      features: [
        'Auditorias ilimitadas',
        'Recomendações com IA',
        'Todos os formatos de exportação',
        'Gerente de conta dedicado',
        'Integrações personalizadas',
        'Garantia de SLA',
        'Relatórios white-label',
      ],
      ctaLabel: 'Falar com Vendas',
    },
  },
};

// ---------------------------------------------------------------------------
// Polish
// ---------------------------------------------------------------------------

const PL: AuditPageCopy = {
  pageTitle: 'Plany Projektu Audytowego',
  pageSubtitle: 'Wybierz wolumen audytów odpowiedni dla Twojej firmy.',
  popularBadge: 'Najpopularniejszy',
  enterpriseCtaLabel: 'Skontaktuj się z działem sprzedaży',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  notConfiguredNotice: 'Ten poziom nie jest jeszcze dostępny do zakupu. Wróć wkrótce.',
  errorGeneric: 'Coś poszło nie tak. Spróbuj ponownie.',
  tiers: {
    audit_starter: {
      name: 'Audit Starter',
      priceLabel: '$29',
      perPeriod: '/mies.',
      auditLabel: '3 Audyty / miesiąc',
      description: 'Idealny dla freelancerów i niezależnych operatorów.',
      features: [
        '3 pełne audyty miesięcznie',
        'Rekomendacje oparte na AI',
        'Eksport PDF',
        'Wsparcie e-mail',
      ],
      ctaLabel: 'Rozpocznij',
    },
    audit_growth: {
      name: 'Audit Growth',
      priceLabel: '$79',
      perPeriod: '/mies.',
      auditLabel: '20 Audytów / miesiąc',
      description: 'Stworzony dla rozwijających się agencji i małych zespołów.',
      features: [
        '20 pełnych audytów miesięcznie',
        'Rekomendacje oparte na AI',
        'Eksport PDF + CSV',
        'Priorytetowe wsparcie',
        'Udostępnianie zespołowi',
      ],
      ctaLabel: 'Rozpocznij',
    },
    audit_pro: {
      name: 'Audit Pro',
      priceLabel: '$199',
      perPeriod: '/mies.',
      auditLabel: '100 Audytów / miesiąc',
      description: 'Dla profesjonalnych agencji realizujących dużą liczbę audytów.',
      features: [
        '100 pełnych audytów miesięcznie',
        'Rekomendacje oparte na AI',
        'Eksport PDF + CSV + JSON',
        'Dedykowane wsparcie',
        'Udostępnianie zespołowi',
        'Raporty white-label',
      ],
      ctaLabel: 'Rozpocznij',
    },
    audit_enterprise: {
      name: 'Audit Enterprise',
      priceLabel: '$599',
      perPeriod: '/mies.',
      auditLabel: 'Nieograniczone Audyty',
      description: 'Nieograniczona pojemność dla przedsiębiorstw i operacji na dużą skalę.',
      features: [
        'Nieograniczone audyty',
        'Rekomendacje oparte na AI',
        'Wszystkie formaty eksportu',
        'Dedykowany opiekun konta',
        'Niestandardowe integracje',
        'Gwarancja SLA',
        'Raporty white-label',
      ],
      ctaLabel: 'Skontaktuj się z działem sprzedaży',
    },
  },
};

// ---------------------------------------------------------------------------
// Russian
// ---------------------------------------------------------------------------

const RU: AuditPageCopy = {
  pageTitle: 'Тарифы Аудиторского Проекта',
  pageSubtitle: 'Выберите объём аудитов, подходящий для вашего бизнеса.',
  popularBadge: 'Самый Популярный',
  enterpriseCtaLabel: 'Связаться с отделом продаж',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  notConfiguredNotice: 'Этот тариф пока недоступен для оплаты. Зайдите позже.',
  errorGeneric: 'Что-то пошло не так. Пожалуйста, попробуйте снова.',
  tiers: {
    audit_starter: {
      name: 'Audit Starter',
      priceLabel: '$29',
      perPeriod: '/мес.',
      auditLabel: '3 Аудита / месяц',
      description: 'Идеально для фрилансеров и индивидуальных операторов.',
      features: [
        '3 полных аудита в месяц',
        'Рекомендации на основе ИИ',
        'Экспорт PDF',
        'Поддержка по электронной почте',
      ],
      ctaLabel: 'Начать',
    },
    audit_growth: {
      name: 'Audit Growth',
      priceLabel: '$79',
      perPeriod: '/мес.',
      auditLabel: '20 Аудитов / месяц',
      description: 'Создан для растущих агентств и небольших команд.',
      features: [
        '20 полных аудитов в месяц',
        'Рекомендации на основе ИИ',
        'Экспорт PDF + CSV',
        'Приоритетная поддержка',
        'Совместный доступ для команды',
      ],
      ctaLabel: 'Начать',
    },
    audit_pro: {
      name: 'Audit Pro',
      priceLabel: '$199',
      perPeriod: '/мес.',
      auditLabel: '100 Аудитов / месяц',
      description: 'Для профессиональных агентств с высоким объёмом аудитов.',
      features: [
        '100 полных аудитов в месяц',
        'Рекомендации на основе ИИ',
        'Экспорт PDF + CSV + JSON',
        'Выделенная поддержка',
        'Совместный доступ для команды',
        'Отчёты white-label',
      ],
      ctaLabel: 'Начать',
    },
    audit_enterprise: {
      name: 'Audit Enterprise',
      priceLabel: '$599',
      perPeriod: '/мес.',
      auditLabel: 'Неограниченные Аудиты',
      description: 'Неограниченные возможности для крупных предприятий.',
      features: [
        'Неограниченные аудиты',
        'Рекомендации на основе ИИ',
        'Все форматы экспорта',
        'Персональный менеджер аккаунта',
        'Индивидуальные интеграции',
        'Гарантия SLA',
        'Отчёты white-label',
      ],
      ctaLabel: 'Связаться с отделом продаж',
    },
  },
};

// ---------------------------------------------------------------------------
// Locale map + accessor
// ---------------------------------------------------------------------------

type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru';

const AUDIT_COPY_MAP: Record<SupportedLocale, AuditPageCopy> = {
  en: EN,
  es: ES,
  pt: PT,
  pl: PL,
  ru: RU,
};

export function getAuditPricingCopy(locale: string): AuditPageCopy {
  const key = locale as SupportedLocale;
  return AUDIT_COPY_MAP[key] ?? EN;
}
