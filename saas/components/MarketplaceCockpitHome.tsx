'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
]

const CATEGORY_KEYS = [
  { key: 'flights', icon: '✈', stat: '42 live routes', signal: '82% intent' },
  { key: 'hotels', icon: '▣', stat: '18 hotel hubs', signal: '76% occupancy' },
  { key: 'esim', icon: '◌', stat: '91 countries', signal: '5G ready' },
  { key: 'tours', icon: '◇', stat: '230 activities', signal: '24h booking' },
  { key: 'cars', icon: '⬡', stat: '33 fleets', signal: '61% demand' },
  { key: 'marketplace', icon: '✦', stat: '130+ partners', signal: 'always on' },
]

const PARTNER_KEYS = ['booking', 'amazon', 'drimsim', 'viator', 'rentalcars', 'getyourguide']

const suggestedQueries = [
  'Search: flights to Lima next month.',
  'Hotels near Warsaw for a product launch.',
  'eSIM and airport transfer in São Paulo.',
]

export default function MarketplaceCockpitHome() {
  const { dict, lang, setLang } = useI18n()
  const [query, setQuery] = useState('')

  const categoryPanels = useMemo(
    () =>
      CATEGORY_KEYS.map((category) => ({
        ...category,
        title: t(dict, `marketplaceHome.categories.${category.key}.title`, category.key),
        description: t(
          dict,
          `marketplaceHome.categories.${category.key}.description`,
          'Compare partner options with live conversion signals.'
        ),
      })),
    [dict]
  )

  const partners = useMemo(
    () =>
      PARTNER_KEYS.map((key) => ({
        key,
        label: t(dict, `marketplaceHome.partners.${key}`, key),
      })),
    [dict]
  )

  return (
    <div className="marketplace-cockpit" aria-label={t(dict, 'marketplaceHome.pageLabel', 'SignalBoost Marketplace cockpit homepage')}>
      <section className="cockpit-hero" aria-labelledby="marketplace-hero-title">
        <div className="cockpit-glow cockpit-glow-one" aria-hidden="true" />
        <div className="cockpit-glow cockpit-glow-two" aria-hidden="true" />

        <div className="cockpit-hero-copy">
          <p className="cockpit-eyebrow">{t(dict, 'marketplaceHome.kicker', 'NASA-style marketplace HMI')}</p>
          <h1 id="marketplace-hero-title">{t(dict, 'marketplaceHome.title', 'Plan trips, bookings, connectivity, and campaigns from one cockpit.')}</h1>
          <p className="cockpit-subtitle">
            {t(
              dict,
              'marketplaceHome.subtitle',
              'SignalBoost Concierge guides travelers and operators through partner choices with telemetry, multilingual prompts, and booking-ready actions.'
            )}
          </p>

          <form className="ai-search-console" role="search" aria-label={t(dict, 'marketplaceHome.searchLabel', 'AI-guided marketplace search')}>
            <label htmlFor="marketplace-search" className="sr-only">
              {t(dict, 'marketplaceHome.searchLabel', 'AI-guided marketplace search')}
            </label>
            <div className="ai-search-row">
              <span aria-hidden="true">⌕</span>
              <input
                id="marketplace-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(dict, 'marketplaceHome.searchPlaceholder', 'Search: flights to Lima next month.')}
                aria-describedby="marketplace-search-suggestions"
              />
              <button type="submit">{t(dict, 'marketplaceHome.searchButton', 'Scan')}</button>
            </div>
            <div id="marketplace-search-suggestions" className="context-suggestions" role="listbox" aria-label={t(dict, 'marketplaceHome.suggestionsLabel', 'Contextual search suggestions')}>
              {suggestedQueries.map((suggestion) => (
                <button key={suggestion} type="button" role="option" onClick={() => setQuery(suggestion.replace('Search: ', ''))}>
                  {suggestion}
                </button>
              ))}
            </div>
          </form>
        </div>

        <aside className="concierge-hero-widget" aria-label={t(dict, 'marketplaceHome.conciergeLabel', 'Concierge AI hero widget')}>
          <div className="concierge-orb" aria-hidden="true" />
          <p className="cockpit-eyebrow">{t(dict, 'marketplaceHome.conciergeKicker', 'Concierge AI')}</p>
          <h2>{t(dict, 'marketplaceHome.conciergeTitle', 'Ask me to optimize the route.')}</h2>
          <p>{t(dict, 'marketplaceHome.conciergeText', 'I can compare partners, translate search intent, and recommend the next booking or campaign action.')}</p>
          <div className="concierge-telemetry" role="group" aria-label={t(dict, 'marketplaceHome.conciergeMetricsLabel', 'Concierge telemetry')}>
            <span>{t(dict, 'marketplaceHome.conciergeMetricOne', 'Intent lock: 94%')}</span>
            <span>{t(dict, 'marketplaceHome.conciergeMetricTwo', 'Latency: 0.8s')}</span>
            <span>{t(dict, 'marketplaceHome.conciergeMetricThree', 'Locale aware')}</span>
          </div>
        </aside>
      </section>

      <section className="executive-strip" aria-label={t(dict, 'marketplaceHome.executiveLabel', 'Executive marketplace telemetry')}>
        <div>
          <span>{t(dict, 'marketplaceHome.connectedLabel', 'Connected with')}</span>
          <strong>{t(dict, 'marketplaceHome.connectedValue', '130+ trusted partners.')}</strong>
        </div>
        <div className="telemetry-cells" role="list">
          <span role="listitem">{t(dict, 'marketplaceHome.activeCampaigns', 'Active campaigns: 24')}</span>
          <span role="listitem">{t(dict, 'marketplaceHome.bookingsToday', 'Bookings today: 318')}</span>
          <span role="listitem">{t(dict, 'marketplaceHome.signalHealth', 'Signal health: nominal')}</span>
        </div>
        <div className="cockpit-language-toggle" role="group" aria-label={t(dict, 'marketplaceHome.languageLabel', 'Language selector')}>
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              aria-pressed={lang === language.code}
              onClick={() => setLang(language.code)}
            >
              {language.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="category-panels-title" className="cockpit-section">
        <div className="section-heading">
          <p className="cockpit-eyebrow">{t(dict, 'marketplaceHome.categoriesKicker', 'Category panels')}</p>
          <h2 id="category-panels-title">{t(dict, 'marketplaceHome.categoriesTitle', 'Select a mission panel and reveal live stats.')}</h2>
        </div>
        <div className="category-panel-grid">
          {categoryPanels.map((category) => (
            <article key={category.key} className="category-cockpit-panel" tabIndex={0} aria-labelledby={`category-${category.key}`}>
              <div className="panel-telemetry" aria-hidden="true"><span /><span /><span /></div>
              <div className="panel-icon" aria-hidden="true">{category.icon}</div>
              <h3 id={`category-${category.key}`}>{category.title}</h3>
              <p>{category.description}</p>
              <dl className="quick-stats">
                <div><dt>{t(dict, 'marketplaceHome.quickStat', 'Quick stat')}</dt><dd>{category.stat}</dd></div>
                <div><dt>{t(dict, 'marketplaceHome.signal', 'Signal')}</dt><dd>{category.signal}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="partner-vitrina cockpit-section" aria-labelledby="partner-showcase-title">
        <div className="section-heading">
          <p className="cockpit-eyebrow">{t(dict, 'marketplaceHome.partnerKicker', 'Partner vitrina')}</p>
          <h2 id="partner-showcase-title">{t(dict, 'marketplaceHome.partnerTitle', 'Trusted partner carousel with neon framing.')}</h2>
        </div>
        <div className="partner-carousel" role="region" aria-roledescription="carousel" aria-label={t(dict, 'marketplaceHome.partnerCarouselLabel', 'Trusted partner logos')}>
          <div className="partner-track">
            {[...partners, ...partners].map((partner, index) => (
              <div className="partner-logo-card" key={`${partner.key}-${index}`}>{partner.label}</div>
            ))}
          </div>
        </div>
        <p className="concierge-tooltip" role="note">{t(dict, 'marketplaceHome.partnerTooltip', 'Ask me about these partners.')}</p>
      </section>

      <footer className="cockpit-footer-console" aria-label={t(dict, 'marketplaceHome.footerLabel', 'Homepage cockpit footer')}>
        <div>
          <p className="cockpit-eyebrow">{t(dict, 'marketplaceHome.footerKicker', 'Support console')}</p>
          <h2>{t(dict, 'marketplaceHome.footerTitle', 'Mission support is standing by.')}</h2>
          <p>{t(dict, 'marketplaceHome.footerText', 'Contact support for partner onboarding, booking flow diagnostics, and SaaS module setup.')}</p>
        </div>
        <nav aria-label={t(dict, 'marketplaceHome.quickLinksLabel', 'Quick links')} className="footer-quick-links">
          <Link href="/admin/adm">{t(dict, 'marketplaceHome.quickLinks.admin', 'Admin')}</Link>
          <Link href="/dashboard">{t(dict, 'marketplaceHome.quickLinks.dashboard', 'Dashboard')}</Link>
          <Link href="/dashboard/modules">{t(dict, 'marketplaceHome.quickLinks.saasModules', 'SaaS Modules')}</Link>
          <Link href="/pricing">{t(dict, 'marketplaceHome.quickLinks.pricing', 'Pricing')}</Link>
        </nav>
        <div className="support-panel">
          <span>{t(dict, 'marketplaceHome.supportChannel', 'Contact + support')}</span>
          <a href="mailto:support@signalboostapp.com">support@signalboostapp.com</a>
        </div>
      </footer>
    </div>
  )
}
