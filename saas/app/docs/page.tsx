'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type DocItem = {
  title: string
  body: string
  action: string
  href: string
}

type DocSection = {
  id: string
  eyebrow: string
  title: string
  summary: string
  items: DocItem[]
}

export default function DocsPage() {
  const { dict } = useI18n()
  const [query, setQuery] = useState('')

  const sections: DocSection[] = useMemo(() => [
    {
      id: 'start-here',
      eyebrow: t(dict, 'docs.start.eyebrow', 'Start here'),
      title: t(dict, 'docs.start.title', 'Get oriented before you build'),
      summary: t(dict, 'docs.start.summary', 'Use the dashboard as your command center: choose a goal, accept AI suggestions, then preview before publishing.'),
      items: [
        {
          title: t(dict, 'docs.start.account.title', 'Create or sign in to your account'),
          body: t(dict, 'docs.start.account.body', 'Your workspace stores projects, credits, language preferences, and generated assets.'),
          action: t(dict, 'docs.start.account.action', 'Open dashboard'),
          href: '/dashboard',
        },
        {
          title: t(dict, 'docs.start.tone.title', 'Pick the tone before generating'),
          body: t(dict, 'docs.start.tone.body', 'Friendly, Professional, and Playful presets keep campaigns consistent while still feeling human.'),
          action: t(dict, 'docs.start.tone.action', 'Try promote'),
          href: '/dashboard/promote',
        },
      ],
    },
    {
      id: 'build',
      eyebrow: t(dict, 'docs.build.eyebrow', 'Build'),
      title: t(dict, 'docs.build.title', 'Create the public experience'),
      summary: t(dict, 'docs.build.summary', 'Generate the site, review the live preview, and keep related assets grouped around the same customer journey.'),
      items: [
        {
          title: t(dict, 'docs.build.website.title', 'Generate or refine a website'),
          body: t(dict, 'docs.build.website.body', 'Describe the business, audience, offer, and proof. SignalBoost turns that into a structured preview.'),
          action: t(dict, 'docs.build.website.action', 'Open operator'),
          href: '/dashboard/operator',
        },
        {
          title: t(dict, 'docs.build.brand.title', 'Reuse one visual system'),
          body: t(dict, 'docs.build.brand.body', 'Use dark glass cards, neon yellow and cyan accents, and clear CTAs across pages.'),
          action: t(dict, 'docs.build.brand.action', 'View examples'),
          href: '/dashboard',
        },
      ],
    },
    {
      id: 'grow',
      eyebrow: t(dict, 'docs.grow.eyebrow', 'Grow'),
      title: t(dict, 'docs.grow.title', 'Turn proof into campaigns'),
      summary: t(dict, 'docs.grow.summary', 'Collect reviews, generate content, and run outreach through a human approval queue.'),
      items: [
        {
          title: t(dict, 'docs.grow.reviews.title', 'Collect reviews and testimonials'),
          body: t(dict, 'docs.grow.reviews.body', 'Gather proof first, then reuse it in landing pages, email outreach, and social content.'),
          action: t(dict, 'docs.grow.reviews.action', 'Collect reviews'),
          href: '/dashboard/reviews',
        },
        {
          title: t(dict, 'docs.grow.outreach.title', 'Approve outreach before sending'),
          body: t(dict, 'docs.grow.outreach.body', 'Analyzer, profiler, predictive intelligence, generated assets, and approval queue stay in one workflow.'),
          action: t(dict, 'docs.grow.outreach.action', 'Open outreach'),
          href: '/dashboard/outreach/outreach',
        },
      ],
    },
    {
      id: 'operate',
      eyebrow: t(dict, 'docs.operate.eyebrow', 'Operate'),
      title: t(dict, 'docs.operate.title', 'Manage credits, roles, and safety'),
      summary: t(dict, 'docs.operate.summary', 'Keep owners, admins, security logs, and panic controls visible without cluttering the customer workflow.'),
      items: [
        {
          title: t(dict, 'docs.operate.pricing.title', 'Choose the right plan'),
          body: t(dict, 'docs.operate.pricing.body', 'Upgrade when you need more published assets, languages, automation volume, team seats, or support.'),
          action: t(dict, 'docs.operate.pricing.action', 'Compare pricing'),
          href: '/pricing',
        },
        {
          title: t(dict, 'docs.operate.admin.title', 'Use ADM controls safely'),
          body: t(dict, 'docs.operate.admin.body', 'Owners can review dashboards, security logs, outreach controls, predictive insights, and partner intent.'),
          action: t(dict, 'docs.operate.admin.action', 'Open ADM'),
          href: '/admin/adm',
        },
      ],
    },
  ], [dict])

  const normalized = query.trim().toLowerCase()
  const filtered = normalized
    ? sections.map(section => ({
        ...section,
        items: section.items.filter(item =>
          [section.eyebrow, section.title, section.summary, item.title, item.body]
            .join(' ')
            .toLowerCase()
            .includes(normalized)
        ),
      })).filter(section => section.items.length > 0)
    : sections

  return (
    <main className="sb-page">
      <section className="sb-glass sb-grid-2" style={{ padding: 32, alignItems: 'center' }}>
        <div className="sb-stack">
          <p className="sb-eyebrow">{t(dict, 'docs.hero.eyebrow', 'Docs')}</p>
          <h1 className="sb-h1">{t(dict, 'docs.hero.title', 'Find the next step fast.')}</h1>
          <p className="sb-body">{t(dict, 'docs.hero.body', 'Docs are grouped by human intent: start, build, grow, and operate. Scan the structure, then jump directly into the workspace.')}</p>
        </div>
        <div className="sb-stack">
          <label className="sb-caption" htmlFor="docs-search">{t(dict, 'docs.search.label', 'What do you want to do?')}</label>
          <input id="docs-search" className="sb-input" style={{ borderRadius: 999, padding: '14px 18px' }} placeholder={t(dict, 'docs.search.placeholder', 'Ask: how do I launch my first campaign?')} value={query} onChange={e => setQuery(e.target.value)} />
          <p className="sb-ai-prompt">{t(dict, 'docs.aiSuggestion', '“Start with a clear homepage, add proof, then approve one outreach campaign.”')}</p>
        </div>
      </section>

      <nav className="sb-grid-4 sb-section-tight" aria-label={t(dict, 'docs.quickNav', 'Docs quick navigation')}>
        {sections.map(section => <a key={section.id} href={`#${section.id}`} className="sb-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>{section.eyebrow}</a>)}
      </nav>

      <section className="sb-grid-2 sb-section">
        {filtered.length === 0 ? (
          <article className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
            <h2 className="sb-h3">{t(dict, 'docs.noResults.title', 'No exact match yet')}</h2>
            <p className="sb-body">{t(dict, 'docs.noResults.body', 'Try “website,” “reviews,” “outreach,” “pricing,” or “admin.”')}</p>
          </article>
        ) : filtered.map(section => (
          <article id={section.id} key={section.id} className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
            <p className="sb-eyebrow">{section.eyebrow}</p>
            <h2 className="sb-h2">{section.title}</h2>
            <p className="sb-body">{section.summary}</p>
            {section.items.map(item => (
              <div className="sb-glass-soft sb-stack" style={{ padding: 16 }} key={item.title}>
                <h3 className="sb-h3">{item.title}</h3>
                <p className="sb-body" style={{ fontSize: 14 }}>{item.body}</p>
                <Link className="sb-button sb-button-ghost" href={item.href}>{item.action}</Link>
              </div>
            ))}
          </article>
        ))}
      </section>

      <section className="sb-section sb-glass sb-grid-2" style={{ padding: 28, alignItems: 'center' }}>
        <div className="sb-stack">
          <p className="sb-eyebrow">{t(dict, 'docs.next.eyebrow', 'Next best action')}</p>
          <h2 className="sb-h2">{t(dict, 'docs.next.title', 'Open the dashboard and let AI propose the first move.')}</h2>
        </div>
        <div className="sb-row" style={{ justifyContent: 'flex-end' }}>
          <Link className="sb-button sb-button-primary" href="/dashboard">{t(dict, 'docs.next.dashboard', 'Open dashboard')}</Link>
          <Link className="sb-button sb-button-secondary" href="/pricing">{t(dict, 'docs.next.pricing', 'Compare plans')}</Link>
        </div>
      </section>
    </main>
  )
}
