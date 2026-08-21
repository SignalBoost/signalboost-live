'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Run = { id:string; started_at:string; completed_at?:string|null; attempted:number; passed:number; status:string; error?:string|null }
type CapabilityState = { cases:Array<{id:string;track:string;active:boolean}>; runs:Run[] }
type UtilizationState = { suiteSize:number; domains:string[]; runs:Run[] }
type BusyMode = 'capability'|'utilization'|null

export default function CosCapabilityBenchmarkPage() {
  const { t } = useTranslation()
  const displayError = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
  const [state, setState] = useState<CapabilityState>({ cases: [], runs: [] })
  const [utilization, setUtilization] = useState<UtilizationState>({ suiteSize: 0, domains: [], runs: [] })
  const [busy, setBusy] = useState<BusyMode>(null)
  const [error, setError] = useState('')

  const load = async () => {
    const [capResponse, utilResponse] = await Promise.all([
      fetch('/api/admin/cos-capability-benchmark', { credentials:'include', cache:'no-store' }),
      fetch('/api/admin/cos-evidence-utilization-benchmark', { credentials:'include', cache:'no-store' }),
    ])
    const [capBody, utilBody] = await Promise.all([capResponse.json(), utilResponse.json()])
    if (!capResponse.ok) throw new Error(capBody.error || t('cos.benchmark.loadFailed', 'Could not load benchmark.'))
    if (!utilResponse.ok) throw new Error(utilBody.error || t('cos.benchmark.utilizationLoadFailed', 'Could not load evidence utilization benchmark.'))
    setState(capBody)
    setUtilization({
      suiteSize: Number(utilBody.suiteSize) || 0,
      domains: Array.isArray(utilBody.domains) ? utilBody.domains.map(String) : [],
      runs: Array.isArray(utilBody.runs) ? utilBody.runs : [],
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

  const active = state.cases.filter(item => item.active).length
  const latestCapabilityRate = state.runs[0]?.attempted ? `${Math.round((state.runs[0].passed/state.runs[0].attempted)*100)}%` : '—'
  const latestUtilizationRate = utilization.runs[0]?.attempted ? `${Math.round((utilization.runs[0].passed/utilization.runs[0].attempted)*100)}%` : '—'

  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
    <header>
      <h1 className="text-2xl font-semibold">{t('cos.benchmark.title', 'COS Capability Benchmark')}</h1>
      <p className="mt-1 text-sm text-text-muted">{t('cos.benchmark.subtitle', 'Private held-out cases. Cache and external-AI answers do not count.')}</p>
    </header>

    <div className="flex flex-wrap gap-3">
      <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50" disabled={busy!==null||active===0} onClick={runCapability}>{busy==='capability'?t('cos.benchmark.running', 'Running…'):t('cos.benchmark.run', 'Run benchmark')}</button>
      <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy!==null||utilization.suiteSize===0} onClick={runUtilization}>{busy==='utilization'?t('cos.benchmark.utilizationRunning', 'Running evidence benchmark…'):t('cos.benchmark.utilizationRun', 'Run evidence utilization')}</button>
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
  </main>
}

function RunList({runs,empty,displayError,passedLabel}:{runs:Run[];empty:string;displayError:(value:unknown)=>string;passedLabel:string}) {
  return <div className="mt-3 space-y-2 text-sm">{runs.length?runs.map(run=><div key={run.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2"><span>{new Date(run.started_at).toLocaleString()} · {run.status}</span><span>{run.passed}/{run.attempted} {passedLabel}</span>{run.error&&<span className="basis-full break-words text-danger">{displayError(run.error)}</span>}</div>):<p className="text-text-muted">{empty}</p>}</div>
}

function Card({label,value}:{label:string;value:string}) { return <div className="rounded-md border border-border bg-surface p-4"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div> }
