'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const homeCopy = {
  en: {
    kicker: 'MARKETPLACE MISSION CONTROL',
    title: 'Book the next move with a cockpit-grade AI travel marketplace.',
    subtitle: 'SignalBoost unifies search, concierge guidance, trusted partners, and live telemetry in one NASA-style HMI for high-confidence marketplace decisions.',
    search: 'Where should SignalBoost route you next?',
    placeholder: 'Try “Lisbon flights with hotel, eSIM, tours, and car rental”',
    suggestions: ['Weekend in Lisbon', 'Family hotel near beach', 'Fast eSIM for Poland', 'Airport car rental'],
    concierge: 'Concierge AI is online: compare options, localize offers, and assemble the safest next itinerary.',
    partners: 'Connected with 130+ trusted partners',
    telemetry: ['API uptime 99.99%', 'Fare scan 12k/min', 'Review trust 4.8/5', 'Locale sync live'],
    partnerTitle: 'Trusted partner signal carousel',
    footer: 'Cockpit console',
  },
  es: {
    kicker: 'CONTROL DE MISIÓN DEL MARKETPLACE',
    title: 'Reserva el próximo movimiento con un marketplace de viajes guiado por IA.',
    subtitle: 'SignalBoost unifica búsqueda, concierge, socios confiables y telemetría en una HMI estilo NASA.',
    search: '¿A dónde debe dirigirte SignalBoost?',
    placeholder: 'Prueba “vuelos a Lisboa con hotel, eSIM, tours y coche”',
    suggestions: ['Fin de semana en Lisboa', 'Hotel familiar cerca de la playa', 'eSIM rápida para Polonia', 'Alquiler de coche aeropuerto'],
    concierge: 'Concierge AI está online: compara opciones, localiza ofertas y arma el itinerario más seguro.',
    partners: 'Conectado con más de 130 socios confiables',
    telemetry: ['API 99.99%', 'Tarifas 12k/min', 'Confianza 4.8/5', 'Locales en vivo'],
    partnerTitle: 'Carrusel de señales de socios',
    footer: 'Consola cockpit',
  },
  pt: {
    kicker: 'CONTROLE DE MISSÃO DO MARKETPLACE',
    title: 'Reserve o próximo movimento com um marketplace de viagens guiado por IA.',
    subtitle: 'SignalBoost une busca, concierge, parceiros confiáveis e telemetria em uma HMI estilo NASA.',
    search: 'Para onde o SignalBoost deve direcionar você?',
    placeholder: 'Tente “voos para Lisboa com hotel, eSIM, tours e carro”',
    suggestions: ['Fim de semana em Lisboa', 'Hotel familiar na praia', 'eSIM rápido para Polônia', 'Carro no aeroporto'],
    concierge: 'Concierge AI online: compare opções, localize ofertas e monte o roteiro mais seguro.',
    partners: 'Conectado a mais de 130 parceiros confiáveis',
    telemetry: ['API 99,99%', 'Tarifas 12k/min', 'Confiança 4,8/5', 'Locales ao vivo'],
    partnerTitle: 'Carrossel de sinais de parceiros',
    footer: 'Console cockpit',
  },
  pl: {
    kicker: 'CENTRUM MISJI MARKETPLACE',
    title: 'Rezerwuj kolejny ruch w marketplace podróży prowadzonym przez AI.',
    subtitle: 'SignalBoost łączy wyszukiwanie, concierge, zaufanych partnerów i telemetrię w HMI w stylu NASA.',
    search: 'Dokąd SignalBoost ma Cię poprowadzić?',
    placeholder: 'Spróbuj „Lizbona: lot, hotel, eSIM, wycieczki i auto”',
    suggestions: ['Weekend w Lizbonie', 'Hotel rodzinny przy plaży', 'Szybki eSIM do Polski', 'Auto z lotniska'],
    concierge: 'Concierge AI online: porównuje opcje, lokalizuje oferty i składa bezpieczny plan.',
    partners: 'Połączono z ponad 130 zaufanymi partnerami',
    telemetry: ['API 99,99%', 'Taryfy 12k/min', 'Zaufanie 4,8/5', 'Locale live'],
    partnerTitle: 'Karuzela sygnałów partnerów',
    footer: 'Konsola cockpit',
  },
  ru: {
    kicker: 'ЦЕНТР УПРАВЛЕНИЯ МАРКЕТПЛЕЙСОМ',
    title: 'Бронируйте следующий шаг в AI‑маркетплейсе путешествий.',
    subtitle: 'SignalBoost объединяет поиск, concierge, партнеров и телеметрию в HMI в стиле NASA.',
    search: 'Куда SignalBoost должен вас направить?',
    placeholder: 'Например: «Лиссабон: рейсы, отель, eSIM, туры и авто»',
    suggestions: ['Уикенд в Лиссабоне', 'Семейный отель у пляжа', 'Быстрый eSIM для Польши', 'Авто в аэропорту'],
    concierge: 'Concierge AI онлайн: сравнит варианты, локализует офферы и соберет безопасный маршрут.',
    partners: 'Подключено к 130+ надежным партнерам',
    telemetry: ['API 99,99%', 'Тарифы 12k/мин', 'Доверие 4,8/5', 'Локали live'],
    partnerTitle: 'Карусель сигналов партнеров',
    footer: 'Консоль cockpit',
  },
} as const

