// saas/lib/i18n/auditPricingCopy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Isolated i18n strings for the Audit Project pricing section.
// Covers all 5 platform languages: EN, ES, PT, PL, RU.
// These keys are SEPARATE from platformCopy.ts and do NOT touch
// the core SaaS plan strings (pricing_v2.*).
// ─────────────────────────────────────────────────────────────────────────────

export type AuditPricingCopy = {
  kicker: string
  title: string
  subtitle: string
  perMonth: string
  auditsLabel: string
  auditsUnlimited: string
  popular: string
  ctaUpgrade: string
  ctaContact: string
  redirecting: string
  errorGeneric: string
  errorNetwork: string
  stripePending: string
  tiers: {
    audit_starter: { name: string; description: string; features: string[] }
    audit_growth: { name: string; description: string; features: string[] }
    audit_pro: { name: string; description: string; features: string[] }
    audit_enterprise: { name: string; description: string; features: string[] }
  }
}

const AUDIT_PRICING_COPY: Record<string, AuditPricingCopy> = {
  // ── English ────────────────────────────────────────────────────────────────
  en: {
    kicker: 'Audit Project — Expansion Pricing',
    title: 'Deep audits at every scale.',
    subtitle: 'Run structured audits across your business, content, and operations. Pick the tier that matches your audit volume.',
    perMonth: '/mo',
    auditsLabel: 'audits / mo',
    auditsUnlimited: 'Unlimited audits',
    popular: 'Most popular',
    ctaUpgrade: 'Get started',
    ctaContact: 'Contact us',
    redirecting: 'Redirecting…',
    errorGeneric: 'Something went wrong. Please try again.',
    errorNetwork: 'Unable to start checkout. Contact support@signalboostapp.com',
    stripePending: 'Stripe price ID not yet configured. Contact the team to activate this tier.',
    tiers: {
      audit_starter: {
        name: 'Audit Starter',
        description: 'Perfect for individuals and small teams running occasional audits.',
        features: [
          '3 audits per month',
          'Standard audit templates',
          'PDF export',
          'Email support',
        ],
      },
      audit_growth: {
        name: 'Audit Growth',
        description: 'For growing teams that need regular, structured audit workflows.',
        features: [
          '20 audits per month',
          'All Starter features',
          'Custom audit templates',
          'Priority email support',
          'Team sharing',
        ],
      },
      audit_pro: {
        name: 'Audit Pro',
        description: 'For agencies and operators running high-volume audit pipelines.',
        features: [
          '100 audits per month',
          'All Growth features',
          'Advanced analytics dashboard',
          'API access',
          'Dedicated onboarding',
          'Priority support',
        ],
      },
      audit_enterprise: {
        name: 'Audit Enterprise',
        description: 'Unlimited audits for large organisations with complex requirements.',
        features: [
          'Unlimited audits',
          'All Pro features',
          'Custom integrations',
          'SLA guarantee',
          'Dedicated account manager',
          'Custom contracts',
        ],
      },
    },
  },

  // ── Spanish ────────────────────────────────────────────────────────────────
  es: {
    kicker: 'Proyecto de Auditoría — Precios de Expansión',
    title: 'Auditorías profundas a cualquier escala.',
    subtitle: 'Ejecuta auditorías estructuradas en tu negocio, contenido y operaciones. Elige el nivel que se adapte a tu volumen de auditorías.',
    perMonth: '/mes',
    auditsLabel: 'auditorías / mes',
    auditsUnlimited: 'Auditorías ilimitadas',
    popular: 'Más popular',
    ctaUpgrade: 'Comenzar',
    ctaContact: 'Contáctanos',
    redirecting: 'Redirigiendo…',
    errorGeneric: 'Algo salió mal. Por favor, inténtalo de nuevo.',
    errorNetwork: 'No se pudo iniciar el pago. Contacta a support@signalboostapp.com',
    stripePending: 'El ID de precio de Stripe aún no está configurado. Contacta al equipo para activar este nivel.',
    tiers: {
      audit_starter: {
        name: 'Audit Starter',
        description: 'Perfecto para personas y equipos pequeños que realizan auditorías ocasionales.',
        features: [
          '3 auditorías por mes',
          'Plantillas de auditoría estándar',
          'Exportación en PDF',
          'Soporte por correo',
        ],
      },
      audit_growth: {
        name: 'Audit Growth',
        description: 'Para equipos en crecimiento que necesitan flujos de auditoría regulares y estructurados.',
        features: [
          '20 auditorías por mes',
          'Todo lo de Starter',
          'Plantillas de auditoría personalizadas',
          'Soporte prioritario por correo',
          'Compartir con el equipo',
        ],
      },
      audit_pro: {
        name: 'Audit Pro',
        description: 'Para agencias y operadores con pipelines de auditoría de alto volumen.',
        features: [
          '100 auditorías por mes',
          'Todo lo de Growth',
          'Panel de análisis avanzado',
          'Acceso a API',
          'Incorporación dedicada',
          'Soporte prioritario',
        ],
      },
      audit_enterprise: {
        name: 'Audit Enterprise',
        description: 'Auditorías ilimitadas para grandes organizaciones con requisitos complejos.',
        features: [
          'Auditorías ilimitadas',
          'Todo lo de Pro',
          'Integraciones personalizadas',
          'Garantía de SLA',
          'Gestor de cuenta dedicado',
          'Contratos personalizados',
        ],
      },
    },
  },

  // ── Portuguese ─────────────────────────────────────────────────────────────
  pt: {
    kicker: 'Projeto de Auditoria — Preços de Expansão',
    title: 'Auditorias profundas em qualquer escala.',
    subtitle: 'Execute auditorias estruturadas no seu negócio, conteúdo e operações. Escolha o nível que corresponde ao seu volume de auditorias.',
    perMonth: '/mês',
    auditsLabel: 'auditorias / mês',
    auditsUnlimited: 'Auditorias ilimitadas',
    popular: 'Mais popular',
    ctaUpgrade: 'Começar',
    ctaContact: 'Fale conosco',
    redirecting: 'Redirecionando…',
    errorGeneric: 'Algo deu errado. Por favor, tente novamente.',
    errorNetwork: 'Não foi possível iniciar o pagamento. Contate support@signalboostapp.com',
    stripePending: 'O ID de preço do Stripe ainda não está configurado. Contate a equipe para ativar este nível.',
    tiers: {
      audit_starter: {
        name: 'Audit Starter',
        description: 'Perfeito para indivíduos e pequenas equipes que realizam auditorias ocasionais.',
        features: [
          '3 auditorias por mês',
          'Modelos de auditoria padrão',
          'Exportação em PDF',
          'Suporte por e-mail',
        ],
      },
      audit_growth: {
        name: 'Audit Growth',
        description: 'Para equipes em crescimento que precisam de fluxos de auditoria regulares e estruturados.',
        features: [
          '20 auditorias por mês',
          'Tudo do Starter',
          'Modelos de auditoria personalizados',
          'Suporte prioritário por e-mail',
          'Compartilhamento com a equipe',
        ],
      },
      audit_pro: {
        name: 'Audit Pro',
        description: 'Para agências e operadores com pipelines de auditoria de alto volume.',
        features: [
          '100 auditorias por mês',
          'Tudo do Growth',
          'Painel de análise avançado',
          'Acesso à API',
          'Onboarding dedicado',
          'Suporte prioritário',
        ],
      },
      audit_enterprise: {
        name: 'Audit Enterprise',
        description: 'Auditorias ilimitadas para grandes organizações com requisitos complexos.',
        features: [
          'Auditorias ilimitadas',
          'Tudo do Pro',
          'Integrações personalizadas',
          'Garantia de SLA',
          'Gerente de conta dedicado',
          'Contratos personalizados',
        ],
      },
    },
  },

  // ── Polish ─────────────────────────────────────────────────────────────────
  pl: {
    kicker: 'Projekt Audytu — Cennik Rozszerzenia',
    title: 'Dogłębne audyty w każdej skali.',
    subtitle: 'Uruchamiaj ustrukturyzowane audyty w swoim biznesie, treściach i operacjach. Wybierz poziom dopasowany do wolumenu audytów.',
    perMonth: '/mies.',
    auditsLabel: 'audytów / mies.',
    auditsUnlimited: 'Nieograniczone audyty',
    popular: 'Najpopularniejszy',
    ctaUpgrade: 'Zacznij',
    ctaContact: 'Skontaktuj się',
    redirecting: 'Przekierowanie…',
    errorGeneric: 'Coś poszło nie tak. Spróbuj ponownie.',
    errorNetwork: 'Nie udało się rozpocząć płatności. Skontaktuj się z support@signalboostapp.com',
    stripePending: 'Identyfikator ceny Stripe nie jest jeszcze skonfigurowany. Skontaktuj się z zespołem, aby aktywować ten poziom.',
    tiers: {
      audit_starter: {
        name: 'Audit Starter',
        description: 'Idealny dla osób i małych zespołów przeprowadzających okazjonalne audyty.',
        features: [
          '3 audyty miesięcznie',
          'Standardowe szablony audytów',
          'Eksport do PDF',
          'Wsparcie e-mail',
        ],
      },
      audit_growth: {
        name: 'Audit Growth',
        description: 'Dla rozwijających się zespołów potrzebujących regularnych, ustrukturyzowanych przepływów audytów.',
        features: [
          '20 audytów miesięcznie',
          'Wszystko ze Starter',
          'Niestandardowe szablony audytów',
          'Priorytetowe wsparcie e-mail',
          'Udostępnianie zespołowi',
        ],
      },
      audit_pro: {
        name: 'Audit Pro',
        description: 'Dla agencji i operatorów prowadzących audyty o dużym wolumenie.',
        features: [
          '100 audytów miesięcznie',
          'Wszystko z Growth',
          'Zaawansowany panel analityczny',
          'Dostęp do API',
          'Dedykowany onboarding',
          'Wsparcie priorytetowe',
        ],
      },
      audit_enterprise: {
        name: 'Audit Enterprise',
        description: 'Nieograniczone audyty dla dużych organizacji o złożonych wymaganiach.',
        features: [
          'Nieograniczone audyty',
          'Wszystko z Pro',
          'Niestandardowe integracje',
          'Gwarancja SLA',
          'Dedykowany opiekun konta',
          'Niestandardowe umowy',
        ],
      },
    },
  },

  // ── Russian ────────────────────────────────────────────────────────────────
  ru: {
    kicker: 'Проект Аудита — Расширенные тарифы',
    title: 'Глубокие аудиты в любом масштабе.',
    subtitle: 'Запускайте структурированные аудиты вашего бизнеса, контента и операций. Выберите тариф, соответствующий вашему объёму аудитов.',
    perMonth: '/мес.',
    auditsLabel: 'аудитов / мес.',
    auditsUnlimited: 'Безлимитные аудиты',
    popular: 'Популярный',
    ctaUpgrade: 'Начать',
    ctaContact: 'Связаться',
    redirecting: 'Перенаправление…',
    errorGeneric: 'Что-то пошло не так. Пожалуйста, попробуйте снова.',
    errorNetwork: 'Не удалось начать оплату. Свяжитесь с support@signalboostapp.com',
    stripePending: 'Идентификатор цены Stripe ещё не настроен. Свяжитесь с командой для активации этого тарифа.',
    tiers: {
      audit_starter: {
        name: 'Audit Starter',
        description: 'Идеально для частных лиц и небольших команд, проводящих редкие аудиты.',
        features: [
          '3 аудита в месяц',
          'Стандартные шаблоны аудитов',
          'Экспорт в PDF',
          'Поддержка по email',
        ],
      },
      audit_growth: {
        name: 'Audit Growth',
        description: 'Для растущих команд, которым нужны регулярные структурированные рабочие процессы аудита.',
        features: [
          '20 аудитов в месяц',
          'Всё из Starter',
          'Пользовательские шаблоны аудитов',
          'Приоритетная поддержка по email',
          'Совместный доступ для команды',
        ],
      },
      audit_pro: {
        name: 'Audit Pro',
        description: 'Для агентств и операторов с высокообъёмными пайплайнами аудитов.',
        features: [
          '100 аудитов в месяц',
          'Всё из Growth',
          'Расширенная аналитическая панель',
          'Доступ к API',
          'Выделенный онбординг',
          'Приоритетная поддержка',
        ],
      },
      audit_enterprise: {
        name: 'Audit Enterprise',
        description: 'Безлимитные аудиты для крупных организаций со сложными требованиями.',
        features: [
          'Безлимитные аудиты',
          'Всё из Pro',
          'Пользовательские интеграции',
          'Гарантия SLA',
          'Выделенный менеджер аккаунта',
          'Индивидуальные договоры',
        ],
      },
    },
  },
}

export default AUDIT_PRICING_COPY

export function getAuditPricingCopy(lang: string): AuditPricingCopy {
  return AUDIT_PRICING_COPY[lang] || AUDIT_PRICING_COPY.en
}
