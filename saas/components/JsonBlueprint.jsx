'use client'

function StatusRow({ label, value, good = false, mono = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">{label}</p>
      <div className="mt-2 flex items-start gap-2">
        {good && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.7)]" />}
        <p className={`break-all font-black text-white ${mono ? 'font-mono text-sm' : 'text-base'}`}>{value || 'Not configured'}</p>
      </div>
    </div>
  )
}

export default function JsonBlueprint({ blueprint }) {
  const requestInputs = Object.entries(blueprint.request_template || {})
  const mappings = Object.entries(blueprint.response_mapping?.output_paths || {})
  const credentialCount = Object.keys(blueprint.auth?.credential_refs || {}).length
  const ready = Boolean(blueprint.provider_key && blueprint.http_method && blueprint.endpoint_template)

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-amber-200">Digital Integration Summary</p>
          <h2 className="mt-1 text-2xl font-black text-white">{blueprint.name || 'Enterprise integration'}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">All required integration details remain active internally. This view presents them in a clear business format without exposing JSON.</p>
        </div>
        <span className={`rounded-full border px-4 py-2 text-sm font-black ${ready ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>
          {ready ? '● Ready' : '● Configuration incomplete'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusRow label="Provider" value={blueprint.provider_name} good={Boolean(blueprint.provider_key)} />
        <StatusRow label="HTTP Method" value={blueprint.http_method} good={Boolean(blueprint.http_method)} />
        <StatusRow label="Authentication" value={`${blueprint.auth?.type || 'none'} · ${credentialCount} credential reference${credentialCount === 1 ? '' : 's'}`} good={credentialCount > 0 || blueprint.auth?.type === 'none'} />
        <StatusRow label="Request Inputs" value={`${requestInputs.length} mapped field${requestInputs.length === 1 ? '' : 's'}`} good={requestInputs.length > 0} />
      </div>

      <div className="mt-4">
        <StatusRow label="Endpoint Template" value={blueprint.endpoint_template} good={Boolean(blueprint.endpoint_template)} mono />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <h3 className="font-black text-white">Request fields</h3>
          <div className="mt-4 grid gap-2">
            {requestInputs.length ? requestInputs.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
                <span className="font-bold text-slate-200">{key}</span>
                <span className="max-w-[60%] truncate font-mono text-xs text-cyan-200">{String(value)}</span>
              </div>
            )) : <p className="text-sm text-slate-400">No request inputs selected.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <h3 className="font-black text-white">Response mapping</h3>
          <div className="mt-4 grid gap-2">
            {mappings.length ? mappings.map(([target, source]) => (
              <div key={target} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                <p className="font-mono text-xs text-cyan-200">{String(source)}</p>
                <p className="my-1 text-center text-slate-500">↓</p>
                <p className="font-mono text-xs text-amber-200">{target}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No response mapping configured.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
          <h3 className="font-black text-white">Governance</h3>
          <div className="mt-4 grid gap-3 text-sm font-bold">
            <p className="flex items-center gap-2 text-emerald-100"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-300/15">✓</span> Backend-only secrets</p>
            <p className="flex items-center gap-2 text-emerald-100"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-300/15">✓</span> {blueprint.governance?.requires_approval ? 'Approval required' : 'Read-only action'}</p>
            <p className="flex items-center gap-2 text-emerald-100"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-300/15">✓</span> {blueprint.governance?.supervisor_monitoring ? 'Supervisor monitoring active' : 'Supervisor monitoring off'}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {(blueprint.tags || []).map(tag => <span key={tag} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">{tag}</span>)}
            {!blueprint.tags?.length && <span className="text-sm text-slate-400">No tags selected.</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
