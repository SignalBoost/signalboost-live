import Link from 'next/link'

const features = [
  ['🧭', 'AI-guided growth map', 'SignalBoost suggests the next best move before you type: website, reviews, audio, video, or outreach.'],
  ['⚡', 'Campaigns in one flow', 'Analyze your audience, choose a tone, generate assets, approve, and launch without hunting through tools.'],
  ['🌍', 'Built for multilingual reach', 'Create pages, audio, and promotional content that feel native across markets.'],
]

const testimonials = [
  ['“SignalBoost turned a scattered launch into a clear daily workflow.”', 'Maya, studio owner'],
  ['“The AI feedback helped us add proof and urgency before we sent anything.”', 'Andre, local services'],
  ['“It feels less like software and more like a growth partner.”', 'Elena, podcaster'],
]

export default function Home() {
  return (
    <main className="sb-page">
      <section className="sb-grid-2" aria-labelledby="home-hero-title">
        <div className="sb-glass sb-stack" style={{ padding: 32, justifyContent: 'center' }}>
          <p className="sb-eyebrow">AI growth studio</p>
          <h1 id="home-hero-title" className="sb-h1">Launch clearer. Grow louder.</h1>
          <p className="sb-body" style={{ maxWidth: 680 }}>
            SignalBoost organizes your website, reviews, outreach, audio, and video into one calm workspace with an AI guide that suggests what to do next.
          </p>
          <div className="sb-row" style={{ marginTop: 8 }}>
            <Link className="sb-button sb-button-primary" href="/dashboard">Start with AI guidance</Link>
            <Link className="sb-button sb-button-secondary" href="/pricing">See plans</Link>
          </div>
        </div>

        <aside className="sb-glass sb-stack" style={{ padding: 24 }} aria-label="AI suggestions preview">
          <p className="sb-eyebrow">Your AI starts here</p>
          <div className="sb-ai-prompt">
            “Want a faster launch? I can draft a homepage, collect proof, then build a 3-touch outreach campaign.”
          </div>
          <div className="sb-tone-selector" aria-label="Tone presets">
            <span>Friendly</span><span>Professional</span><span>Playful</span>
          </div>
          <div className="sb-glass-soft" style={{ padding: 16 }}>
            <p className="sb-caption">AI feedback</p>
            <p className="sb-body" style={{ fontSize: 14 }}>This campaign looks strong for urgency, but you could add a testimonial before the final CTA.</p>
          </div>
        </aside>
      </section>

      <section className="sb-section" aria-labelledby="features-title">
        <p className="sb-eyebrow">Features</p>
        <h2 id="features-title" className="sb-h2">Everything grouped by the job you are trying to finish.</h2>
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
        <p className="sb-eyebrow">Testimonials</p>
        <h2 id="testimonials-title" className="sb-h2">A calmer way to move from idea to launch.</h2>
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
          <p className="sb-eyebrow">Call to action</p>
          <h2 id="cta-title" className="sb-h2">Open your workspace and let AI propose the first move.</h2>
        </div>
        <div className="sb-row" style={{ justifyContent: 'flex-end' }}>
          <Link className="sb-button sb-button-primary" href="/dashboard">Go to dashboard</Link>
          <Link className="sb-button sb-button-ghost" href="/docs">Read the guide</Link>
        </div>
      </section>
    </main>
  )
}