const categories = [
  ['✈️', 'Flights', 'Fare vectors, baggage rules, disruption risk'],
  ['🏨', 'Hotels', 'Trust score, family fit, availability heat'],
  ['📶', 'eSIM & Internet', 'Coverage map, speed tier, activation ETA'],
  ['🗺️', 'Tours & Activities', 'Local guide match, weather, capacity'],
  ['🚗', 'Car Rentals', 'Pickup telemetry, insurance, EV readiness'],
  ['🛰️', 'Marketplace', 'Bundles, partner SLAs, price confidence'],
]

const partners = ['AeroLink', 'StayGrid', 'NomadSIM', 'LocalOps', 'DriveNet', 'MarketHub']

export default function Home() {
  const { lang } = useI18n()
  const copy = homeCopy[(lang as keyof typeof homeCopy) || 'en'] || homeCopy.en
  const consoleLinks = useMemo(() => [
    ['Admin', '/admin'],
    ['Dashboard', '/dashboard'],
    ['SaaS', '/dashboard'],
    ['Pricing', '/pricing'],
  ], [])

  return (
    <main className="sb-cockpit" aria-labelledby="marketplace-title">
      <section className="sb-cockpit-hero" aria-label="AI guided marketplace search">
        <div className="sb-cockpit-copy">
          <span className="sb-eyebrow">{copy.kicker}</span>
          <h1 id="marketplace-title" className="sb-h1">{copy.title}</h1>
          <p className="sb-body">{copy.subtitle}</p>
          <form className="sb-search-console" role="search" aria-label={copy.search}>
            <label htmlFor="marketplace-search">{copy.search}</label>
            <div>
              <input id="marketplace-search" type="search" placeholder={copy.placeholder} aria-describedby="marketplace-suggestions" />
              <button type="submit">AI route</button>
            </div>
            <ul id="marketplace-suggestions" aria-label="Contextual search suggestions">
              {copy.suggestions.map((suggestion) => <li key={suggestion}><button type="button">{suggestion}</button></li>)}
            </ul>
          </form>
        </div>

        <aside className="sb-concierge-widget" aria-label="Concierge AI widget">
          <span>CONCIERGE AI</span>
          <strong>Guidance channel active</strong>
          <p>{copy.concierge}</p>
          <div className="sb-orbit" aria-hidden="true"><i /><i /><i /></div>
        </aside>
      </section>

      <section className="sb-info-strip" aria-label="Executive marketplace telemetry">
        <strong>{copy.partners}</strong>
        <div>
          {copy.telemetry.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      <section aria-labelledby="category-panels">
        <div className="sb-section-heading">
          <span className="sb-eyebrow">Telemetry categories</span>
          <h2 id="category-panels" className="sb-h2">Category cockpit panels</h2>
        </div>
        <div className="sb-cockpit-grid" role="list">
          {categories.map(([icon, title, text]) => (
            <Link href="/pricing" key={title} className="sb-cockpit-panel" role="listitem" aria-label={`${title}: ${text}`}>
              <span>{icon}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <div aria-hidden="true"><i style={{ width: `${45 + title.length * 4}%` }} /></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="sb-partner-carousel" aria-labelledby="partner-showcase">
        <div className="sb-section-heading">
          <span className="sb-eyebrow">Partner showcase</span>
          <h2 id="partner-showcase" className="sb-h2">{copy.partnerTitle}</h2>
        </div>
        <div role="list" aria-label="Trusted partner carousel">
          {partners.map((partner, index) => (
            <article key={partner} role="listitem" tabIndex={0} aria-label={`${partner} partner frame`}>
              <span>0{index + 1}</span>
              <strong>{partner}</strong>
              <small>Signal locked</small>
            </article>
          ))}
        </div>
      </section>

      <footer className="sb-cockpit-footer" aria-label="Marketplace cockpit footer console">
        <span>{copy.footer}</span>
        <nav aria-label="Console links">
          {consoleLinks.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
        </nav>
      </footer>
    </main>
  )
}
