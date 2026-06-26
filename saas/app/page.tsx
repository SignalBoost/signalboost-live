'use client'

import Link from 'next/link'
import SignalHero from '@/components/SignalHero'
import FeaturesFlow from '@/components/FeaturesFlow'
import Testimonials from '@/components/Testimonials'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES } from '@/lib/services/catalog'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'

export default function Home() {
  const { dict } = useI18n()
  const featureCards = [1, 2, 3].map((item) => ({
    icon: ['🧠', '🌐', '⚡'][item - 1],
    title: t(dict, `home.features.${item}.title`, ['AI proposes the next move', 'One brand, every channel', 'Built for action'][item - 1]),
    text: t(dict, `home.features.${item}.text`, ['Guided suggestions appear before a user types, reducing blank-page friction.', 'Websites, reviews, audio, video, optimization, lab, and outreach share the same visual rhythm.', 'Each service highlights one primary CTA so teams know exactly what to do next.'][item - 1]),
  }))

  return (
    <main>
      <SignalHero />

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.repoCheckLabel', 'Free public repo check')}>
        <div className="sb-glass" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 22, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.repoCheckKicker', 'Free developer utility')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.repoCheckTitle', 'Run a free public GitHub repo check.')}</h2>
            <p className="sb-body" style={{ maxWidth: 720 }}>{t(dict, 'home.repoCheckText', 'Paste a public repository URL and get a capped package advisory preview. Audit Pro unlocks the complete report, planning layer, scheduled monitoring, and assisted review workflow.')}</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/repo-check">{t(dict, 'home.repoCheckCta', 'Run free repo check')}</Link>
            <Link className="sb-button-secondary" href="/pricing">{t(dict, 'home.repoCheckPricing', 'View Audit Pro')}</Link>
          </div>
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.featuresLabel', 'Features')}>
        <div className="sb-cta-row" style={{ justifyContent: 'space-between', alignItems: 'end', marginBottom: 24 }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.featuresKicker', 'Features')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.featuresTitle', 'Everything arranged around momentum.')}</h2>
          </div>
          <Link className="sb-button-secondary" href="/docs">{t(dict, 'home.workflowCta', 'Show me the workflow')}</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {featureCards.map(({ icon, title, text }) => (
            <article key={title} className="sb-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{icon}</div>
              <h3 className="sb-h3">{title}</h3>
              <p className="sb-body" style={{ fontSize: 14, marginBottom: 0 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.servicesLabel', 'Services')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'end', marginBottom: 22 }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.servicesKicker', 'All services')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.servicesTitle', 'Nine connected services for launch, content, optimization, and learning.')}</h2>
          </div>
          <Link className="sb-button-primary" href="/dashboard">{t(dict, 'home.openWorkspace', 'Open workspace')}</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {SERVICES.map((service) => (
            <Link key={service.key} href={service.landingHref} className="sb-card" style={{ padding: 22, textDecoration: 'none', color: '#fff', borderColor: `${service.accent}44` }}>
              <div style={{ fontSize: 30 }}>{service.icon}</div>
              <h3 className="sb-h3">{t(dict, `services.${service.key}.title`, service.titleFallback)}</h3>
              <p className="sb-body" style={{ fontSize: 14 }}>{t(dict, `services.${service.key}.desc`, service.descFallback)}</p>
              <span className="sb-caption">{t(dict, `services.${service.key}.cta`, service.ctaFallback)} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'orchestration.kicker', 'AI orchestration')}>
        <OrchestrationPanel module="homepage" />
      </section>

      <FeaturesFlow />
      <Testimonials />

      <section className="sb-page-shell sb-section" aria-label={t(dict, 'home.ctaLabel', 'Call to action')}>
        <div className="sb-glass" style={{ padding: 32, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">{t(dict, 'home.readyKicker', 'Ready when you are')}</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>{t(dict, 'home.readyTitle', 'Let SignalBoost organize your growth room.')}</h2>
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
