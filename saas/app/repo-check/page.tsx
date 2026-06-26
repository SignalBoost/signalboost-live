'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

export default function RepoCheckPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<any>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim()) {
      setError('Paste a public GitHub repository URL first.')
      return
    }
    setLoading(true)
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
      setData(json)
    } catch {
      setError('Could not check this repository.')
    } finally {
      setLoading(false)
    }
  }

  const summary = data?.summary || null
  const top = Array.isArray(data?.topAdvisories) ? data.topAdvisories : []

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200">← SignalBoost</Link>
        <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-10">
          <div className="mb-4 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Free public repo check</div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Check a public GitHub repository.</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">Paste a public repo URL and get a fast package risk preview. The full report and fix workflow are available on Audit Pro.</p>

          <form onSubmit={submit} className="mt-8 rounded-2xl border border-white/10 bg-slate-950 p-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repo" className="min-h-12 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
              <button disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? 'Checking…' : 'Run free check'}</button>
            </div>
            <button type="button" onClick={() => setUrl('https://github.com/SignalBoost/signalboost-live')} className="mt-3 text-xs font-semibold text-cyan-200">Try SignalBoost itself</button>
          </form>

          {error ? <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

          {summary ? <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Packages" value={summary.packagesScanned} /><Metric label="Findings" value={summary.advisories} /><Metric label="Critical" value={summary.critical} /><Metric label="High" value={summary.high} /></div> : null}

          {data ? <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-4"><h2 className="text-sm font-semibold">Top findings</h2>{top.length === 0 ? <p className="mt-3 text-sm text-slate-300">No known package issues found in this capped check.</p> : <div className="mt-3 space-y-3">{top.map((item: any) => <div key={`${item.id}:${item.packageName}:${item.version}`} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="text-sm font-semibold">{item.packageName}@{item.version}</div><p className="mt-1 text-sm text-slate-400">{item.summary}</p></div>)}</div>}</div> : null}

          <div className="mt-6 rounded-2xl border border-yellow-300/25 bg-yellow-300/10 p-4"><h2 className="text-sm font-semibold text-yellow-100">Unlock the full workflow</h2><p className="mt-2 text-sm leading-6 text-yellow-100/80">Audit Pro adds the complete report, planning layer, scheduled monitoring, and assisted review workflow.</p><Link href="/pricing" className="mt-4 inline-flex rounded-xl bg-yellow-300 px-4 py-2 text-sm font-black text-slate-950">Unlock Audit Pro — $199/mo</Link></div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div></div>
}
