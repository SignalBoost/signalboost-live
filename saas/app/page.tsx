'use client'

import Link from 'next/link'
import FeaturesFlow from '@/components/FeaturesFlow'
import Testimonials from '@/components/Testimonials'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES } from '@/lib/services/catalog'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'

const marketplaceCategories = [
  { icon: '📣', label: 'Launch', detail: 'Campaign crews, local ads, and offer builders.', accent: 'sb-neon-text-gold' },
  { icon: '⭐', label: 'Trust', detail: 'Review responders, testimonial kits, and proof panels.', accent: 'sb-neon-text-cyan' },
  { icon: '🛰️', label: 'Operate', detail: 'Calendar, spreadsheet, outreach, and CRM telemetry.', accent: 'sb-neon-text-magenta' },
]

const partners = ['Google Business', 'TikTok', 'YouTube', 'Meta', 'Stripe', 'Supabase']

export default function Home() {
  const { dict } = useI18n()
  const featureCards = [1, 2, 3].map((item) => ({
    icon: ['🧠', '🌐', '⚡'][item - 1],
    title: t(dict, `home.features.${item}.title`, ['AI proposes the next move', 'One brand, every channel', 'Built for action'][item - 1]),
    text: t(dict, `home.features.${item}.text`, ['Guided suggestions appear before a user types, reducing blank-page friction.', 'Websites, reviews, audio, video, optimization, lab, and outreach share the same visual rhythm.', 'Each service highlights one primary CTA so teams know exactly what to do next.'][item - 1]),
  }))

  return (
    <main className="sb-marketplace">
      <section className="sb-page-shell sb-section sb-cockpit-hero" aria-label={t(dict, 'home.marketplaceHeroLabel', 'Marketplace mission search')}>
        <span className="sb-eyebrow sb-neon-text-gold">{t(dict, 'home.marketplaceKicker', 'SignalBoost mission marketplace')}</span>
        <h1 className="sb-h1" style={{ marginTop: 'var(--sb-space-md)' }}>{t(dict, 'home.marketplaceTitle', 'Find the next growth maneuver before your competitors see it.')}</h1>
        <p className="sb-body" style={{ maxWidth: 860 }}>{t(dict, 'home.marketplaceSubtitle', 'Search partners, categories, and SaaS workspaces from one NASA-style command surface built on shared typography, color, spacing, shadow, and cockpit tokens.')}</p>
        <form className="sb-hero-search" role="search" aria-label={t(dict, 'home.searchLabel', 'Search SignalBoost marketplace')} style={{ marginTop: 'var(--sb-space-xl)' }}>
          <input aria-label={t(dict, 'home.searchInput', 'Search services and partners')} placeholder={t(dict, 'home.searchPlaceholder', 'Try “reviews + outreach for restaurants”')} />
          <Link className="sb-button-primary" href="/dashboard">{t(dict, 'home.searchCta', 'Open cockpit')}</Link>
        </form>
        <div className="sb-telemetry-strip" aria-hidden="true" style={{ marginTop: 'var(--sb-space-lg)' }}>
          <span className="sb-telemetry-bar" />
          <span className="sb-telemetry-bar" />
          <span className="sb-telemetry-bar" />
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.categoriesLabel', 'Marketplace categories')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sb-space-lg)', flexWrap: 'wrap', alignItems: 'end', marginBottom: 'var(--sb-space-lg)' }}>
          <div>
            <span className="sb-eyebrow sb-neon-text-cyan">{t(dict, 'home.categoriesKicker', 'Category panels')}</span>
            <h2 className="sb-h2" style={{ marginTop: 'var(--sb-space-sm)' }}>{t(dict, 'home.categoriesTitle', 'Marketplace routes mapped like cockpit telemetry.')}</h2>
          </div>
          <Link className="sb-button-secondary" href="/pricing">{t(dict, 'home.comparePlans', 'Compare plans')}</Link>
        </div>
        <div className="sb-responsive-grid">
          {marketplaceCategories.map((category) => (
            <article key={category.label} className="sb-marketplace-panel" style={{ padding: 'var(--sb-space-lg)' }}>
              <div className={category.accent} style={{ fontSize: 34 }}>{category.icon}</div>
              <h3 className="sb-h3" style={{ marginTop: 'var(--sb-space-md)' }}>{category.label}</h3>
              <p className="sb-body" style={{ fontSize: 14 }}>{category.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.featuresLabel', 'Features')}>
        <div className="sb-cta-row" style={{ justifyContent: 'space-between', alignItems: 'end', marginBottom: 'var(--sb-space-lg)' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.featuresKicker', 'Features')}</span>
            <h2 className="sb-h2" style={{ marginTop: 'var(--sb-space-sm)' }}>{t(dict, 'home.featuresTitle', 'Everything arranged around momentum.')}</h2>
          </div>
          <Link className="sb-button-secondary" href="/docs">{t(dict, 'home.workflowCta', 'Show me the workflow')}</Link>
        </div>

        <div className="sb-responsive-grid">
          {featureCards.map(({ icon, title, text }) => (
            <article key={title} className="sb-card sb-cockpit-panel" style={{ padding: 'var(--sb-space-lg)' }}>
              <div style={{ fontSize: 28, marginBottom: 'var(--sb-space-md)' }}>{icon}</div>
              <h3 className="sb-h3">{title}</h3>
              <p className="sb-body" style={{ fontSize: 14, marginBottom: 0 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.servicesLabel', 'Services')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sb-space-lg)', flexWrap: 'wrap', alignItems: 'end', marginBottom: 'var(--sb-space-lg)' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.servicesKicker', 'All services')}</span>
            <h2 className="sb-h2" style={{ marginTop: 'var(--sb-space-sm)' }}>{t(dict, 'home.servicesTitle', 'Nine connected services for launch, content, optimization, and learning.')}</h2>
          </div>
          <Link className="sb-button-primary" href="/dashboard">{t(dict, 'home.openWorkspace', 'Open workspace')}</Link>
        </div>
        <div className="sb-responsive-grid">
          {SERVICES.map((service) => (
            <Link key={service.key} href={service.landingHref} className="sb-card sb-cockpit-panel" style={{ padding: 'var(--sb-space-lg)', textDecoration: 'none', color: '#fff', borderColor: `${service.accent}66` }}>
              <div style={{ fontSize: 30 }}>{service.icon}</div>
              <h3 className="sb-h3">{t(dict, `services.${service.key}.title`, service.titleFallback)}</h3>
              <p className="sb-body" style={{ fontSize: 14 }}>{t(dict, `services.${service.key}.desc`, service.descFallback)}</p>
              <span className="sb-caption">{t(dict, `services.${service.key}.cta`, service.ctaFallback)} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.partnersLabel', 'Partner showcase')}>
        <div className="sb-cockpit-panel" style={{ padding: 'var(--sb-space-xl)' }}>
          <span className="sb-eyebrow sb-neon-text-magenta">{t(dict, 'home.partnersKicker', 'Partner showcase')}</span>
          <h2 className="sb-h2" style={{ marginTop: 'var(--sb-space-sm)' }}>{t(dict, 'home.partnersTitle', 'Connected channels stay visible in the same cockpit.')}</h2>
          <div className="sb-responsive-grid" style={{ marginTop: 'var(--sb-space-lg)' }}>
            {partners.map((partner) => <div key={partner} className="sb-telemetry-card" style={{ padding: 'var(--sb-space-md)', fontWeight: 700 }}>{partner}</div>)}
          </div>
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'orchestration.kicker', 'AI orchestration')}>
        <OrchestrationPanel module="homepage" />
      </section>

      <FeaturesFlow />
      <Testimonials />

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.ctaLabel', 'Call to action')}>
        <div className="sb-glass sb-cockpit-panel" style={{ padding: 'var(--sb-space-xl)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sb-space-lg)', alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.readyKicker', 'Ready when you are')}</span>
            <h2 className="sb-h2" style={{ marginTop: 'var(--sb-space-sm)' }}>{t(dict, 'home.readyTitle', 'Let SignalBoost organize your growth room.')}</h2>
            <p className="sb-body" style={{ maxWidth: 680 }}>{t(dict, 'home.readyText', 'Start with one campaign or optimization. The AI will suggest an audience, tone, proof point, approval step, and launch-ready result before you publish.')}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/dashboard">{t(dict, 'home.startBuilding', 'Start building')}</Link>
            <Link className="sb-button-secondary" href="/pricing">{t(dict, 'home.comparePlans', 'Compare plans')}</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
