import Link from 'next/link'
import { governanceEvents } from '@/lib/admin/governance'

export default function TimelinePage() {
  return <main className="min-h-screen bg-[#05070b] p-8 text-white"><Link href="/admin/governance" className="text-[#FFD700]">← Governance</Link><h1 className="mt-8 text-4xl font-black">Recovery timeline</h1><section className="mt-8 border-l border-[#FFD700]/40 pl-6">{governanceEvents.map((event) => <article id={event.subsystem} key={event.event_id} className="mb-6 rounded-3xl border border-white/10 bg-white/[.04] p-5"><p className="text-sm text-white/50">{event.timestamp}</p><h2 className="mt-1 text-xl font-bold text-[#FFD700]">{event.subsystem}: {event.state_before} → {event.state_after}</h2><p className="mt-2 text-white/70">Isolation: {event.isolation_action}</p><p className="mt-2 text-white/70">Recovery: {event.recovery_action}</p><p className="mt-2 text-sm text-white/50">Next: {event.next_recommended_action}</p></article>)}</section></main>
}
