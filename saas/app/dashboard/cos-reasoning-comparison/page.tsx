'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  distinctVerifiedCaseCount,
  nextDiverseCaseForProblemClass,
  problemClassCaseCounts,
  verifiedOutcomeCountForCandidate,
} from '@/lib/ai/cos/reasoningComparisonProgress'

type Role = 'primary' | 'coder' | 'critic' | 'verifier' | 'researcher'
type BusyMode = 'single' | 'campaign' | null

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

type LearnerCandidate = {
  workerRole: Role
  reasonerLabel: string
  verifiedOutcomes: number
  verifiedSuccesses: number
  successRate: number
  repairRate: number | null
  escalationRate: number | null
  qualityScore: number
  averageLatencyMs: number
  averageEstimatedCostUsd: number | null
}

type LearnerPreference = {
  problemClass: string
  status: 'learned' | 'no_clear_winner' | 'insufficient_evidence'
  recommendedWorkerRole: Role | null
  recommendedReasonerLabel: string | null
  reason: string
  candidates: LearnerCandidate[]
}

type LearnerStatus = {
  ok: boolean
  problemClass: string
  status: 'learned' | 'no_clear_winner' | 'insufficient_evidence'
  recommendedWorkerRole: Role | null
  recommendedReasonerLabel: string | null
  reason: string
  preference: LearnerPreference | null
  error?: string
}

const MAX_CAMPAIGN_COMPARISONS = 4
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

function shortModel(label: string | null | undefined): string {
  if (!label) return '—'
  return label.replace(/^managed-open-model:/, '')
}

