const testimonials = [
  { name: 'Sarah K.', role: 'Shopify Store Owner', text: 'SignalBoost turned our reviews into a clear ad workflow overnight.' },
  { name: 'Marcus T.', role: 'Local Business Owner', text: 'The AI suggestions made outreach feel like a guided conversation, not another blank form.' },
  { name: 'Priya N.', role: 'Marketing Manager', text: 'The dashboard finally shows our next action, preview, and approval path in one place.' },
]

export default function Testimonials() {
  return (
    <section className="sb-page-shell sb-section" aria-label="Testimonials">
      <span className="sb-eyebrow">Testimonials</span>
      <h2 className="sb-h2" style={{ marginTop: 10, marginBottom: 24 }}>Customers feel less clutter and more control.</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {testimonials.map(t => (
          <article key={t.name} className="sb-card" style={{ padding: 24 }}>
            <div style={{ color: 'var(--gold)', letterSpacing: 2, marginBottom: 12 }}>★★★★★</div>
            <p className="sb-body" style={{ fontSize: 15 }}>“{t.text}”</p>
            <div style={{ color: '#fff', fontWeight: 800 }}>{t.name}</div>
            <div className="sb-caption">{t.role}</div>
          </article>
        ))}
      </div>
    </section>
  )
}
