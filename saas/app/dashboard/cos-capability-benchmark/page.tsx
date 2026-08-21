'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Run = { id:string; started_at:string; completed_at?:string|null; attempted:number; passed:number; status:string; error?:string|null }
type CapabilityState = { cases:Array<{id:string;track:string;active:boolean}>; runs:Run[] }
type UtilizationState = { suiteSize:number; domains:string[]; runs:Run[] }
type AutopsyRow = { id:string; problem_class:string; primary_stage?:string|null; status:string; source_case_id?:string|null; retest_case_id?:string|null; retest_passed?:boolean|null; lesson_retained:boolean; updated_at:string }
type AutopsyState = { turns:number; pendingRetests:number; awaitingEvidence:number; passedRetests:number; failedRetests:number; retainedLessons:number; rows:AutopsyRow[] }
type BusyMode = 'capability'|'utilization'|'autopsy'|null

const EMPTY_AUTOPSY: AutopsyState = { turns:0, pendingRetests:0, awaitingEvidence:0, passedRetests:0, failedRetests:0, retainedLessons:0, rows:[] }

function latestScoredRate(runs: Run[]): string {
  const run = runs.find(item => Number(item.attempted) > 0)
  return run ? `${Math.round((run.passed / run.attempted) * 100)}%` : '—'
}

