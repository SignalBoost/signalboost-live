import Link from 'next/link'

export default function ExecutivePage() {
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <Link href="/" className="text-[#FFD700] no-underline">← SignalBoost</Link>
      <section className="mt-12 max-w-4xl rounded-[2rem] border border-white/10 bg-white/[.04] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Executive</p>
        <h1 className="mt-4 text-5xl font-black">SignalBoost executive command.</h1>
        <p className="mt-5 text-xl leading-8 text-neutral-400">
          Review growth plans, Concierge direction, pricing, and owner-level operations without adding the Stationary SaaS Station module list to the marketing navbar.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black no-underline">Open admin console</Link>
          <Link href="/pricing" className="rounded-full border border-white/15 px-5 py-3 font-bold text-white no-underline">Review pricing</Link>
        </div>
      </section>
    </main>
  )
}
