'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
        aria-label={t(dict, 'wireframes.unifiedAria', uiCopy('u_539464f588e9b14d'))}
      >
        <aside className="sb-hmi-sidebar" aria-label={t(dict, 'wireframes.sidebarAria', uiCopy('u_55089f0b7e734ac6'))}>
          <Link href="/" className="sb-hmi-brand">{uiCopy('u_39469b05c8f95971')}</Link>

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
            <span /> {t(dict, 'wireframes.i18nStatus', uiCopy('u_593d3d0c0f414706'))}
          </div>
        </aside>

        <section className="sb-hmi-main">
          <header className="sb-hmi-hero">
            <p className="sb-hmi-kicker">{t(dict, 'wireframes.kicker', uiCopy('u_31e439a4bad86d36'))}</p>

            <h1 id="wireframe-title">
              {t(dict, 'wireframes.title', uiCopy('u_d300f755e79ae476'))}
            </h1>

            <p>
              {t(
                dict,
                'wireframes.subtitle',
                uiCopy('u_4666c6210b9077ee'),
              )}
            </p>

            <div className="sb-hmi-cta-row">
              <Link href="/pricing" className="sb-button-primary">
                {t(dict, 'wireframes.viewPricing', uiCopy('u_0dbb6679f98d132c'))}
              </Link>

              <a href="#pricing-wireframe" className="sb-button-secondary">
                {t(dict, 'wireframes.jumpPricing', uiCopy('u_6105bd390717a036'))}
              </a>
            </div>
          </header>

          <section
            className="sb-hmi-telemetry"
            aria-label={t(dict, 'wireframes.telemetryAria', uiCopy('u_3dd294d51f7ffc59'))}
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
            aria-label={t(dict, 'wireframes.modulesAria', uiCopy('u_c8afc693cb191785'))}
          >
            {modules.map((module) => (
              <ModulePreview
                key={module.key}
                module={module}
                openLabel={t(dict, 'wireframes.openDashboard', uiCopy('u_bfbf8821bbedb36f'))}
              />
            ))}
          </section>

          <section className="sb-hmi-preview-gallery" aria-labelledby="preview-gallery-title">
            <div>
              <p className="sb-hmi-kicker">{t(dict, 'wireframes.previewKicker', uiCopy('u_fecfc991431cff0b'))}</p>
              <h2 id="preview-gallery-title">{t(dict, 'wireframes.previewTitle', uiCopy('u_da167d9d865f140c'))}</h2>
            </div>

            <div className="sb-hmi-preview-grid">
              {[
                uiCopy('u_72e6f139ae203d00'),
                uiCopy('u_a82a35e4e482e2ce'),
                uiCopy('u_87c3939e04bbe245'),
                uiCopy('u_ba56088abafd88df'),
                uiCopy('u_b820b1554d64124d'),
                uiCopy('u_132c8b35d3686e45'),
                uiCopy('u_faa8a29a77bc6b3d'),
                uiCopy('u_bbd3388263cefe7d'),
              ].map((image) => (
                <a key={image} href={`/wireframes/${image}.svg`} className="sb-hmi-preview-card">
                  <img
                    src={`/wireframes/${image}.svg`}
                    alt={t(dict, 'wireframes.previewAlt', uiCopy('u_b4ac6628488ee022'))}
                  />
                  <span>{image.replaceAll('-', ' ')}</span>
                </a>
              ))}
            </div>
          </section>

          <section id="pricing-wireframe" className="sb-hmi-pricing-preview" aria-labelledby="pricing-wireframe-title">
            <div>
              <p className="sb-hmi-kicker">{t(dict, 'wireframes.pricing.kicker', uiCopy('u_c5e404ec43c2c401'))}</p>

              <h2 id="pricing-wireframe-title">
                {t(dict, 'wireframes.pricing.title', uiCopy('u_23de4d1df757cd23'))}
              </h2>

              <p>
                {t(
                  dict,
                  'wireframes.pricing.description',
                  uiCopy('u_ce6c00367da74050'),
                )}
              </p>
            </div>

            <div className="sb-hmi-price-grid">
              {pricingPlans.map((plan) => (
                <Link key={plan.key} href={plan.href} className="sb-hmi-price-card">
                  <span>{plan.price}</span>
                  <strong>{t(dict, `wireframes.pricing.${plan.key}`, plan.nameFallback)}</strong>
                  <small>{t(dict, 'wireframes.viewPricing', uiCopy('u_a555912fc950abea'))}</small>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  )
}
