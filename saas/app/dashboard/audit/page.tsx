CRITICAL PRODUCT DIRECTIVE: Deploy Advanced UX Dead-End & Placeholder Detector

Our application still has static placeholders, dead clicks, and unimplemented UI endpoints scattered across the Admin panel and Workspace views. We are building a comprehensive UX Integrity tool directly into our Audit framework to permanently wipe these out.

Please implement the full tool architecture as follows:

1. **The Crawling & Detection Engine (`lib/audit/uxDetector.ts`):**
   - **String Matcher:** Scan all source components (`/app`, `/components`) for standard placeholder content, including: `"Lorem ipsum"`, `"TODO"`, `"Coming soon"`, `href="#"`, and `href="javascript:void(0)"`.
   - **Click/Route Validator:** Create a script that traces our application map, validating that every route listed in our workspace nav blocks returns a valid server status and doesn't load a blank or un-hydrated screen.

2. **Map to Audit Console Severity Tiers:**
   - **Critical:** Dead links or 404/500 API paths inside active Admin or Workspace routes.
   - **High:** Primary action buttons that lack a bound handler or functional backend pipeline (dead clicks).
   - **Medium:** Raw placeholder text strings visible to a logged-in user.

3. **Enforce Absolute Automation Rules:**
   - If the tool finds a placeholder string or a dead button, it must hook straight into our remediation roadmap. 
   - A user must be able to click `[Create PR Fix]` on a UX finding to have the COS automatically clean up the component file or replace placeholder text with valid localized i18n keys.

