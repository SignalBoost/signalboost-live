// saas/components/TrustSignals.tsx
export default function TrustSignals() {
  const partners = ['Shopify', 'Meta', 'Yelp', 'Rakuten', 'Mercado Libre']

  return (
    <section className="py-12 bg-gray-50 text-center">
      <h2 className="text-xl font-semibold mb-6">Trusted by businesses worldwide</h2>
      <div className="flex justify-center gap-8 flex-wrap">
        {partners.map((partner, idx) => (
          <div key={idx} className="w-24 h-12 bg-gray-200 flex items-center justify-center rounded">
            {partner}
          </div>
        ))}
      </div>
    </section>
  )
}
