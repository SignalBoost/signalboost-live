import { PARTNERS, getRegionAwareAffiliate } from './partners'

export default function PartnerDescription() {
  const groups = Array.from(new Map(PARTNERS.map(partner => [partner.category, partner])).values()).slice(0, 5)
  return (
    <section className="sb-page-shell sb-section" aria-label="Partner marketplace categories">
      <div className="sb-cta-row" style={{ justifyContent: 'space-between', alignItems: 'end', marginBottom: 22 }}>
        <div>
          <span className="sb-eyebrow">Marketplace</span>
          <h2 className="sb-h2" style={{ marginTop: 10 }}>Verified partner paths with region-aware links.</h2>
        </div>
        <a className="sb-button-secondary" href="/pricing">Pricing stays one click away</a>
      </div>
      <div className="sb-partner-grid">
        {groups.map(partner => (
          <a key={partner.id} className="sb-card sb-partner-description" href={getRegionAwareAffiliate(partner)} target="_blank" rel="noopener noreferrer sponsored">
            <img src={partner.logoUrl} alt={`${partner.name} logo`} loading="lazy" />
            <div>
              <strong>{partner.category}</strong>
              <p className="sb-body">Start with {partner.name} or compare nearby partners without deleting broken listings from audit logs.</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
