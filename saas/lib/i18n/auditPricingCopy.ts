/**
 * Audit Project — Multi-language Pricing Copy
 * Covers all 5 platform locales: EN, ES, PT, PL, RU.
 * No existing platformCopy.ts or SaaS plan strings are modified here.
 */

export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru';

export type AuditTierId = 'starter' | 'growth' | 'pro' | 'enterprise';

export interface AuditTierCopy {
  name: string;
  priceLabel: string;
  billingNote: string;
  auditBadge: string;
  description: string;
  features: string[];
  ctaLabel: string;
  popularBadge: string;
}

export interface AuditPageCopy {
  pageTitle: string;
  pageSubtitle: string;
  tiers: Record<AuditTierId, AuditTierCopy>;
  enterpriseCtaLabel: string;
  enterpriseCtaHref: string;
  stripeNotConfigured: string;
  loadingLabel: string;
  errorLabel: string;
}

export type AuditPricingI18n = Record<SupportedLocale, AuditPageCopy>;

const EN: AuditPageCopy = {
  pageTitle: 'Audit Project Plans',
  pageSubtitle: 'Choose the audit tier that fits your workflow. No hidden fees.',
  enterpriseCtaLabel: 'Contact Sales',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  stripeNotConfigured: 'This plan is not yet available for purchase. Please check back soon.',
  loadingLabel: 'Processing…',
  errorLabel: 'Something went wrong. Please try again.',
  tiers: {
    starter: {
      name: 'Audit Starter',
      priceLabel: '$29',
      billingNote: '/mo',
      auditBadge: '3 Audits / mo',
      description: 'Perfect for individuals running a small number of audits each month.',
      features: ['3 audits per month', 'Core audit reports', 'Email support', 'Export to PDF'],
      ctaLabel: 'Get Started',
      popularBadge: '',
    },
    growth: {
      name: 'Audit Growth',
      priceLabel: '$79',
      billingNote: '/mo',
      auditBadge: '20 Audits / mo',
      description: 'Ideal for growing teams that need regular, high-volume audit cycles.',
      features: ['20 audits per month', 'Advanced audit reports', 'Priority email support', 'Export to PDF & CSV', 'Team sharing'],
      ctaLabel: 'Get Started',
      popularBadge: 'Most Popular',
    },
    pro: {
      name: 'Audit Pro',
      priceLabel: '$199',
      billingNote: '/mo',
      auditBadge: '100 Audits / mo',
      description: 'Built for agencies and power users running audits at scale.',
      features: ['100 audits per month', 'Full audit suite', 'Dedicated support', 'API access', 'White-label exports', 'Custom branding'],
      ctaLabel: 'Get Started',
      popularBadge: '',
    },
    enterprise: {
      name: 'Audit Enterprise',
      priceLabel: '$599',
      billingNote: '/mo',
      auditBadge: 'Unlimited Audits',
      description: 'Unlimited audits, SLA guarantees, and a dedicated account manager.',
      features: ['Unlimited audits', 'SLA guarantee', 'Dedicated account manager', 'Custom integrations', 'SSO / SAML', 'On-boarding & training'],
      ctaLabel: 'Contact Sales',
      popularBadge: '',
    },
  },
};

const ES: AuditPageCopy = {
  pageTitle: 'Planes del Proyecto de Auditoría',
  pageSubtitle: 'Elige el nivel de auditoría que se adapta a tu flujo de trabajo. Sin tarifas ocultas.',
  enterpriseCtaLabel: 'Contactar Ventas',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  stripeNotConfigured: 'Este plan aún no está disponible para su compra. Vuelve pronto.',
  loadingLabel: 'Procesando…',
  errorLabel: 'Algo salió mal. Por favor, inténtalo de nuevo.',
  tiers: {
    starter: {
      name: 'Auditoría Starter',
      priceLabel: '$29',
      billingNote: '/mes',
      auditBadge: '3 Auditorías / mes',
      description: 'Perfecto para personas que realizan un pequeño número de auditorías al mes.',
      features: ['3 auditorías por mes', 'Informes de auditoría básicos', 'Soporte por correo', 'Exportar a PDF'],
      ctaLabel: 'Comenzar',
      popularBadge: '',
    },
    growth: {
      name: 'Auditoría Growth',
      priceLabel: '$79',
      billingNote: '/mes',
      auditBadge: '20 Auditorías / mes',
      description: 'Ideal para equipos en crecimiento que necesitan ciclos de auditoría frecuentes.',
      features: ['20 auditorías por mes', 'Informes avanzados', 'Soporte prioritario', 'Exportar a PDF y CSV', 'Compartir en equipo'],
      ctaLabel: 'Comenzar',
      popularBadge: 'Más Popular',
    },
    pro: {
      name: 'Auditoría Pro',
      priceLabel: '$199',
      billingNote: '/mes',
      auditBadge: '100 Auditorías / mes',
      description: 'Diseñado para agencias y usuarios avanzados que realizan auditorías a escala.',
      features: ['100 auditorías por mes', 'Suite completa de auditoría', 'Soporte dedicado', 'Acceso a API', 'Exportaciones con marca blanca', 'Marca personalizada'],
      ctaLabel: 'Comenzar',
      popularBadge: '',
    },
    enterprise: {
      name: 'Auditoría Enterprise',
      priceLabel: '$599',
      billingNote: '/mes',
      auditBadge: 'Auditorías Ilimitadas',
      description: 'Auditorías ilimitadas, garantías de SLA y un gestor de cuenta dedicado.',
      features: ['Auditorías ilimitadas', 'Garantía de SLA', 'Gestor de cuenta dedicado', 'Integraciones personalizadas', 'SSO / SAML', 'Incorporación y formación'],
      ctaLabel: 'Contactar Ventas',
      popularBadge: '',
    },
  },
};

