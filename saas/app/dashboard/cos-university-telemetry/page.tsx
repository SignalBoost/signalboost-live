// saas/app/dashboard/cos-university-telemetry/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  COS_UNIVERSITY_TELEMETRY_COPY,
  type CosUniversityTelemetryLanguage,
} from '@/lib/i18n/cosUniversityTelemetryCopy'

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
  const { lang } = useTranslation()
  const copy = COS_UNIVERSITY_TELEMETRY_COPY[
    (lang in COS_UNIVERSITY_TELEMETRY_COPY ? lang : 'en') as CosUniversityTelemetryLanguage
  ]
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
      setError(response.ok && body.ok ? '' : body.error || copy.requestFailed)
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.requestFailed)
    } finally {
      setBusy(false)
    }
  }, [copy.requestFailed])

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
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm opacity-75">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-xs opacity-75">
          <span>{copy.updated} {when(data?.generatedAt)}</span>
          <button
            type="button"
            onClick={() => { void load() }}
            disabled={busy}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? copy.refreshing : copy.refresh}
          </button>
        </div>
      </header>

      {data?.authRequired ? (
        <div className="rounded-lg border border-amber-500/40 p-4 text-sm">{copy.ownerRequired}</div>
      ) : null}
      {error && !data?.authRequired ? (
        <div className="rounded-lg border border-red-500/40 p-4 text-sm text-red-300">{error}</div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card label={copy.teacherOutputs24h} value={String(summary.teacherOutputs24h ?? '—')} />
        <Card label={copy.completedRuns24h} value={String(summary.completedRuns24h ?? '—')} />
        <Card label={copy.inFlight24h} value={String(summary.inFlightRuns24h ?? '—')} />
        <Card label={copy.failedRuns24h} value={String(summary.failedRuns24h ?? '—')} />
        <Card label={copy.hfObservedCost24h} value={money(summary.hfObservedCostUsd24h)} />
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-semibold">{copy.providersTitle}</h2>
            <p className="text-xs opacity-65">{copy.providersExplanation}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {providers.length ? providers.map(provider => (
            <div key={provider.id} className="rounded-lg border p-4">
              <div className="text-sm font-semibold uppercase tracking-wide">{provider.id}</div>
              <div className="mt-1 text-xs opacity-65">{provider.model || provider.provider}</div>
              <div className="mt-4 text-3xl font-semibold tabular-nums">{provider.calls}</div>
              <div className="mt-1 text-xs opacity-70">{copy.teacherCalls}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="opacity-60">{copy.input}</span><br /><strong>{provider.inputTokens.toLocaleString()}</strong></div>
                <div><span className="opacity-60">{copy.output}</span><br /><strong>{provider.outputTokens.toLocaleString()}</strong></div>
              </div>
              <div className="mt-3 text-[11px] opacity-55">{copy.latest} {when(provider.latestAt)}</div>
            </div>
          )) : <p className="text-sm opacity-65">{copy.noTeacherCalls}</p>}
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-4">
          <h2 className="font-semibold">{copy.runsTitle}</h2>
          <p className="text-xs opacity-65">{copy.runsExplanation}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b text-xs uppercase opacity-60">
              <tr>
                <th className="pb-3 pr-4">{copy.subject}</th>
                <th className="pb-3 pr-4">{copy.stage}</th>
                <th className="pb-3 pr-4">{copy.teacherMix}</th>
                <th className="pb-3 pr-4">{copy.outputs}</th>
                <th className="pb-3 pr-4">{copy.preparation}</th>
                <th className="pb-3 pr-4">{copy.training}</th>
                <th className="pb-3 pr-4">{copy.campaignBudget}</th>
                <th className="pb-3">{copy.updated}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.runId} className="border-b border-white/10 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{run.subject || copy.unknownSubject}</div>
                    <div className="mt-1 font-mono text-[11px] opacity-50">{short(run.runId, 16)}</div>
                    {run.failureReason ? <div className="mt-1 max-w-sm text-xs text-red-300">{run.failureReason}</div> : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={'inline-block rounded-full border px-2 py-1 text-xs ' + stageClass(run.stageBucket)}>
                      {run.stage || copy.unknownStage}
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
                <tr><td colSpan={8} className="py-6 text-center text-sm opacity-60">{copy.noRuns}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs opacity-55">{copy.footer}</footer>
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
