import { LocalizedText } from '@/components/i18n/LocalizedText'

// saas/app/products/agent-gateway/page.tsx
import Link from 'next/link'

const PROTOCOLS = ['MCP', 'A2A', 'REST / OpenAPI', 'MQTT', 'ROS 2', 'MAVLink', 'OPC UA'] as const

const CAPABILITIES = [
  {
    title: 'Unified governance',
    body: 'Normalize agent and tool requests into one policy-controlled flow with approval, authorization, execution, receipts, and audit evidence.',
  },
  {
    title: 'Cluster runtime',
    body: 'Coordinate delivery, acknowledgements, reconciliation, health, recovery, diagnostics, alerts, trends, forecasts, and recommendations.',
  },
  {
    title: 'Provider Hub',
    body: 'Discover provider capabilities, validate compatibility, negotiate versions, aggregate health, and produce read-only readiness diagnostics.',
  },
  {
    title: 'Governance evidence',
    body: 'Generate deterministic manifests, ledgers, chains, snapshots, archives, catalogs, registries, bundles, indexes, directories, and queryable evidence.',
  },
] as const

const SAFETY = [
  'Direct API is the only potentially mutating path.',
  'Browser Agent assistance remains dry-run only.',
  'Governed AI infrastructure PRs remain proposal-only.',
  'Infrastructure mutation, automatic repair, and production browser execution remain disabled.',
] as const

export default function AgentGatewayProductPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 transition hover:text-white">← SignalBoost</Link>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.14),transparent_35%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(2,6,23,.98))] p-7 shadow-2xl shadow-cyan-950/30 md:p-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-violet-300/40 bg-violet-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-violet-200">Preview</span>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100"><LocalizedText fallback={"Real implementation"} /></span>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_.8fr] lg:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-200"><LocalizedText fallback={"Governed AI connectivity for enterprise"} /></p>
              <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl"><LocalizedText fallback={"Agent Gateway"} /></h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl"><LocalizedText fallback={"Connect AI agents, enterprise applications, APIs, automation platforms, robots, and industrial systems through one governed gateway with consistent policy, approvals, runtime coordination, provider integration, diagnostics, and immutable evidence."} /></p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/dashboard" className="rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-white"><LocalizedText fallback={"Open SignalBoost"} /></Link>
                <Link href="/pricing" className="rounded-xl border border-white/15 px-5 py-3 text-center font-black transition hover:border-cyan-300/60 hover:text-cyan-100"><LocalizedText fallback={"View pricing"} /></Link>
              </div>
            </div>

            <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Foundation</h2>
              <p className="mt-4 text-base font-bold leading-7 text-slate-100">Mission 002 Agent Gateway and protocol adapter registry</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {PROTOCOLS.map((protocol) => <span key={protocol} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-100">{protocol}</span>)}
              </div>
            </aside>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {CAPABILITIES.map((capability) => (
            <article key={capability.title} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <h2 className="text-xl font-black text-white">{capability.title}</h2>
              <p className="mt-3 leading-7 text-slate-300">{capability.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-6 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200"><LocalizedText fallback={"Governance boundary"} /></p>
          <h2 className="mt-3 text-3xl font-black"><LocalizedText fallback={"Minimum Human Work. Maximum Human Control."} /></h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {SAFETY.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm font-semibold leading-6 text-slate-200">✓ {item}</div>)}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-200"><LocalizedText fallback={"What is implemented"} /></p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {['Protocol adapters', 'Governance and approvals', 'Cluster runtime', 'Runtime receipts', 'Reconciliation', 'Delivery diagnostics', 'Runtime health', 'Forecasts and recommendations', 'Provider capability discovery', 'Provider diagnostics', 'Readiness validation', 'Immutable evidence hierarchy'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-100">{item}</div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
