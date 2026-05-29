'use client'

import Link from 'next/link'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'

const nav = [
  ['nav.home', '/'], ['nav.podcasters', '/podcasters'], ['nav.pricing', '/pricing'], ['nav.docs', '/docs'], ['nav.dashboard', '/dashboard'],
]

const categories = [
  ['✈️', 'Flights', 'fare anomaly scan'],
  ['🏨', 'Hotels', 'reviews + occupancy'],
  ['📶', 'eSIM', 'connectivity ready'],
  ['🗺️', 'Tours', 'local experiences'],
  ['🚗', 'Cars', 'availability telemetry'],
  ['🛒', 'Marketplace', 'partner supply gaps'],
]

export default function HomePage() {
  const { lang, setLang } = useI18n()
  const { t } = useTranslation()
  return (
    <main className="marketplace-shell">
      <header className="marketplace-nav">
        <Link href="/" className="brand">SignalBoost</Link>
        <nav>
          {nav.map(([key, href]) => <Link key={href} href={href}>{t(key)}</Link>)}
        </nav>
        <LanguageSwitcher current={lang} onChange={setLang} />
      </header>

      <section className="marketplace-hero" aria-label="AI-guided marketplace search">
        <div className="hero-copy">
          <p className="kicker">NASA HMI · Concierge AI · Marketplace telemetry</p>
          <h1>Find flights, hotels, eSIM, tours, cars, and growth tools from one cockpit.</h1>
          <p>SignalBoost turns marketplace discovery into a precise command surface: search, compare, ask Concierge AI, then route intent into SaaS workflows.</p>
          <label className="ai-search" htmlFor="ai-search"><span>⌕</span><input id="ai-search" placeholder="Ask Concierge AI: Lisbon flights, hotel proof, eSIM bundle, partner campaign…" /><Link href="/dashboard">Route</Link></label>
        </div>
        <aside className="concierge-panel" aria-label="Concierge AI panel">
          <span className="status">● Concierge AI online</span>
          <h2>Instant guidance</h2>
          <p>Choose a destination, category, language, or business objective. Concierge answers in the selected language and maps Marketplace traffic to SaaS next actions.</p>
          <div className="telemetry"><span>5 locales</span><span>Live CRM handoff</span><span>Admin telemetry</span></div>
        </aside>
      </section>

      <section className="category-grid" aria-label="Marketplace cockpit categories">
        {categories.map(([icon, name, signal]) => (
          <Link href="/dashboard" className="category-card" key={name}>
            <span>{icon}</span><strong>{name}</strong><small>{signal}</small><em>Open panel →</em>
          </Link>
        ))}
      </section>
    </main>
  )
}
