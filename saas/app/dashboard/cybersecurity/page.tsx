'use client'

// saas/app/dashboard/cybersecurity/page.tsx
// Cybersecurity Center MVP. Audit = readiness/reports. Cybersecurity = technical
// monitoring checks, alert inbox, scheduled scans, and human-approved remediation.

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

type MonitorRow = {
  id: string
  label?: string | null
  repo_url: string
  repo?: string | null
  branch?: string | null
  frequency: string
  is_enabled: boolean
  last_scan_at?: string | null
  last_status?: string | null
  last_error?: string | null
  last_advisories: number
  last_critical: number
  last_high: number
  created_at: string
}

type AlertRow = {
  id: string
  repo?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  advisory_id?: string | null
  package_name?: string | null
  package_version?: string | null
  title: string
  message: string
  details_url?: string | null
  status: 'open' | 'resolved' | 'ignored'
  created_at: string
}

type RemediationRequest = {
  id: string
  source_area: string
  source_type: string
  repo?: string | null
  target?: string | null
  title: string
  summary: string
  severity_summary?: Record<string, number>
  status: 'awaiting_human_review' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
  human_approval_required: boolean
  human_approved: boolean
  approved_at?: string | null
  approval_notes?: string | null
  created_at: string
  updated_at?: string
}

const sevClass: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
  medium: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-100',
  low: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-100',
  unknown: 'border-white/15 bg-white/5 text-white/60',
}

const statusClass: Record<string, string> = {
  awaiting_human_review: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-100',
  approved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  in_progress: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-100',
  completed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  rejected: 'border-red-400/35 bg-red-400/10 text-red-100',
  cancelled: 'border-white/15 bg-white/5 text-white/60',
}

