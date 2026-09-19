// saas/app/dashboard/cos-university-telemetry/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'

type Provider = {
  id: string
  provider: string
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  latestAt: string | null
}

type Job = {
  jobId: string
  jobUrl: string | null
  stage: string | null
  observedCostUsd: number
}

type Run = {
  runId: string
  campaignId: string
  subject: string
  stage: string
  stageBucket: 'complete' | 'failed' | 'in_flight'
  failureReason: string | null
  teacherOutputs: number
  providerMix: Record<string, number>
  preparation: Job | null
  training: Job | null
  trainedArtifactId: string | null
  campaignStatus: string | null
  campaignCommittedCostUsd: number
  campaignMaxCostUsd: number
  updatedAt: string | null
  completedAt: string | null
}

type Telemetry = {
  ok?: boolean
  error?: string
  authRequired?: boolean
  readOnly?: boolean
  generatedAt?: string
  windowHours?: number
  summary?: {
    teacherOutputs24h?: number
    completedRuns24h?: number
    failedRuns24h?: number
    inFlightRuns24h?: number
    hfObservedCostUsd24h?: number
  }
  providers?: Provider[]
  runs?: Run[]
}

const REFRESH_MS = 10_000

function money(value: number | null | undefined): string {
  return '$' + Number(value || 0).toFixed(4)
}

function when(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function short(value: string | null | undefined, length = 12): string {
  const text = String(value || '')
  return text.length <= length ? text : text.slice(0, length) + '…'
}

function mixLabel(mix: Record<string, number>): string {
  const preferred = ['openai', 'claude', 'grok', 'qwen', 'deepseek']
  const entries = Object.entries(mix)
  entries.sort(([a], [b]) => {
    const ai = preferred.indexOf(a)
    const bi = preferred.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return entries.length ? entries.map(([provider, count]) => provider + ' ' + count).join(' · ') : '—'
}

function stageClass(bucket: Run['stageBucket']): string {
  if (bucket === 'complete') return 'border-emerald-500/40 text-emerald-300'
  if (bucket === 'failed') return 'border-red-500/40 text-red-300'
  return 'border-amber-500/40 text-amber-300'
}

export default function CosUniversityTelemetryPage() {
  const [data, setData] = useState<Telemetry | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/cos-university-telemetry', {
        cache: 'no-store',
        credentials: 'include',
      })
      const body = await response.json().catch(() => ({})) as Telemetry
      setData(body)
      setError(response.ok && body.ok ? '' : body.error || 'Telemetry request failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telemetry request failed')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const summary = data?.summary || {}
  const providers = data?.providers || []
  const runs = data?.runs || []

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">COS University — Distillation Telemetry</h1>
          <p className="mt-1 text-sm opacity-75">
            Read-only Production view. Auto-refreshes every 10 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs opacity-75">
          <span>Updated {when(data?.generatedAt)}</span>
          <button
            type="button"
            onClick={() => { void load() }}
            disabled={busy}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {data?.authRequired ? (
        <div className="rounded-lg border border-amber-500/40 p-4 text-sm">
          Owner sign-in is required to view University production telemetry.
        </div>
      ) : null}
      {error && !data?.authRequired ? (
        <div className="rounded-lg border border-red-500/40 p-4 text-sm text-red-300">{error}</div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Teacher outputs · 24h" value={String(summary.teacherOutputs24h ?? '—')} />
        <Card label="Completed runs · 24h" value={String(summary.completedRuns24h ?? '—')} />
        <Card label="In flight · 24h" value={String(summary.inFlightRuns24h ?? '—')} />
        <Card label="Failed runs · 24h" value={String(summary.failedRuns24h ?? '—')} />
        <Card label="HF observed cost · 24h" value={money(summary.hfObservedCostUsd24h)} />
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-semibold">Frontier teacher providers · last 24h</h2>
            <p className="text-xs opacity-65">
              Calls and tokens are durable API telemetry. Provider account charges are not inferred here.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {providers.length ? providers.map(provider => (
            <div key={provider.id} className="rounded-lg border p-4">
              <div className="text-sm font-semibold uppercase tracking-wide">{provider.id}</div>
              <div className="mt-1 text-xs opacity-65">{provider.model || provider.provider}</div>
              <div className="mt-4 text-3xl font-semibold tabular-nums">{provider.calls}</div>
              <div className="mt-1 text-xs opacity-70">teacher calls</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="opacity-60">Input</span><br /><strong>{provider.inputTokens.toLocaleString()}</strong></div>
                <div><span className="opacity-60">Output</span><br /><strong>{provider.outputTokens.toLocaleString()}</strong></div>
              </div>
              <div className="mt-3 text-[11px] opacity-55">Latest {when(provider.latestAt)}</div>
            </div>
          )) : <p className="text-sm opacity-65">No hosted teacher calls in this window.</p>}
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-4">
          <h2 className="font-semibold">Recent distillation runs</h2>
          <p className="text-xs opacity-65">Newest Production activity first.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b text-xs uppercase opacity-60">
              <tr>
                <th className="pb-3 pr-4">Subject</th>
                <th className="pb-3 pr-4">Stage</th>
                <th className="pb-3 pr-4">Teacher mix</th>
                <th className="pb-3 pr-4">Outputs</th>
                <th className="pb-3 pr-4">Preparation</th>
                <th className="pb-3 pr-4">Training</th>
                <th className="pb-3 pr-4">Campaign budget</th>
                <th className="pb-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.runId} className="border-b border-white/10 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{run.subject}</div>
                    <div className="mt-1 font-mono text-[11px] opacity-50">{short(run.runId, 16)}</div>
                    {run.failureReason ? <div className="mt-1 max-w-sm text-xs text-red-300">{run.failureReason}</div> : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={'inline-block rounded-full border px-2 py-1 text-xs ' + stageClass(run.stageBucket)}>
                      {run.stage || 'unknown'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{mixLabel(run.providerMix)}</td>
                  <td className="py-3 pr-4 tabular-nums">{run.teacherOutputs}</td>
                  <td className="py-3 pr-4"><JobCell job={run.preparation} /></td>
                  <td className="py-3 pr-4"><JobCell job={run.training} /></td>
                  <td className="py-3 pr-4 tabular-nums">
                    {money(run.campaignCommittedCostUsd)} / {money(run.campaignMaxCostUsd)}
                  </td>
                  <td className="py-3 text-xs opacity-65">{when(run.updatedAt)}</td>
                </tr>
              ))}
              {!runs.length ? (
                <tr><td colSpan={8} className="py-6 text-center text-sm opacity-60">No runs found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs opacity-55">
        This surface is read-only. It does not authorize spend, retrigger jobs, change providers, or promote artifacts.
      </footer>
    </main>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs opacity-60">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function JobCell({ job }: { job: Job | null }) {
  if (!job) return <span className="opacity-45">—</span>
  const label = job.stage || short(job.jobId, 10)
  return (
    <div className="space-y-1 text-xs">
      {job.jobUrl ? (
        <a href={job.jobUrl} target="_blank" rel="noreferrer" className="font-medium underline">
          {label}
        </a>
      ) : <span>{label}</span>}
      {job.observedCostUsd > 0 ? <div className="opacity-60">{money(job.observedCostUsd)}</div> : null}
    </div>
  )
}
