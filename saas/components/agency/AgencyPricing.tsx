import type { AgencyCopy } from '@/lib/i18n/agencyCopy'

type AgencyPricingProps = {
  copy: AgencyCopy['pricing']
}

export default function AgencyPricing({ copy }: AgencyPricingProps) {
  return (
    <section id="agency-pricing" className="sb-page-shell sb-section" aria-label={copy.eyebrow}>
      <div style={{ marginBottom: 22 }}>
        <span className="sb-eyebrow">{copy.eyebrow}</span>
        <h2 className="sb-h2" style={{ marginTop: 10 }}>{copy.title}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {copy.plans.map((plan) => (
          <article key={plan.name} className="sb-card" style={{ padding: 24 }}>
            <h3 className="sb-h3">{plan.name}</h3>
            <p className="sb-body" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{plan.price}</p>
            <p className="sb-caption" style={{ marginBottom: 18 }}>{plan.fee}</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,.78)', display: 'grid', gap: 10 }}>
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
