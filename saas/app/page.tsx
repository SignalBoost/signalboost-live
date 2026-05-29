'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

export default function Home() {
  const { dict } = useI18n()
  const features = [
    ['🧭', t(dict, 'home.features.map.title', 'AI-guided growth map'), t(dict, 'home.features.map.body', 'SignalBoost suggests the next best move before you type: website, reviews, audio, video, or outreach.')],
    ['⚡', t(dict, 'home.features.flow.title', 'Campaigns in one flow'), t(dict, 'home.features.flow.body', 'Analyze your audience, choose a tone, generate assets, approve, and launch without hunting through tools.')],
    ['🌍', t(dict, 'home.features.reach.title', 'Built for multilingual reach'), t(dict, 'home.features.reach.body', 'Create pages, audio, and promotional content that feel native across markets.')],
  ]

  const testimonials = [
    [t(dict, 'home.testimonials.one.quote', '“SignalBoost turned a scattered launch into a clear daily workflow.”'), t(dict, 'home.testimonials.one.name', 'Maya, studio owner')],
    [t(dict, 'home.testimonials.two.quote', '“The AI feedback helped us add proof and urgency before we sent anything.”'), t(dict, 'home.testimonials.two.name', 'Andre, local services')],
    [t(dict, 'home.testimonials.three.quote', '“It feels less like software and more like a growth partner.”'), t(dict, 'home.testimonials.three.name', 'Elena, podcaster')],
  ]
  const tones = [t(dict, 'tone.friendly', 'Friendly'), t(dict, 'tone.professional', 'Professional'), t(dict, 'tone.playful', 'Playful')]
  return (
    <main className="sb-page">
      <section className="sb-grid-2" aria-labelledby="home-hero-title">
        <div className="sb-glass sb-stack" style={{ padding: 32, justifyContent: 'center' }}>
          <p className="sb-eyebrow">{t(dict, 'home.hero.eyebrow', 'AI growth studio')}</p>
          <h1 id="home-hero-title" className="sb-h1">{t(dict, 'home.hero.title', 'Launch clearer. Grow louder.')}</h1>
          <p className="sb-body" style={{ maxWidth: 680 }}>
            {t(dict, 'home.hero.body', 'SignalBoost organizes your website, reviews, outreach, audio, and video into one calm workspace with an AI guide that suggests what to do next.')}
          </p>
          <div className="sb-row" style={{ marginTop: 8 }}>
            <Link className="sb-button sb-button-primary" href="/dashboard">{t(dict, 'home.hero.primaryCta', 'Start with AI guidance')}</Link>
            <Link className="sb-button sb-button-secondary" href="/pricing">{t(dict, 'home.hero.secondaryCta', 'See plans')}</Link>
          </div>
        </div>

        <aside className="sb-glass sb-stack" style={{ padding: 24 }} aria-label="AI suggestions preview">
          <p className="sb-eyebrow">{t(dict, 'home.ai.eyebrow', 'Your AI starts here')}</p>
          <div className="sb-ai-prompt">
            {t(dict, 'home.ai.suggestion', '“Want a faster launch? I can draft a homepage, collect proof, then build a 3-touch outreach campaign.”')}
          </div>
          <div className="sb-tone-selector" aria-label="Tone presets">
            {tones.map(tone => <span key={tone}>{tone}</span>)}
          </div>
          <div className="sb-glass-soft" style={{ padding: 16 }}>
            <p className="sb-caption">{t(dict, 'home.ai.feedbackLabel', 'AI feedback')}</p>
            <p className="sb-body" style={{ fontSize: 14 }}>{t(dict, 'home.ai.feedback', 'This campaign looks strong for urgency, but you could add a testimonial before the final CTA.')}</p>
          </div>
        </aside>
      </section>

      <section className="sb-section" aria-labelledby="features-title">
        <p className="sb-eyebrow">{t(dict, 'home.features.eyebrow', 'Features')}</p>
        <h2 id="features-title" className="sb-h2">{t(dict, 'home.features.title', 'Everything grouped by the job you are trying to finish.')}</h2>
        <div className="sb-grid-3" style={{ marginTop: 24 }}>
          {features.map(([icon, title, body]) => (
            <article className="sb-glass-soft sb-stack" style={{ padding: 24 }} key={title}>
              <span style={{ fontSize: 28 }}>{icon}</span>
              <h3 className="sb-h3">{title}</h3>
              <p className="sb-body" style={{ fontSize: 14 }}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-section" aria-labelledby="testimonials-title">
        <p className="sb-eyebrow">{t(dict, 'home.testimonials.eyebrow', 'Testimonials')}</p>
        <h2 id="testimonials-title" className="sb-h2">{t(dict, 'home.testimonials.title', 'A calmer way to move from idea to launch.')}</h2>
        <div className="sb-grid-3" style={{ marginTop: 24 }}>
          {testimonials.map(([quote, name]) => (
            <figure className="sb-glass-soft sb-stack" style={{ padding: 24, margin: 0 }} key={name}>
              <blockquote className="sb-body">{quote}</blockquote>
              <figcaption className="sb-caption">— {name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="sb-section sb-glass sb-grid-2" style={{ padding: 32, alignItems: 'center' }} aria-labelledby="cta-title">
        <div className="sb-stack">
          <p className="sb-eyebrow">{t(dict, 'home.cta.eyebrow', 'Call to action')}</p>
          <h2 id="cta-title" className="sb-h2">{t(dict, 'home.cta.title', 'Open your workspace and let AI propose the first move.')}</h2>
        </div>
        <div className="sb-row" style={{ justifyContent: 'flex-end' }}>
          <Link className="sb-button sb-button-primary" href="/dashboard">{t(dict, 'home.cta.dashboard', 'Go to dashboard')}</Link>
          <Link className="sb-button sb-button-ghost" href="/docs">{t(dict, 'home.cta.docs', 'Read the guide')}</Link>
        </div>
      </section>
    </main>
  )
}