const PT: AuditPageCopy = {
  pageTitle: 'Planos do Projeto de Auditoria',
  pageSubtitle: 'Escolha o nível de auditoria que se adapta ao seu fluxo de trabalho. Sem taxas ocultas.',
  enterpriseCtaLabel: 'Falar com Vendas',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  stripeNotConfigured: 'Este plano ainda não está disponível para compra. Volte em breve.',
  loadingLabel: 'Processando…',
  errorLabel: 'Algo deu errado. Por favor, tente novamente.',
  tiers: {
    starter: {
      name: 'Auditoria Starter',
      priceLabel: '$29',
      billingNote: '/mês',
      auditBadge: '3 Auditorias / mês',
      description: 'Perfeito para indivíduos que realizam um pequeno número de auditorias por mês.',
      features: ['3 auditorias por mês', 'Relatórios de auditoria básicos', 'Suporte por e-mail', 'Exportar para PDF'],
      ctaLabel: 'Começar',
      popularBadge: '',
    },
    growth: {
      name: 'Auditoria Growth',
      priceLabel: '$79',
      billingNote: '/mês',
      auditBadge: '20 Auditorias / mês',
      description: 'Ideal para equipes em crescimento que precisam de ciclos de auditoria frequentes.',
      features: ['20 auditorias por mês', 'Relatórios avançados', 'Suporte prioritário', 'Exportar para PDF e CSV', 'Compartilhamento em equipe'],
      ctaLabel: 'Começar',
      popularBadge: 'Mais Popular',
    },
    pro: {
      name: 'Auditoria Pro',
      priceLabel: '$199',
      billingNote: '/mês',
      auditBadge: '100 Auditorias / mês',
      description: 'Criado para agências e usuários avançados que realizam auditorias em escala.',
      features: ['100 auditorias por mês', 'Suite completa de auditoria', 'Suporte dedicado', 'Acesso à API', 'Exportações com marca branca', 'Marca personalizada'],
      ctaLabel: 'Começar',
      popularBadge: '',
    },
    enterprise: {
      name: 'Auditoria Enterprise',
      priceLabel: '$599',
      billingNote: '/mês',
      auditBadge: 'Auditorias Ilimitadas',
      description: 'Auditorias ilimitadas, garantias de SLA e um gerente de conta dedicado.',
      features: ['Auditorias ilimitadas', 'Garantia de SLA', 'Gerente de conta dedicado', 'Integrações personalizadas', 'SSO / SAML', 'Integração e treinamento'],
      ctaLabel: 'Falar com Vendas',
      popularBadge: '',
    },
  },
};

