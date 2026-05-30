'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

const moduleCopy = {
  en: {
    title: 'Unified SaaS command dashboard',
    subtitle: 'One cockpit layout for business promotion, reviews, calendars, spreadsheets, outreach, and a personal assistant.',
    nav: ['Promote Business', 'Reviews', 'Calendar', 'Spreadsheets', 'Outreach', 'Personal Assistant'],
    status: ['Mission health 98%', 'Keyboard nav armed', 'ARIA panels online', 'i18n sync active'],
  },
  es: { title: 'Dashboard SaaS unificado', subtitle: 'Un cockpit para promoción, reseñas, calendario, hojas, outreach y asistente personal.', nav: ['Promover negocio', 'Reseñas', 'Calendario', 'Hojas de cálculo', 'Outreach', 'Asistente personal'], status: ['Salud 98%', 'Teclado activo', 'ARIA online', 'i18n activo'] },
  pt: { title: 'Dashboard SaaS unificado', subtitle: 'Um cockpit para promoção, avaliações, calendário, planilhas, outreach e assistente pessoal.', nav: ['Promover negócio', 'Avaliações', 'Calendário', 'Planilhas', 'Outreach', 'Assistente pessoal'], status: ['Saúde 98%', 'Teclado ativo', 'ARIA online', 'i18n ativo'] },
  pl: { title: 'Ujednolicony dashboard SaaS', subtitle: 'Jeden cockpit dla promocji, opinii, kalendarza, arkuszy, outreachu i asystenta.', nav: ['Promuj firmę', 'Opinie', 'Kalendarz', 'Arkusze', 'Outreach', 'Asystent osobisty'], status: ['Zdrowie 98%', 'Klawiatura aktywna', 'ARIA online', 'i18n aktywny'] },
  ru: { title: 'Единая SaaS‑панель', subtitle: 'Один cockpit для продвижения, отзывов, календаря, таблиц, outreach и ассистента.', nav: ['Продвижение', 'Отзывы', 'Календарь', 'Таблицы', 'Outreach', 'Личный ассистент'], status: ['Здоровье 98%', 'Клавиатура активна', 'ARIA online', 'i18n активен'] },
} as const

const modules = [
  {
    key: 'promote',
    icon: '📣',
    title: 'Promote Business',
    href: '/dashboard/promote',
    panels: ['Campaign builder', 'Audience + locale controls', 'Analytics chart'],
    chart: [38, 62, 48, 76, 58, 84],
  },
  {
    key: 'reviews',
    icon: '⭐',
    title: 'Reviews',
    href: '/dashboard/reviews',
    panels: ['Submission card', 'Sentiment chart', 'Moderation queue'],
    chart: [72, 54, 66, 82, 61, 91],
  },
  {
    key: 'calendar',
    icon: '📅',
    title: 'Calendar',
    href: '/dashboard',
    panels: ['Monthly grid', 'Event modal', 'Reminder strip'],
    chart: [28, 45, 64, 39, 80, 52],
  },
  {
    key: 'spreadsheets',
    icon: '▦',
    title: 'Spreadsheets',
    href: '/dashboard/data',
    panels: ['Collaborative table grid', 'Presence cursors', 'Sharing panel'],
    chart: [58, 58, 58, 58, 58, 58],
  },
  {
    key: 'outreach',
    icon: '🛰️',
    title: 'Outreach',
    href: '/dashboard/outreach/outreach',
    panels: ['Campaign launch card', 'Success chart', 'Concierge panel'],
    chart: [34, 49, 57, 73, 88, 92],
  },
  {
    key: 'assistant',
    icon: '🤖',
    title: 'Personal Assistant',
    href: '/dashboard/apprentice',
    panels: ['Task list', 'Reminder timeline', 'Productivity chart'],
    chart: [44, 68, 63, 79, 74, 96],
  },
]

export default function DashboardOverviewPage() {
  const { lang } = useI18n()
  const copy = moduleCopy[(lang as keyof typeof moduleCopy) || 'en'] || moduleCopy.en

  return (
    <main className="sb-saas-cockpit" aria-labelledby="saas-title">
      <aside className="sb-saas-sidebar" aria-label="Unified SaaS navigation">
        <span className="sb-eyebrow">SaaS modules</span>
        <nav>
          {copy.nav.map((item, index) => (
            <a key={item} href={`#${modules[index].key}`} aria-label={`Jump to ${item} module`}>
              <span>{modules[index].icon}</span>
              {item}
            </a>
          ))}
        </nav>
      </aside>

      <section className="sb-saas-main">
        <header className="sb-saas-header">
          <div>
            <span className="sb-eyebrow">NASA HMI wireframe</span>
            <h1 id="saas-title" className="sb-h1">{copy.title}</h1>
            <p className="sb-body">{copy.subtitle}</p>
          </div>
          <div className="sb-status-stack" aria-label="Dashboard live telemetry">
            {copy.status.map((item) => <span key={item}>{item}</span>)}
          </div>
        </header>

        <div className="sb-module-grid">
          {modules.map((module) => (
            <article key={module.key} id={module.key} className="sb-module-panel" tabIndex={0} aria-labelledby={`${module.key}-title`}>
              <div className="sb-module-panel__top">
                <span>{module.icon}</span>
                <div>
                  <h2 id={`${module.key}-title`}>{module.title}</h2>
                  <Link href={module.href}>Open dashboard →</Link>
                </div>
              </div>

              <div className="sb-wireframe-stack" aria-label={`${module.title} wireframe components`}>
                {module.panels.map((panel) => <span key={panel}>{panel}</span>)}
              </div>

              <div className="sb-mini-chart" aria-hidden="true">
                {module.chart.map((height, index) => <i key={`${module.key}-${index}`} style={{ height: `${height}%` }} />)}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
