'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

const CONTACT_EMAIL = 'support@signalboostapp.com'

type Plan = {
  key: string
  name: [string, string]
  audience: [string, string]
  price: string
  period?: [string, string]
  credits: [string, string]
  seats: [string, string]
  badge?: [string, string]
  cta: [string, string]
  ctaHref: string
  featured?: boolean
  features: [string, string][]
}

const plans: Plan[] = [
  {
    key: 'free',
    name: ['pricing.free.name', 'Free Demo'],
    audience: ['pricing.free.audience', 'Evaluate SignalBoost before subscribing'],
    price: 'Free',
    credits: ['pricing.free.credits', '2 one-time video credits'],
    seats: ['pricing.free.seats', '1 user'],
    cta: ['pricing.free.cta', 'Start demo'],
    ctaHref: '/login',
    features: [
      ['pricing.free.f1', '5-language workspace preview'],
      ['pricing.free.f2', 'Website, podcast, video, reviews & outreach preview'],
      ['pricing.free.f3', 'Canvas Video Studio preview with manual captions'],
      ['pricing.free.f4', 'Basic assistant and dashboard access'],
    ],
  },
  {
    key: 'launch',
    name: ['pricing.launch.name', 'Launch'],
    audience: ['pricing.launch.audience', 'For solo operators and small businesses'],
    price: '$29',
    period: ['pricing.perMonth', '/mo'],
    credits: ['pricing.launch.credits', '25 video credits / month'],
    seats: ['pricing.launch.seats', '1 user'],
    badge: ['pricing.launch.badge', 'Best starting point'],
    cta: ['pricing.launch.cta', 'Start Launch'],
    ctaHref: '/login',
    features: [
      ['pricing.launch.f1', '5-language platform: EN, PT, ES, PL, RU'],
      ['pricing.launch.f2', '1 published website plus optimization tools'],
      ['pricing.launch.f3', 'Canvas Video Studio with AI captions and MP4 export'],
      ['pricing.launch.f4', 'Podcast launch and optimization workspace'],
      ['pricing.launch.f5', 'Reviews, calendar, basic outreach, and assistant'],
    ],
  },
  {
    key: 'growth',
    name: ['pricing.growth.name', 'Growth'],
    audience: ['pricing.growth.audience', 'For growing businesses and small teams'],
    price: '$99',
    period: ['pricing.perMonth', '/mo'],
    credits: ['pricing.growth.credits', '100 video credits / month'],
    seats: ['pricing.growth.seats', '3 users'],
    badge: ['pricing.growth.badge', 'Best for teams'],
    cta: ['pricing.growth.cta', 'Grow faster'],
    ctaHref: '/login',
    featured: true,
    features: [
      ['pricing.growth.f1', 'Everything in Launch'],
      ['pricing.growth.f2', 'Up to 5 websites/projects, deeper optimization'],
      ['pricing.growth.f3', 'Video Studio templates, brand styling, higher usage'],
      ['pricing.growth.f4', 'CoWork workspace, spreadsheets, reviews & outreach suite'],
      ['pricing.growth.f5', 'Content planning, campaigns, and assistant workflows'],
    ],
  },
  {
    key: 'command',
    name: ['pricing.command.name', 'Command'],
    audience: ['pricing.command.audience', 'For agencies, teams, and serious operators'],
    price: '$249',
    period: ['pricing.perMonth', '/mo'],
    credits: ['pricing.command.credits', '300 video credits / month'],
    seats: ['pricing.command.seats', '10+ users'],
    badge: ['pricing.command.badge', 'Full platform'],
    cta: ['pricing.command.cta', 'Get Command'],
    ctaHref: '/login',
    features: [
      ['pricing.command.f1', 'Everything in Growth'],
      ['pricing.command.f2', 'Expanded/unlimited websites and advanced workflows'],
      ['pricing.command.f3', 'Advanced video, larger usage pool, priority rendering'],
      ['pricing.command.f4', 'Team workspace, brand kit, white label, sales pipeline'],
      ['pricing.command.f5', 'Connectors, API path, dedicated onboarding & priority support'],
    ],
  },
]

export default function PricingPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-[#FFD700] no-underline">← SignalBoost</Link>

        <header className="mt-8 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">
            {t('pricing.eyebrow', 'Pricing')}
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">
            {t('pricing.title', 'One calm cockpit. Uniform pricing.')}
          </h1>
          <p className="mt-5 text-lg leading-8 text-neutral-400">
            {t('pricing.subtitle', 'Every plan is the full multilingual platform — website, video, podcast, reviews, outreach, and assistant. Choose the usage and seats that fit.')}
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <section
              key={plan.key}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.featured
                  ? 'border-[#FFD700]/50 bg-[#FFD700]/[.06] shadow-[0_0_40px_rgba(255,215,0,.12)]'
                  : 'border-white/10 bg-white/[.04]'
              }`}
            >
              {plan.badge ? (
                <span className="mb-3 inline-block w-fit rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-3 py-1 text-xs font-bold text-[#FFD700]">
                  {t(plan.badge[0], plan.badge[1])}
                </span>
              ) : (
                <span className="mb-3 inline-block h-[26px]" aria-hidden />
              )}

              <h2 className="text-xl font-bold">{t(plan.name[0], plan.name[1])}</h2>
              <p className="mt-1 text-sm text-neutral-400">{t(plan.audience[0], plan.audience[1])}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-black">{plan.price}</span>
                {plan.period && (
                  <span className="text-sm text-neutral-400">{t(plan.period[0], plan.period[1])}</span>
                )}
              </div>

              <div className="mt-3 space-y-1 text-sm text-neutral-300">
                <p>📹 {t(plan.credits[0], plan.credits[1])}</p>
                <p>👤 {t(plan.seats[0], plan.seats[1])}</p>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                {plan.features.map((f) => (
                  <li key={f[0]} className="flex gap-2">
                    <span className="text-[#FFD700]">✓</span>
                    <span>{t(f[0], f[1])}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`mt-6 rounded-full px-5 py-3 text-center font-bold no-underline transition ${
                  plan.featured
                    ? 'bg-[#FFD700] text-black hover:brightness-95'
                    : 'border border-white/15 text-white hover:border-[#FFD700]/40'
                }`}
              >
                {t(plan.cta[0], plan.cta[1])}
              </Link>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.03] p-6 text-center">
          <h3 className="text-lg font-bold">
            {t('pricing.enterprise.title', 'Need custom usage or enterprise terms?')}
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-neutral-400">
            {t('pricing.enterprise.subtitle', 'Multi-location businesses and agencies can request custom usage, white-label, and priority onboarding.')}
          </p>
          
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-4 inline-block rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-5 py-3 font-bold text-[#FFD700] no-underline"
          >
            {t('pricing.enterprise.cta', 'Talk to us')}
          </a>
        </div>
      </div>
    </main>
  )
}