const PL: AuditPageCopy = {
  pageTitle: 'Plany Projektu Audytowego',
  pageSubtitle: 'Wybierz poziom audytu dopasowany do Twojego przepływu pracy. Bez ukrytych opłat.',
  enterpriseCtaLabel: 'Skontaktuj się z działem sprzedaży',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  stripeNotConfigured: 'Ten plan nie jest jeszcze dostępny do zakupu. Wróć wkrótce.',
  loadingLabel: 'Przetwarzanie…',
  errorLabel: 'Coś poszło nie tak. Spróbuj ponownie.',
  tiers: {
    starter: {
      name: 'Audyt Starter',
      priceLabel: '$29',
      billingNote: '/mies.',
      auditBadge: '3 Audyty / mies.',
      description: 'Idealny dla osób przeprowadzających niewielką liczbę audytów miesięcznie.',
      features: ['3 audyty miesięcznie', 'Podstawowe raporty audytowe', 'Wsparcie e-mail', 'Eksport do PDF'],
      ctaLabel: 'Rozpocznij',
      popularBadge: '',
    },
    growth: {
      name: 'Audyt Growth',
      priceLabel: '$79',
      billingNote: '/mies.',
      auditBadge: '20 Audytów / mies.',
      description: 'Idealny dla rozwijających się zespołów potrzebujących regularnych cykli audytowych.',
      features: ['20 audytów miesięcznie', 'Zaawansowane raporty', 'Priorytetowe wsparcie', 'Eksport do PDF i CSV', 'Udostępnianie zespołowe'],
      ctaLabel: 'Rozpocznij',
      popularBadge: 'Najpopularniejszy',
    },
    pro: {
      name: 'Audyt Pro',
      priceLabel: '$199',
      billingNote: '/mies.',
      auditBadge: '100 Audytów / mies.',
      description: 'Stworzony dla agencji i zaawansowanych użytkowników przeprowadzających audyty na dużą skalę.',
      features: ['100 audytów miesięcznie', 'Pełny pakiet audytowy', 'Dedykowane wsparcie', 'Dostęp do API', 'Eksporty white-label', 'Własna marka'],
      ctaLabel: 'Rozpocznij',
      popularBadge: '',
    },
    enterprise: {
      name: 'Audyt Enterprise',
      priceLabel: '$599',
      billingNote: '/mies.',
      auditBadge: 'Nieograniczone Audyty',
      description: 'Nieograniczone audyty, gwarancje SLA i dedykowany opiekun konta.',
      features: ['Nieograniczone audyty', 'Gwarancja SLA', 'Dedykowany opiekun konta', 'Niestandardowe integracje', 'SSO / SAML', 'Wdrożenie i szkolenie'],
      ctaLabel: 'Skontaktuj się z działem sprzedaży',
      popularBadge: '',
    },
  },
};

const RU: AuditPageCopy = {
  pageTitle: 'Тарифы проекта аудита',
  pageSubtitle: 'Выберите уровень аудита, подходящий для вашего рабочего процесса. Без скрытых платежей.',
  enterpriseCtaLabel: 'Связаться с отделом продаж',
  enterpriseCtaHref: 'mailto:sales@signalboostapp.com',
  stripeNotConfigured: 'Этот план пока недоступен для покупки. Загляните позже.',
  loadingLabel: 'Обработка…',
  errorLabel: 'Что-то пошло не так. Пожалуйста, попробуйте снова.',
  tiers: {
    starter: {
      name: 'Аудит Starter',
      priceLabel: '$29',
      billingNote: '/мес.',
      auditBadge: '3 аудита / мес.',
      description: 'Идеально для частных лиц, выполняющих небольшое количество аудитов в месяц.',
      features: ['3 аудита в месяц', 'Базовые отчёты аудита', 'Поддержка по электронной почте', 'Экспорт в PDF'],
      ctaLabel: 'Начать',
      popularBadge: '',
    },
    growth: {
      name: 'Аудит Growth',
      priceLabel: '$79',
      billingNote: '/мес.',
      auditBadge: '20 аудитов / мес.',
      description: 'Идеально для растущих команд, которым нужны регулярные циклы аудита.',
      features: ['20 аудитов в месяц', 'Расширенные отчёты', 'Приоритетная поддержка', 'Экспорт в PDF и CSV', 'Совместный доступ для команды'],
      ctaLabel: 'Начать',
      popularBadge: 'Самый популярный',
    },
    pro: {
      name: 'Аудит Pro',
      priceLabel: '$199',
      billingNote: '/мес.',
      auditBadge: '100 аудитов / мес.',
      description: 'Создан для агентств и опытных пользователей, проводящих аудиты в большом масштабе.',
      features: ['100 аудитов в месяц', 'Полный пакет аудита', 'Выделенная поддержка', 'Доступ к API', 'Экспорт white-label', 'Персональный брендинг'],
      ctaLabel: 'Начать',
      popularBadge: '',
    },
    enterprise: {
      name: 'Аудит Enterprise',
      priceLabel: '$599',
      billingNote: '/мес.',
      auditBadge: 'Неограниченные аудиты',
      description: 'Неограниченные аудиты, гарантии SLA и выделенный менеджер по работе с клиентами.',
      features: ['Неограниченные аудиты', 'Гарантия SLA', 'Выделенный менеджер', 'Пользовательские интеграции', 'SSO / SAML', 'Онбординг и обучение'],
      ctaLabel: 'Связаться с отделом продаж',
      popularBadge: '',
    },
  },
};

export const AUDIT_PRICING_COPY: AuditPricingI18n = { en: EN, es: ES, pt: PT, pl: PL, ru: RU };

/**
 * Safely retrieves copy for a given locale, falling back to English
 * if the requested locale is not found.
 */
export function getAuditPricingCopy(locale: string): AuditPageCopy {
  const key = locale as SupportedLocale;
  return AUDIT_PRICING_COPY[key] ?? AUDIT_PRICING_COPY['en'];
}
