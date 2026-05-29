import Link from 'next/link'

const sections = [
  ['1', 'Choose an intent', 'Start with Promote, Builder, Reviews, Audio, Video, or Outreach so every workflow has one clear goal.'],
  ['2', 'Let AI suggest first', 'Read the suggested prompt, tone, and feedback before typing your own instructions.'],
  ['3', 'Review generated assets', 'Scan grouped cards: summary, audience, copy, proof, and risks. Avoid bouncing between unrelated panels.'],
  ['4', 'Approve and publish', 'Use the approval queue for final human judgment before outreach or public content goes live.'],
]

const quickLinks = [
  ['Dashboard', '/dashboard'],
  ['Outreach Engine', '/dashboard/outreach/outreach'],
  ['Pricing', '/pricing'],
  ['Support', '/support'],
]

export default function DocsPage() {
  return (
    <main className="sb-page-shell sb-section">
      <section className="sb-glass" style={{ padding: 32, marginBottom: 24 }}>
        <span className="sb-eyebrow">Documentation</span>
        <h1 className="sb-h1" style={{ marginTop: 12 }}>A clear map for building with SignalBoost.</h1>
        <p className="sb-body" style={{ maxWidth: 760 }}>Docs are organized by how a human thinks through work: choose an intent, follow AI guidance, review the output, and approve the final action.</p>
        <div className="sb-cta-row" style={{ marginTop: 20 }}>
          {quickLinks.map(([label, href]) => <Link key={href} className="sb-button-secondary" href={href}>{label}</Link>)}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 24 }}>
        <aside className="sb-card" style={{ padding: 20 }}>
          <span className="sb-eyebrow">Scan path</span>
          <nav style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {sections.map(([, title]) => <a key={title} href={`#${title.toLowerCase().replaceAll(' ', '-')}`} className="sb-caption" style={{ color: '#fff', textDecoration: 'none' }}>{title}</a>)}
          </nav>
        </aside>

        <div style={{ display: 'grid', gap: 16 }}>
          {sections.map(([step, title, copy]) => (
            <article key={title} id={title.toLowerCase().replaceAll(' ', '-')} className="sb-card" style={{ padding: 24 }}>
              <span className="sb-eyebrow">Step {step}</span>
              <h2 className="sb-h3" style={{ marginTop: 10 }}>{title}</h2>
              <p className="sb-body" style={{ marginBottom: 0 }}>{copy}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