Run this UX audit script against our entire repository immediately, expose the findings in our dashboard grid, and let's clean up our own Admin and Workspace panels first!
const [maxFiles, setMaxFiles] = useState(8)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const [isAdmin, setIsAdmin] = useState(false)

  // Report drawer
  const [openReportKey, setOpenReportKey] = useState<string | null>(null)
  const [reportEntered, setReportEntered] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  // Finding drawer + patch flow
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [entered, setEntered] = useState(false)
  const [patchState, setPatchState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [patchResult, setPatchResult] = useState<{ branch: string; compareUrl: string } | null>(null)
  const [patchError, setPatchError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/credits', { cache: 'no-store', credentials: 'include' })
      .then(r => r.json()).then(d => { if (alive) setIsAdmin(!!d?.isAdmin) })
      .catch(() => { /* default: not admin */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setPatchState('idle'); setPatchResult(null); setPatchError(null)
    if (selectedFinding) { const id = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(id) }
    setEntered(false)
  }, [selectedFinding])

  useEffect(() => {
    if (openReportKey) { const id = requestAnimationFrame(() => setReportEntered(true)); return () => cancelAnimationFrame(id) }
    setReportEntered(false)
  }, [openReportKey])

  async function generateFix(f: Finding) {
    setPatchState('working'); setPatchError(null); setPatchResult(null)
    try {
      const res = await fetch('/api/hub/operator/audit/patch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ file: f.file, line: typeof f.line === 'number' ? f.line : undefined, title: f.title, detail: f.detail, recommendation: f.recommendation }),
      })
      const data = await res.json().catch(() => null)
      if (res.status === 402 && data?.code === 'patch_not_in_plan') { setPatchError(copy.patchUpgrade); setPatchState('error'); return }
      if (!res.ok || !data?.ok) { setPatchError(data?.error || copy.patchFailed); setPatchState('error'); return }
      setPatchResult({ branch: data.branch, compareUrl: data.compareUrl }); setPatchState('done')
    } catch {
      setPatchError(copy.patchFailed); setPatchState('error')
    }
  }

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/operator/audit/runs', { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) setRuns(data.runs || [])
    } catch { /* sidebar history is non-critical */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Elapsed-time heartbeat so a long run never looks frozen.
  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [loading])

  async function runNew() {
    setLoading(true); setError(null); setView(null); setSelectedRunId(null)
    setPhase('SCAN_TARGET'); setProgress({ done: 0, total: 0 })
    try {
      const res = await fetch('/api/hub/operator/audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ url: prefix.trim(), maxFiles }),
      })
      if (res.status === 403) { setError(copy.ownerOnly); setPhase(null); return }
      if (res.status === 402) {
        const j = (await res.json().catch(() => null)) as { used?: number; cap?: number } | null
        setError(copy.quotaExceeded.replace('{used}', String(j?.used ?? '')).replace('{cap}', String(j?.cap ?? '')))
        setPhase(null); return
      }
      if (!res.body) { setError(copy.failed); setPhase(null); return }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let final: View | null = null
      let finalRunId: string | null = null
      let sawError = false
      // Read NDJSON phase events line by line.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
          if (!line) continue
          let evt: { phase?: string; done?: number; total?: number; error?: string; findings?: Finding[]; filesScanned?: string[]; findingsCount?: number; prefix?: string; runId?: string }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.phase === 'RUN_ANALYZERS') { setPhase('RUN_ANALYZERS'); setProgress({ done: evt.done || 0, total: evt.total || 0 }) }
          else if (evt.phase === 'SCAN_TARGET' || evt.phase === 'GENERATE_REPORT' || evt.phase === 'PREPARE_PRS') { setPhase(evt.phase) }
          else if (evt.phase === 'ERROR') { setError(evt.error || copy.failed); sawError = true }
          else if (evt.phase === 'DONE') {
            final = { findings: evt.findings || [], filesScanned: (evt.filesScanned || []).length, findingsCount: evt.findingsCount || 0, prefix: evt.prefix, status: 'complete' }
            finalRunId = evt.runId || null
          }
        }
      }
      if (final) {
        setView(final); setSelectedRunId(finalRunId); setPhase('DONE'); loadHistory()
        // Data sync: bump the refresh token so the 12 report cards/drawers reload fresh.
        setRefreshTick(x => x + 1)
      } else {
        setPhase(null)
        if (!sawError) setError(copy.failed)
      }
    } catch {
      setError(copy.failed); setPhase(null)
    } finally {
      setLoading(false)
    }
  }

  async function openRun(id: string) {
    setError(null); setSelectedRunId(id)
    try {
      const res = await fetch(`/api/hub/operator/audit/runs?runId=${encodeURIComponent(id)}`, { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(data?.error || copy.failed); return }
      const r = data.run
      const log = data.log as { findings?: Finding[]; filesScanned?: string[]; findingsCount?: number; prefix?: string } | null
      const findings = (log?.findings as Finding[]) || (data.findings as Finding[]) || []
      setView({
        findings,
        filesScanned: Array.isArray(log?.filesScanned) ? log!.filesScanned!.length : (r?.files_scanned || 0),
        findingsCount: typeof log?.findingsCount === 'number' ? log!.findingsCount! : (r?.findings_count || 0),
        prefix: log?.prefix ?? r?.prefix,
        status: r?.status,
      })
      setProgress({ done: 0, total: 0 })
      setPhase(r?.status === 'complete' ? 'DONE' : null)
    } catch {
      setError(copy.failed)
    }
  }

  const findings = view?.findings || []
  const openReport = openReportKey ? REPORTS.find(r => r.key === openReportKey) || null : null
  const closeReport = () => setOpenReportKey(null)
  const hasSynced = refreshTick > 0

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">{copy.title}</h1>
            <p className="mt-1.5 max-w-[640px] text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
          </div>
          <a href="/dashboard/audit/pricing" className="inline-flex shrink-0 items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">
            {copy.viewPlans}
          </a>
        </div>

        {/* ── Audit Command Center (scan controller) ─────────────────────── */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm" aria-hidden>⚡</span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{copy.cmdTitle}</h2>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-[1_1_280px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.pathLabel}</span>
              <input
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <span className="text-[10.5px] leading-snug text-text-muted/80">{copy.pathHint}</span>
            </label>
            <label className="flex w-[120px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.maxLabel}</span>
              <input
                type="number" min={1} max={60} value={maxFiles}
                onChange={e => setMaxFiles(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={runNew}
              disabled={loading}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-accent bg-accent px-5 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:opacity-60"
            >
              {loading ? copy.running : copy.run}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 rounded-md border border-accent/40 bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-text">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                {copy.running}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-text-muted">{fmtElapsed(elapsed)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full w-1/3 rounded-full bg-accent" style={{ animation: 'sbIndet 1.15s ease-in-out infinite' }} />
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">{copy.runningHint}</p>
            <style>{`@keyframes sbIndet{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}`}</style>
          </div>
        )}

        {phase && <PhaseTracker phase={phase} progress={progress} copy={copy} />}

        {error && (
          <div className="mt-4 rounded-md border border-danger bg-surface p-3 text-sm text-danger">{copy.failed}: {error}</div>
        )}

        {/* Findings + history */}
        <div className="mt-4 flex flex-wrap items-start gap-4">
          {/* History */}
          <aside className="min-w-[240px] max-w-[300px] flex-[1_1_260px] rounded-md border border-border bg-surface p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.history}</span>
              <button onClick={loadHistory} className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-fast hover:bg-surface">{copy.refresh}</button>
            </div>
            {runs.length === 0 ? (
              <div className="px-0.5 py-2 text-xs text-text-muted">{copy.noRuns}</div>
            ) : (
              <div className="flex max-h-[calc(100vh-280px)] flex-col gap-1.5 overflow-y-auto">
                {runs.map(r => {
                  const active = r.id === selectedRunId
                  return (
                    <button
                      key={r.id}
                      onClick={() => openRun(r.id)}
                      className={`rounded-md border px-2.5 py-2 text-left transition-fast ${active ? 'border-accent bg-bg' : 'border-border bg-bg hover:border-accent'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(r.status)}`} />
                        <span className={`text-[11px] font-semibold ${statusText(r.status)}`}>{statusLabel(copy, r.status)}</span>
                        <span className={`ml-auto text-[11px] font-bold ${r.findings_count > 0 ? 'text-accent' : 'text-text-muted'}`}>{r.findings_count}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10.5px] text-text-muted">{r.prefix || '—'}</div>
                      <div className="mt-0.5 text-[10px] text-text-muted/70">{timeShort(r.created_at, lang)}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </aside>
{/* Findings column */}
          <section className="min-w-[320px] flex-[999_1_420px]">
            {view ? (
              <>
                <div className="mb-3 flex flex-wrap gap-3">
                  <Stat label={copy.filesScanned} value={String(view.filesScanned)} accent="text-[#1af0ff]" />
                  <Stat label={copy.findings} value={String(view.findingsCount)} accent="text-accent" />
                </div>
                {findings.length === 0 ? (
                  <div className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">{copy.clean}</div>
                ) : (
                  <div className="max-h-[calc(100vh-380px)] overflow-y-auto rounded-md border border-border bg-surface p-1.5">
                    {findings.map((f, i) => {
                      const sev = asSev(f.severity)
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedFinding(f)}
                          className={`cursor-pointer p-3.5 ${i < findings.length - 1 ? 'border-b border-border' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className={`rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevText(sev)}`}>{copy.sev[sev]}</span>
                            <span className="text-sm font-semibold text-text">{f.title}</span>
                          </div>
                          <div className="mt-1.5 font-mono text-[11px] text-text-muted">
                            {f.file}{typeof f.line === 'number' ? `  ·  ${copy.line} ${f.line}` : ''}  ·  {copy.category}: {f.category}
                          </div>
                          {f.detail && <p className="mt-2 text-[13px] leading-relaxed text-text">{f.detail}</p>}
                          {f.recommendation && (
                            <div className="mt-2 rounded-md border border-border bg-bg px-3 py-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">{copy.recommendation}</span>
                              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{f.recommendation}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              !error && !loading && <div className="text-[12.5px] text-text-muted">{copy.emptyHint}</div>
            )}
          </section>
        </div>

        {/* ── Compliance & Readiness Reports (12-card grid) ──────────────── */}
        <div className="mt-10 mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm" aria-hidden>📊</span>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{copy.reportsTitle}</h2>
              <p className="mt-0.5 max-w-[680px] text-[12.5px] leading-relaxed text-text-muted/80">{copy.reportsSubtitle}</p>
            </div>
          </div>
          {hasSynced && (
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-[#34d399]">● {copy.reportSyncHint}</span>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {REPORTS.map((r, idx) => {
            const accent = idx % 2 === 0 ? 'text-accent' : 'text-[#1af0ff]'
            const isExec = r.key === 'executive'
            return (
              <button
                key={r.key}
                onClick={() => setOpenReportKey(r.key)}
                className={`flex flex-col gap-2 rounded-md border bg-surface p-4 text-left transition-fast hover:border-accent ${r.mvp ? 'border-accent ring-1 ring-accent/40' : 'border-border'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg" aria-hidden>{r.icon}</span>
                  <div className="flex items-center gap-1.5">
                    {r.mvp && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-bg">{copy.mvpBadge}</span>}
                    {isExec && view && (
                      <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-bold text-accent">
                        {view.findingsCount} {copy.findings}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-text">{t(`audit.center.${r.key}.title`, r.title)}</div>
                <div className="flex-1 text-[12px] leading-relaxed text-text-muted">{t(`audit.center.${r.key}.desc`, r.desc)}</div>
                <div className={`mt-1 text-[12px] font-semibold ${accent}`}>{copy.openReport} →</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Report drawer (520px) ─────────────────────────────────────────── */}
      {openReport && (
        <div
          onClick={closeReport}
          className="fixed inset-0 z-[1000] flex justify-end transition-[background] duration-200"
          style={{ background: reportEntered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: reportEntered ? 'blur(4px)' : 'none', WebkitBackdropFilter: reportEntered ? 'blur(4px)' : 'none' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="fixed right-0 top-0 flex h-full w-[520px] max-w-full flex-col border-l border-border bg-surface p-6 transition-transform duration-300"
            style={{ transform: reportEntered ? 'translateX(0)' : 'translateX(100%)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden>{openReport.icon}</span>
                <h2 className="text-base font-semibold text-text">{t(`audit.center.${openReport.key}.title`, openReport.title)}</h2>
              </div>
              <button onClick={closeReport} aria-label={copy.close} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition-fast hover:bg-bg">×</button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
              <a
                href={openReport.key === 'pr-cockpit' ? '/hub' : `/hub/audit/${openReport.key}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] font-semibold text-text transition-fast hover:border-accent"
              >
                ↗ {copy.viewOnline}
              </a>
            </div>

            {openReport.key === 'pr-cockpit' ? (
              <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-4 rounded-md border border-border bg-bg p-6">
                <span className="text-2xl" aria-hidden>🔀</span>
                <p className="text-sm leading-relaxed text-text-muted">{t('audit.center.prCockpitPending', 'The PR Cockpit approval trail — infrastructure change requests, approvals, and merge results — lives in the Hub PR Cockpit. A dedicated report view is being wired to that data.')}</p>
                <a href="/hub" className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">{t('audit.center.openCockpit', 'Open PR Cockpit')}</a>
              </div>
            ) : isAdmin ? (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-bg">
                {(() => {
                  const ReportView = REPORT_VIEWS[openReport.key]
                  return ReportView ? (
                    <Suspense fallback={<div className="p-6 text-sm text-text-muted">{t('audit.center.loading', 'Loading report…')}</div>}>
                      <ReportView key={refreshTick} />
                    </Suspense>
                  ) : null
                })()}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-4 rounded-md border border-border bg-bg p-6">
                <span className="text-2xl" aria-hidden>🔒</span>
                <p className="text-sm leading-relaxed text-text-muted">{copy.reportOwnerOnly}</p>
                <a href="/dashboard/audit/pricing" className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">
                  {copy.viewPlans}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Finding-detail drawer ─────────────────────────────────────────── */}
      {selectedFinding && (() => {
        const sev = asSev(selectedFinding.severity)
        return (
          <div
            onClick={() => setSelectedFinding(null)}
            className="fixed inset-0 z-[1000] flex justify-end transition-[background] duration-200"
            style={{ background: entered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: entered ? 'blur(4px)' : 'none', WebkitBackdropFilter: entered ? 'blur(4px)' : 'none' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="fixed right-0 top-0 h-full w-[480px] max-w-full overflow-y-auto border-l border-border bg-surface p-6 transition-transform duration-300"
              style={{ transform: entered ? 'translateX(0)' : 'translateX(100%)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevText(sev)}`}>{copy.sev[sev]}</span>
                <button onClick={() => setSelectedFinding(null)} aria-label={copy.close} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition-fast hover:bg-bg">×</button>
              </div>

              <h2 className="mt-3.5 mb-1 text-lg font-semibold leading-snug text-text">{selectedFinding.title}</h2>
              <div className="break-all font-mono text-[11.5px] text-text-muted">
                {selectedFinding.file}{typeof selectedFinding.line === 'number' ? `  ·  ${copy.line} ${selectedFinding.line}` : ''}
              </div>
              <div className="mt-1.5 text-[11px] text-text-muted">{copy.category}: {selectedFinding.category}</div>

              {selectedFinding.detail && (
                <div className="mt-4">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.detail}</div>
                  <p className="text-[13.5px] leading-relaxed text-text">{selectedFinding.detail}</p>
                </div>
              )}

              {selectedFinding.recommendation && (
                <div className="mt-4 rounded-md border border-border bg-bg px-3.5 py-3">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{copy.recommendation}</div>
                  <p className="text-[13px] leading-relaxed text-text-muted">{selectedFinding.recommendation}</p>
                </div>
              )}

              <a href={ghUrl(selectedFinding.file, selectedFinding.line)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-md border border-border px-3.5 py-2 text-[12.5px] font-semibold text-[#1af0ff] transition-fast hover:bg-bg">
                {copy.viewSource} ↗
              </a>

              {selectedFinding.recommendation && (
                <div className="mt-5 border-t border-border pt-4">
                  <button
                    onClick={() => selectedFinding && generateFix(selectedFinding)}
                    disabled={patchState === 'working' || patchState === 'done'}
                    className={`w-full rounded-md border px-4 py-2.5 text-sm font-semibold transition-fast ${patchState === 'done' ? 'border-[#34d399] bg-bg text-[#34d399]' : 'border-accent bg-accent text-bg hover:brightness-110'} disabled:opacity-80`}
                  >
                    {patchState === 'working' ? copy.patching : patchState === 'done' ? `✓ ${copy.patchReady}` : copy.generateFix}
                  </button>

                  {patchState === 'done' && patchResult && (
                    <div className="mt-3 rounded-md border border-border bg-bg px-3.5 py-3">
                      <div className="break-all font-mono text-[11px] text-text-muted">{patchResult.branch}</div>
                      <a href={patchResult.compareUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12.5px] font-semibold text-[#34d399]">
                        {copy.reviewMerge} ↗
                      </a>
                    </div>
                  )}

                  {patchState === 'error' && patchError && (
                    <div className="mt-3 rounded-md border border-danger bg-bg px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">{patchError}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="min-w-[130px] rounded-md border border-border bg-surface px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold leading-tight ${accent}`}>{value}</div>
    </div>
  )
}
