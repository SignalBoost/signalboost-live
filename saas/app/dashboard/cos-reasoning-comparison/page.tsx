'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  distinctVerifiedCaseCount,
  nextDiverseCase,
  trackProblemClasses,
  verifiedOutcomeCountForCandidate,
} from '@/lib/ai/cos/reasoningComparisonProgress'

type Role = 'primary' | 'coder' | 'critic' | 'verifier' | 'researcher'

type ComparisonCase = {
  id: string
  track: string
  origin: string
  difficultyScore: number
  problemClass: string
  suggestedRole: Role
  createdAt?: string
}

type ComparisonRun = {
  id: string
  case_id: string
  candidate_roles: Role[]
  started_at: string
  completed_at?: string | null
  attempted: number
  verified: number
  passed: number
  status: string
  error?: string | null
}

type ComparisonResult = {
  run_id: string
  case_id: string
  track: string
  candidate_id: string
  worker_role: Role
  reasoner_label?: string | null
  passed: boolean
  reasons?: string[]
  turn_id?: string | null
  latency_ms: number
  verified_outcome_recorded: boolean
  problem_class?: string | null
  created_at: string
}

type ComparisonState = {
  ok: boolean
  currentReasoner: string | null
  roles: Role[]
  limits: {
    candidatesPerRun: number
    casesPerRun: number
    evaluationsPerRun: number
  }
  learningGate: {
    minimumVerifiedOutcomesPerCandidate: number
  }
  privateSuiteOrigin: string
  cases: ComparisonCase[]
  runs: ComparisonRun[]
  results: ComparisonResult[]
  note?: string
  error?: string
}

const EMPTY: ComparisonState = {
  ok: false,
  currentReasoner: null,
  roles: [],
  limits: { candidatesPerRun: 2, casesPerRun: 1, evaluationsPerRun: 2 },
  learningGate: { minimumVerifiedOutcomesPerCandidate: 8 },
  privateSuiteOrigin: 'controlled-comparison-private-v1',
  cases: [],
  runs: [],
  results: [],
}

function alternateRole(suggested: Role, roles: Role[]): Role {
  if (suggested !== 'primary' && roles.includes('primary')) return 'primary'
  return roles.find(role => role !== suggested) ?? 'primary'
}

function shortModel(label: string | null | undefined): string {
  if (!label) return '—'
  return label.replace(/^managed-open-model:/, '')
}

