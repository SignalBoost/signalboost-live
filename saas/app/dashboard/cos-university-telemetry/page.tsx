'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

type OpenSource = {
  id: string
  name: string
  integration: 'implemented' | 'candidate'
  status: 'observed' | 'implemented' | 'candidate'
  vectorSpace: string | null
  mode: string
  items24h: number
  embedded24h: number
  latestAt: string | null
  sourceAccessCostUsd24h: number
}

type WorkingCos = {
  bundleReady: boolean
  bundleKey: string | null
  portableManifestHash: string | null
  itemCount: number
  subjectCount: number
  subjectIds: string[]
  blockers: string[]
  automaticTrainingAuthorized: boolean
  productionTrafficAuthorized: boolean
  nextGate: string
  runtimeBindingEligible?: boolean
  runtimeBindingBlockers?: string[]
  runtimeBindingSource?: string | null
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

type Residency = { residencyId:string; candidateId:string; subject:string; artifactId:string; artifactHash:string; programId:string; programVersion:string; standing:string; demonstratedCompetencies:number; competenciesObserved:number; totalCompetencies:number; completedCases:number; realOutcomes:number; infrastructureFailures:number; latestCase:{competency:string;family:string;status:string;outcome:string|null;failureCode:string|null;startedAt:string|null;completedAt:string|null}|null; admittedAt:string|null; completedAt:string|null; remediationRequiredAt:string|null; updatedAt:string|null }

type Artifact = {
  candidateId: string
  subject: string
  status: string
  artifactId: string | null
  artifactHash: string | null
  revisionKey: string | null
  ageSeconds: number | null
  retentionEligibleAt: string | null
  claimability: string
  currentStage: string
  blocker: string
  nextAction: string
  residency: Residency | null
  evaluation: {
    evaluatedAt: string | null
    artifactAgeSeconds: number
    baselineScore: number
    artifactScore: number
    holdoutImproved: boolean
    safetyPassed: boolean
    unseenTransferPassed: boolean
    delayedRetentionPassed: boolean
  } | null
  graduate: {
    status: string
    runtimeProvider: string | null
    runtimeModelId: string | null
    promotedAt: string | null
    activatedAt: string | null
    updatedAt: string | null
  } | null
  updatedAt: string | null
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
    openSourceItems24h?: number
  }
  openSources?: OpenSource[]
  workingCos?: WorkingCos
  providers?: Provider[]
  runs?: Run[]
  artifacts?: Artifact[]
  residency?: Residency[]
  pipeline?: { residencyTotal?:number; residencyResidents?:number; residencyRemediation?:number; residencyComplete?:number; residencyFailed?:number; activeGraduates?:number; evaluationPending?:number; quarantined?:number }
  workforce?: { available?:boolean; onCall?:number; retired?:number; workers?:Array<{ candidateId:string; specialty:string; jobRoles:string[]; hiredAt:string|null }> }
  quarantine?: {
    total?:number; finalResults?:number; pendingCorrection?:number
    byReason?: Partial<Record<'exam_failed'|'residency_failed'|'exhausted_real_failures'|'exhausted_our_errors'|'exam_data_defect'|'no_recorded_reason', number>>
    returnedToExam?: { total?:number; waitingForExam?:number; passedExam?:number; quarantinedAgain?:number; other?:number }
    review?: { available?:boolean; ran?:boolean; outcome?:string|null; reason?:string|null; observedAt?:string|null; checked?:number; restored?:number; error?:string|null }
    resolution?: { available?:boolean; ran?:boolean; outcome?:string|null; observedAt?:string|null; dismissed?:number; returnedToExam?:number; heldForInvestigation?:number; error?:string|null }
    leftUniversity?: { total?:number; byReason?: Partial<Record<'exam_failed'|'residency_failed'|'exhausted_real_failures'|'exhausted_our_errors'|'exam_data_defect'|'no_recorded_reason'|'xsa_not_examinable', number>> }
    why?: {
      examGates?: Partial<Record<'holdout'|'safety'|'transfer'|'retention', number>>
      residencyCompetencies?: Array<{ competency:string; count:number }>
      topErrors?: Array<{ error:string; count:number }>
    }
  }
}

