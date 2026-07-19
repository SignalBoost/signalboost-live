import Link from 'next/link'
import { failurePatterns, governanceEvents, governanceSubsystems, governanceSummary, monitoredSignals, rebuildPlans, safeModeStatus } from '@/lib/admin/governance'

export default function GovernancePage() {
  return (
    <main className="min-h-screen bg-[#05070b] p-8 text-white">
      <Link href="/admin" className="text-[#FFD700] no-underline">← Admin Console</Link>
      <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[.04] p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Owner/Admin Governance</p>
        <h1 className="mt-3 text-4xl font-black">{governanceSummary.title}</h1>
        <p className="mt-4 max-w-4xl text-white/70">{governanceSummary.description}</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ['Active incidents', governanceSummary.activeIncidents, '/admin/system'],
          ['Pending approvals', governanceSummary.pendingApprovals, '/admin/governance#approvals'],
          ['Safe mode', safeModeStatus.active ? 'Active' : 'Inactive', '/admin/timeline'],
          ['Failed recoveries', governanceSummary.failedRecoveries, '/admin/logs'],
        ].map(([label, value, href]) => (
          <Link key={label} href={String(href)} className="rounded-3xl border border-white/10 bg-black/40 p-5 no-underline hover:border-[#FFD700]/60">
            <p className="text-sm text-white/50">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[#FFD700]">{value}</p>
            <p className="mt-3 text-xs text-white/50">Open investigation →</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6">
        <h2 className="text-2xl font-bold">{safeModeStatus.active ? 'Safe Mode Active' : 'Safe Mode Ready'}</h2>
        <p className="mt-2 text-white/70">Recommended admin action: {safeModeStatus.recommendedAdminAction}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><h3 className="font-semibold text-[#FFD700]">Keep alive</h3><ul className="mt-2 list-disc pl-5 text-white/70">{safeModeStatus.keptAlive.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><h3 className="font-semibold text-[#FFD700]">Paused or throttled</h3><ul className="mt-2 list-disc pl-5 text-white/70">{safeModeStatus.pausedWorkloads.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2" id="ai">
        {governanceSubsystems.map((system) => (
          <Link key={system.id} href={system.investigationHref} className="rounded-3xl border border-white/10 bg-white/[.04] p-5 no-underline hover:border-[#FFD700]/60">
            <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-bold">{system.name}</h3><span className="rounded-full bg-[#FFD700]/10 px-3 py-1 text-sm text-[#FFD700]">{system.state}</span></div>
            <p className="mt-2 text-white/60">Root cause: {system.rootCause} · routing: {system.routingMode}</p>
            <p className="mt-3 text-white/70">{system.automaticRecovery}</p>
            <p className="mt-2 text-sm text-white/50">Approval gate: {system.approvalGate}</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">Telemetry signals monitored</h2>
        <ul className="mt-3 list-disc pl-5 text-white/70">{monitoredSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">Known failure pattern library</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{failurePatterns.map((pattern) => <article key={pattern.pattern_id} className="rounded-2xl border border-white/10 p-4"><h3 className="font-bold text-[#FFD700]">{pattern.pattern_id}</h3><p className="mt-2 text-sm text-white/60">{pattern.detection_rule}</p><p className="mt-2 text-sm">Auto allowed: {pattern.automatic_action_allowed ? 'yes' : 'no'} · Approval required: {pattern.owner_approval_required ? 'yes' : 'no'}</p></article>)}</div>
      </section>

      <section id="approvals" className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">Controlled self-rebuild plans</h2>
        {rebuildPlans.map((plan) => <article key={plan.id} className="mt-4 rounded-2xl border border-white/10 p-4"><h3 className="font-bold text-[#FFD700]">{plan.broken_component}</h3><p className="mt-2 text-white/70">{plan.proposed_fix}</p><p className="mt-2 text-sm text-white/50">Risk: {plan.risk_level}. {plan.estimated_impact}</p><button className="mt-4 rounded-full border border-[#FFD700]/60 px-4 py-2 text-[#FFD700]" type="button">Approval required before production action</button></article>)}
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="text-2xl font-bold">Recent audit events</h2>
        <div className="mt-4 space-y-3">{governanceEvents.map((event) => <Link key={event.event_id} href={`/admin/logs#${event.subsystem}`} className="block rounded-2xl border border-white/10 p-4 no-underline hover:border-[#FFD700]/60"><p className="font-semibold text-[#FFD700]">{event.event_id}</p><p className="mt-1 text-white/70">{event.isolation_action}</p><p className="mt-1 text-sm text-white/50">{event.automatic_or_manual} · approval required: {event.approval_required ? 'yes' : 'no'} · result: {event.result}</p></Link>)}</div>
      </section>
    </main>
  )
}
