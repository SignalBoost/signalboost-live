// saas/app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx
//
// The Artifact Effectiveness Funnel on the University telemetry page. Read-only; every row shows its source table.
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EffectivenessFunnel, FunnelWindow } from '@/lib/ai/cos/cosUniversityEffectivenessFunnel'
import type { CosUniversityFunnelCopy } from '@/lib/i18n/cosUniversityFunnelCopy'

const FUNNEL_URL = '/api/admin/cos-university-effectiveness'

type Response = { ok?: boolean; error?: string; summary?: string; funnel?: EffectivenessFunnel }

const STAGE_LABEL: Readonly<Record<string, keyof CosUniversityFunnelCopy>> = Object.freeze({
  born: 'stageBorn',
  birth_certificate: 'stageBirthCertificate',
  examined: 'stageExamined',
  improved_over_baseline: 'stageImproved',
  passed_safety: 'stageSafety',
  passed_transfer: 'stageTransfer',
  passed_retention: 'stageRetention',
  passed_all_gates: 'stageAllGates',
  residency_enrolled: 'stageResidencyEnrolled',
  residency_complete: 'stageResidencyComplete',
  graduated: 'stageGraduated',
  activated: 'stageActivated',
  hired: 'stageHired',
  performed_work: 'stagePerformedWork',
  served_successfully: 'stageServedSuccessfully',
  verified_outcome: 'stageVerifiedOutcome',
})

const counts = (record: Readonly<Record<string, number>>): string => {
  const entries = Object.entries(record)
  return entries.length ? entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') : '—'
}
const when = (value: string | null | undefined): string => {
  if (!value) return '—'
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? value : at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export default function EffectivenessFunnelPanel({ copy, subjects }: { copy: CosUniversityFunnelCopy; subjects: readonly string[] }) {
  const [window, setWindow] = useState<FunnelWindow>('7d')
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [funnel, setFunnel] = useState<EffectivenessFunnel | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const params = new URLSearchParams({ window })
      if (subject) params.set('subject', subject)
      const response = await fetch(`${FUNNEL_URL}?${params.toString()}`, { credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as Response
      if (!response.ok || body.ok !== true || !body.funnel) {
        setMessage(body.error || copy.requestFailed)
        return
      }
      setFunnel(body.funnel)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : copy.requestFailed)
    } finally {
      setBusy(false)
    }
  }, [copy.requestFailed, subject, window])

  useEffect(() => { void load() }, [load])

  const f = funnel
  const born = f?.stages.find(s => s.id === 'born')?.count ?? 0
  const windowLabel: Record<FunnelWindow, string> = { '24h': copy.window24h, '7d': copy.window7d, '30d': copy.window30d, all: copy.windowAll }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">{copy.title}</h2>
      <p className="mt-1 text-xs opacity-65">{copy.explanation}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs opacity-75">
          {copy.windowLabel}
          <select value={window} onChange={event => setWindow(event.target.value as FunnelWindow)} disabled={busy} className="mt-1 block rounded-md border bg-transparent px-2 py-1.5 text-sm">
            {(['24h', '7d', '30d', 'all'] as FunnelWindow[]).map(w => <option key={w} value={w}>{windowLabel[w]}</option>)}
          </select>
        </label>
        <label className="text-xs opacity-75">
          {copy.subjectLabel}
          <select value={subject} onChange={event => setSubject(event.target.value)} disabled={busy} className="mt-1 block rounded-md border bg-transparent px-2 py-1.5 text-sm">
            <option value="">{copy.subjectAll}</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { void load() }} disabled={busy} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">{busy ? copy.loading : copy.refresh}</button>
      </div>
      {message ? <p className="mt-3 text-sm" role="alert">{message}</p> : null}

      {f ? (
        <div className="mt-4 space-y-4">
          {f.cohort.truncated ? <p className="text-xs" role="alert">{copy.cohortTruncated}</p> : null}

          <div className="rounded-lg border p-3">
            <div className="font-semibold">{copy.production}</div>
            {f.production.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="opacity-60">{copy.runsStarted}:</span> {f.production.runsStarted}</div>
                  <div><span className="opacity-60">{copy.runsCompleted}:</span> {f.production.runsCompleted}</div>
                  <div><span className="opacity-60">{copy.runsFailed}:</span> {f.production.runsFailed}</div>
                  <div><span className="opacity-60">{copy.runsInFlight}:</span> {f.production.runsInFlight}</div>
                </div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.production.source}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.production.error}</p>}
          </div>

          <div className="rounded-lg border p-3">
            <div className="font-semibold">{copy.stagesTitle}</div>
            <div className="mt-2 space-y-1">
              {f.stages.map(stage => {
                const pct = stage.share === null ? 0 : Math.round(stage.share * 100)
                const label = copy[STAGE_LABEL[stage.id] ?? 'stageBorn'] as string
                return (
                  <div key={stage.id} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="flex justify-between gap-2">
                        <span>{label}</span>
                        <span className="opacity-50 font-mono text-[10px] truncate">{stage.source}</span>
                      </div>
                      <div className="mt-0.5 h-2 w-full rounded bg-current/10">
                        <div className="h-2 rounded bg-current/60" style={{ width: `${born ? Math.max(pct, stage.count ? 1 : 0) : 0}%` }} />
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">{stage.count}</div>
                    <div className="text-right font-mono tabular-nums opacity-70">{stage.share === null ? '—' : `${pct}%`}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3 text-xs">
              <div className="font-semibold">{copy.rejectedTitle}</div>
              <div className="mt-2">{copy.rejectedQuarantined}: <span className="font-mono">{f.rejected.quarantined}</span> · {copy.rejectedRetired}: <span className="font-mono">{f.rejected.retired}</span></div>
              <div className="mt-1 font-mono" style={{ overflowWrap: 'anywhere' }}>{copy.byStatus}: {counts(f.rejected.byStatus)}</div>
              <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.rejected.source}</div>
            </div>
            <div className="rounded-lg border p-3 text-xs">
              <div className="font-semibold">{copy.failuresTitle}</div>
              {f.evaluationFailures.available ? (
                <>
                  <div className="mt-2">{copy.failuresTotal}: <span className="font-mono">{f.evaluationFailures.total}</span></div>
                  <div>{copy.failuresInfrastructure}: <span className="font-mono">{f.evaluationFailures.infrastructure}</span></div>
                  <div>{copy.failuresMerit}: <span className="font-mono">{f.evaluationFailures.merit}</span></div>
                  <div className="mt-1 font-mono" style={{ overflowWrap: 'anywhere' }}>{copy.failuresByReason}: {counts(f.evaluationFailures.byReason)}</div>
                  <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.evaluationFailures.source} · {copy.failuresRule}: {f.evaluationFailures.rule}</div>
                </>
              ) : <p role="alert">{f.evaluationFailures.error}</p>}
            </div>
          </div>

          {Object.keys(f.unavailable).length ? (
            <div className="rounded-lg border p-3 text-xs" role="alert">
              <div className="font-semibold">{copy.unavailableTitle}</div>
              <p className="opacity-75">{copy.unavailableExplanation}</p>
              <div className="mt-1 font-mono" style={{ overflowWrap: 'anywhere' }}>{Object.entries(f.unavailable).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
            </div>
          ) : null}

          <div className="text-[10px] opacity-50">{copy.generatedAt}: {when(f.generatedAt)} · {f.schemaVersion}</div>
        </div>
      ) : null}
    </section>
  )
}
// end of saas/app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx (if this line is missing, the paste was cut short)
