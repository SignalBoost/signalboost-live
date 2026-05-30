'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

const pricingCopy = {
  en: {
    kicker: 'UNIFIED SAAS PRICING',
    title: 'Pick a cockpit tier and launch straight into dashboards.',
    subtitle: 'Cockpit pricing panels keep value, limits, and CTAs visible while preserving the same HMI as Marketplace and SaaS dashboards.',
    cta: 'Open SaaS dashboard',
    plans: [
      ['Free', '$0', 'Mission rehearsal', ['Marketplace preview', '1 language console', 'Concierge suggestions']],
      ['Starter', '$19/mo', 'Solo operator', ['Promote Business', 'Reviews cockpit', 'Calendar reminders']],
      ['Pro', '$49/mo', 'Growth crew', ['All SaaS modules', 'Outreach campaigns', 'Shared spreadsheets']],
      ['Business', '$149/mo', 'Command fleet', ['Advanced telemetry', 'Partner routing', 'Priority concierge']],
    ],
  },
  es: {
    kicker: 'PRECIOS SAAS UNIFICADOS', title: 'Elige un nivel cockpit y entra al dashboard.', subtitle: 'Paneles de precios muestran valor, límites y CTA con la misma HMI.', cta: 'Abrir dashboard SaaS',
    plans: [['Gratis', '$0', 'Ensayo de misión', ['Vista marketplace', '1 consola idioma', 'Sugerencias concierge']], ['Starter', '$19/mes', 'Operador solo', ['Promover negocio', 'Cockpit reseñas', 'Recordatorios']], ['Pro', '$49/mes', 'Equipo crecimiento', ['Todos los módulos', 'Campañas outreach', 'Hojas compartidas']], ['Business', '$149/mes', 'Flota command', ['Telemetría avanzada', 'Rutas partner', 'Concierge prioritario']]],
  },
  pt: {
    kicker: 'PREÇOS SAAS UNIFICADOS', title: 'Escolha um tier cockpit e entre no dashboard.', subtitle: 'Painéis de preço exibem valor, limites e CTAs com a mesma HMI.', cta: 'Abrir dashboard SaaS',
    plans: [['Grátis', '$0', 'Ensaio de missão', ['Preview marketplace', '1 console idioma', 'Sugestões concierge']], ['Starter', '$19/mês', 'Operador solo', ['Promover negócio', 'Cockpit avaliações', 'Lembretes']], ['Pro', '$49/mês', 'Equipe crescimento', ['Todos os módulos', 'Campanhas outreach', 'Planilhas compartilhadas']], ['Business', '$149/mês', 'Frota command', ['Telemetria avançada', 'Rotas partner', 'Concierge prioritário']]],
  },
  pl: {
    kicker: 'UJEDNOLICONY CENNIK SAAS', title: 'Wybierz poziom cockpit i przejdź do dashboardu.', subtitle: 'Panele cen pokazują wartość, limity i CTA w tym samym HMI.', cta: 'Otwórz dashboard SaaS',
    plans: [['Free', '$0', 'Próba misji', ['Podgląd marketplace', '1 konsola języka', 'Sugestie concierge']], ['Starter', '$19/mies.', 'Solo operator', ['Promuj firmę', 'Cockpit opinii', 'Przypomnienia']], ['Pro', '$49/mies.', 'Zespół wzrostu', ['Wszystkie moduły', 'Kampanie outreach', 'Wspólne arkusze']], ['Business', '$149/mies.', 'Flota command', ['Zaawansowana telemetria', 'Trasy partnerów', 'Priorytet concierge']]],
  },
  ru: {
    kicker: 'ЕДИНЫЕ ЦЕНЫ SAAS', title: 'Выберите cockpit‑тариф и откройте панель.', subtitle: 'Ценовые панели показывают ценность, лимиты и CTA в единой HMI.', cta: 'Открыть SaaS‑панель',
    plans: [['Free', '$0', 'Репетиция миссии', ['Превью marketplace', '1 языковая консоль', 'Подсказки concierge']], ['Starter', '$19/мес', 'Один оператор', ['Продвижение', 'Cockpit отзывов', 'Напоминания']], ['Pro', '$49/мес', 'Команда роста', ['Все модули', 'Outreach кампании', 'Общие таблицы']], ['Business', '$149/мес', 'Флот command', ['Расширенная телеметрия', 'Partner маршруты', 'Приоритет concierge']]],
  },
} as const

export default function PricingPage() {
  const { lang } = useI18n()
  const copy = pricingCopy[(lang as keyof typeof pricingCopy) || 'en'] || pricingCopy.en

  return (
    <main className="sb-pricing-cockpit" aria-labelledby="pricing-title">
      <section className="sb-pricing-hero">
        <span className="sb-eyebrow">{copy.kicker}</span>
        <h1 id="pricing-title" className="sb-h1">{copy.title}</h1>
        <p className="sb-body">{copy.subtitle}</p>
      </section>

      <section className="sb-pricing-grid" aria-label="SaaS pricing tiers">
        {copy.plans.map(([name, price, mission, features], index) => (
          <article key={name} className="sb-price-panel" tabIndex={0} aria-labelledby={`plan-${index}`}>
            <span className="sb-panel-index">0{index + 1}</span>
            <h2 id={`plan-${index}`}>{name}</h2>
            <strong>{price}</strong>
            <p>{mission}</p>
            <ul>
              {features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <Link href="/dashboard" aria-label={`${copy.cta}: ${name}`}>{copy.cta}</Link>
          </article>
        ))}
      </section>

      <section className="sb-locale-strip" aria-label="Available pricing locales">
        {['English', 'Español', 'Português', 'Polski', 'Русский'].map((locale) => <span key={locale}>{locale}</span>)}
      </section>
    </main>
  )
}
