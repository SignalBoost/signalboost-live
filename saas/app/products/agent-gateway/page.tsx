import { LocalizedText } from '@/components/i18n/LocalizedText'

// saas/app/products/agent-gateway/page.tsx
import Link from 'next/link'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const PROTOCOLS = ['MCP', 'A2A', 'REST / OpenAPI', 'MQTT', 'ROS 2', 'MAVLink', 'OPC UA'] as const

const CAPABILITIES = [
  {
    title: uiCopy('u_2e8e62cf613eaea0'),
    body: uiCopy('u_86441d23250047eb'),
  },
  {
    title: uiCopy('u_c874fcbc22aa6bc7'),
    body: uiCopy('u_fc8df664ce878468'),
  },
  {
    title: uiCopy('u_18921ccc070bf1ae'),
    body: uiCopy('u_0578605b90799502'),
  },
  {
    title: uiCopy('u_a3f177afec925527'),
    body: uiCopy('u_d65d2dad87436853'),
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
        <Link href="/" className="text-sm font-semibold text-cyan-200 transition hover:text-white">{uiCopy('u_21258869eaa44dcd')}</Link>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.14),transparent_35%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(2,6,23,.98))] p-7 shadow-2xl shadow-cyan-950/30 md:p-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-violet-300/40 bg-violet-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-violet-200">{uiCopy('u_ef85b3ef00b9e934')}</span>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100"><LocalizedText fallback={uiCopy('u_f44e2f837e3d6021')} /></span>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_.8fr] lg:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-200"><LocalizedText fallback={uiCopy('u_9223fc4883752af1')} /></p>
              <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl"><LocalizedText fallback={uiCopy('u_afa7d070ca29a720')} /></h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl"><LocalizedText fallback={uiCopy('u_51c404017deb5bda')} /></p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/dashboard" className="rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 transition hover:bg-white"><LocalizedText fallback={uiCopy('u_1ee9c398f05e3d19')} /></Link>
                <Link href="/pricing" className="rounded-xl border border-white/15 px-5 py-3 text-center font-black transition hover:border-cyan-300/60 hover:text-cyan-100"><LocalizedText fallback={uiCopy('u_6d3bd40356c52171')} /></Link>
              </div>
            </div>

            <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{uiCopy('u_04e6fe37a69d6da2')}</h2>
              <p className="mt-4 text-base font-bold leading-7 text-slate-100">{uiCopy('u_3c93b7dc627b859a')}</p>
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
          <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200"><LocalizedText fallback={uiCopy('u_31d5c8a0bec40d67')} /></p>
          <h2 className="mt-3 text-3xl font-black"><LocalizedText fallback={uiCopy('u_6fdf19e849c73120')} /></h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {SAFETY.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm font-semibold leading-6 text-slate-200">✓ {item}</div>)}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-200"><LocalizedText fallback={uiCopy('u_d0ce427bdf014c27')} /></p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[uiCopy('u_7979a6d7dc4753bc'), uiCopy('u_69ce709b026f8eb2'), uiCopy('u_6f2fae3651227603'), uiCopy('u_0263bd935edb59ac'), uiCopy('u_762d18d76bbe120a'), uiCopy('u_7e0bf9b9d6169d78'), uiCopy('u_dc2b0c575f55f519'), uiCopy('u_f2ceaccd1c78eb51'), uiCopy('u_3ffc7e1267e55905'), uiCopy('u_2093170647261aa6'), uiCopy('u_9cda31d8594b1af2'), uiCopy('u_fccc569e2d72e3ed')].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-100">{item}</div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
