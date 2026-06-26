'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

type CheckItem = {
  id: string
  packageName: string
  version: string
  sourceFile?: string
  severity?: string
  summary?: string
  detailsUrl?: string | null
  fixedVersionAvailable?: boolean
}

const STEPS = ['Scanning target', 'Running analyzers', 'Preparing summary']
const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-red-400/40 bg-red-400/10 text-red-100',
  high: 'border-orange-300/40 bg-orange-300/10 text-orange-100',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  low: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100',
  unknown: 'border-white/15 bg-white/5 text-white/70',
}

export default function RepoCheckPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState('')
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (!loading) return
    const timers = [
      window.setTimeout(() => setStage(1), 500),
      window.setTimeout(() => setStage(2), 1100),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [loading])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim()) {
      setError('Paste a public GitHub repository URL first.')
      return
    }
    setLoading(true)
    setStage(0)
    setError('')
    setData(null)
    try {
      const res = await fetch('/api/public/surface-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), maxPackages: 75 }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Could not check this repository.')
        return
      }
      setStage(2)
      setData(json)
    } catch {
      setError('Could not check this repository.')
    } finally {
      setLoading(false)
    }
  }

  const summary = data?.summary || null
  const top: CheckItem[] = Array.isArray(data?.topAdvisories) ? data.topAdvisories : []
  const status = loading ? STEPS[stage] : data ? 'Ready' : 'Waiting for repo'

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_.95fr] lg:items-start">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100">
            <span>←</span><span>SignalBoost</span>
          </Link>

          <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-slate-950/50 md:p-10">
            <div className="mb-4 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Free developer utility</div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Run a free public GitHub dependency risk preview.</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">Paste a public repository URL and get a capped package advisory summary. The free check shows the signal; Audit Pro unlocks the complete report, planning layer, scheduled monitoring, and assisted review workflow.</p>

            <form onSubmit={submit} className="mt-8 rounded-2xl border border-white/10 bg-slate-950 p-3">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Public GitHub repository</label>
              <div className="flex flex-col gap-3 md:flex-row">
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repo" className="min-h-12 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
                <button disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Checking…' : 'Run free check'}</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <span>Public repos only. Free preview is capped and does not access private code.</span>
                <button type="button" onClick={() => setUrl('https://github.com/SignalBoost/signalboost-live')} className="font-semibold text-cyan-200 hover:text-cyan-100">Try SignalBoost itself</button>
              </div>
            </form>

            {error ? <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 shadow-2xl shadow-slate-950/60 md:p-6">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Live check</h2>
                <p className="mt-1 text-xs text-slate-500">{data?.repo || url || 'Paste a repo URL to begin'}</p>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">{status}</span>
            </div>
            <div className="mt-5 grid gap-3">
              {STEPS.map((step, index) => {
                const active = loading ? stage >= index : !!data
                return <div key={step} className="flex items-center gap-3"><span className={`grid h-7 w-7 place-items-center rounded-full border text-xs font-bold ${active ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-white/10 text-slate-600'}`}>{index + 1}</span><span className={active ? 'text-sm text-white' : 'text-sm text-slate-500'}>{step}</span></div>
              })}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Packages" value={summary?.packagesScanned ?? '—'} /><Metric label="Findings" value={summary?.advisories ?? '—'} /><Metric label="Critical" value={summary?.critical ?? '—'} /><Metric label="High" value={summary?.high ?? '—'} /></div>

          {data ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-white">Top findings</h2><span className="text-xs text-slate-500">Branch: {data.branch || 'default'}</span></div>{top.length === 0 ? <p className="mt-3 text-sm leading-6 text-slate-300">No known package advisories found in this capped preview. This is not a full audit, but it is a good first signal.</p> : <div className="mt-3 space-y-3">{top.map((item) => { const severity = String(item.severity || 'unknown').toLowerCase(); return <div key={`${item.id}:${item.packageName}:${item.version}`} className="rounded-xl border border-white/10 bg-slate-950/70 p-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase ${SEVERITY_STYLES[severity] || SEVERITY_STYLES.unknown}`}>{severity}</span><span className="text-sm font-semibold text-white">{item.packageName}@{item.version}</span>{item.fixedVersionAvailable ? <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">patched version available</span> : null}</div><p className="mt-2 text-sm leading-6 text-slate-400">{item.summary || 'Package advisory detected.'}</p>{item.sourceFile ? <p className="mt-2 text-xs text-slate-500">Source: {item.sourceFile}</p> : null}</div> })}</div>}</div> : null}

          <div className="mt-5 rounded-2xl border border-yellow-300/25 bg-yellow-300/10 p-4"><h2 className="text-sm font-semibold text-yellow-100">Unlock the complete workflow</h2><p className="mt-2 text-sm leading-6 text-yellow-100/80">Audit Pro adds the complete report, planning layer, scheduled monitoring, and assisted review workflow. No code changes happen without human approval.</p><ul className="mt-3 grid gap-2 text-sm text-yellow-50/80"><li>✓ Full issue review report</li><li>✓ Remediation planning layer</li><li>✓ Scheduled monitoring and alert inbox</li><li>✓ Human-approved patch workflow</li></ul><Link href="/pricing" className="mt-4 inline-flex rounded-xl bg-yellow-300 px-4 py-2 text-sm font-black text-slate-950">Unlock Audit Pro — $199/mo</Link></div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div></div>
}
