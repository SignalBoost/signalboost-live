'use client'

// saas/app/dashboard/cybersecurity/page.tsx
// Cybersecurity Center MVP. This is intentionally separate from Audit Center:
// audit = readiness/reports, cybersecurity = recurring technical checks.

import { useEffect, useState } from 'react'

type Advisory = {
  id: string
  packageName: string
  version: string
  sourceFile: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  summary: string
  detailsUrl?: string
  aliases: string[]
}

type Report = {
  ok: boolean
  generatedAt: string
  target: string
  repo?: string
  branch?: string
  packages: { name: string; version: string; sourceFile: string }[]
  advisories: Advisory[]
  summary: { packagesScanned: number; advisories: number; critical: number; high: number; medium: number; low: number; unknown: number }
  error?: string
}

type ScanRow = {
  id: string
  target: string
  repo?: string
  branch?: string
  packages_scanned: number
  advisories_count: number
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
  created_at: string
}

const sevClass: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
  medium: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-100',
  low: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-100',
  unknown: 'border-white/15 bg-white/5 text-white/60',
}

export default function CybersecurityCenterPage() {
  const [url, setUrl] = useState('')
  const [maxPackages, setMaxPackages] = useState(120)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<ScanRow[]>([])

  async function loadHistory() {
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) setHistory(json.scans || [])
    } catch { /* optional */ }
  }

  useEffect(() => { loadHistory() }, [])

  async function runScan() {
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), maxPackages }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.report) {
        setError(json?.error || 'Cybersecurity scan failed.')
        return
      }
      setReport(json.report)
      await loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cybersecurity scan failed.')
    } finally {
      setLoading(false)
    }
  }

  const summary = report?.summary

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Cybersecurity Center</div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">Dependency Advisory Monitoring</h1>
            <p className="mt-1.5 max-w-[720px] text-sm leading-relaxed text-text-muted">
              Scan public GitHub repositories for package dependency advisories. This is the first real cybersecurity monitoring tool; audit reports remain in Audit Center.
            </p>
          </div>
          <a href="/dashboard/audit" className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-text">Audit Center</a>
        </header>

        <section className="rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[260px] flex-[1_1_420px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Repository URL</span>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <span className="text-[10.5px] text-text-muted/80">Public GitHub repos now. Private repo support needs connected GitHub OAuth.</span>
            </label>
            <label className="flex w-[150px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Max packages</span>
              <input type="number" min={1} max={250} value={maxPackages} onChange={e => setMaxPackages(Math.max(1, Math.min(250, Number(e.target.value) || 1)))} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
            <button onClick={runScan} disabled={loading} className="rounded-md border border-accent bg-accent px-5 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">
              {loading ? 'Scanning…' : 'Run dependency scan'}
            </button>
          </div>
        </section>

        {error ? <div className="mt-4 rounded-md border border-danger bg-surface p-4 text-sm text-danger">{error}</div> : null}

        {summary ? (
          <section className="mt-5 grid gap-3 md:grid-cols-6">
            <Metric label="Packages" value={summary.packagesScanned} />
            <Metric label="Advisories" value={summary.advisories} />
            <Metric label="Critical" value={summary.critical} tone="critical" />
            <Metric label="High" value={summary.high} tone="high" />
            <Metric label="Medium" value={summary.medium} tone="medium" />
            <Metric label="Low" value={summary.low} tone="low" />
          </section>
        ) : null}

        {report ? (
          <section className="mt-5 rounded-md border border-border bg-surface p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text">Latest scan result</h2>
                <p className="text-xs text-text-muted">{report.repo || report.target} · {report.branch || 'default branch'} · {new Date(report.generatedAt).toLocaleString()}</p>
              </div>
            </div>
            {report.advisories.length === 0 ? (
              <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">No dependency advisories found for exact versions collected in this run.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-text-muted">
                    <tr><th className="border-b border-border p-3">Severity</th><th className="border-b border-border p-3">Package</th><th className="border-b border-border p-3">Advisory</th><th className="border-b border-border p-3">Source</th></tr>
                  </thead>
                  <tbody>
                    {report.advisories.map(a => (
                      <tr key={`${a.id}:${a.packageName}:${a.version}`} className="border-b border-border/70">
                        <td className="p-3"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{a.severity}</span></td>
                        <td className="p-3 text-text"><div className="font-semibold">{a.packageName}</div><div className="text-xs text-text-muted">{a.version}</div></td>
                        <td className="p-3 text-text-muted"><div className="font-semibold text-text">{a.id}</div><div>{a.summary}</div>{a.detailsUrl ? <a className="mt-1 inline-block text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">Details →</a> : null}</td>
                        <td className="p-3 text-xs text-text-muted">{a.sourceFile}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <section className="mt-5 rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Recent dependency scans</h2>
          {history.length === 0 ? <p className="text-sm text-text-muted">No stored cybersecurity scans yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">Date</th><th className="border-b border-border p-3">Repo</th><th className="border-b border-border p-3">Packages</th><th className="border-b border-border p-3">Advisories</th><th className="border-b border-border p-3">Critical/High</th></tr></thead>
                <tbody>{history.map(h => <tr key={h.id} className="border-b border-border/70"><td className="p-3 text-text-muted">{new Date(h.created_at).toLocaleString()}</td><td className="p-3 text-text">{h.repo || h.target}</td><td className="p-3 text-text-muted">{h.packages_scanned}</td><td className="p-3 text-text-muted">{h.advisories_count}</td><td className="p-3 text-text-muted">{h.critical}/{h.high}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const toneCls = tone ? sevClass[tone] : 'border-border bg-surface text-text'
  return <div className={`rounded-md border p-4 ${toneCls}`}><div className="text-xs uppercase tracking-wider opacity-70">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>
}