export default function CosCapabilityBenchmarkPage() {
  const { t } = useTranslation()
  const displayError = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
  const [state, setState] = useState<CapabilityState>({ cases: [], runs: [] })
  const [utilization, setUtilization] = useState<UtilizationState>({ suiteSize: 0, domains: [], runs: [] })
  const [autopsy, setAutopsy] = useState<AutopsyState>(EMPTY_AUTOPSY)
  const [busy, setBusy] = useState<BusyMode>(null)
  const [error, setError] = useState('')

  const load = async () => {
    const [capResponse, utilResponse, autopsyResponse] = await Promise.all([
      fetch('/api/admin/cos-capability-benchmark', { credentials:'include', cache:'no-store' }),
      fetch('/api/admin/cos-evidence-utilization-benchmark', { credentials:'include', cache:'no-store' }),
      fetch('/api/admin/cos-failure-autopsy', { credentials:'include', cache:'no-store' }),
    ])
    const [capBody, utilBody, autopsyBody] = await Promise.all([capResponse.json(), utilResponse.json(), autopsyResponse.json()])
    if (!capResponse.ok) throw new Error(capBody.error || t('cos.benchmark.loadFailed', 'Could not load benchmark.'))
    if (!utilResponse.ok) throw new Error(utilBody.error || t('cos.benchmark.utilizationLoadFailed', 'Could not load evidence utilization benchmark.'))
    if (!autopsyResponse.ok) throw new Error(autopsyBody.error || t('cos.benchmark.autopsyLoadFailed', 'Could not load failure autopsy report.'))
    setState(capBody)
    setUtilization({
      suiteSize: Number(utilBody.suiteSize) || 0,
      domains: Array.isArray(utilBody.domains) ? utilBody.domains.map(String) : [],
      runs: Array.isArray(utilBody.runs) ? utilBody.runs : [],
    })
    const report = autopsyBody.report || {}
    setAutopsy({
      turns: Number(report.turns) || 0,
      pendingRetests: Number(report.pendingRetests) || 0,
      awaitingEvidence: Number(report.awaitingEvidence) || 0,
      passedRetests: Number(report.passedRetests) || 0,
      failedRetests: Number(report.failedRetests) || 0,
      retainedLessons: Number(report.retainedLessons) || 0,
      rows: Array.isArray(report.rows) ? report.rows : [],
    })
  }

  useEffect(() => { void load().catch(e => setError(e.message)) }, [])

  const runCapability = async () => {
    setBusy('capability'); setError('')
    try {
      const response = await fetch('/api/admin/cos-capability-benchmark', { method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body:JSON.stringify({limit:2}) })
      const body=await response.json()
      if(!response.ok) throw new Error(body.error||t('cos.benchmark.runFailed', 'Benchmark failed.'))
      await load()
    } catch(e) {
      setError(e instanceof Error?e.message:t('cos.benchmark.runFailed', 'Benchmark failed.'))
    } finally { setBusy(null) }
  }

  const runUtilization = async () => {
    setBusy('utilization'); setError('')
    try {
      const response = await fetch('/api/admin/cos-evidence-utilization-benchmark', { method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body:JSON.stringify({limit:2}) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('cos.benchmark.utilizationRunFailed', 'Evidence utilization benchmark failed.'))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cos.benchmark.utilizationRunFailed', 'Evidence utilization benchmark failed.'))
    } finally { setBusy(null) }
  }

  const runAutopsyRetest = async () => {
    setBusy('autopsy'); setError('')
    try {
      const response = await fetch('/api/admin/cos-failure-autopsy', { method:'POST', credentials:'include' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('cos.benchmark.autopsyRunFailed', 'Failure autopsy retest failed.'))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cos.benchmark.autopsyRunFailed', 'Failure autopsy retest failed.'))
    } finally { setBusy(null) }
  }

  const active = state.cases.filter(item => item.active).length
  const latestCapabilityRate = latestScoredRate(state.runs)
  const latestUtilizationRate = latestScoredRate(utilization.runs)

  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
    <header>
      <h1 className="text-2xl font-semibold">{t('cos.benchmark.title', 'COS Capability Benchmark')}</h1>
      <p className="mt-1 text-sm text-text-muted">{t('cos.benchmark.subtitle', 'Private held-out cases. Cache and external-AI answers do not count.')}</p>
    </header>

    <div className="flex flex-wrap gap-3">
      <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50" disabled={busy!==null||active===0} onClick={runCapability}>{busy==='capability'?t('cos.benchmark.running', 'Running…'):t('cos.benchmark.run', 'Run benchmark')}</button>
      <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy!==null||utilization.suiteSize===0} onClick={runUtilization}>{busy==='utilization'?t('cos.benchmark.utilizationRunning', 'Running evidence benchmark…'):t('cos.benchmark.utilizationRun', 'Run evidence utilization')}</button>
      <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy!==null||autopsy.pendingRetests===0} onClick={runAutopsyRetest}>{busy==='autopsy'?t('cos.benchmark.autopsyRunning', 'Running autopsy retest…'):t('cos.benchmark.autopsyRun', 'Run failure autopsy retest')}</button>
      <button className="rounded-md border border-border px-4 py-2 text-sm" disabled={busy!==null} onClick={()=>void load().catch(e=>setError(e.message))}>{t('common.refresh', 'Refresh')}</button>
    </div>

    {error&&<p className="rounded-md border border-danger/40 p-3 text-sm text-danger">{error}</p>}

    <section className="grid gap-3 md:grid-cols-4">
      <Card label={t('cos.benchmark.activeCases', 'Active private cases')} value={String(active)} />
      <Card label={t('cos.benchmark.latestPassRate', 'Latest private pass rate')} value={latestCapabilityRate} />
      <Card label={t('cos.benchmark.utilizationCases', 'Evidence-utilization cases')} value={String(utilization.suiteSize)} />
      <Card label={t('cos.benchmark.utilizationPassRate', 'Latest utilization pass rate')} value={latestUtilizationRate} />
    </section>

    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="font-semibold">{t('cos.benchmark.recentRuns', 'Recent private capability runs')}</h2>
      <p className="mt-1 text-xs text-text-muted">{t('cos.benchmark.privateSeparation', 'These six cases remain the capability-acceptance rotation and are not diluted by the evidence-utilization suite.')}</p>
      <RunList runs={state.runs} empty={t('cos.benchmark.noRuns', 'No runs yet. Add private benchmark cases in Supabase, then run a bounded batch.')} displayError={displayError} passedLabel={t('cos.benchmark.passed', 'passed')} />
    </section>

    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="font-semibold">{t('cos.benchmark.utilizationTitle', 'Evidence utilization benchmark')}</h2>
      <p className="mt-1 text-xs text-text-muted">{t('cos.benchmark.utilizationDescription', 'Separate controlled cohort across {count} domains. Slow first cases can end a batch early so the route stays inside the 300-second production ceiling; the next run resumes from actual attempted cases.').replace('{count}', String(utilization.domains.length || 9))}</p>
      <RunList runs={utilization.runs} empty={t('cos.benchmark.utilizationNoRuns', 'No evidence-utilization runs yet.')} displayError={displayError} passedLabel={t('cos.benchmark.passed', 'passed')} />
    </section>

    <section className="rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('cos.benchmark.autopsyTitle', 'Failure autopsy')}</h2>
          <p className="mt-1 text-xs text-text-muted">{t('cos.benchmark.autopsyDescription', 'Poor outcomes are classified from explicit turn telemetry. Corrective guidance is shadow-only and is retained only after a different controlled retest passes.')}</p>
        </div>
        <div className="text-xs text-text-muted">{autopsy.retainedLessons} {t('cos.benchmark.autopsyRetained', 'validated lesson(s)')}</div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Card label={t('cos.benchmark.autopsyDiagnosed', 'Autopsied turns')} value={String(autopsy.turns)} />
        <Card label={t('cos.benchmark.autopsyPending', 'Pending retests')} value={String(autopsy.pendingRetests)} />
        <Card label={t('cos.benchmark.autopsyPassed', 'Retests passed')} value={String(autopsy.passedRetests)} />
        <Card label={t('cos.benchmark.autopsyFailed', 'Retests failed')} value={String(autopsy.failedRetests)} />
      </div>
      <div className="mt-4 space-y-2 text-sm">
        {autopsy.rows.length ? autopsy.rows.slice(0,12).map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <span className="min-w-0 break-words"><strong>{row.primary_stage || 'awaiting evidence'}</strong> · {row.problem_class}</span>
          <span>{row.status}{row.lesson_retained?' · lesson retained':''}</span>
          {(row.source_case_id||row.retest_case_id)&&<span className="basis-full text-xs text-text-muted">source {row.source_case_id||'production turn'}{row.retest_case_id?` → retest ${row.retest_case_id}`:''}</span>}
        </div>) : <p className="text-text-muted">{t('cos.benchmark.autopsyEmpty', 'No poor outcome has produced an autopsy yet.')}</p>}
      </div>
    </section>
  </main>
}

function RunList({runs,empty,displayError,passedLabel}:{runs:Run[];empty:string;displayError:(value:unknown)=>string;passedLabel:string}) {
  return <div className="mt-3 space-y-2 text-sm">{runs.length?runs.map(run=><div key={run.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2"><span>{new Date(run.started_at).toLocaleString()} · {run.status}</span><span>{run.passed}/{run.attempted} {passedLabel}</span>{run.error&&<span className="basis-full break-words text-danger">{displayError(run.error)}</span>}</div>):<p className="text-text-muted">{empty}</p>}</div>
}

function Card({label,value}:{label:string;value:string}) { return <div className="rounded-md border border-border bg-surface p-4"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div> }
