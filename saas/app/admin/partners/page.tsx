const partnerIntents = [
  ['Flights', 'Help travelers get there first.', 'Compare flight offers, regional carriers, and urgency-based travel promos.'],
  ['Hotels', 'Give them a safe place to land.', 'Surface lodging partners by budget, location, cancellation flexibility, and trust.'],
  ['SIM Cards', 'Keep customers connected on arrival.', 'Prioritize eSIM/SIM partners with country fit, setup clarity, and support quality.'],
  ['Insurance', 'Reduce travel anxiety.', 'Group medical, trip, and gear protection around confidence and compliance.'],
  ['Activities', 'Turn arrival into an experience.', 'Recommend tours, events, dining, and local experiences by intent and region.'],
]

export default function PartnersPage() {
  return (
    <main className="space-y-6">
      <section className="sb-glass p-6">
        <span className="sb-eyebrow">Partners</span>
        <h1 className="sb-h2 mt-3">Organized by what the traveler needs next.</h1>
        <p className="sb-body max-w-3xl">Instead of one flat partner list, this console groups supply by human intent: getting there, staying there, connecting, feeling protected, and doing something memorable.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {partnerIntents.map(([title, prompt, detail]) => (
          <article key={title} className="sb-card p-5">
            <span className="sb-eyebrow">{title}</span>
            <h2 className="sb-h3 mt-3">{prompt}</h2>
            <p className="sb-body text-sm">{detail}</p>
            <button className="sb-button-secondary mt-3 w-full" type="button">Review partners</button>
          </article>
        ))}
      </section>

      <section className="sb-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="sb-h3">Partner performance by intent</h2>
            <p className="sb-caption">Filters: date range • country • user intent • partner category</p>
          </div>
          <button className="sb-button-primary" type="button">Add partner</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-slate-300">
              <tr><th className="px-5 py-3">Intent</th><th className="px-5 py-3">Partner</th><th className="px-5 py-3">Clicks</th><th className="px-5 py-3">Status</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/10"><td className="px-5 py-6 text-slate-400" colSpan={4}>Not tracked yet. Connect partner click analytics to populate this organized view.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
