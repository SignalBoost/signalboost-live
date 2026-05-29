'use client'

import Link from 'next/link'
import { useState } from 'react'

const stages = [
  {
    title: 'Analyzer',
    prompt: 'Who should SignalBoost understand first?',
    detail: 'Paste a public website, Google profile, or social page. AI summarizes the business and the human trigger to use.',
    accent: 'var(--gold)',
  },
  {
    title: 'Profiler',
    prompt: 'What does this business actually sell, fear, and need?',
    detail: 'Model fit, likely buyer persona, trust gaps, and best offer angle are grouped together.',
    accent: '#1af0ff',
  },
  {
    title: 'Predictive Intelligence',
    prompt: 'What should we propose before they ask?',
    detail: 'AI predicts urgency, next likely problem, and strongest conversion moment.',
    accent: '#7dd3fc',
  },
  {
    title: 'Generated Assets',
    prompt: 'Which proof point should we put in front of them?',
    detail: 'Friendly, Professional, and Playful variants prepare email, SMS, social, and landing copy.',
    accent: '#fde68a',
  },
  {
    title: 'Approval Queue',
    prompt: 'Ready to approve the best one?',
    detail: 'Review AI feedback, adjust tone, and send only after a human confirms.',
    accent: '#86efac',
  },
]

export default function OutreachSendPage() {
  const [tone, setTone] = useState('Friendly')

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <span className="sb-eyebrow">Outreach Engine</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>Turn a lead into an approved campaign.</h1>
          <p className="sb-body" style={{ maxWidth: 680 }}>SignalBoost organizes outreach as a human review journey: analyze, profile, predict, generate, approve.</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/pipeline">Open pipeline</Link>
      </div>

      <section className="sb-card" style={{ padding: 20, marginBottom: 24 }}>
        <label className="sb-eyebrow" htmlFor="lead-url">AI suggestion</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, marginTop: 12 }}>
          <input id="lead-url" className="sb-input" placeholder="Try: https://example.com — I’ll find a useful urgency angle." style={{ borderRadius: 16, padding: 14 }} />
          <button className="sb-button-primary" type="button">Analyze lead</button>
        </div>
        <p className="sb-caption" style={{ marginTop: 10 }}>Suggested before typing: “Find local service businesses with outdated review proof and draft a professional first touch.”</p>
      </section>

      <section style={{ display: 'grid', gap: 16 }} aria-label="Outreach workflow">
        {stages.map((stage, index) => (
          <article key={stage.title} className="sb-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', gap: 16 }}>
            <div style={{ color: stage.accent, fontSize: 13, fontWeight: 950, letterSpacing: '.12em' }}>STEP {index + 1}</div>
            <div>
              <h2 className="sb-h3">{stage.title}</h2>
              <p style={{ color: '#fff', fontWeight: 800, margin: '10px 0 4px' }}>{stage.prompt}</p>
              <p className="sb-body" style={{ fontSize: 14, margin: 0 }}>{stage.detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="sb-card" style={{ padding: 20, marginTop: 24 }}>
        <h2 className="sb-h3">Choose the voice before generation.</h2>
        <div className="sb-cta-row" style={{ marginTop: 14 }}>
          {['Friendly', 'Professional', 'Playful'].map(option => (
            <button key={option} onClick={() => setTone(option)} className={tone === option ? 'sb-button-primary' : 'sb-button-secondary'} type="button">
              {option}
            </button>
          ))}
        </div>
        <div className="sb-ai-feedback">
          <strong>AI feedback</strong>
          <p>{tone} tone selected. This campaign looks strong for urgency, but you could add a testimonial before approval.</p>
        </div>
      </section>
    </main>
  )
}