const REFRESH_MS = 60_000
const MAX_REFRESH_MS = 300_000

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

function gateLabel(value: string | null | undefined): string {
  return String(value || '—').replaceAll('_', ' ')
}

function openSourceDetail(source: OpenSource): string {
  const raw = String(source.vectorSpace || source.mode || '—')
  return source.vectorSpace ? raw : raw.replaceAll('_', ' ')
}


function short(value: string | null | undefined, length = 12): string {
  const text = String(value || '')
  return text.length <= length ? text : text.slice(0, length) + '…'
}

function mixLabel(mix: Record<string, number>): string {
  const preferred = ['openai', 'claude', 'grok', 'gemini', 'deepseek', 'qwen']
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
  const [workingCosAction, setWorkingCosAction] = useState<'prepare_dataset' | 'train' | null>(null)
  const [workingCosActionStatus, setWorkingCosActionStatus] = useState('')
  const inFlight = useRef(false)
  const consecutiveFailures = useRef(0)

  const load = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return true
    inFlight.current = true
    setBusy(true)
    try {
      const response = await fetch('/api/admin/cos-university-telemetry', {
        cache: 'no-store',
        credentials: 'include',
      })
      const body = await response.json().catch(() => ({})) as Telemetry
      setData(body)
      const ok = response.ok && body.ok === true
      setError(ok ? '' : body.error || copy.requestFailed)
      consecutiveFailures.current = ok ? 0 : consecutiveFailures.current + 1
      return ok
    } catch (err) {
      consecutiveFailures.current += 1
      setError(err instanceof Error ? err.message : copy.requestFailed)
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [copy.requestFailed])

  const runWorkingCosAction = useCallback(async (operation: 'prepare_dataset' | 'train') => {
    setWorkingCosAction(operation)
    setWorkingCosActionStatus('')
    try {
      const response = await fetch('/api/admin/cos-working-distillation', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, confirmDispatch: true }),
      })
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok || body.ok !== true) {
        throw new Error(String(body.error || copy.requestFailed))
      }
      const jobId = typeof body.jobId === 'string' ? body.jobId : ''
      setWorkingCosActionStatus(
        operation === 'prepare_dataset'
          ? `${copy.workingCosPreparationAccepted}${jobId ? ' · ' + jobId : ''}`
          : `${copy.workingCosTrainingAccepted}${jobId ? ' · ' + jobId : ''}`,
      )
      await load()
    } catch (err) {
      setWorkingCosActionStatus(err instanceof Error ? err.message : copy.requestFailed)
    } finally {
      setWorkingCosAction(null)
    }
  }, [copy.requestFailed, copy.workingCosPreparationAccepted, copy.workingCosTrainingAccepted, load])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      const ok = await load()
      if (cancelled) return
      const delay = ok
        ? REFRESH_MS
        : Math.min(MAX_REFRESH_MS, REFRESH_MS * (2 ** Math.min(consecutiveFailures.current, 3)))
      timer = window.setTimeout(() => { void tick() }, delay)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [load])

  const summary = data?.summary || {}
  const providers = data?.providers || []
  const openSources = data?.openSources || []
  const workingCos = data?.workingCos || null
  const runs = data?.runs || []
  const artifacts = data?.artifacts || []
  const residency = data?.residency || []
  const pipeline = data?.pipeline || {}
  const workforce = data?.workforce || {}
  const quarantine = data?.quarantine || {}
  const quarantineReasons = quarantine.byReason || {}
  const quarantineReturned = quarantine.returnedToExam || {}
  const quarantineReview = quarantine.review || {}
  const quarantineResolution = quarantine.resolution || {}
  const leftUniversity = quarantine.leftUniversity || {}
  const leftReasons = leftUniversity.byReason || {}
  const why = quarantine.why || {}
  const whyGates = why.examGates || {}
  // Residency FAILs are results: they leave the University with the quarantine resolution and are counted there.
  const residencyInUniversity = residency.filter(row => row.standing !== 'residency_failed')

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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card label={copy.teacherOutputs24h} value={String(summary.teacherOutputs24h ?? '—')} />
        <Card label={copy.openSourceItems24h} value={String(summary.openSourceItems24h ?? '—')} />
        <Card label={copy.completedRuns24h} value={String(summary.completedRuns24h ?? '—')} />
        <Card label={copy.inFlight24h} value={String(summary.inFlightRuns24h ?? '—')} />
        <Card label={copy.failedRuns24h} value={String(summary.failedRuns24h ?? '—')} />
        <Card label={copy.hfObservedCost24h} value={money(summary.hfObservedCostUsd24h)} />
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-4">
          <h2 className="font-semibold">{copy.workingCosTitle}</h2>
          <p className="text-xs opacity-65">{copy.workingCosExplanation}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label={copy.workingCosBundleReady} value={workingCos ? (workingCos.bundleReady ? copy.pass : copy.pending) : '—'} />
          <Card label={copy.workingCosSubjects} value={workingCos ? String(workingCos.subjectCount) : '—'} />
          <Card label={copy.workingCosItems} value={workingCos ? String(workingCos.itemCount) : '—'} />
          <Card label={copy.workingCosNextGate} value={gateLabel(workingCos?.nextGate)} />
        </div>
        {workingCos?.subjectIds?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {workingCos.subjectIds.map(subject => (
              <span key={subject} className="rounded-full border px-2 py-1 text-xs">{subject}</span>
            ))}
          </div>
        ) : null}
        {workingCos?.blockers?.length ? (
          <div className="mt-3 text-xs text-amber-300">{workingCos.blockers.join(' · ')}</div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { void runWorkingCosAction('prepare_dataset') }}
            disabled={workingCosAction !== null || !workingCos?.bundleReady || workingCos?.runtimeBindingEligible === false}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {workingCosAction === 'prepare_dataset' ? copy.workingCosPreparing : copy.workingCosPrepare}
          </button>
          <button
            type="button"
            onClick={() => { void runWorkingCosAction('train') }}
            disabled={workingCosAction !== null || !workingCos?.bundleReady || workingCos?.runtimeBindingEligible === false}
            className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {workingCosAction === 'train' ? copy.workingCosTraining : copy.workingCosStartTraining}
          </button>
          <span className="text-xs opacity-65">{copy.workingCosActionWarning}</span>
        </div>
        {workingCosActionStatus ? (
          <div className="mt-3 rounded-md border p-3 text-xs">{workingCosActionStatus}</div>
        ) : null}
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
          <h2 className="font-semibold">{copy.openSourcesTitle}</h2>
          <p className="text-xs opacity-65">{copy.openSourcesExplanation}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {openSources.length ? openSources.map(source => (
            <div key={source.id} className="min-w-0 overflow-hidden rounded-lg border p-4">
              <div className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{source.name}</div>
              <div className="mt-1 max-w-full whitespace-normal break-words text-xs leading-5 opacity-65 [overflow-wrap:anywhere]">{openSourceDetail(source)}</div>
              <div className="mt-3 flex min-w-0 flex-wrap items-start gap-2 text-xs">
                <span className="max-w-full whitespace-normal break-words rounded-full border px-2 py-1 [overflow-wrap:anywhere]">{copy.openSourceStates[source.status] || source.status}</span>
                <span className="min-w-0 break-words opacity-55 [overflow-wrap:anywhere]">{copy.sourceAccessCost}: {money(source.sourceAccessCostUsd24h)}</span>
              </div>
              <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="opacity-60">{copy.acquiredItems}</span><br />
                  <strong className="text-xl tabular-nums">{source.items24h.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="opacity-60">{copy.embeddedItems}</span><br />
                  <strong className="text-xl tabular-nums">{source.embedded24h.toLocaleString()}</strong>
                </div>
              </div>
              <div className="mt-3 text-[11px] opacity-55">{copy.latest} {when(source.latestAt)}</div>
            </div>
          )) : <p className="text-sm opacity-65">{copy.noOpenSources}</p>}
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

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">University pipeline — live state</h2>
        <p className="mt-1 text-xs opacity-65">
          Training / distillation → artifact produced. Computer Science artifacts branch through Builder Residency;
          every other subject goes directly to independent evaluation. Both branches then converge on runtime verification,
          graduation and the Workforce.
        </p>
        <div className="mt-4 rounded-lg border p-3 text-xs">
          <div className="font-medium">Computer Science branch</div>
          <div className="mt-1 opacity-70">Artifact → Builder Residency → remediation when required → Residency complete → Evaluation</div>
          <div className="mt-3 font-medium">All other subjects</div>
          <div className="mt-1 opacity-70">Artifact → Evaluation</div>
          <div className="mt-3 font-medium">Shared downstream path</div>
          <div className="mt-1 opacity-70">Evaluation PASS → runtime verification → Graduation → Workforce</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Card label="CS Residency residents" value={String(pipeline.residencyResidents ?? 0)} />
          <Card label="CS Residency remediation" value={String(pipeline.residencyRemediation ?? 0)} />
          <Card label="CS Residency complete" value={String(pipeline.residencyComplete ?? 0)} />
          <Card label="Evaluation pending — both branches" value={String(pipeline.evaluationPending ?? 0)} />
          <Card label={copy.pipelinePassedGraduating} value={String(artifacts.filter(artifact => artifact.status === 'runtime_pending').length)} />
          <Card label={copy.pipelineGraduated} value={String(pipeline.activeGraduates ?? workforce.onCall ?? 0)} />
          <Card label="CS Residency failed" value={String(pipeline.residencyFailed ?? 0)} />
          <Card label="Quarantined" value={String(pipeline.quarantined ?? 0)} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">{copy.quarantineTitle}</h2>
        <p className="mt-1 text-xs opacity-65">{copy.quarantineExplanation}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Card label={copy.quarantineFinal} value={String(quarantine.finalResults ?? 0)} />
          <Card label={copy.quarantinePending} value={String(quarantine.pendingCorrection ?? 0)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Card label={copy.quarantineExamFailed} value={String(quarantineReasons.exam_failed ?? 0)} />
          <Card label={copy.quarantineResidencyFailed} value={String(quarantineReasons.residency_failed ?? 0)} />
          <Card label={copy.quarantineExhaustedReal} value={String(quarantineReasons.exhausted_real_failures ?? 0)} />
          <Card label={copy.quarantineExhaustedOurs} value={String(quarantineReasons.exhausted_our_errors ?? 0)} />
          <Card label={copy.quarantineDataDefect} value={String(quarantineReasons.exam_data_defect ?? 0)} />
          <Card label={copy.quarantineNoReason} value={String(quarantineReasons.no_recorded_reason ?? 0)} />
        </div>
        <p className="mt-4 text-sm">
          <span className="font-medium">{copy.quarantineReturned}: {quarantineReturned.total ?? 0}</span>
          <span className="opacity-70"> · {copy.quarantineReturnedWaiting} {quarantineReturned.waitingForExam ?? 0} · {copy.quarantineReturnedPassed} {quarantineReturned.passedExam ?? 0} · {copy.quarantineReturnedAgain} {quarantineReturned.quarantinedAgain ?? 0}</span>
        </p>
        <p className="mt-2 text-xs opacity-75">
          {!quarantineReview.ran
            ? copy.quarantineReviewNever
            : quarantineReview.outcome === 'failed'
              ? `${copy.quarantineReviewFailed} · ${when(quarantineReview.observedAt)} · ${quarantineReview.error || quarantineReview.reason || ''}`
              : `${copy.quarantineReviewLast} ${when(quarantineReview.observedAt)} · ${quarantineReview.restored ?? 0} ${copy.quarantineReviewRestored}`}
        </p>
        <p className="mt-1 text-xs opacity-75">
          {!quarantineResolution.ran
            ? copy.resolutionNever
            : quarantineResolution.outcome === 'failed'
              ? `${copy.resolutionFailed} · ${when(quarantineResolution.observedAt)} · ${quarantineResolution.error || ''}`
              : `${copy.resolutionLast} ${when(quarantineResolution.observedAt)} · ${quarantineResolution.dismissed ?? 0} ${copy.resolutionDismissed} · ${quarantineResolution.returnedToExam ?? 0} ${copy.resolutionReturned} · ${quarantineResolution.heldForInvestigation ?? 0} ${copy.resolutionHeld}`}
        </p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">{copy.whyTitle}</h2>
        <h3 className="mt-3 text-xs font-medium uppercase opacity-60">{copy.whyExamGates}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label={copy.whyHoldout} value={String(whyGates.holdout ?? 0)} />
          <Card label={copy.whySafety} value={String(whyGates.safety ?? 0)} />
          <Card label={copy.whyTransfer} value={String(whyGates.transfer ?? 0)} />
          <Card label={copy.whyRetention} value={String(whyGates.retention ?? 0)} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase opacity-60">{copy.whyResidency}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {(why.residencyCompetencies || []).map(item => (
                <li key={item.competency} className="flex justify-between gap-3"><span>{gateLabel(item.competency)}</span><span className="font-mono">{item.count}</span></li>
              ))}
              {!(why.residencyCompetencies || []).length ? <li className="opacity-60">{copy.whyNone}</li> : null}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase opacity-60">{copy.whyErrors}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {(why.topErrors || []).map(item => (
                <li key={item.error} className="flex justify-between gap-3"><span className="break-all font-mono text-xs">{item.error}</span><span className="font-mono">{item.count}</span></li>
              ))}
              {!(why.topErrors || []).length ? <li className="opacity-60">{copy.whyNone}</li> : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">{copy.leftTitle}</h2>
        <p className="mt-1 text-xs opacity-65">{copy.leftExplanation}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card label={copy.leftTotal} value={String(leftUniversity.total ?? 0)} />
          <Card label={copy.quarantineExamFailed} value={String(leftReasons.exam_failed ?? 0)} />
          <Card label={copy.quarantineResidencyFailed} value={String(leftReasons.residency_failed ?? 0)} />
          <Card label={copy.quarantineExhaustedReal} value={String(leftReasons.exhausted_real_failures ?? 0)} />
          <Card label={copy.leftUnexaminable} value={String((leftReasons.exam_data_defect ?? 0) + (leftReasons.xsa_not_examinable ?? 0))} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">{copy.workforceTitle}</h2>
        <p className="mt-1 text-xs opacity-65">{copy.workforceExplanation}</p>
        {workforce.available === false ? (
          <p className="mt-4 text-sm opacity-65">{copy.workforceUnavailable}</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Card label={copy.workforceOnCall} value={String(workforce.onCall ?? 0)} />
              <Card label={copy.workforceRetired} value={String(workforce.retired ?? 0)} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(workforce.workers || []).map(worker => (
                <div key={worker.candidateId} className="rounded-lg border p-3 text-xs">
                  <div className="font-semibold">{worker.specialty}</div>
                  <div className="mt-1 font-mono opacity-60">{short(worker.candidateId, 28)}</div>
                  <div className="mt-2">{worker.jobRoles.join(' · ') || '—'}</div>
                  <div className="mt-1 opacity-70">{copy.workforceHired} {when(worker.hiredAt)}</div>
                </div>
              ))}
              {!(workforce.workers || []).length ? <p className="text-sm opacity-60">{copy.workforceNone}</p> : null}
            </div>
          </>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Builder Residency — live cohort</h2>
        <p className="mt-1 text-xs opacity-65">Every enrolled Computer Science artifact and its durable progress.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{residencyInUniversity.map(row => <div key={row.residencyId} className="rounded-lg border p-3 text-xs"><div className="font-semibold">{gateLabel(row.standing)} · {row.demonstratedCompetencies}/{row.totalCompetencies} competencies</div><div className="mt-1 font-mono opacity-60">{short(row.candidateId,28)}</div><div className="mt-2">{row.completedCases} cases · {row.realOutcomes} real outcomes · {row.infrastructureFailures} infrastructure failures</div><div className="mt-1">Latest: {row.latestCase ? gateLabel(row.latestCase.outcome || row.latestCase.status) : 'no case yet'}</div><div className="mt-1 font-medium">Next: {row.standing === 'residency_complete' ? 'fresh exact-artifact canary' : row.standing === 'residency_failed' ? 'none — Residency FAIL (final)' : row.standing === 'remediation_required' ? 'remediation case' : 'continue competency cases'}</div></div>)}</div>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-4">
          <h2 className="font-semibold">{copy.artifactsTitle}</h2>
          <p className="text-xs opacity-65">{copy.artifactsExplanation}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b text-xs uppercase opacity-60">
              <tr>
                <th className="pb-3 pr-4">{copy.subject}</th>
                <th className="pb-3 pr-4">{copy.artifactStatus}</th><th className="pb-3 pr-4">Current stage</th><th className="pb-3 pr-4">Blocker</th><th className="pb-3 pr-4">Next action</th>
                <th className="pb-3 pr-4">{copy.retentionGate}</th>
                <th className="pb-3 pr-4">{copy.claimability}</th>
                <th className="pb-3 pr-4">{copy.holdout}</th>
                <th className="pb-3 pr-4">{copy.safety}</th>
                <th className="pb-3 pr-4">{copy.transfer}</th>
                <th className="pb-3 pr-4">{copy.retention}</th>
                <th className="pb-3 pr-4">{copy.graduation}</th>
                <th className="pb-3">{copy.updated}</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map(artifact => (
                <tr key={artifact.candidateId + ':' + artifact.artifactHash} className="border-b border-white/10 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{artifact.subject || copy.unknownSubject}</div>
                    <div className="mt-1 font-mono text-[11px] opacity-50">{short(artifact.candidateId, 20)}</div>
                  </td>
                  <td className="py-3 pr-4"><span className="rounded-full border px-2 py-1 text-xs">{artifact.status || copy.unknownStage}</span></td><td className="py-3 pr-4 text-xs font-medium">{artifact.currentStage}</td><td className="py-3 pr-4 text-xs">{gateLabel(artifact.blocker)}</td><td className="py-3 pr-4 text-xs">{artifact.nextAction}</td>
                  <td className="py-3 pr-4 text-xs">{when(artifact.retentionEligibleAt)}</td>
                  <td className="py-3 pr-4 text-xs font-medium">{copy.claimabilityStates[artifact.claimability] || artifact.claimability}</td>
                  <td className="py-3 pr-4 text-xs">{artifact.evaluation ? (artifact.evaluation.holdoutImproved ? copy.pass : copy.fail) : copy.pending}</td>
                  <td className="py-3 pr-4 text-xs">{artifact.evaluation ? (artifact.evaluation.safetyPassed ? copy.pass : copy.fail) : copy.pending}</td>
                  <td className="py-3 pr-4 text-xs">{artifact.evaluation ? (artifact.evaluation.unseenTransferPassed ? copy.pass : copy.fail) : copy.pending}</td>
                  <td className="py-3 pr-4 text-xs">{artifact.evaluation ? (artifact.evaluation.delayedRetentionPassed ? copy.pass : copy.fail) : copy.pending}</td>
                  <td className="py-3 pr-4 text-xs">{artifact.graduate?.status || copy.notGraduated}</td>
                  <td className="py-3 text-xs opacity-65">{when(artifact.updatedAt)}</td>
                </tr>
              ))}
              {!artifacts.length ? <tr><td colSpan={13} className="py-6 text-center text-sm opacity-60">{copy.noArtifacts}</td></tr> : null}
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
    <div className="min-w-0 rounded-lg border p-4">
      <div className="text-xs opacity-60">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ overflowWrap: 'anywhere' }}>{value}</div>
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