function defaultRoles(cases: ComparisonCase[], roles: Role[]): [Role, Role] {
  const primary: Role = roles.includes('primary') ? 'primary' : (roles[0] ?? 'primary')
  const specialistCounts = new Map<Role, number>()
  for (const item of cases) {
    if (item.suggestedRole === primary) continue
    specialistCounts.set(item.suggestedRole, (specialistCounts.get(item.suggestedRole) ?? 0) + 1)
  }
  const specialist = [...specialistCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    ?? roles.find(role => role !== primary && role === 'researcher')
    ?? roles.find(role => role !== primary)
    ?? 'critic'
  return [primary, specialist]
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`
}

export default function CosReasoningComparisonPage() {
  const { t } = useTranslation()
  const [state, setState] = useState<ComparisonState>(EMPTY)
  const [problemClass, setProblemClass] = useState('')
  const [roleA, setRoleA] = useState<Role>('primary')
  const [roleB, setRoleB] = useState<Role>('critic')
  const [busy, setBusy] = useState<BusyMode>(null)
  const [error, setError] = useState('')
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null)
  const [campaignCompleted, setCampaignCompleted] = useState(0)
  const [learner, setLearner] = useState<LearnerStatus | null>(null)

  const fetchState = async (): Promise<ComparisonState> => {
    const response = await fetch('/api/admin/cos-reasoning-comparison', {
      credentials: 'include',
      cache: 'no-store',
    })
    const body = await response.json() as ComparisonState
    if (!response.ok) throw new Error(body.error || t('cos.reasoningComparison.loadFailed', 'Could not load COS reasoning comparison.'))
    setState(body)
    return body
  }

  const fetchLearner = async (bucket: string): Promise<LearnerStatus | null> => {
    if (!bucket) return null
    const response = await fetch(`/api/admin/cos-reasoning-learning-status?problemClass=${encodeURIComponent(bucket)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const body = await response.json() as LearnerStatus
    if (!response.ok) throw new Error(body.error || t('cos.reasoningComparison.learnerLoadFailed', 'Could not load Phase 4 learner status.'))
    setLearner(body)
    return body
  }

  useEffect(() => {
    void fetchState().catch(err => setError(err instanceof Error ? err.message : String(err)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const privateCases = useMemo(
    () => state.cases.filter(item => item.origin === state.privateSuiteOrigin),
    [state.cases, state.privateSuiteOrigin],
  )
  const gate = Math.max(1, Number(state.learningGate.minimumVerifiedOutcomesPerCandidate) || 8)
  const bucketCounts = useMemo(
    () => problemClassCaseCounts(privateCases, { origin: state.privateSuiteOrigin }),
    [privateCases, state.privateSuiteOrigin],
  )
  const eligibleBuckets = useMemo(
    () => bucketCounts.filter(item => item.cases >= gate),
    [bucketCounts, gate],
  )

  useEffect(() => {
    if (problemClass || !eligibleBuckets.length) return
    const sre = eligibleBuckets.find(item => /site reliability engineering/i.test(item.problemClass))
    const initial = sre?.problemClass ?? eligibleBuckets[0].problemClass
    setProblemClass(initial)
    const pair = defaultRoles(privateCases.filter(item => item.problemClass === initial), state.roles)
    setRoleA(pair[0])
    setRoleB(pair[1])
  }, [eligibleBuckets, privateCases, problemClass, state.roles])

  useEffect(() => {
    if (!problemClass) return
    void fetchLearner(problemClass).catch(err => setError(err instanceof Error ? err.message : String(err)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemClass])

  const bucketCases = useMemo(
    () => privateCases.filter(item => item.problemClass === problemClass),
    [privateCases, problemClass],
  )
  const bucketCaseIds = bucketCases.map(item => item.id)
  const nextCase = useMemo(
    () => nextDiverseCaseForProblemClass(privateCases, state.results, {
      problemClass,
      roles: [roleA, roleB],
      reasonerLabel: state.currentReasoner,
      origin: state.privateSuiteOrigin,
    }),
    [privateCases, problemClass, roleA, roleB, state.currentReasoner, state.privateSuiteOrigin, state.results],
  ) as ComparisonCase | null

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
    caseIds: bucketCaseIds,
  })
  const workerBDiverse = distinctVerifiedCaseCount(state.results, {
    workerRole: roleB,
    reasonerLabel: state.currentReasoner,
    caseIds: bucketCaseIds,
  })
  const evidenceFloorReached = workerAOutcomes >= gate && workerBOutcomes >= gate
  const currentModelCandidates = (learner?.preference?.candidates ?? [])
    .filter(candidate => candidate.reasonerLabel === state.currentReasoner)
  const campaignRemaining = Math.max(0, Math.min(
    bucketCases.length - Math.min(workerADiverse, workerBDiverse),
    gate - Math.min(workerAOutcomes, workerBOutcomes),
  ))
  const campaignTarget = Math.min(MAX_CAMPAIGN_COMPARISONS, campaignRemaining)

  const changeProblemClass = (next: string) => {
    setProblemClass(next)
    setLastRun(null)
    setCampaignCompleted(0)
    setLearner(null)
    const pair = defaultRoles(privateCases.filter(item => item.problemClass === next), state.roles)
    setRoleA(pair[0])
    setRoleB(pair[1])
  }

  const postComparison = async (caseId: string) => {
    const response = await fetch('/api/admin/cos-reasoning-comparison', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId, roles: [roleA, roleB] }),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || t('cos.reasoningComparison.runFailed', 'Reasoning comparison failed.'))
    return body as Record<string, unknown>
  }

  const runSingle = async () => {
    if (!nextCase || roleA === roleB) return
    setBusy('single')
    setError('')
    setLastRun(null)
    setCampaignCompleted(0)
    try {
      const body = await postComparison(nextCase.id)
      setLastRun(body)
      await fetchState()
      await fetchLearner(problemClass)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const runCampaign = async () => {
    if (!problemClass || roleA === roleB || campaignTarget <= 0) return
    setBusy('campaign')
    setError('')
    setLastRun(null)
    setCampaignCompleted(0)
    let snapshot = state
    let completed = 0
    let lastBody: Record<string, unknown> | null = null
    try {
      while (completed < campaignTarget) {
        const privateSnapshot = snapshot.cases.filter(item => item.origin === snapshot.privateSuiteOrigin)
        const candidate = nextDiverseCaseForProblemClass(privateSnapshot, snapshot.results, {
          problemClass,
          roles: [roleA, roleB],
          reasonerLabel: snapshot.currentReasoner,
          origin: snapshot.privateSuiteOrigin,
        }) as ComparisonCase | null
        if (!candidate) break

        lastBody = await postComparison(candidate.id)
        completed += 1
        setCampaignCompleted(completed)
        snapshot = await fetchState()
        const status = await fetchLearner(problemClass)
        if (status && status.status !== 'insufficient_evidence') break
      }
      setLastRun(lastBody ?? { ok: true, completed })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('cos.reasoningComparison.title', 'COS Reasoning Comparison')}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {t('cos.reasoningComparison.campaignSubtitle', 'Outcome-driven evidence campaigns grouped by the exact Phase 4 learner bucket. Private prompts remain hidden.')}
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
        <Card label={t('cos.reasoningComparison.eligibleBuckets', 'Learner buckets with enough diverse cases')} value={String(eligibleBuckets.length)} />
        <Card label={t('cos.reasoningComparison.evidenceGate', 'Verified outcomes required per candidate')} value={String(gate)} />
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t('cos.reasoningComparison.campaignTitle', 'Run a bounded evidence campaign')}</h2>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              {t('cos.reasoningComparison.campaignCostNote', 'A campaign runs up to four diverse comparisons sequentially. Every server request remains capped at exactly two model evaluations; the campaign stops on any error or as soon as Phase 4 reaches a verdict.')}
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-text-muted">
            {state.currentReasoner ? shortModel(state.currentReasoner) : t('cos.reasoningComparison.loadingReasoner', 'Loading reasoner…')}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('cos.reasoningComparison.bucketLabel', 'Phase 4 learner bucket')}</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={problemClass}
              onChange={event => changeProblemClass(event.target.value)}
              disabled={busy !== null || eligibleBuckets.length === 0}
            >
              {eligibleBuckets.map(item => (
                <option key={item.problemClass} value={item.problemClass}>{`${item.problemClass} (${item.cases} cases)`}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">{t('cos.reasoningComparison.workerA', 'Worker A')}</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={roleA}
              onChange={event => setRoleA(event.target.value as Role)}
              disabled={busy !== null}
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
              disabled={busy !== null}
            >
              {state.roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Card label={t('cos.reasoningComparison.bucketCases', 'Private cases in this bucket')} value={String(bucketCases.length)} />
          <Card label={t('cos.reasoningComparison.nextCase', 'Next diverse case')} value={nextCase ? `${nextCase.track} · ${nextCase.difficultyScore.toFixed(1)}` : '—'} />
          <Card label={t('cos.reasoningComparison.campaignCap', 'This campaign')} value={`${campaignTarget} ${t('cos.reasoningComparison.comparisons', 'comparison(s)')} · ${campaignTarget * 2} ${t('cos.reasoningComparison.modelEvaluations', 'model evaluations')}`} />
        </div>

        {roleA === roleB && (
          <p className="mt-3 text-sm text-danger">{t('cos.reasoningComparison.differentWorkers', 'Choose two different workers.')}</p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-danger/40 p-3 text-sm text-danger">{error}</p>
        )}
        {busy === 'campaign' && (
          <p className="mt-3 rounded-md border border-border p-3 text-sm text-text-muted">
            {`${t('cos.reasoningComparison.campaignProgress', 'Evidence campaign progress')} ${campaignCompleted}/${campaignTarget}`}
          </p>
        )}
        {lastRun && (
          <p className="mt-3 rounded-md border border-success/40 p-3 text-sm">
            {t('cos.reasoningComparison.completedNext', 'Comparison evidence was recorded and the next untested private case has been selected.')}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            disabled={busy !== null || !nextCase || roleA === roleB}
            onClick={() => void runSingle()}
          >
            {busy === 'single'
              ? t('cos.reasoningComparison.running', 'Running 2-worker comparison…')
              : t('cos.reasoningComparison.runOne', 'Run One Diverse Comparison')}
          </button>
          <button
            className="rounded-md border border-accent px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={busy !== null || campaignTarget <= 0 || roleA === roleB}
            onClick={() => void runCampaign()}
          >
            {busy === 'campaign'
              ? t('cos.reasoningComparison.campaignRunning', 'Running evidence campaign…')
              : `${t('cos.reasoningComparison.runCampaign', 'Run Evidence Campaign')} (${campaignTarget} × 2)`}
          </button>
          <button
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void fetchState().then(() => fetchLearner(problemClass)).catch(err => setError(err instanceof Error ? err.message : String(err)))}
          >
            {t('cos.reasoningComparison.refresh', 'Refresh Results')}
          </button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t('cos.reasoningComparison.verdictTitle', 'Phase 4 learner verdict')}</h2>
            <p className="mt-1 text-xs text-text-muted">{problemClass || '—'}</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
            {learner?.status ?? 'insufficient_evidence'}
          </span>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          {learner?.reason ?? t('cos.reasoningComparison.noLearnerEvidence', 'No verified worker/model evidence has been recorded for this learner bucket yet.')}
        </p>
        {learner?.status === 'learned' && learner.recommendedWorkerRole && (
          <p className="mt-3 rounded-md border border-success/40 p-3 text-sm">
            {`${t('cos.reasoningComparison.learnedRecommendation', 'Learned recommendation:')} ${learner.recommendedWorkerRole} · ${shortModel(learner.recommendedReasonerLabel)}`}
          </p>
        )}
        {evidenceFloorReached && learner?.status === 'insufficient_evidence' && (
          <p className="mt-3 rounded-md border border-warning/40 p-3 text-sm text-warning">
            {t('cos.reasoningComparison.floorAwaitingVerdict', 'Both selected candidates reached the evidence floor, but the learner status has not produced a promotion decision yet. Refresh before running more evidence.')}
          </p>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Card label={`${roleA} · ${t('cos.reasoningComparison.verifiedOutcomes', 'verified outcomes')}`} value={`${workerAOutcomes}/${gate}`} />
          <Card label={`${roleA} · ${t('cos.reasoningComparison.distinctCases', 'distinct cases')}`} value={`${workerADiverse}/${bucketCases.length}`} />
          <Card label={`${roleB} · ${t('cos.reasoningComparison.verifiedOutcomes', 'verified outcomes')}`} value={`${workerBOutcomes}/${gate}`} />
          <Card label={`${roleB} · ${t('cos.reasoningComparison.distinctCases', 'distinct cases')}`} value={`${workerBDiverse}/${bucketCases.length}`} />
        </div>

        {currentModelCandidates.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-text-muted">
                <tr className="border-b border-border">
                  <th className="px-2 py-2">{t('cos.reasoningComparison.worker', 'Worker')}</th>
                  <th className="px-2 py-2">{t('cos.reasoningComparison.verified', 'Verified')}</th>
                  <th className="px-2 py-2">{t('cos.reasoningComparison.successRate', 'Success rate')}</th>
                  <th className="px-2 py-2">{t('cos.reasoningComparison.qualityScore', 'Quality score')}</th>
                  <th className="px-2 py-2">{t('cos.reasoningComparison.avgLatency', 'Average latency')}</th>
                </tr>
              </thead>
              <tbody>
                {currentModelCandidates.map(candidate => (
                  <tr className="border-b border-border/60" key={`${candidate.workerRole}-${candidate.reasonerLabel}`}>
                    <td className="px-2 py-2 font-medium">{candidate.workerRole}</td>
                    <td className="px-2 py-2">{candidate.verifiedOutcomes}</td>
                    <td className="px-2 py-2">{percent(candidate.successRate)}</td>
                    <td className="px-2 py-2">{percent(candidate.qualityScore)}</td>
                    <td className="px-2 py-2">{`${Math.round(candidate.averageLatencyMs).toLocaleString()} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
              {state.results.slice(0, 40).map((item, index) => (
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
                <tr><td className="px-2 py-4 text-text-muted" colSpan={7}>{t('cos.reasoningComparison.noResults', 'No controlled comparisons have been run yet.')}</td></tr>
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
                <span className="font-medium">{Array.isArray(run.candidate_roles) ? run.candidate_roles.join(' vs ') : t('cos.reasoningComparison.comparison', 'comparison')}</span>
                <span className="text-xs text-text-muted">{run.status}</span>
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {`${t('cos.reasoningComparison.attempted', 'attempted')} ${run.attempted} · ${t('cos.reasoningComparison.verified', 'verified')} ${run.verified} · ${t('cos.reasoningComparison.passed', 'passed')} ${run.passed}`}
              </div>
              {run.error && <div className="mt-2 text-xs text-danger">{run.error}</div>}
            </div>
          ))}
          {state.runs.length === 0 && <p className="text-text-muted">{t('cos.reasoningComparison.noRuns', 'No comparison runs yet.')}</p>}
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
