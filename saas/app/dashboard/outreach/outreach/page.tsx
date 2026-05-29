'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const stages = [
  ['Analyzer', 'Paste a business URL and I’ll identify offers, proof gaps, and the best reason to contact them.'],
  ['Profiler', 'I’ll summarize business model, likely buyer intent, revenue signals, and cultural context.'],
  ['Predictive Intelligence', 'I’ll predict what they need next: reviews, a faster website, local SEO, or a campaign.'],
  ['Generated Assets', 'I’ll draft the email, landing-page sketch, review ask, and social follow-up in one bundle.'],
  ['Approval Queue', 'You approve, adjust tone, or hold the send. Nothing leaves without a clear human decision.'],
]

export default function OutreachSendPage() {
  const { dict } = useI18n()

  return (
    <main className="sb-stack">
      <section className="sb-glass sb-grid-2" style={{ padding: 28, alignItems: 'center' }}>
        <div className="sb-stack">
          <p className="sb-eyebrow">Outreach engine</p>
          <h1 className="sb-h2">From signal to approved campaign, in one guided line.</h1>
          <p className="sb-body">
            {t(dict, 'outreach.send.subtitle', 'Analyze a prospect, profile their business, predict their next need, generate assets, then approve the exact outreach before it is sent.')}
          </p>
          <div className="sb-row">
            <Link className="sb-button sb-button-primary" href="/dashboard/outreach/pipeline">Review approval queue</Link>
            <Link className="sb-button sb-button-secondary" href="/dashboard/outreach/discovery">Find prospects</Link>
          </div>
        </div>
        <aside className="sb-ai-prompt">
          “Want a strong first batch? Start with businesses that have recent activity but weak testimonials.”
        </aside>
      </section>

      <section className="sb-glass-soft sb-stack" style={{ padding: 24 }} aria-label="Outreach workflow">
        {stages.map(([title, body], index) => (
          <article key={title} className="sb-glass-soft" style={{ padding: 18, display: 'grid', gridTemplateColumns: '48px 1fr', gap: 16, alignItems: 'start' }}>
            <div className="sb-chip" style={{ justifyContent: 'center', width: 48, height: 48, padding: 0, color: index === 0 ? 'var(--accent-yellow)' : 'var(--accent-cyan)' }}>
              {index + 1}
            </div>
            <div className="sb-stack" style={{ gap: 8 }}>
              <h2 className="sb-h3">{title}</h2>
              <p className="sb-body" style={{ fontSize: 14 }}>{body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="sb-grid-2">
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">Tone selector</p>
          <div className="sb-tone-selector"><span>Friendly</span><span>Professional</span><span>Playful</span></div>
        </div>
        <div className="sb-glass-soft sb-stack" style={{ padding: 24 }}>
          <p className="sb-eyebrow">AI feedback</p>
          <p className="sb-body" style={{ fontSize: 14 }}>This campaign looks strong for urgency, but you could add a testimonial before approving the queue.</p>
        </div>
      </section>
    </main>
  )
}
