import Link from 'next/link'
import { governanceEvents } from '@/lib/admin/governance'

export default function LogsPage() {
  return <main className="min-h-screen bg-[#05070b] p-8 text-white"><Link href="/admin/governance" className="text-[#FFD700]">← Governance</Link><h1 className="mt-8 text-4xl font-black">Governance audit logs</h1><p className="mt-3 text-white/70">Every self-healing action is logged as telemetry JSON with approval and risk context.</p><section className="mt-6 space-y-4">{governanceEvents.map((event) => <article id={event.subsystem} key={event.event_id} className="rounded-3xl border border-white/10 bg-black/40 p-6"><h2 className="text-xl font-bold text-[#FFD700]">{event.event_id}</h2><pre className="mt-4 overflow-auto rounded-2xl bg-white/[.04] p-4 text-xs text-white/80">{JSON.stringify(event, null, 2)}</pre></article>)}</section></main>
}
