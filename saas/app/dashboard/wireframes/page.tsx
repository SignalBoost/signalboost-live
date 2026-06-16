'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type ModuleKey = 'promote' | 'reviews' | 'calendar' | 'spreadsheets' | 'outreach' | 'assistant'

type ModuleWireframe = {
  key: ModuleKey
  icon: string
  href: string
  accent: string
  metric: string
  metricLabel: string
  title: string
  description: string
  panels: string[]
}

const moduleKeys: Array<Pick<ModuleWireframe, 'key' | 'icon' | 'href' | 'accent'>> = [
  { key: 'promote', icon: '📣', href: '/dashboard/promote', accent: '#ffc300' },
  { key: 'reviews', icon: '⭐', href: '/dashboard/reviews', accent: '#f59e0b' },
  { key: 'calendar', icon: '📅', href: '/dashboard/calendar', accent: '#1af0ff' },
  { key: 'spreadsheets', icon: '▦', href: '/dashboard/spreadsheets', accent: '#4ade80' },
  { key: 'outreach', icon: '📡', href: '/dashboard/outreach', accent: '#ff4fd8' },
  { key: 'assistant', icon: '🛰️', href: '/dashboard/assistant', accent: '#a78bfa' },
]

const panelFallbacks: Record<ModuleKey, string[]> = {
  promote: ['Campaign builder panel', 'Reach and conversions chart', 'Concierge suggestion box'],
  reviews: ['Review submission card', 'Sentiment trend chart', 'Moderation queue list'],
  calendar: ['Monthly view grid', 'Event creation modal', 'Reminder timeline strip'],
  spreadsheets: ['Collaborative table grid', 'Sharing panel', 'Activity feed'],
  outreach: ['Campaign launch card', 'Success rate chart', 'Concierge recommendation panel'],
  assistant: ['Task list panel', 'Reminder timeline', 'Productivity insights chart'],
}

const pricingPlans = [
  {
    key: 'plan1',
    nameFallback: 'Launch',
    price: '$29',
    href: '/pricing',
  },
  {
    key: 'plan2',
    nameFallback: 'Growth',
    price: '$99',
    href: '/pricing',
  },
  {
    key: 'plan3',
    nameFallback: 'Command',
    price: '$249',
    href: '/pricing',
  },
]

function MiniChart({ accent }: { accent: string }) {
  return (
    <div className="sb-hmi-chart" aria-hidden="true">
      {[36, 58, 44, 76, 62, 88].map((height, index) => (
        <span
          key={index}
          style={{
            height: `${height}%`,
            background: `linear-gradient(180deg, ${accent}, rgba(26,240,255,.18))`,
          }}
        />
      ))}
    </div>
  )
}

function ModulePreview({ module, openLabel }: { module: ModuleWireframe; openLabel: string }) {
  return (
    <article id={module.key} className="sb-hmi-module" tabIndex={0} aria-labelledby={`${module.key}-title`}>
      <div className="sb-hmi-module__top">
        <span className="sb-hmi-icon" style={{ color: module.accent, borderColor: module.accent }}>
          {module.icon}
        </span>

        <div>
          <p className="sb-hmi-kicker">{module.metricLabel}</p>
          <h2 id={`${module.key}-title`}>{module.title}</h2>
        </div>

        <strong style={{ color: module.accent }}>{module.metric}</strong>
      </div>

      <p className="sb-hmi-muted">{module.description}</p>

      <div className="sb-hmi-module__grid">
        <div className="sb-hmi-panel sb-hmi-panel--primary">
          <span>{module.panels[0]}</span>
          <div className="sb-hmi-form-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>

        <div className="sb-hmi-panel">
          <span>{module.panels[1]}</span>
          <MiniChart accent={module.accent} />
        </div>

        <div className="sb-hmi-panel">
          <span>{module.panels[2]}</span>
          <div className="sb-hmi-feed" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>

      <Link className="sb-hmi-link" href={module.href}>
        {openLabel}
      </Link>
    </article>
  )
}