export default function CosReasoningComparisonPage() {
  const { t } = useTranslation()
  const [state, setState] = useState<ComparisonState>(EMPTY)
  const [track, setTrack] = useState('')
  const [roleA, setRoleA] = useState<Role>('primary')
  const [roleB, setRoleB] = useState<Role>('critic')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null)

  const load = async () => {
    const response = await fetch('/api/admin/cos-reasoning-comparison', {
      credentials: 'include',
      cache: 'no-store',
    })
    const body = await response.json() as ComparisonState
    if (!response.ok) throw new Error(body.error || t('cos.reasoningComparison.loadFailed', 'Could not load COS reasoning comparison.'))
    setState(body)
  }

  useEffect(() => {
    void load().catch(err => setError(err instanceof Error ? err.message : String(err)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const privateCases = useMemo(
    () => state.cases.filter(item => item.origin === state.privateSuiteOrigin),
    [state.cases, state.privateSuiteOrigin],
  )
  const tracks = useMemo(() => [...new Set(privateCases.map(item => item.track))], [privateCases])

  useEffect(() => {
    if (track || !tracks.length) return
    const initialTrack = tracks.includes('incident-reasoning') ? 'incident-reasoning' : tracks[0]
    setTrack(initialTrack)
    const firstCase = privateCases.find(item => item.track === initialTrack)
    if (!firstCase) return
    setRoleA(alternateRole(firstCase.suggestedRole, state.roles))
    setRoleB(firstCase.suggestedRole)
  }, [privateCases, state.roles, track, tracks])

  const trackCases = useMemo(
    () => privateCases.filter(item => item.track === track),
    [privateCases, track],
  )
  const problemClasses = useMemo(
    () => trackProblemClasses(privateCases, { track, origin: state.privateSuiteOrigin }),
    [privateCases, state.privateSuiteOrigin, track],
  )
  const nextCase = useMemo(
    () => nextDiverseCase(privateCases, state.results, {
      track,
      roles: [roleA, roleB],
      reasonerLabel: state.currentReasoner,
      origin: state.privateSuiteOrigin,
    }),
    [privateCases, roleA, roleB, state.currentReasoner, state.privateSuiteOrigin, state.results, track],
  ) as ComparisonCase | null
  const problemClass = nextCase?.problemClass ?? problemClasses[0] ?? ''
  const gate = Math.max(1, Number(state.learningGate.minimumVerifiedOutcomesPerCandidate) || 8)
  const trackCaseIds = trackCases.map(item => item.id)
  const workerAOutcomes = verifiedOutcomeCountForCandidate(state.results, {
    workerRole: roleA,
    reasonerLabel: state.currentReasoner,
    problemClass,
  })
  const workerBOutcomes = verifiedOutcomeCountForCandidate(state.results, {
    workerRole: roleB,
    reasonerLabel: state.currentReasoner,
    problemClass,
  })
  const workerADiverse = distinctVerifiedCaseCount(state.results, {
    workerRole: roleA,
    reasonerLabel: state.currentReasoner,
    caseIds: trackCaseIds,
  })
  const workerBDiverse = distinctVerifiedCaseCount(state.results, {
    workerRole: roleB,
    reasonerLabel: state.currentReasoner,
    caseIds: trackCaseIds,
  })
  const nextCaseIndex = nextCase ? trackCases.findIndex(item => item.id === nextCase.id) + 1 : trackCases.length
  const evidenceFloorReached = workerAOutcomes >= gate && workerBOutcomes >= gate

  const changeTrack = (nextTrack: string) => {
    setTrack(nextTrack)
    setLastRun(null)
    const firstCase = privateCases.find(item => item.track === nextTrack)
    if (!firstCase) return
    setRoleA(alternateRole(firstCase.suggestedRole, state.roles))
    setRoleB(firstCase.suggestedRole)
  }

  const runComparison = async () => {
    if (!nextCase || roleA === roleB) return
    setBusy(true)
    setError('')
    setLastRun(null)
    try {
      const response = await fetch('/api/admin/cos-reasoning-comparison', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId: nextCase.id, roles: [roleA, roleB] }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('cos.reasoningComparison.runFailed', 'Reasoning comparison failed.'))
      setLastRun(body)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('cos.reasoningComparison.title', 'COS Reasoning Comparison')}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {t('cos.reasoningComparison.diverseSubtitle', 'Diverse held-out A/B evaluation of two COS reasoning workers. Each track rotates through private cases instead of repeating one question.')}
            </p>
          </div>
          <Link className="rounded-md border border-border px-3 py-2 text-sm" href="/dashboard/cos-capability-benchmark">
            {t('cos.reasoningComparison.back', 'Back to Capability Benchmark')}
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Card label={t('cos.reasoningComparison.currentReasoner', 'Current reasoner')} value={shortModel(state.currentReasoner)} />
        <Card label={t('cos.reasoningComparison.privateCases', 'Private diverse cases')} value={String(privateCases.length)} />
        <Card label={t('cos.reasoningComparison.tracks', 'Evaluation tracks')} value={String(tracks.length)} />
        <Card label={t('cos.reasoningComparison.evidenceGate', 'Verified outcomes required per candidate')} value={String(gate)} />
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t('cos.reasoningComparison.runDiverseTitle', 'Run the next diverse comparison')}</h2>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              {t('cos.reasoningComparison.diverseCostNote', 'Each click makes two billable model evaluations on one private held-out case. The next untested case is selected automatically; normal COS traffic is never duplicated.')}
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-text-muted">
            {state.currentReasoner ? shortModel(state.currentReasoner) : t('cos.reasoningComparison.loadingReasoner', 'Loading reasoner…')}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('cos.reasoningComparison.trackLabel', 'Evaluation track')}</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={track}
              onChange={event => changeTrack(event.target.value)}
              disabled={busy || tracks.length === 0}
            >
              {tracks.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('cos.reasoningComparison.workerA', 'Worker A')}</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={roleA}
              onChange={event => setRoleA(event.target.value as Role)}
              disabled={busy}
            >
              {state.roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('cos.reasoningComparison.workerB', 'Worker B')}</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={roleB}
              onChange={event => setRoleB(event.target.value as Role)}
              disabled={busy}
            >
              {state.roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border bg-bg/40 p-3 text-sm">
            <div className="font-medium">{t('cos.reasoningComparison.nextCase', 'Next private case')}</div>
            <div className="mt-1 text-text-muted">
              {nextCase
                ? `${t('cos.reasoningComparison.caseNumber', 'Case')} ${nextCaseIndex}/${trackCases.length} · ${roleA} vs ${roleB}`
                : t('cos.reasoningComparison.trackComplete', 'All private cases in this track are verified for this worker pair and reasoner.')}
            </div>
          </div>
          <div className="rounded-md border border-border bg-bg/40 p-3 text-sm">
            <div className="font-medium">{t('cos.reasoningComparison.learnerBucket', 'Phase 4 learner bucket')}</div>
            <div className="mt-1 text-text-muted">{problemClass || t('cos.reasoningComparison.loadingCases', 'Loading held-out cases…')}</div>
          </div>
        </div>

        {problemClasses.length > 1 && (
          <p className="mt-3 rounded-md border border-warning/40 p-3 text-sm text-warning">
            {t('cos.reasoningComparison.bucketWarning', 'This track currently spans more than one learner bucket. Evidence is counted only inside the bucket shown above.')}
          </p>
        )}
        {roleA === roleB && (
          <p className="mt-3 text-sm text-danger">{t('cos.reasoningComparison.differentWorkers', 'Choose two different workers.')}</p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-danger/40 p-3 text-sm text-danger">{error}</p>
        )}
        {lastRun && (
          <p className="mt-3 rounded-md border border-success/40 p-3 text-sm">
            {t('cos.reasoningComparison.completedNext', 'Comparison completed and verified results were recorded. The next untested case is now selected automatically.')}
          </p>
        )}
        {evidenceFloorReached && (
          <p className="mt-3 rounded-md border border-success/40 p-3 text-sm">
            {t('cos.reasoningComparison.floorReached', 'Both candidates have reached the Phase 4 verified-outcome evidence floor for this learner bucket. COS still requires the configured quality or efficiency margin before changing live routing.')}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            disabled={busy || !nextCase || roleA === roleB || state.roles.length < 2}
            onClick={() => void runComparison()}
          >
            {busy
              ? t('cos.reasoningComparison.running', 'Running 2-worker comparison…')
              : nextCase
                ? t('cos.reasoningComparison.runNext', 'Run Next Diverse Comparison')
                : t('cos.reasoningComparison.diverseComplete', 'Diverse Evidence Complete')}
          </button>
          <button
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void load().catch(err => setError(err instanceof Error ? err.message : String(err)))}
          >
            {t('cos.reasoningComparison.refresh', 'Refresh Results')}
          </button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-semibold">{t('cos.reasoningComparison.progressTitle', 'Learning evidence progress')}</h2>
        <p className="mt-1 text-xs text-text-muted">
          {t('cos.reasoningComparison.progressNote', 'Verified outcomes are the Phase 4 gate. Distinct private cases are shown separately to prove the evidence comes from diverse questions rather than repeated runs of one case.')}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Card label={`${roleA} · ${t('cos.reasoningComparison.verifiedOutcomes', 'verified outcomes')}`} value={`${workerAOutcomes}/${gate}`} />
          <Card label={`${roleA} · ${t('cos.reasoningComparison.distinctCases', 'distinct cases')}`} value={`${workerADiverse}/${trackCases.length || 0}`} />
          <Card label={`${roleB} · ${t('cos.reasoningComparison.verifiedOutcomes', 'verified outcomes')}`} value={`${workerBOutcomes}/${gate}`} />
          <Card label={`${roleB} · ${t('cos.reasoningComparison.distinctCases', 'distinct cases')}`} value={`${workerBDiverse}/${trackCases.length || 0}`} />
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-semibold">{t('cos.reasoningComparison.resultsTitle', 'Recent candidate results')}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className="px-2 py-2">{t('cos.reasoningComparison.case', 'Case')}</th>
                <th className="px-2 py-2">{t('cos.reasoningComparison.worker', 'Worker')}</th>
                <th className="px-2 py-2">{t('cos.reasoningComparison.result', 'Result')}</th>
                <th className="px-2 py-2">{t('cos.reasoningComparison.verified', 'Verified')}</th>
                <th className="px-2 py-2">{t('cos.reasoningComparison.latency', 'Latency')}</th>
                <th className="px-2 py-2">{t('cos.reasoningComparison.bucket', 'Learner bucket')}</th>
                <th className="px-2 py-2">{t('cos.reasoningComparison.reasoner', 'Reasoner')}</th>
              </tr>
            </thead>
            <tbody>
              {state.results.slice(0, 30).map((item, index) => (
                <tr className="border-b border-border/60" key={`${item.run_id}-${item.candidate_id}-${index}`}>
                  <td className="px-2 py-2">{item.track}</td>
                  <td className="px-2 py-2 font-medium">{item.worker_role}</td>
                  <td className="px-2 py-2">{item.passed ? t('cos.reasoningComparison.pass', 'PASS') : t('cos.reasoningComparison.fail', 'FAIL')}</td>
                  <td className="px-2 py-2">{item.verified_outcome_recorded ? t('common.yes', 'yes') : t('common.no', 'no')}</td>
                  <td className="px-2 py-2">{`${Math.round(Number(item.latency_ms) || 0).toLocaleString()} ms`}</td>
                  <td className="px-2 py-2 text-xs text-text-muted">{item.problem_class || '—'}</td>
                  <td className="px-2 py-2 text-xs text-text-muted">{shortModel(item.reasoner_label)}</td>
                </tr>
              ))}
              {state.results.length === 0 && (
                <tr>
                  <td className="px-2 py-4 text-text-muted" colSpan={7}>
                    {t('cos.reasoningComparison.noResults', 'No controlled comparisons have been run yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-semibold">{t('cos.reasoningComparison.runsTitle', 'Recent runs')}</h2>
        <div className="mt-3 space-y-2 text-sm">
          {state.runs.slice(0, 20).map(run => (
            <div className="rounded-md border border-border p-3" key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {Array.isArray(run.candidate_roles) ? run.candidate_roles.join(' vs ') : t('cos.reasoningComparison.comparison', 'comparison')}
                </span>
                <span className="text-xs text-text-muted">{run.status}</span>
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {`${t('cos.reasoningComparison.attempted', 'attempted')} ${run.attempted} · ${t('cos.reasoningComparison.verified', 'verified')} ${run.verified} · ${t('cos.reasoningComparison.passed', 'passed')} ${run.passed}`}
              </div>
              {run.error && <div className="mt-2 text-xs text-danger">{run.error}</div>}
            </div>
          ))}
          {state.runs.length === 0 && (
            <p className="text-text-muted">{t('cos.reasoningComparison.noRuns', 'No comparison runs yet.')}</p>
          )}
        </div>
      </section>
    </main>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold">{value}</div>
    </div>
  )
}
