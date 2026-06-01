import { PARTNERS, getRegionAwareAffiliate } from './partners'

export default function PartnerMarquee() {
  const featured = PARTNERS.slice(0, 24)
  return (
    <section className="sb-page-shell sb-section" aria-label="Partner logos">
      <div className="sb-partner-marquee">
        <div className="sb-partner-marquee__track">
          {[...featured, ...featured].map((partner, index) => (
            <a key={`${partner.id}-${index}`} href={getRegionAwareAffiliate(partner)} target="_blank" rel="noopener noreferrer sponsored" className="sb-partner-logo-card">
              <img src={partner.logoUrl} alt={`${partner.name} logo`} loading="lazy" />
              <span>{partner.name}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