export default function SaaSWireframesPage() {
  const { dict } = useI18n()
  const [metrics, setMetrics] = useState<Record<string, string | null> | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/module-metrics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setMetrics(d) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const modules = useMemo<ModuleWireframe[]>(
    () =>
      moduleKeys.map((module) => ({
        ...module,
        // Real value from /api/dashboard/module-metrics; "—" until loaded or when absent.
        metric: metrics?.[module.key] ?? '—',
        title: t(
          dict,
          `wireframes.modules.${module.key}.title`,
          {
            promote: 'Promote Business',
            reviews: 'Reviews',
            calendar: 'Calendar',
            spreadsheets: 'Spreadsheets',
            outreach: 'Outreach',
            assistant: 'Assistant',
          }[module.key],
        ),
        metricLabel: t(
          dict,
          `wireframes.modules.${module.key}.metricLabel`,
          {
            promote: 'Campaigns',
            reviews: 'Trust score',
            calendar: 'Events queued',
            spreadsheets: 'Shared sheets',
            outreach: 'Success rate',
            assistant: 'Tasks today',
          }[module.key],
        ),
        description: t(
          dict,
          `wireframes.modules.${module.key}.description`,
          {
            promote: 'Build launches with multilingual campaign blocks, live telemetry, and AI concierge next steps.',
            reviews: 'Capture localized reviews, monitor sentiment, and route moderation work without leaving the console.',
            calendar: 'Plan monthly operations with event creation overlays and reminder timelines.',
            spreadsheets: 'Coordinate shared utility tables with permissions, comments, and real-time activity signals.',
            outreach: 'Launch email, social, and partner pushes while the concierge recommends the next channel.',
            assistant: 'Turn work into prioritized tasks, reminders, and productivity telemetry for the day.',
          }[module.key],
        ),
        panels: panelFallbacks[module.key].map((fallback, index) =>
          t(dict, `wireframes.modules.${module.key}.panel${index + 1}`, fallback),
        ),
      })),
    [dict, metrics],
  )

  return (
    <main className="sb-hmi-shell" role="main" aria-labelledby="wireframe-title">
      <section
        className="sb-hmi-dashboard"
        aria-label={t(dict, 'wireframes.unifiedAria', 'Unified SaaS dashboard wireframe preview')}
      >
        <aside className="sb-hmi-sidebar" aria-label={t(dict, 'wireframes.sidebarAria', 'SaaS module navigation')}>
          <Link href="/" className="sb-hmi-brand">
            SignalBoost
          </Link>

          <nav>
            {modules.map((module) => (
              <a key={module.key} href={`#${module.key}`} className="sb-hmi-nav-item">
                <span className="sb-hmi-nav-icon" style={{ color: module.accent }}>
                  {module.icon}
                </span>
                {module.title}
              </a>
            ))}
          </nav>

          <div className="sb-hmi-status" role="status" aria-live="polite">
            <span /> {t(dict, 'wireframes.i18nStatus', 'i18n online: EN · ES · PT · PL · RU')}
          </div>
        </aside>

        <section className="sb-hmi-main">
          <header className="sb-hmi-hero">
            <p className="sb-hmi-kicker">{t(dict, 'wireframes.kicker', 'SaaS cockpit wireframes')}</p>

            <h1 id="wireframe-title">
              {t(dict, 'wireframes.title', 'Cockpit console for office utilities and assistant workflows')}
            </h1>

            <p>
              {t(
                dict,
                'wireframes.subtitle',
                'A responsive dashboard system with telemetry cards, keyboard-friendly navigation, glass panels, and module previews ready for approval before production coding.',
              )}
            </p>

            <div className="sb-hmi-cta-row">
              <Link href="/pricing" className="sb-button-primary">
                {t(dict, 'wireframes.viewPricing', 'View pricing')}
              </Link>

              <a href="#pricing-wireframe" className="sb-button-secondary">
                {t(dict, 'wireframes.jumpPricing', 'Jump to pricing preview')}
              </a>
            </div>
          </header>

          <section
            className="sb-hmi-telemetry"
            aria-label={t(dict, 'wireframes.telemetryAria', 'Unified telemetry cards')}
          >
            {modules.map((module) => (
              <Link
                key={module.key}
                href={`#${module.key}`}
                className="sb-hmi-telemetry-card"
                style={{ '--module-accent': module.accent } as CSSProperties}
              >
                <span>{module.icon}</span>
                <strong>{module.metric}</strong>
                <small>{module.metricLabel}</small>
              </Link>
            ))}
          </section>

          <section
            className="sb-hmi-modules"
            aria-label={t(dict, 'wireframes.modulesAria', 'Module wireframe previews')}
          >
            {modules.map((module) => (
              <ModulePreview
                key={module.key}
                module={module}
                openLabel={t(dict, 'wireframes.openDashboard', 'Open dashboard')}
              />
            ))}
          </section>

          <section className="sb-hmi-preview-gallery" aria-labelledby="preview-gallery-title">
            <div>
              <p className="sb-hmi-kicker">{t(dict, 'wireframes.previewKicker', 'Preview images')}</p>
              <h2 id="preview-gallery-title">{t(dict, 'wireframes.previewTitle', 'Wireframe image exports')}</h2>
            </div>

            <div className="sb-hmi-preview-grid">
              {[
                'unified-saas-dashboard',
                'module-promote',
                'module-reviews',
                'module-calendar',
                'module-spreadsheets',
                'module-outreach',
                'module-assistant',
                'pricing-cockpit',
              ].map((image) => (
                <a key={image} href={`/wireframes/${image}.svg`} className="sb-hmi-preview-card">
                  <img
                    src={`/wireframes/${image}.svg`}
                    alt={t(dict, 'wireframes.previewAlt', 'Wireframe preview')}
                  />
                  <span>{image.replaceAll('-', ' ')}</span>
                </a>
              ))}
            </div>
          </section>

          <section id="pricing-wireframe" className="sb-hmi-pricing-preview" aria-labelledby="pricing-wireframe-title">
            <div>
              <p className="sb-hmi-kicker">{t(dict, 'wireframes.pricing.kicker', 'Pricing integration')}</p>

              <h2 id="pricing-wireframe-title">
                {t(dict, 'wireframes.pricing.title', 'SignalBoost plan panels')}
              </h2>

              <p>
                {t(
                  dict,
                  'wireframes.pricing.description',
                  'Pricing cards use the same console styling and route users directly into each workspace module.',
                )}
              </p>
            </div>

            <div className="sb-hmi-price-grid">
              {pricingPlans.map((plan) => (
                <Link key={plan.key} href={plan.href} className="sb-hmi-price-card">
                  <span>{plan.price}</span>
                  <strong>{t(dict, `wireframes.pricing.${plan.key}`, plan.nameFallback)}</strong>
                  <small>{t(dict, 'wireframes.viewPricing', 'View pricing')}</small>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  )
}
