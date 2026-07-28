import { LocalizedText } from '@/components/i18n/LocalizedText'

// saas/app/products/agent-gateway/page.tsx
import Link from 'next/link'
import { uiText } from '@/lib/i18n/uiText'

const PROTOCOLS = ['MCP', 'A2A', 'REST / OpenAPI', 'MQTT', 'ROS 2', 'MAVLink', 'OPC UA'] as const

const CAPABILITIES = [
  {
    title: uiText('generatedUi.u_d1bd072a9f09236f'),
    body: uiText('generatedUi.u_855155c7a2fc27bd'),
  },
  {
    title: uiText('generatedUi.u_6dc4e263e23a6826'),
    body: uiText('generatedUi.u_7b2bc6dfe6c65098'),
  },
  {
    title: uiText('generatedUi.u_a082185bfb56e8e0'),
    body: uiText('generatedUi.u_5bbb3e921e96a8bb'),
  },
  {
    title: uiText('generatedUi.u_7f9e87709d560d10'),
    body: uiText('generatedUi.u_ef1e45b34453c568'),
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
        <Link href="/" className="text-sm font-semibold text-cyan-200 transition hover:text-white">{uiText('generatedUi.u_cccc10a9d6005317')}</Link>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.14),transparent_35%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(2,6,23,.98))] p-7 shadow-2xl shadow-cyan-950/30 md:p-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-violet-300/40 bg-violet-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-violet-200">{uiText('generatedUi.u_324b134f57c70c72')}</span>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100"><LocalizedText fallback={uiText('generatedUi.u_0e5f7a4e2f6c2842')} /></span>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_.8fr] lg:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-200"><LocalizedText fallback={uiText('generatedUi.u_195a4a5731285d69')} /></p>
              <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl"><LocalizedText fallback={uiText('generatedUi.u_a69d967bbb755708')} /></h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl"><LocalizedText fallback={uiText('generatedUi.u_39703f3b3ad32b71')} /></p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/dashboard" className="rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-white"><LocalizedText fallback={uiText('generatedUi.u_dd3897f45a827b16')} /></Link>
                <Link href="/pricing" className="rounded-xl border border-white/15 px-5 py-3 text-center font-black transition hover:border-cyan-300/60 hover:text-cyan-100"><LocalizedText fallback={uiText('generatedUi.u_434dc3a581a65a52')} /></Link>
              </div>
            </div>

            <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{uiText('generatedUi.u_df42a4d5d3537666')}</h2>
              <p className="mt-4 text-base font-bold leading-7 text-slate-100">{uiText('generatedUi.u_e20c3a03cf45a1ee')}</p>
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
          <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200"><LocalizedText fallback={uiText('generatedUi.u_c3e75dbd79e9eef5')} /></p>
          <h2 className="mt-3 text-3xl font-black"><LocalizedText fallback={uiText('generatedUi.u_c9a415ac2da7bd54')} /></h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {SAFETY.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm font-semibold leading-6 text-slate-200">✓ {item}</div>)}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-200"><LocalizedText fallback={uiText('generatedUi.u_ad4d6d2f2bfe5985')} /></p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["Protocol adapters", "Governance and approvals", "Cluster runtime", "Runtime receipts", "Reconciliation", "Delivery diagnostics", "Runtime health", "Forecasts and recommendations", "Provider capability discovery", "Provider diagnostics", "Readiness validation", "Immutable evidence hierarchy"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-100">{item}</div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
