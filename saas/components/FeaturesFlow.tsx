const steps = [
  { number: '01', title: 'Analyzer', description: 'Paste a business, review, or website. SignalBoost reads intent, urgency, and trust gaps.' },
  { number: '02', title: 'Tone + assets', description: 'Choose Friendly, Professional, or Playful and let AI prepare copy, social, and outreach assets.' },
  { number: '03', title: 'Approve with clarity', description: 'Review one best recommendation, see AI feedback, and publish without decision clutter.' },
]

export default function FeaturesFlow() {
  return (
    <section id="how-it-works" className="sb-section" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: '1px solid var(--border-soft)' }}>
      <div className="sb-page-shell">
        <span className="sb-eyebrow">Guided flow</span>
        <h2 className="sb-h2" style={{ marginTop: 10, marginBottom: 24 }}>From messy idea to approved campaign.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {steps.map(step => (
            <article key={step.number} className="sb-card" style={{ padding: 24 }}>
              <div style={{ color: 'var(--gold)', fontWeight: 950, fontSize: 44, lineHeight: 1 }}>{step.number}</div>
              <h3 className="sb-h3" style={{ marginTop: 16 }}>{step.title}</h3>
              <p className="sb-body" style={{ fontSize: 14, marginBottom: 0 }}>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
