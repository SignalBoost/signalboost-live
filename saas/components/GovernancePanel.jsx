'use client'

function LockedControl({ label, help }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] p-4">
      <span>
        <span className="block font-bold text-white">{label}</span>
        <span className="text-xs text-slate-400" title={help}>{help}</span>
      </span>
      <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-cyan-100">Required</span>
    </div>
  )
}

function Toggle({ label, checked, onChange, help }) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[.04] p-4 text-left"><span><span className="block font-bold text-white">{label}</span><span className="text-xs text-slate-400" title={help}>{help}</span></span><span className={`h-7 w-12 rounded-full p-1 transition ${checked ? 'bg-cyan-300' : 'bg-slate-700'}`}><span className={`block h-5 w-5 rounded-full bg-slate-950 transition ${checked ? 'translate-x-5' : ''}`} /></span></button>
}

export default function GovernancePanel({ value, onChange, onTest, onLogs }) {
  return (
    <section className="grid gap-4">
      <LockedControl label="Requires Approval" help="Sensitive and mutating actions always remain behind an HMI approval gate." />
      <LockedControl label="Secrets Backend Only" help="Secrets are represented only by backend references and can never be exposed in this blueprint." />
      <Toggle label="Enable Supervisor Monitoring" checked={value.supervisorMonitoring} onChange={next => onChange({ ...value, supervisorMonitoring: next })} help="Routes test and runtime telemetry to the supervisor log stream." />
      <button type="button" onClick={onTest} className="rounded-2xl bg-amber-300 px-4 py-3 font-black text-slate-950 shadow-lg shadow-amber-900/20">Test Integration</button>
      <button type="button" onClick={onLogs} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 font-black text-cyan-100">View Logs</button>
    </section>
  )
}
