'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const CONTACT_EMAIL = 'support@signalboostapp.com'

type Plan = {
  key: 'free' | 'launch' | 'growth' | 'command'
  name: string
  audience: string
  price: string
  period?: string
  description: string
  cta: string
  badge?: string
  credits: string
  seats: string
  features: string[]
  limits: string[]
}

type PlatformModule = {
  icon: string
  name: string
  availability: string
  description: string
}

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

  const plans: Plan[] = [
    {
      key: 'free',
      name: t(dict, 'pricing_v2.free.name', 'Free Demo'),
      audience: t(dict, 'pricing_v2.free.audience', 'Evaluate SignalBoost before subscribing'),
      price: t(dict, 'pricing_v2.priceFree', 'Free'),
      description: t(
        dict,
        'pricing_v2.free.description',
        'A limited evaluation pass so you can test the multilingual workspace, preview the editor, and understand the platform before choosing a paid plan.',
      ),
      cta: t(dict, 'pricing_v2.free.cta', 'Start demo'),
      credits: t(dict, 'pricing_v2.free.credits', '2 one-time video credits'),
      seats: t(dict, 'pricing_v2.free.seats', '1 user'),
      features: [
        t(dict, 'pricing_v2.free.feature1', '5-language workspace preview'),
        t(dict, 'pricing_v2.free.feature2', 'Website, podcast, video, reviews, outreach, and workspace preview'),
        t(dict, 'pricing_v2.free.feature3', 'Canvas Video Studio preview and manual caption editing'),
        t(dict, 'pricing_v2.free.feature4', 'Basic assistant and dashboard access'),
      ],
      limits: [
        t(dict, 'pricing_v2.free.limit1', 'Evaluation access only — not a monthly free operating plan'),
        t(dict, 'pricing_v2.free.limit2', '2 one-time credits for AI captions or MP4 export testing'),
        t(dict, 'pricing_v2.free.limit3', 'Paid plan required for ongoing business use'),
      ],
    },
    {
      key: 'launch',
      name: t(dict, 'pricing_v2.launch.name', 'Launch'),
      audience: t(dict, 'pricing_v2.launch.audience', 'For solo operators and small businesses'),
      price: '$29',
      period: t(dict, 'pricing_v2.perMonthShort', '/mo'),
      description: t(
        dict,
        'pricing_v2.launch.description',
        'Launch a multilingual business presence with website tools, AI captions, video exports, reviews, podcast/web optimization, and a focused operating workspace.',
      ),
      cta: t(dict, 'pricing_v2.launch.cta', 'Launch with SignalBoost'),
      badge: t(dict, 'pricing_v2.launch.badge', 'Best starting point'),
      credits: t(dict, 'pricing_v2.launch.credits', '25 video credits / month'),
      seats: t(dict, 'pricing_v2.launch.seats', '1 user'),
      features: [
        t(dict, 'pricing_v2.launch.feature1', '5-language platform: English, Portuguese, Spanish, Polish, and Russian'),
        t(dict, 'pricing_v2.launch.feature2', '1 published website plus website optimization tools'),
        t(dict, 'pricing_v2.launch.feature3', 'Canvas Video Studio with AI captions and MP4 exports'),
        t(dict, 'pricing_v2.launch.feature4', 'Podcast launch and optimization workspace'),
        t(dict, 'pricing_v2.launch.feature5', 'Reviews, calendar, basic outreach, and assistant tools'),
      ],
      limits: [
        t(dict, 'pricing_v2.launch.limit1', 'Designed for one brand or business'),
        t(dict, 'pricing_v2.launch.limit2', 'Advanced team workflows start on Growth'),
      ],
    },
    {
      key: 'growth',
      name: t(dict, 'pricing_v2.growth.name', 'Growth'),
      audience: t(dict, 'pricing_v2.growth.audience', 'For growing businesses and small teams'),
      price: '$99',
      period: t(dict, 'pricing_v2.perMonthShort', '/mo'),
      description: t(
        dict,
        'pricing_v2.growth.description',
        'Scale content, campaigns, reviews, websites, podcasts, and video production across a multilingual team workspace.',
      ),
      cta: t(dict, 'pricing_v2.growth.cta', 'Grow faster'),
      badge: t(dict, 'pricing_v2.growth.badge', 'Best for teams'),
      credits: t(dict, 'pricing_v2.growth.credits', '100 video credits / month'),
      seats: t(dict, 'pricing_v2.growth.seats', '3 users'),
      features: [
        t(dict, 'pricing_v2.growth.feature1', 'Everything in Launch'),
        t(dict, 'pricing_v2.growth.feature2', 'Up to 5 websites/projects and deeper website optimization'),
        t(dict, 'pricing_v2.growth.feature3', 'Canvas Video Studio templates, brand styling, and higher video usage'),
        t(dict, 'pricing_v2.growth.feature4', 'CoWork workspace, spreadsheets, calendar, reviews suite, and outreach tools'),
        t(dict, 'pricing_v2.growth.feature5', 'Podcast optimization, content planning, campaigns, and assistant workflows'),
      ],
      limits: [
        t(dict, 'pricing_v2.growth.limit1', 'Best for active content and growth operations'),
        t(dict, 'pricing_v2.growth.limit2', 'White label and advanced agency controls start on Command'),
      ],
    },
    {
      key: 'command',
      name: t(dict, 'pricing_v2.command.name', 'Command'),
      audience: t(dict, 'pricing_v2.command.audience', 'For agencies, teams, and serious operators'),
      price: '$249',
      period: t(dict, 'pricing_v2.perMonthShort', '/mo'),
      description: t(
        dict,
        'pricing_v2.command.description',
        'Run a multilingual growth command center with expanded websites, advanced video, podcast optimization, outreach, teams, and priority workflows.',
      ),
      cta: t(dict, 'pricing_v2.command.cta', 'Get Command'),
      badge: t(dict, 'pricing_v2.command.badge', 'Full platform'),
      credits: t(dict, 'pricing_v2.command.credits', '300 video credits / month'),
      seats: t(dict, 'pricing_v2.command.seats', '10+ users'),
      features: [
        t(dict, 'pricing_v2.command.feature1', 'Everything in Growth'),
        t(dict, 'pricing_v2.command.feature2', 'Unlimited or expanded websites and advanced optimization workflows'),
        t(dict, 'pricing_v2.command.feature3', 'Advanced video workflows, larger usage pool, and priority rendering path'),
        t(dict, 'pricing_v2.command.feature4', 'Team workspace, brand kit, white label, reviews, outreach, and sales pipeline'),
        t(dict, 'pricing_v2.command.feature5', 'Data connectors, API/integrations path, dedicated onboarding, and priority support'),
      ],
      limits: [
        t(dict, 'pricing_v2.command.limit1', 'Built for multi-location businesses, agencies, and operators'),
        t(dict, 'pricing_v2.command.limit2', 'Custom usage and enterprise terms available by request'),
      ],
    },
  ]

  const platformModules: PlatformModule[] = [
    {
      icon: '🌐',
      name: t(dict, 'pricing_v2.modules.website.name', 'Website Builder + Web Optimization'),
      availability: t(dict, 'pricing_v2.modules.website.availability', 'Launch+'),
      description: t(
        dict,
        'pricing_v2.modules.website.description',
        'Create websites, improve existing pages, optimize content, and prepare multilingual pages for search and conversion.',
      ),
    },
    {
      icon: '🎙️',
      name: t(dict, 'pricing_v2.modules.podcast.name', 'Podcast Builder + Podcast Optimization'),
      availability: t(dict, 'pricing_v2.modules.podcast.availability', 'Launch+ / advanced podcast add-on path'),
      description: t(
        dict,
        'pricing_v2.modules.podcast.description',
        'Plan, launch, audit, and optimize podcast presence across the same 5-language operating workspace.',
      ),
    },
    {
      icon: '🎬',
      name: t(dict, 'pricing_v2.modules.video.name', 'Canvas Video Studio'),
      availability: t(dict, 'pricing_v2.modules.video.availability', 'All plans, credits apply'),
      description: t(
        dict,
        'pricing_v2.modules.video.description',
        'Upload video, generate AI captions, style overlays, preview edits, and export MP4s using video credits.',
      ),
    },
    {
      icon: '🎧',
      name: t(dict, 'pricing_v2.modules.audio.name', 'Audio Studio'),
      availability: t(dict, 'pricing_v2.modules.audio.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.audio.description',
        'Create and manage voice/audio content as part of your multilingual publishing workflow.',
      ),
    },
    {
      icon: '⭐',
      name: t(dict, 'pricing_v2.modules.reviews.name', 'Reviews + Reputation'),
      availability: t(dict, 'pricing_v2.modules.reviews.availability', 'Launch+'),
      description: t(
        dict,
        'pricing_v2.modules.reviews.description',
        'Collect, manage, and showcase reviews while supporting reputation workflows across languages.',
      ),
    },
    {
      icon: '📡',
      name: t(dict, 'pricing_v2.modules.outreach.name', 'Outreach + Campaigns'),
      availability: t(dict, 'pricing_v2.modules.outreach.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.outreach.description',
        'Coordinate discovery, contacts, pipeline, promotion, campaigns, and sales follow-up from one workspace.',
      ),
    },
    {
      icon: '🤝',
      name: t(dict, 'pricing_v2.modules.cowork.name', 'CoWork Workspace'),
      availability: t(dict, 'pricing_v2.modules.cowork.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.cowork.description',
        'Operate with shared dashboards, roles, tasks, planning, feedback, and team collaboration workflows.',
      ),
    },
    {
      icon: '🤖',
      name: t(dict, 'pricing_v2.modules.assistant.name', 'Assistant + Concierge'),
      availability: t(dict, 'pricing_v2.modules.assistant.availability', 'All plans, deeper workflows on Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.assistant.description',
        'Use AI assistance for prioritization, content, launch guidance, optimization ideas, and daily operations.',
      ),
    },
    {
      icon: '📅',
      name: t(dict, 'pricing_v2.modules.operations.name', 'Calendar, Spreadsheets + Data Connectors'),
      availability: t(dict, 'pricing_v2.modules.operations.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.operations.description',
        'Coordinate schedules, shared tables, data imports, metrics, and credit control from the operations console.',
      ),
    },
  ]

  const comparisonRows = [
    ['Platform access', 'Limited demo', 'Ongoing use', 'Ongoing use', 'Ongoing use'],
    ['5-language platform', 'Preview', 'Included', 'Included', 'Included'],
    ['Published websites/projects', 'Preview', '1', '5', 'Expanded / custom'],
    ['Website optimization', 'Preview', 'Included', 'Advanced', 'Advanced + priority'],
    ['Podcast optimization', 'Preview', 'Included', 'Advanced', 'Advanced + network path'],
    ['Canvas Video Studio', 'Preview', 'Included', 'Included + templates', 'Advanced workflows'],
    ['Video credits', '2 one-time', '25 / month', '100 / month', '300 / month'],
    ['AI captions + MP4 exports', 'Limited demo', 'Included via credits', 'Included via credits', 'Included via credits'],
    ['Reviews workspace', 'Preview', 'Included', 'Advanced', 'Advanced'],
    ['Outreach + campaigns', 'Preview', 'Basic', 'Included', 'Advanced'],
    ['CoWork/team workspace', 'Preview', 'Basic', '3 users', '10+ users'],
    ['Calendar + spreadsheets', 'Preview', 'Basic', 'Included', 'Team workflows'],
    ['Brand kit / white label', '—', 'Basic', 'Brand kit', 'Brand kit + white label'],
    ['Support', 'Community', 'Email', 'Priority', 'Priority + onboarding'],
  ]

  async function handleCheckout(plan: Plan['key']) {
    if (plan === 'free') {
      window.location.href = '/dashboard'
      return
    }

    try {
      setLoading(plan)

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ plan }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || t(dict, 'pricing_v2.errorGeneric', 'Something went wrong.'))
      }
    } catch {
      alert(t(dict, 'pricing_v2.errorNetwork', `Unable to start checkout. Please contact ${CONTACT_EMAIL}`))
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="sb-page-shell sb-section sb-pricing-cockpit">
      <section style={{ textAlign: 'center', marginBottom: 22 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.kicker', 'Multilingual AI operations platform')}
        </span>

        <h1 style={{ marginTop: 10, fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 950, letterSpacing: '-.045em', lineHeight: 1.08 }}>
          {t(dict, 'pricing_v2.title', 'Build, publish, optimize, and grow in 5 languages.')}
        </h1>

        <p className="sb-body" style={{ maxWidth: 760, margin: '12px auto 0', fontSize: 14 }}>
          {t(
            dict,
            'pricing_v2.subtitle',
            'SignalBoost combines websites, web optimization, podcast optimization, Canvas video, AI captions, reviews, outreach, CoWork, and operations tools into one multilingual platform.',
          )}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 }}>
          {['English', 'Portuguese', 'Spanish', 'Polish', 'Russian'].map((language) => (
            <span
              key={language}
              className="sb-caption"
              style={{
                border: '1px solid rgba(255,195,0,.28)',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 11,
                background: 'rgba(255,195,0,.08)',
                color: 'rgba(255,255,255,.82)',
              }}
            >
              {language}
            </span>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {plans.map((plan) => (
          <article
            key={plan.key}
            className="sb-card sb-pricing-panel"
            style={{
              padding: 24,
              position: 'relative',
            }}
          >
            {plan.badge ? (
              <span className="sb-eyebrow">
                {plan.badge}
              </span>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginTop: plan.badge ? 12 : 0 }}>
              <div>
                <h2 className="sb-h3">{plan.name}</h2>
                <p className="sb-caption" style={{ marginTop: 4 }}>{plan.audience}</p>
              </div>
              <span className="sb-caption">{plan.seats}</span>
            </div>

            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 16 }}>
              {plan.price}
              {plan.period ? <span className="sb-caption">{plan.period}</span> : null}
            </div>

            <p className="sb-body" style={{ fontSize: 14, minHeight: 74 }}>
              {plan.description}
            </p>

            <div
              style={{
                border: '1px solid rgba(26,240,255,.18)',
                borderRadius: 16,
                padding: 12,
                marginTop: 14,
                background: 'rgba(26,240,255,.05)',
              }}
            >
              <strong style={{ display: 'block', color: '#fff', fontSize: 13 }}>
                {plan.credits}
              </strong>
              <span className="sb-caption">
                {plan.key === 'free'
                  ? t(dict, 'pricing_v2.free.creditExplainerShort', 'One-time demo credits for AI captions or MP4 export testing.')
                  : t(dict, 'pricing_v2.creditExplainerShort', 'Credits are used for AI captions and MP4 exports. Preview/editing is free.')}
              </span>
            </div>

            <button
              className={plan.key === 'free' ? 'sb-button-secondary' : 'sb-button-primary'}
              style={{
                width: '100%',
                border: plan.key === 'free' ? undefined : 'none',
                cursor: 'pointer',
                marginTop: 18,
              }}
              onClick={() => handleCheckout(plan.key)}
              disabled={loading === plan.key}
            >
              {loading === plan.key ? t(dict, 'common.loading', 'Loading…') : plan.cta}
            </button>

            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 10 }}>
              {plan.features.map((feature) => (
                <li key={feature} className="sb-caption">✦ {feature}</li>
              ))}
            </ul>

            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 8 }}>
              {plan.limits.map((limit) => (
                <li key={limit} className="sb-caption" style={{ color: 'rgba(255,255,255,.48)' }}>• {limit}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 38 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.demoKicker', 'Free Demo is not a monthly free plan')}
        </span>

        <div className="sb-card sb-pricing-panel" style={{ padding: 24, marginTop: 12 }}>
          <h2 className="sb-h2">
            {t(dict, 'pricing_v2.demoTitle', 'Try the platform. Upgrade to keep operating.')}
          </h2>

          <p className="sb-body" style={{ maxWidth: 860 }}>
            {t(
              dict,
              'pricing_v2.demoDescription',
              'Free Demo is designed for evaluation. It includes limited access and 2 one-time video credits so you can test the workflow. Ongoing business use requires Launch, Growth, or Command.',
            )}
          </p>
        </div>
      </section>

      <section style={{ marginTop: 38 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.platformKicker', 'What is included')}
        </span>

        <h2 className="sb-h2" style={{ marginTop: 10 }}>
          {t(dict, 'pricing_v2.platformTitle', 'One platform. Multiple business systems. Five languages.')}
        </h2>

        <p className="sb-body" style={{ maxWidth: 760 }}>
          {t(
            dict,
            'pricing_v2.platformDescription',
            'SignalBoost is designed to replace disconnected tools with one multilingual operating workspace for publishing, optimization, content, reputation, outreach, and growth.',
          )}
        </p>

        <div className="sb-pricing-module-grid" style={{ marginTop: 18 }}>
          {platformModules.map((module) => (
            <article key={module.name} className="sb-card sb-pricing-panel" style={{ padding: 20 }}>
              <div className="sb-pricing-panel__icon">{module.icon}</div>
              <h3 className="sb-h3">{module.name}</h3>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ffc300', marginTop: 6 }}>
                {module.availability}
              </div>
              <p className="sb-body" style={{ fontSize: 13 }}>{module.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 38 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.videoUsageKicker', 'Video usage')}
        </span>

        <div className="sb-card sb-pricing-panel" style={{ padding: 24, marginTop: 12 }}>
          <h2 className="sb-h2">
            {t(dict, 'pricing_v2.videoUsageTitle', 'Video credits keep AI captions and exports fair.')}
          </h2>

          <p className="sb-body" style={{ maxWidth: 820 }}>
            {t(
              dict,
              'pricing_v2.videoUsageDescription',
              'Previewing, editing, dragging captions, styling templates, and reviewing your video are free. Credits are used for expensive actions: AI caption generation and MP4 export/rendering.',
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 18 }}>
            {[
              ['Free Demo', '2 one-time credits', 'no monthly reset'],
              ['Launch', '25 credits', 'per month'],
              ['Growth', '100 credits', 'per month'],
              ['Command', '300 credits', 'per month'],
            ].map(([name, credits, note]) => (
              <div
                key={name}
                style={{
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 16,
                  padding: 16,
                  background: 'rgba(255,255,255,.04)',
                }}
              >
                <span className="sb-caption">{name}</span>
                <strong style={{ display: 'block', fontSize: 23, color: '#fff', marginTop: 4 }}>{credits}</strong>
                <span className="sb-caption">{note}</span>
              </div>
            ))}
          </div>

          <p className="sb-caption" style={{ marginTop: 16 }}>
            {t(
              dict,
              'pricing_v2.videoUsageNote',
              'Larger videos use storage-first captioning now and will move to background FFmpeg audio extraction for production-scale processing.',
            )}
          </p>
        </div>
      </section>

      <section style={{ marginTop: 38, overflowX: 'auto' }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.compareKicker', 'Plan comparison')}
        </span>

        <h2 className="sb-h2" style={{ marginTop: 10 }}>
          {t(dict, 'pricing_v2.compareTitle', 'Choose based on the operation you want to run.')}
        </h2>

        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            marginTop: 16,
            minWidth: 820,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 18,
          }}
        >
          <thead>
            <tr style={{ background: 'rgba(255,255,255,.06)' }}>
              {['Capability', 'Free Demo', 'Launch', 'Growth', 'Command'].map((heading) => (
                <th
                  key={heading}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    color: '#fff',
                    fontSize: 13,
                    borderBottom: '1px solid rgba(255,255,255,.1)',
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className="sb-caption"
                    style={{
                      padding: 14,
                      borderBottom: '1px solid rgba(255,255,255,.07)',
                      color: index === 0 ? 'rgba(255,255,255,.82)' : undefined,
                      fontWeight: index === 0 ? 800 : undefined,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sb-pricing-wireframe-cta" aria-labelledby="pricing-wireframe-cta-title">
        <div>
          <span className="sb-eyebrow">
            {t(dict, 'pricing_v2.finalCtaKicker', 'Ready before marketing')}
          </span>

          <h2 id="pricing-wireframe-cta-title" className="sb-h2">
            {t(dict, 'pricing_v2.finalCtaTitle', 'Launch with a platform, not a single tool.')}
          </h2>

          <p className="sb-body">
            {t(
              dict,
              'pricing_v2.finalCtaDescription',
              'Start with a limited demo, test the 5-language workspace, then upgrade when you are ready to publish, optimize, caption, export, and grow.',
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="sb-button-secondary" href="/dashboard">
            {t(dict, 'pricing_v2.tryDashboard', 'Try dashboard')}
          </Link>
          <Link className="sb-button-primary" href="/dashboard/video">
            {t(dict, 'pricing_v2.tryVideoStudio', 'Try Video Studio')}
          </Link>
        </div>
      </section>
    </main>
  )
}

const CONTACT_EMAIL = 'support@signalboostapp.com'

type Plan = {
  key: 'free' | 'launch' | 'growth' | 'command'
  name: string
  audience: string
  price: string
  period?: string
  description: string
  cta: string
  badge?: string
  credits: string
  seats: string
  features: string[]
  limits: string[]
}

type PlatformModule = {
  icon: string
  name: string
  availability: string
  description: string
}

export default function PricingPage() {
  const { dict } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)

  const plans: Plan[] = [
    {
      key: 'free',
      name: t(dict, 'pricing_v2.free.name', 'Free Demo'),
      audience: t(dict, 'pricing_v2.free.audience', 'Evaluate SignalBoost before subscribing'),
      price: t(dict, 'pricing_v2.priceFree', 'Free'),
      description: t(
        dict,
        'pricing_v2.free.description',
        'A limited evaluation pass so you can test the multilingual workspace, preview the editor, and understand the platform before choosing a paid plan.',
      ),
      cta: t(dict, 'pricing_v2.free.cta', 'Start demo'),
      credits: t(dict, 'pricing_v2.free.credits', '2 one-time video credits'),
      seats: t(dict, 'pricing_v2.free.seats', '1 user'),
      features: [
        t(dict, 'pricing_v2.free.feature1', '5-language workspace preview'),
        t(dict, 'pricing_v2.free.feature2', 'Website, podcast, video, reviews, outreach, and workspace preview'),
        t(dict, 'pricing_v2.free.feature3', 'Canvas Video Studio preview and manual caption editing'),
        t(dict, 'pricing_v2.free.feature4', 'Basic assistant and dashboard access'),
      ],
      limits: [
        t(dict, 'pricing_v2.free.limit1', 'Evaluation access only — not a monthly free operating plan'),
        t(dict, 'pricing_v2.free.limit2', '2 one-time credits for AI captions or MP4 export testing'),
        t(dict, 'pricing_v2.free.limit3', 'Paid plan required for ongoing business use'),
      ],
    },
    {
      key: 'launch',
      name: t(dict, 'pricing_v2.launch.name', 'Launch'),
      audience: t(dict, 'pricing_v2.launch.audience', 'For solo operators and small businesses'),
      price: '$29',
      period: t(dict, 'pricing_v2.perMonthShort', '/mo'),
      description: t(
        dict,
        'pricing_v2.launch.description',
        'Launch a multilingual business presence with website tools, AI captions, video exports, reviews, podcast/web optimization, and a focused operating workspace.',
      ),
      cta: t(dict, 'pricing_v2.launch.cta', 'Launch with SignalBoost'),
      badge: t(dict, 'pricing_v2.launch.badge', 'Best starting point'),
      credits: t(dict, 'pricing_v2.launch.credits', '25 video credits / month'),
      seats: t(dict, 'pricing_v2.launch.seats', '1 user'),
      features: [
        t(dict, 'pricing_v2.launch.feature1', '5-language platform: English, Portuguese, Spanish, Polish, and Russian'),
        t(dict, 'pricing_v2.launch.feature2', '1 published website plus website optimization tools'),
        t(dict, 'pricing_v2.launch.feature3', 'Canvas Video Studio with AI captions and MP4 exports'),
        t(dict, 'pricing_v2.launch.feature4', 'Podcast launch and optimization workspace'),
        t(dict, 'pricing_v2.launch.feature5', 'Reviews, calendar, basic outreach, and assistant tools'),
      ],
      limits: [
        t(dict, 'pricing_v2.launch.limit1', 'Designed for one brand or business'),
        t(dict, 'pricing_v2.launch.limit2', 'Advanced team workflows start on Growth'),
      ],
    },
    {
      key: 'growth',
      name: t(dict, 'pricing_v2.growth.name', 'Growth'),
      audience: t(dict, 'pricing_v2.growth.audience', 'For growing businesses and small teams'),
      price: '$99',
      period: t(dict, 'pricing_v2.perMonthShort', '/mo'),
      description: t(
        dict,
        'pricing_v2.growth.description',
        'Scale content, campaigns, reviews, websites, podcasts, and video production across a multilingual team workspace.',
      ),
      cta: t(dict, 'pricing_v2.growth.cta', 'Grow faster'),
      badge: t(dict, 'pricing_v2.growth.badge', 'Best for teams'),
      credits: t(dict, 'pricing_v2.growth.credits', '100 video credits / month'),
      seats: t(dict, 'pricing_v2.growth.seats', '3 users'),
      features: [
        t(dict, 'pricing_v2.growth.feature1', 'Everything in Launch'),
        t(dict, 'pricing_v2.growth.feature2', 'Up to 5 websites/projects and deeper website optimization'),
        t(dict, 'pricing_v2.growth.feature3', 'Canvas Video Studio templates, brand styling, and higher video usage'),
        t(dict, 'pricing_v2.growth.feature4', 'CoWork workspace, spreadsheets, calendar, reviews suite, and outreach tools'),
        t(dict, 'pricing_v2.growth.feature5', 'Podcast optimization, content planning, campaigns, and assistant workflows'),
      ],
      limits: [
        t(dict, 'pricing_v2.growth.limit1', 'Best for active content and growth operations'),
        t(dict, 'pricing_v2.growth.limit2', 'White label and advanced agency controls start on Command'),
      ],
    },
    {
      key: 'command',
      name: t(dict, 'pricing_v2.command.name', 'Command'),
      audience: t(dict, 'pricing_v2.command.audience', 'For agencies, teams, and serious operators'),
      price: '$249',
      period: t(dict, 'pricing_v2.perMonthShort', '/mo'),
      description: t(
        dict,
        'pricing_v2.command.description',
        'Run a multilingual growth command center with expanded websites, advanced video, podcast optimization, outreach, teams, and priority workflows.',
      ),
      cta: t(dict, 'pricing_v2.command.cta', 'Get Command'),
      badge: t(dict, 'pricing_v2.command.badge', 'Full platform'),
      credits: t(dict, 'pricing_v2.command.credits', '300 video credits / month'),
      seats: t(dict, 'pricing_v2.command.seats', '10+ users'),
      features: [
        t(dict, 'pricing_v2.command.feature1', 'Everything in Growth'),
        t(dict, 'pricing_v2.command.feature2', 'Unlimited or expanded websites and advanced optimization workflows'),
        t(dict, 'pricing_v2.command.feature3', 'Advanced video workflows, larger usage pool, and priority rendering path'),
        t(dict, 'pricing_v2.command.feature4', 'Team workspace, brand kit, white label, reviews, outreach, and sales pipeline'),
        t(dict, 'pricing_v2.command.feature5', 'Data connectors, API/integrations path, dedicated onboarding, and priority support'),
      ],
      limits: [
        t(dict, 'pricing_v2.command.limit1', 'Built for multi-location businesses, agencies, and operators'),
        t(dict, 'pricing_v2.command.limit2', 'Custom usage and enterprise terms available by request'),
      ],
    },
  ]

  const platformModules: PlatformModule[] = [
    {
      icon: '🌐',
      name: t(dict, 'pricing_v2.modules.website.name', 'Website Builder + Web Optimization'),
      availability: t(dict, 'pricing_v2.modules.website.availability', 'Launch+'),
      description: t(
        dict,
        'pricing_v2.modules.website.description',
        'Create websites, improve existing pages, optimize content, and prepare multilingual pages for search and conversion.',
      ),
    },
    {
      icon: '🎙️',
      name: t(dict, 'pricing_v2.modules.podcast.name', 'Podcast Builder + Podcast Optimization'),
      availability: t(dict, 'pricing_v2.modules.podcast.availability', 'Launch+ / advanced podcast add-on path'),
      description: t(
        dict,
        'pricing_v2.modules.podcast.description',
        'Plan, launch, audit, and optimize podcast presence across the same 5-language operating workspace.',
      ),
    },
    {
      icon: '🎬',
      name: t(dict, 'pricing_v2.modules.video.name', 'Canvas Video Studio'),
      availability: t(dict, 'pricing_v2.modules.video.availability', 'All plans, credits apply'),
      description: t(
        dict,
        'pricing_v2.modules.video.description',
        'Upload video, generate AI captions, style overlays, preview edits, and export MP4s using video credits.',
      ),
    },
    {
      icon: '🎧',
      name: t(dict, 'pricing_v2.modules.audio.name', 'Audio Studio'),
      availability: t(dict, 'pricing_v2.modules.audio.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.audio.description',
        'Create and manage voice/audio content as part of your multilingual publishing workflow.',
      ),
    },
    {
      icon: '⭐',
      name: t(dict, 'pricing_v2.modules.reviews.name', 'Reviews + Reputation'),
      availability: t(dict, 'pricing_v2.modules.reviews.availability', 'Launch+'),
      description: t(
        dict,
        'pricing_v2.modules.reviews.description',
        'Collect, manage, and showcase reviews while supporting reputation workflows across languages.',
      ),
    },
    {
      icon: '📡',
      name: t(dict, 'pricing_v2.modules.outreach.name', 'Outreach + Campaigns'),
      availability: t(dict, 'pricing_v2.modules.outreach.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.outreach.description',
        'Coordinate discovery, contacts, pipeline, promotion, campaigns, and sales follow-up from one workspace.',
      ),
    },
    {
      icon: '🤝',
      name: t(dict, 'pricing_v2.modules.cowork.name', 'CoWork Workspace'),
      availability: t(dict, 'pricing_v2.modules.cowork.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.cowork.description',
        'Operate with shared dashboards, roles, tasks, planning, feedback, and team collaboration workflows.',
      ),
    },
    {
      icon: '🤖',
      name: t(dict, 'pricing_v2.modules.assistant.name', 'Assistant + Concierge'),
      availability: t(dict, 'pricing_v2.modules.assistant.availability', 'All plans, deeper workflows on Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.assistant.description',
        'Use AI assistance for prioritization, content, launch guidance, optimization ideas, and daily operations.',
      ),
    },
    {
      icon: '📅',
      name: t(dict, 'pricing_v2.modules.operations.name', 'Calendar, Spreadsheets + Data Connectors'),
      availability: t(dict, 'pricing_v2.modules.operations.availability', 'Growth+'),
      description: t(
        dict,
        'pricing_v2.modules.operations.description',
        'Coordinate schedules, shared tables, data imports, metrics, and credit control from the operations console.',
      ),
    },
  ]

  const comparisonRows = [
    ['Platform access', 'Limited demo', 'Ongoing use', 'Ongoing use', 'Ongoing use'],
    ['5-language platform', 'Preview', 'Included', 'Included', 'Included'],
    ['Published websites/projects', 'Preview', '1', '5', 'Expanded / custom'],
    ['Website optimization', 'Preview', 'Included', 'Advanced', 'Advanced + priority'],
    ['Podcast optimization', 'Preview', 'Included', 'Advanced', 'Advanced + network path'],
    ['Canvas Video Studio', 'Preview', 'Included', 'Included + templates', 'Advanced workflows'],
    ['Video credits', '2 one-time', '25 / month', '100 / month', '300 / month'],
    ['AI captions + MP4 exports', 'Limited demo', 'Included via credits', 'Included via credits', 'Included via credits'],
    ['Reviews workspace', 'Preview', 'Included', 'Advanced', 'Advanced'],
    ['Outreach + campaigns', 'Preview', 'Basic', 'Included', 'Advanced'],
    ['CoWork/team workspace', 'Preview', 'Basic', '3 users', '10+ users'],
    ['Calendar + spreadsheets', 'Preview', 'Basic', 'Included', 'Team workflows'],
    ['Brand kit / white label', '—', 'Basic', 'Brand kit', 'Brand kit + white label'],
    ['Support', 'Community', 'Email', 'Priority', 'Priority + onboarding'],
  ]

  async function handleCheckout(plan: Plan['key']) {
    if (plan === 'free') {
      window.location.href = '/dashboard'
      return
    }

    try {
      setLoading(plan)

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ plan }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || t(dict, 'pricing_v2.errorGeneric', 'Something went wrong.'))
      }
    } catch {
      alert(t(dict, 'pricing_v2.errorNetwork', `Unable to start checkout. Please contact ${CONTACT_EMAIL}`))
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="sb-page-shell sb-section sb-pricing-cockpit">
      <section style={{ textAlign: 'center', marginBottom: 32 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.kicker', 'Multilingual AI operations platform')}
        </span>

        <h1 className="sb-h1" style={{ marginTop: 12 }}>
          {t(dict, 'pricing_v2.title', 'Build, publish, optimize, and grow in 5 languages.')}
        </h1>

        <p className="sb-body" style={{ maxWidth: 840, margin: '18px auto 0' }}>
          {t(
            dict,
            'pricing_v2.subtitle',
            'SignalBoost combines websites, web optimization, podcast optimization, Canvas video, AI captions, reviews, outreach, CoWork, and operations tools into one multilingual platform.',
          )}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 22 }}>
          {['English', 'Portuguese', 'Spanish', 'Polish', 'Russian'].map((language) => (
            <span
              key={language}
              className="sb-caption"
              style={{
                border: '1px solid rgba(255,195,0,.28)',
                borderRadius: 999,
                padding: '7px 12px',
                background: 'rgba(255,195,0,.08)',
                color: 'rgba(255,255,255,.82)',
              }}
            >
              {language}
            </span>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {plans.map((plan) => (
          <article
            key={plan.key}
            className="sb-card sb-pricing-panel"
            style={{
              padding: 24,
              position: 'relative',
            }}
          >
            {plan.badge ? (
              <span className="sb-eyebrow">
                {plan.badge}
              </span>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginTop: plan.badge ? 12 : 0 }}>
              <div>
                <h2 className="sb-h3">{plan.name}</h2>
                <p className="sb-caption" style={{ marginTop: 4 }}>{plan.audience}</p>
              </div>
              <span className="sb-caption">{plan.seats}</span>
            </div>

            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 16 }}>
              {plan.price}
              {plan.period ? <span className="sb-caption">{plan.period}</span> : null}
            </div>

            <p className="sb-body" style={{ fontSize: 14, minHeight: 74 }}>
              {plan.description}
            </p>

            <div
              style={{
                border: '1px solid rgba(26,240,255,.18)',
                borderRadius: 16,
                padding: 12,
                marginTop: 14,
                background: 'rgba(26,240,255,.05)',
              }}
            >
              <strong style={{ display: 'block', color: '#fff', fontSize: 13 }}>
                {plan.credits}
              </strong>
              <span className="sb-caption">
                {plan.key === 'free'
                  ? t(dict, 'pricing_v2.free.creditExplainerShort', 'One-time demo credits for AI captions or MP4 export testing.')
                  : t(dict, 'pricing_v2.creditExplainerShort', 'Credits are used for AI captions and MP4 exports. Preview/editing is free.')}
              </span>
            </div>

            <button
              className={plan.key === 'free' ? 'sb-button-secondary' : 'sb-button-primary'}
              style={{
                width: '100%',
                border: plan.key === 'free' ? undefined : 'none',
                cursor: 'pointer',
                marginTop: 18,
              }}
              onClick={() => handleCheckout(plan.key)}
              disabled={loading === plan.key}
            >
              {loading === plan.key ? t(dict, 'common.loading', 'Loading…') : plan.cta}
            </button>

            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 10 }}>
              {plan.features.map((feature) => (
                <li key={feature} className="sb-caption">✦ {feature}</li>
              ))}
            </ul>

            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 8 }}>
              {plan.limits.map((limit) => (
                <li key={limit} className="sb-caption" style={{ color: 'rgba(255,255,255,.48)' }}>• {limit}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 38 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.demoKicker', 'Free Demo is not a monthly free plan')}
        </span>

        <div className="sb-card sb-pricing-panel" style={{ padding: 24, marginTop: 12 }}>
          <h2 className="sb-h2">
            {t(dict, 'pricing_v2.demoTitle', 'Try the platform. Upgrade to keep operating.')}
          </h2>

          <p className="sb-body" style={{ maxWidth: 860 }}>
            {t(
              dict,
              'pricing_v2.demoDescription',
              'Free Demo is designed for evaluation. It includes limited access and 2 one-time video credits so you can test the workflow. Ongoing business use requires Launch, Growth, or Command.',
            )}
          </p>
        </div>
      </section>

      <section style={{ marginTop: 38 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.platformKicker', 'What is included')}
        </span>

        <h2 className="sb-h2" style={{ marginTop: 10 }}>
          {t(dict, 'pricing_v2.platformTitle', 'One platform. Multiple business systems. Five languages.')}
        </h2>

        <p className="sb-body" style={{ maxWidth: 760 }}>
          {t(
            dict,
            'pricing_v2.platformDescription',
            'SignalBoost is designed to replace disconnected tools with one multilingual operating workspace for publishing, optimization, content, reputation, outreach, and growth.',
          )}
        </p>

        <div className="sb-pricing-module-grid" style={{ marginTop: 18 }}>
          {platformModules.map((module) => (
            <article key={module.name} className="sb-card sb-pricing-panel" style={{ padding: 20 }}>
              <div className="sb-pricing-panel__icon">{module.icon}</div>
              <h3 className="sb-h3">{module.name}</h3>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ffc300', marginTop: 6 }}>
                {module.availability}
              </div>
              <p className="sb-body" style={{ fontSize: 13 }}>{module.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 38 }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.videoUsageKicker', 'Video usage')}
        </span>

        <div className="sb-card sb-pricing-panel" style={{ padding: 24, marginTop: 12 }}>
          <h2 className="sb-h2">
            {t(dict, 'pricing_v2.videoUsageTitle', 'Video credits keep AI captions and exports fair.')}
          </h2>

          <p className="sb-body" style={{ maxWidth: 820 }}>
            {t(
              dict,
              'pricing_v2.videoUsageDescription',
              'Previewing, editing, dragging captions, styling templates, and reviewing your video are free. Credits are used for expensive actions: AI caption generation and MP4 export/rendering.',
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 18 }}>
            {[
              ['Free Demo', '2 one-time credits', 'no monthly reset'],
              ['Launch', '25 credits', 'per month'],
              ['Growth', '100 credits', 'per month'],
              ['Command', '300 credits', 'per month'],
            ].map(([name, credits, note]) => (
              <div
                key={name}
                style={{
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 16,
                  padding: 16,
                  background: 'rgba(255,255,255,.04)',
                }}
              >
                <span className="sb-caption">{name}</span>
                <strong style={{ display: 'block', fontSize: 23, color: '#fff', marginTop: 4 }}>{credits}</strong>
                <span className="sb-caption">{note}</span>
              </div>
            ))}
          </div>

          <p className="sb-caption" style={{ marginTop: 16 }}>
            {t(
              dict,
              'pricing_v2.videoUsageNote',
              'Larger videos use storage-first captioning now and will move to background FFmpeg audio extraction for production-scale processing.',
            )}
          </p>
        </div>
      </section>

      <section style={{ marginTop: 38, overflowX: 'auto' }}>
        <span className="sb-eyebrow">
          {t(dict, 'pricing_v2.compareKicker', 'Plan comparison')}
        </span>

        <h2 className="sb-h2" style={{ marginTop: 10 }}>
          {t(dict, 'pricing_v2.compareTitle', 'Choose based on the operation you want to run.')}
        </h2>

        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            marginTop: 16,
            minWidth: 820,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 18,
          }}
        >
          <thead>
            <tr style={{ background: 'rgba(255,255,255,.06)' }}>
              {['Capability', 'Free Demo', 'Launch', 'Growth', 'Command'].map((heading) => (
                <th
                  key={heading}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    color: '#fff',
                    fontSize: 13,
                    borderBottom: '1px solid rgba(255,255,255,.1)',
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className="sb-caption"
                    style={{
                      padding: 14,
                      borderBottom: '1px solid rgba(255,255,255,.07)',
                      color: index === 0 ? 'rgba(255,255,255,.82)' : undefined,
                      fontWeight: index === 0 ? 800 : undefined,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="sb-pricing-wireframe-cta" aria-labelledby="pricing-wireframe-cta-title">
        <div>
          <span className="sb-eyebrow">
            {t(dict, 'pricing_v2.finalCtaKicker', 'Ready before marketing')}
          </span>

          <h2 id="pricing-wireframe-cta-title" className="sb-h2">
            {t(dict, 'pricing_v2.finalCtaTitle', 'Launch with a platform, not a single tool.')}
          </h2>

          <p className="sb-body">
            {t(
              dict,
              'pricing_v2.finalCtaDescription',
              'Start with a limited demo, test the 5-language workspace, then upgrade when you are ready to publish, optimize, caption, export, and grow.',
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="sb-button-secondary" href="/dashboard">
            {t(dict, 'pricing_v2.tryDashboard', 'Try dashboard')}
          </Link>
          <Link className="sb-button-primary" href="/dashboard/video">
            {t(dict, 'pricing_v2.tryVideoStudio', 'Try Video Studio')}
          </Link>
        </div>
      </section>
    </main>
  )
}
