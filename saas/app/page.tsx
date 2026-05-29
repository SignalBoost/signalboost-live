import Link from 'next/link'
import SignalHero from '@/components/SignalHero'
import FeaturesFlow from '@/components/FeaturesFlow'
import Testimonials from '@/components/Testimonials'
import OrchestrationGuide from '@/components/orchestration/OrchestrationGuide'

const featureCards = [
  ['🧠', 'AI proposes the next move', 'Guided suggestions appear before a user types, reducing blank-page friction.'],
  ['🌐', 'One brand, every channel', 'Websites, reviews, audio, video, and outreach share the same visual rhythm.'],
  ['⚡', 'Built for action', 'Each page highlights one primary CTA so teams know exactly what to do next.'],
]

export default function Home() {
  return (
    <main>
      <SignalHero />

      <section className="sb-page-shell sb-section" aria-label="Features">
        <div className="sb-cta-row" style={{ justifyContent: 'space-between', alignItems: 'end', marginBottom: 24 }}>
          <div>
            <span className="sb-eyebrow">Features</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>Everything arranged around momentum.</h2>
          </div>
          <Link className="sb-button-secondary" href="/docs">Show me the workflow</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {featureCards.map(([icon, title, text]) => (
            <article key={title} className="sb-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{icon}</div>
              <h3 className="sb-h3">{title}</h3>
              <p className="sb-body" style={{ fontSize: 14, marginBottom: 0 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sb-page-shell sb-section" aria-label="AI orchestration">
        <OrchestrationGuide />
      </section>

      <FeaturesFlow />
      <Testimonials />

      <section className="sb-page-shell sb-section" aria-label="Call to action">
        <div className="sb-glass" style={{ padding: 32, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'center' }}>
          <div>
            <span className="sb-eyebrow">Ready when you are</span>
            <h2 className="sb-h2" style={{ marginTop: 10 }}>Let SignalBoost organize your growth room.</h2>
            <p className="sb-body" style={{ maxWidth: 680 }}>Start with one campaign. The AI will suggest an audience, tone, proof point, and approval step before you publish.</p>
          </div>
          <div className="sb-cta-row">
            <Link className="sb-button-primary" href="/dashboard">Start building</Link>
            <Link className="sb-button-secondary" href="/pricing">Compare plans</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
