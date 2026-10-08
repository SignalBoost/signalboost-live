// saas/app/dashboard/cos-university-telemetry/LabExperimentPanel.tsx
//
// "Run one experiment" on the University telemetry page. Owner 2026-10-07: the always-on line stays paused and testing
// uses deliberate experiments run the way a user runs them. This block starts one run of a Lab experiment the signed-in
// user may start and shows each run's position: training stage, artifact status, Residency standing, graduate status.
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ItmountsLabExperimentCopy } from '@/lib/i18n/itmountsLabExperimentCopy'

const LAB_EXPERIMENTS_URL = '/api/lab/experiments'

type Experiment = { organizationId: string; organizationName: string; experimentId: string; projectName: string; privacyTier: string; role: string }
type Subject = { subjectId: string; eligibleBatches: number }
type Run = {
  grantId: string; experimentId: string; subjectId: string; candidateId: string; startedAt: string; expiresAt: string
  active: boolean; trainingStage: string | null; trainingFailure: string | null; artifactStatus: string | null
  residencyStanding: string | null; graduateStatus: string | null
}

export default function LabExperimentPanel({ copy }: { copy: ItmountsLabExperimentCopy }) {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [experimentKey, setExperimentKey] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch(LAB_EXPERIMENTS_URL, { credentials: 'include', cache: 'no-store', signal })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error('lab_options_unavailable')
      const startable = (body.experiments as Experiment[]).filter(item => item.role === 'owner' || item.role === 'admin')
      setExperiments(startable)
      setSubjects(body.subjects as Subject[])
      setRuns(body.runs as Run[])
      setUnavailable(false)
      setExperimentKey(current => current || (startable[0] ? `${startable[0].organizationId}|${startable[0].experimentId}` : ''))
      setSubjectId(current => current || (body.subjects[0]?.subjectId ?? ''))
    } catch {
      if (!signal?.aborted) setUnavailable(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function start() {
    const [organizationId, experimentId] = experimentKey.split('|')
    if (!organizationId || !experimentId || !subjectId) return
    setStarting(true)
    setMessage(null)
    try {
      const response = await fetch(LAB_EXPERIMENTS_URL, {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, experimentId, subjectId }),
      })
      const body = await response.json()
      if (body.ok) setMessage({ kind: 'status', text: `${copy.started} ${body.candidateId}` })
      else if (body.reason === 'no_eligible_prepared_batch') setMessage({ kind: 'alert', text: copy.refusedNoBatch })
      else setMessage({ kind: 'alert', text: `${copy.refused}: ${String(body.error || body.reason || response.status)}` })
      await load()
    } catch {
      setMessage({ kind: 'alert', text: copy.requestFailed })
    } finally {
      setStarting(false)
    }
  }

  const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : '—'
  const cell = (value: string | null) => value || '—'

  return (
    <section className="rounded-lg border p-4" aria-busy={loading || starting}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{copy.title}</h2>
          <p className="mt-1 text-xs opacity-65">{copy.explanation}</p>
          <p className="mt-1 text-xs opacity-65">{copy.costNote}</p>
        </div>
        <button type="button" onClick={() => { void load() }} disabled={loading} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{copy.refresh}</button>
      </div>
      {loading && !experiments.length ? <p className="mt-3 text-sm">{copy.loading}</p> : unavailable ? (
        <p className="mt-3 text-sm" role="alert">{copy.unavailable}</p>
      ) : !experiments.length ? (
        <p className="mt-3 text-sm">{copy.noExperiments}</p>
      ) : (
        <form className="mt-4 flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); void start() }}>
          <label className="text-xs opacity-75" htmlFor="lab-experiment-select">
            {copy.experimentLabel}
            <select id="lab-experiment-select" value={experimentKey} disabled={starting} onChange={event => setExperimentKey(event.target.value)}
              className="mt-1 block rounded-md border bg-transparent px-3 py-2 text-sm">
              {experiments.map(item => (
                <option key={`${item.organizationId}|${item.experimentId}`} value={`${item.organizationId}|${item.experimentId}`}>
                  {item.organizationName} · {item.projectName} · {item.experimentId.slice(0, 8)} · {item.privacyTier}
                </option>
              ))}
            </select>
          </label>
          {subjects.length ? (
            <label className="text-xs opacity-75" htmlFor="lab-subject-select">
              {copy.subjectLabel}
              <select id="lab-subject-select" value={subjectId} disabled={starting} onChange={event => setSubjectId(event.target.value)}
                className="mt-1 block rounded-md border bg-transparent px-3 py-2 text-sm">
                {subjects.map(item => <option key={item.subjectId} value={item.subjectId}>{item.subjectId} ({item.eligibleBatches} {copy.eligibleBatches})</option>)}
              </select>
            </label>
          ) : <p className="text-sm">{copy.noEligibleSubjects}</p>}
          <button type="submit" disabled={starting || !subjects.length || !experimentKey || !subjectId} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
            {starting ? copy.starting : copy.startButton}
          </button>
        </form>
      )}
      {message ? <p className="mt-3 text-sm" role={message.kind}>{message.text}</p> : null}
      <h3 className="mt-5 font-medium">{copy.runsTitle}</h3>
      {!runs.length ? <p className="mt-1 text-sm opacity-75">{copy.noRuns}</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="opacity-65">
              <tr>
                <th className="py-1 pr-3">{copy.columnSubject}</th>
                <th className="py-1 pr-3">{copy.columnCandidate}</th>
                <th className="py-1 pr-3">{copy.columnStarted}</th>
                <th className="py-1 pr-3">{copy.columnWindow}</th>
                <th className="py-1 pr-3">{copy.columnTraining}</th>
                <th className="py-1 pr-3">{copy.columnArtifact}</th>
                <th className="py-1 pr-3">{copy.columnResidency}</th>
                <th className="py-1 pr-3">{copy.columnGraduate}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.grantId} className="border-t align-top">
                  <td className="py-1 pr-3">{run.subjectId}</td>
                  <td className="py-1 pr-3 font-mono">{run.candidateId}</td>
                  <td className="py-1 pr-3">{stamp(run.startedAt)}</td>
                  <td className="py-1 pr-3">{run.active ? copy.windowActive : copy.windowExpired} · {stamp(run.expiresAt)}</td>
                  <td className="py-1 pr-3">{cell(run.trainingStage)}{run.trainingFailure ? <span className="block opacity-65">{run.trainingFailure}</span> : null}</td>
                  <td className="py-1 pr-3">{cell(run.artifactStatus)}</td>
                  <td className="py-1 pr-3">{cell(run.residencyStanding)}</td>
                  <td className="py-1 pr-3">{cell(run.graduateStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
// end of saas/app/dashboard/cos-university-telemetry/LabExperimentPanel.tsx (if this line is missing, the paste was cut short)