export default function CybersecurityCenterPage() {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [maxPackages, setMaxPackages] = useState(120)
  const [loading, setLoading] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [remediationLoading, setRemediationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remediationMessage, setRemediationMessage] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [history, setHistory] = useState<ScanRow[]>([])
  const [monitors, setMonitors] = useState<MonitorRow[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [remediationRequests, setRemediationRequests] = useState<RemediationRequest[]>([])

  async function loadDashboard() {
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setHistory(json.scans || [])
        setMonitors(json.monitors || [])
        setAlerts(json.alerts || [])
        setRemediationRequests(json.remediationRequests || [])
      }
    } catch { /* optional */ }
  }

  useEffect(() => { loadDashboard() }, [])

  async function runScan() {
    setLoading(true)
    setError(null)
    setRemediationMessage(null)
    setReport(null)
    setScanId(null)
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
      setScanId(json.scanId || null)
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cybersecurity scan failed.')
    } finally {
      setLoading(false)
    }
  }

  async function addMonitor() {
    const repoUrl = url.trim()
    if (!repoUrl) { setError('Repository URL is required to add a monitor.'); return }
    setMonitoring(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_monitor', url: repoUrl, label: label.trim(), frequency }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || 'Could not add monitor.'); return }
      setLabel('')
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add monitor.')
    } finally {
      setMonitoring(false)
    }
  }

  async function requestRemediation() {
    if (!report || report.advisories.length === 0) return
    setRemediationLoading(true)
    setError(null)
    setRemediationMessage(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_remediation', scanId, report }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || 'Could not create remediation request.'); return }
      setRemediationMessage('Remediation request created. A human/admin must approve it before any fix, PR, or code change happens.')
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create remediation request.')
    } finally {
      setRemediationLoading(false)
    }
  }

  async function updateRemediation(id: string, status: RemediationRequest['status']) {
    try {
      await fetch('/api/hub/cyber/dependencies', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remediationId: id, status, approvalNotes: status === 'approved' ? 'Approved by human reviewer from Cybersecurity Center.' : undefined }),
      })
      await loadDashboard()
    } catch { /* non-critical */ }
  }

  async function resolveAlert(id: string, status: 'resolved' | 'ignored' = 'resolved') {
    try {
      await fetch('/api/hub/cyber/dependencies', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: id, status }),
      })
      await loadDashboard()
    } catch { /* non-critical */ }
  }

  async function toggleMonitor(id: string, isEnabled: boolean) {
    try {
      await fetch('/api/hub/cyber/dependencies', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitorId: id, isEnabled }),
      })
      await loadDashboard()
    } catch { /* non-critical */ }
  }

  const summary = report?.summary
  const openAlerts = alerts.filter(a => a.status === 'open')
  const pendingRemediation = remediationRequests.filter(r => r.status === 'awaiting_human_review')

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Cybersecurity Center</div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">Dependency Advisory Monitoring</h1>
            <p className="mt-1.5 max-w-[760px] text-sm leading-relaxed text-text-muted">
              Run scans, monitor repositories, review detected issues, and require human approval before SignalBoost performs any fix.
            </p>
          </div>
          <a href="/dashboard/audit" className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-text">Audit Center</a>
        </header>

        <section className="rounded-md border border-border bg-surface p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_190px_150px_auto_auto] lg:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Repository URL</span>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <span className="text-[10.5px] text-text-muted/80">Public GitHub repos now. Private repo support needs connected GitHub OAuth.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Monitor label</span>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Production app" className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Frequency</span>
              <select value={frequency} onChange={e => setFrequency(e.target.value === 'weekly' ? 'weekly' : 'daily')} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Max packages</span>
              <input type="number" min={1} max={250} value={maxPackages} onChange={e => setMaxPackages(Math.max(1, Math.min(250, Number(e.target.value) || 1)))} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={runScan} disabled={loading} className="rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? 'Scanning…' : 'Run scan'}</button>
              <button onClick={addMonitor} disabled={monitoring} className="rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold text-text hover:bg-surface disabled:opacity-60">{monitoring ? 'Adding…' : 'Add monitor'}</button>
            </div>
          </div>
        </section>

        {error ? <div className="mt-4 rounded-md border border-danger bg-surface p-4 text-sm text-danger">{error}</div> : null}
        {remediationMessage ? <div className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">{remediationMessage}</div> : null}

        <section className="mt-5 grid gap-3 md:grid-cols-5">
          <Metric label="Open alerts" value={openAlerts.length} tone={openAlerts.some(a => a.severity === 'critical') ? 'critical' : openAlerts.length ? 'high' : undefined} />
          <Metric label="Monitors" value={monitors.length} />
          <Metric label="Enabled" value={monitors.filter(m => m.is_enabled).length} />
          <Metric label="Recent scans" value={history.length} />
          <Metric label="Awaiting approval" value={pendingRemediation.length} tone={pendingRemediation.length ? 'medium' : undefined} />
        </section>

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

        {report && report.advisories.length > 0 ? <IssueReviewReport report={report} /> : null}

        {report && report.advisories.length > 0 ? (
          <section className="mt-5 rounded-md border border-accent/40 bg-accent/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text">Would you like SignalBoost to prepare a fix request?</h2>
                <p className="mt-1 max-w-[760px] text-sm leading-relaxed text-text-muted">
                  This comes after the issue review above. Nothing will be changed automatically. A human/admin must approve the request before any code change, pull request, or assisted fix is performed.
                </p>
              </div>
              <button onClick={requestRemediation} disabled={remediationLoading} className="rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">
                {remediationLoading ? 'Creating request…' : 'Request human-approved fix'}
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Human approval queue</h2>
          {remediationRequests.length === 0 ? <p className="text-sm text-text-muted">No remediation requests yet. After a report finds problems, users can request help here.</p> : (
            <div className="flex flex-col gap-3">
              {remediationRequests.slice(0, 20).map(r => (
                <div key={r.id} className="rounded-md border border-border bg-bg p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass[r.status] || statusClass.cancelled}`}>{r.status.replaceAll('_', ' ')}</span>
                        <span className="text-sm font-semibold text-text">{r.title}</span>
                      </div>
                      <p className="mt-2 text-sm text-text-muted">{r.summary}</p>
                      <p className="mt-1 text-xs text-text-muted/80">{r.repo || r.target || 'target unknown'} · {new Date(r.created_at).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-text-muted/80">Human approval required: {r.human_approval_required ? 'yes' : 'no'} · Approved: {r.human_approved ? 'yes' : 'no'}</p>
                    </div>
                    {r.status === 'awaiting_human_review' ? <div className="flex gap-2"><button onClick={() => updateRemediation(r.id, 'approved')} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-400/10">Approve</button><button onClick={() => updateRemediation(r.id, 'rejected')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">Reject</button></div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Alert inbox</h2>
          {alerts.length === 0 ? <p className="text-sm text-text-muted">No cybersecurity alerts yet.</p> : (
            <div className="flex flex-col gap-3">
              {alerts.slice(0, 20).map(a => (
                <div key={a.id} className="rounded-md border border-border bg-bg p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{a.severity}</span>
                        <span className="text-sm font-semibold text-text">{a.title}</span>
                        <span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-text-muted">{a.status}</span>
                      </div>
                      <p className="mt-2 text-sm text-text-muted">{a.message}</p>
                      <p className="mt-1 text-xs text-text-muted/80">{a.repo || 'repo unknown'} · {a.advisory_id || 'advisory'} · {new Date(a.created_at).toLocaleString()}</p>
                      {a.details_url ? <a className="mt-1 inline-block text-xs font-semibold text-accent" href={a.details_url} target="_blank" rel="noreferrer">Advisory details →</a> : null}
                    </div>
                    {a.status === 'open' ? <div className="flex gap-2"><button onClick={() => resolveAlert(a.id, 'resolved')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">Resolve</button><button onClick={() => resolveAlert(a.id, 'ignored')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">Ignore</button></div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Monitored repositories</h2>
          {monitors.length === 0 ? <p className="text-sm text-text-muted">No monitors yet. Add one above to include it in scheduled cybersecurity checks.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">Repository</th><th className="border-b border-border p-3">Frequency</th><th className="border-b border-border p-3">Last scan</th><th className="border-b border-border p-3">Findings</th><th className="border-b border-border p-3">Status</th><th className="border-b border-border p-3">Action</th></tr></thead>
                <tbody>{monitors.map(m => <tr key={m.id} className="border-b border-border/70"><td className="p-3 text-text"><div className="font-semibold">{m.label || m.repo || m.repo_url}</div><div className="text-xs text-text-muted">{m.repo_url}</div></td><td className="p-3 text-text-muted">{m.frequency}</td><td className="p-3 text-text-muted">{m.last_scan_at ? new Date(m.last_scan_at).toLocaleString() : 'Not scanned yet'}</td><td className="p-3 text-text-muted">{m.last_advisories} advisories · {m.last_critical}/{m.last_high} critical/high</td><td className="p-3 text-text-muted">{m.is_enabled ? 'enabled' : 'disabled'}{m.last_error ? ` · ${m.last_error}` : ''}</td><td className="p-3"><button onClick={() => toggleMonitor(m.id, !m.is_enabled)} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{m.is_enabled ? 'Disable' : 'Enable'}</button></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        {report ? (
          <section className="mt-5 rounded-md border border-border bg-surface p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-text">Technical advisory table</h2><p className="text-xs text-text-muted">{report.repo || report.target} · {report.branch || 'default branch'} · {new Date(report.generatedAt).toLocaleString()}</p></div>
            </div>
            {report.advisories.length === 0 ? <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">No dependency advisories found for exact versions collected in this run.</div> : (
              <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">Severity</th><th className="border-b border-border p-3">Package</th><th className="border-b border-border p-3">Advisory</th><th className="border-b border-border p-3">Source</th></tr></thead><tbody>{report.advisories.map(a => <tr key={`${a.id}:${a.packageName}:${a.version}`} className="border-b border-border/70"><td className="p-3"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{a.severity}</span></td><td className="p-3 text-text"><div className="font-semibold">{a.packageName}</div><div className="text-xs text-text-muted">{a.version}</div></td><td className="p-3 text-text-muted"><div className="font-semibold text-text">{a.id}</div><div>{a.summary}</div>{a.detailsUrl ? <a className="mt-1 inline-block text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">Details →</a> : null}</td><td className="p-3 text-xs text-text-muted">{a.sourceFile}</td></tr>)}</tbody></table></div>
            )}
          </section>
        ) : null}

        <section className="mt-5 rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Recent dependency scans</h2>
          {history.length === 0 ? <p className="text-sm text-text-muted">No stored cybersecurity scans yet.</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">Date</th><th className="border-b border-border p-3">Repo</th><th className="border-b border-border p-3">Packages</th><th className="border-b border-border p-3">Advisories</th><th className="border-b border-border p-3">Critical/High</th></tr></thead><tbody>{history.map(h => <tr key={h.id} className="border-b border-border/70"><td className="p-3 text-text-muted">{new Date(h.created_at).toLocaleString()}</td><td className="p-3 text-text">{h.repo || h.target}</td><td className="p-3 text-text-muted">{h.packages_scanned}</td><td className="p-3 text-text-muted">{h.advisories_count}</td><td className="p-3 text-text-muted">{h.critical}/{h.high}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
  )
}

function IssueReviewReport({ report }: { report: Report }) {
  return (
    <section className="mt-5 rounded-md border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Issue review report</div>
          <h2 className="text-base font-semibold text-text">Review of detected dependency issue{report.advisories.length === 1 ? '' : 's'}</h2>
          <p className="mt-1 max-w-[820px] text-sm leading-relaxed text-text-muted">
            SignalBoost reviewed the scan result before offering help. This report explains what was detected, where it was found, why it matters, and the recommended next step. No fix has been requested or approved yet.
          </p>
        </div>
        <div className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-text-muted">
          <div>{report.repo || report.target}</div>
          <div>{report.branch || 'default branch'} · {new Date(report.generatedAt).toLocaleString()}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ReviewMetric label="Issues found" value={report.advisories.length} />
        <ReviewMetric label="Affected packages" value={new Set(report.advisories.map(a => a.packageName)).size} />
        <ReviewMetric label="Files referenced" value={new Set(report.advisories.map(a => a.sourceFile)).size} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {report.advisories.map((a, index) => (
          <div key={`${a.id}:${a.packageName}:${a.version}:${index}`} className="rounded-md border border-border bg-bg p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{a.severity}</span>
              <span className="text-sm font-semibold text-text">Issue {index + 1}: {a.packageName}@{a.version}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ReviewItem label="What was found" value={`The package ${a.packageName} at version ${a.version} matched dependency advisory ${a.id}.`} />
              <ReviewItem label="Where it was found" value={a.sourceFile || 'Source file not provided by scanner.'} />
              <ReviewItem label="Why it matters" value={issueExplanation(a)} />
              <ReviewItem label="Recommended next step" value={recommendedAction(a)} />
            </div>
            <div className="mt-3 rounded-md border border-border/70 bg-surface p-3 text-sm text-text-muted">
              <span className="font-semibold text-text">Advisory summary: </span>{a.summary || 'No advisory summary was returned by the source.'}
              {a.detailsUrl ? <a className="ml-2 text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">Open advisory →</a> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function issueExplanation(a: Advisory) {
  if (a.severity === 'critical') return 'This is categorized as critical. It should be reviewed immediately because vulnerable dependency versions can create serious security exposure when they are reachable in production code.'
  if (a.severity === 'high') return 'This is categorized as high severity. It should be prioritized for remediation and tested carefully before deployment.'
  if (a.severity === 'medium') return 'This is categorized as medium severity. It should be planned for remediation after confirming whether the affected package is used in a reachable part of the application.'
  if (a.severity === 'low') return 'This is categorized as low severity. It should be tracked and remediated during normal maintenance unless the package is exposed in a sensitive path.'
  return 'The advisory source did not provide a clear severity classification. A human should review the advisory details before deciding whether a dependency update is necessary.'
}

function recommendedAction(a: Advisory) {
  if (a.severity === 'critical' || a.severity === 'high') return 'Prepare a dependency update plan, test the application, and require human approval before opening or merging any fix.'
  if (a.severity === 'medium') return 'Review available patched versions, create a safe update plan, and test before deployment.'
  if (a.severity === 'low') return 'Track the issue and include the dependency update in the next maintenance cycle.'
  return 'Review the advisory manually, confirm the safe patched version, and only then decide whether SignalBoost should prepare a fix request.'
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border bg-bg p-3"><div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div><div className="mt-1 text-xl font-semibold text-text">{value}</div></div>
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div><p className="mt-1 text-sm leading-relaxed text-text-muted">{value}</p></div>
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const toneCls = tone ? sevClass[tone] : 'border-border bg-surface text-text'
  return <div className={`rounded-md border p-4 ${toneCls}`}><div className="text-xs uppercase tracking-wider opacity-70">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>
}
