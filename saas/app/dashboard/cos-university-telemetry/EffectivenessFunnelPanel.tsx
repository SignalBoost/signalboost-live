// saas/app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx
//
// The Artifact Effectiveness Funnel on the University telemetry page. Read-only; every row shows its source table.
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EffectivenessFunnel, FunnelWindow } from '@/lib/ai/cos/cosUniversityEffectivenessFunnel'
import type { CosUniversityFunnelCopy } from '@/lib/i18n/cosUniversityFunnelCopy'
import { uiText } from '@/lib/i18n/uiText'


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

          <div className="rounded-lg border p-3" data-testid="capability-gain">
            <div className="font-semibold">{copy.capabilityTitle}</div>
            {f.capabilityGain.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="opacity-60">{copy.capabilityComparable}:</span> {f.capabilityGain.sampleSize}</div>
                  <div><span className="opacity-60">{copy.capabilityMeanBaseline}:</span> {f.capabilityGain.meanBaseline === null ? '—' : f.capabilityGain.meanBaseline.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.capabilityMeanTrained}:</span> {f.capabilityGain.meanTrained === null ? '—' : f.capabilityGain.meanTrained.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.capabilityMeanGain}:</span> {f.capabilityGain.meanAbsoluteGain === null ? '—' : (f.capabilityGain.meanAbsoluteGain >= 0 ? '+' : '') + f.capabilityGain.meanAbsoluteGain.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.capabilityMedianGain}:</span> {f.capabilityGain.medianAbsoluteGain === null ? '—' : (f.capabilityGain.medianAbsoluteGain >= 0 ? '+' : '') + f.capabilityGain.medianAbsoluteGain.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.capabilityImproved}:</span> {f.capabilityGain.improved}</div>
                  <div><span className="opacity-60">{copy.capabilityUnchangedRegressed}:</span> {f.capabilityGain.unchanged} / {f.capabilityGain.regressed}</div>
                  <div><span className="opacity-60">{copy.capabilityPositiveRate}:</span> {f.capabilityGain.positiveGainRate === null ? '—' : Math.round(f.capabilityGain.positiveGainRate * 100) + '%'}</div>
                </div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.capabilityGain.source} · {copy.methodology}: {f.capabilityGain.methodology}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.capabilityGain.error}</p>}
          </div>

          <div className="rounded-lg border p-3" data-testid="comparative-benchmark">
            <div className="font-semibold">{copy.benchmarkTitle}</div>
            {f.comparativeBenchmark.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="opacity-60">{copy.capabilityComparable}:</span> {f.comparativeBenchmark.comparableArtifacts}</div>
                  <div><span className="opacity-60">{copy.benchmarkBaselineUniversity}:</span> {f.comparativeBenchmark.baselineMean === null ? '—' : f.comparativeBenchmark.baselineMean.toFixed(3)} / {f.comparativeBenchmark.universityMean === null ? '—' : f.comparativeBenchmark.universityMean.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.benchmarkGain}:</span> {f.comparativeBenchmark.absoluteGain === null ? '—' : (f.comparativeBenchmark.absoluteGain >= 0 ? '+' : '') + f.comparativeBenchmark.absoluteGain.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.benchmarkResidencySubset}:</span> {f.comparativeBenchmark.residencyCompletedComparable} / {f.comparativeBenchmark.residencyCompletedMean === null ? '—' : f.comparativeBenchmark.residencyCompletedMean.toFixed(3)}</div>
                  <div><span className="opacity-60">{copy.benchmarkProductionSubset}:</span> {f.comparativeBenchmark.productionGraduatesComparable} / {f.comparativeBenchmark.productionGraduatesMean === null ? '—' : f.comparativeBenchmark.productionGraduatesMean.toFixed(3)}</div>
                </div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.comparativeBenchmark.source} · {copy.methodology}: {f.comparativeBenchmark.methodology}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.comparativeBenchmark.error}</p>}
          </div>

          <div className="rounded-lg border p-3" data-testid="governance-assurance">
            <div className="font-semibold">{copy.governanceTitle}</div>
            {f.governanceAssurance.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="opacity-60">{copy.governanceAuthorityExpansion}:</span> {f.governanceAssurance.authorityExpansionObserved}</div>
                  <div><span className="opacity-60">{copy.governanceEvidenceChain}:</span> {f.governanceAssurance.repositoryEvidenceEntries} / {f.governanceAssurance.repositoryEvidenceChainValid === null ? uiText('generatedUi.u_bc4b37fda072c7fe') : f.governanceAssurance.repositoryEvidenceChainValid ? uiText('generatedUi.u_f7496f1fc9731f2e') : uiText('generatedUi.u_d84771511dbeaa73')}</div>
                  <div><span className="opacity-60">{copy.governanceControls}:</span> {uiText('generatedUi.u_ef4ba6f0d5afc9e8')}</div>
                  <div><span className="opacity-60">{copy.governancePentest}:</span> {f.governanceAssurance.thirdPartyPenetrationTest}</div>
                </div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.governanceAssurance.source} · {copy.methodology}: {f.governanceAssurance.methodology}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.governanceAssurance.error}</p>}
          </div>

          <div className="rounded-lg border p-3" data-testid="serving-reliability">
            <div className="font-semibold">{copy.reliabilityTitle}</div>
            {f.reliability.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="opacity-60">{copy.reliabilityAttempts}:</span> {f.reliability.attempts}</div>
                  <div><span className="opacity-60">{copy.reliabilityDirectSuccess}:</span> {f.reliability.successRate === null ? '—' : Math.round(f.reliability.successRate * 100) + '%'}</div>
                  <div><span className="opacity-60">{copy.reliabilityFailuresFallbacks}:</span> {f.reliability.failures} / {f.reliability.fallbacks}</div>
                  <div><span className="opacity-60">{copy.reliabilityLatency}:</span> {f.reliability.p50LatencyMs ?? '—'} / {f.reliability.p90LatencyMs ?? '—'} / {f.reliability.p99LatencyMs ?? '—'} {uiText('generatedUi.u_f785c3ce1d580c8f')}</div>
                  <div><span className="opacity-60">{copy.reliabilityOver15s}:</span> {f.reliability.over15s}</div>
                  <div className="sm:col-span-3 font-mono text-xs" style={{ overflowWrap: 'anywhere' }}><span className="opacity-60">{copy.reliabilityOutcomes}:</span> {counts(f.reliability.byOutcome)} · <span className="opacity-60">{copy.reliabilityErrors}:</span> {counts(f.reliability.byErrorClass)}</div>
                </div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.reliability.source} · {copy.methodology}: {f.reliability.methodology}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.reliability.error}</p>}
          </div>

          <div className="rounded-lg border p-3" data-testid="assembly-line-health">
            <div className="font-semibold">{copy.lineHealthTitle}</div>
            {f.lineHealth.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-5 text-sm">
                  <div><span className="opacity-60">{copy.lineLive}:</span> {f.lineHealth.liveUnits}</div>
                  <div><span className="opacity-60">{copy.lineOverdue}:</span> {f.lineHealth.overdueUnits}</div>
                  <div><span className="opacity-60">{copy.lineLeased}:</span> {f.lineHealth.leasedUnits}</div>
                  <div><span className="opacity-60">{copy.lineOldestWait}:</span> {f.lineHealth.oldestWaitingSeconds === null ? '—' : Math.round(f.lineHealth.oldestWaitingSeconds / 60) + uiText('generatedUi.u_1f6fa6f69d185e60')}</div>
                  <div><span className="opacity-60">{copy.lineBottleneck}:</span> {f.lineHealth.bottleneckStation || '—'}</div>
                </div>
                <div className="mt-2 text-xs"><span className="opacity-60">{copy.lineStations}:</span> {Object.entries(f.lineHealth.byStation).sort((a, b) => b[1].waiting - a[1].waiting).map(([station, row]) => station + ' ' + row.waiting + ' (' + row.overdue + ' overdue, ' + row.leased + ' leased)').join(' · ') || '—'}</div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.lineHealth.source} · {copy.methodology}: {f.lineHealth.methodology}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.lineHealth.error}</p>}
          </div>

          <div className="rounded-lg border p-3" data-testid="throughput-recovery">
            <div className="font-semibold">{copy.flowTitle}</div>
            {f.lineHistory.available ? (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="opacity-60">{copy.flowTransitions}:</span> {f.lineHistory.transitions}</div>
                  <div><span className="opacity-60">{copy.flowThroughput}:</span> {f.lineHistory.throughputPerHour === null ? '—' : f.lineHistory.throughputPerHour.toFixed(2) + '/h'}</div>
                  <div><span className="opacity-60">{copy.flowRecovered}:</span> {f.lineHistory.recoveredOverdue}</div>
                  <div><span className="opacity-60">{copy.flowMeanRecovery}:</span> {f.lineHistory.meanRecoverySeconds === null ? '—' : Math.round(f.lineHistory.meanRecoverySeconds / 60) + uiText('generatedUi.u_1f6fa6f69d185e60')}</div>
                  <div><span className="opacity-60">{copy.flowMedianRecovery}:</span> {f.lineHistory.medianRecoverySeconds === null ? '—' : Math.round(f.lineHistory.medianRecoverySeconds / 60) + uiText('generatedUi.u_1f6fa6f69d185e60')}</div>
                  <div><span className="opacity-60">{copy.flowP90Recovery}:</span> {f.lineHistory.p90RecoverySeconds === null ? '—' : Math.round(f.lineHistory.p90RecoverySeconds / 60) + uiText('generatedUi.u_1f6fa6f69d185e60')}</div>
                  <div className="sm:col-span-2"><span className="opacity-60">{copy.flowDwell}:</span> {f.lineHistory.p50DwellSeconds === null ? '—' : [f.lineHistory.p50DwellSeconds, f.lineHistory.p90DwellSeconds, f.lineHistory.p99DwellSeconds].map(seconds => seconds === null ? '—' : Math.round(seconds / 60) + ' min').join(' / ')}</div>
                  <div className="sm:col-span-2"><span className="opacity-60">{copy.flowByStation}:</span> {counts(f.lineHistory.byFromStation)}</div>
                </div>
                <div className="mt-1 text-[10px] opacity-50">{copy.source}: {f.lineHistory.source} · {copy.methodology}: {f.lineHistory.methodology}</div>
              </>
            ) : <p className="text-xs" role="alert">{f.lineHistory.error}</p>}
          </div>

          <div className="rounded-lg border p-3" data-testid="buyer-assurance-scorecard">
            <div className="font-semibold">{copy.assuranceTitle}</div>
            <div className="mt-2 grid gap-3 lg:grid-cols-2 text-sm">
              <div><b>{copy.assuranceResidency}</b>{f.residencyEffectiveness.available ? <><div>{copy.assuranceCompleted}: {f.residencyEffectiveness.completed} / {f.residencyEffectiveness.enrollments}</div><div>{copy.assuranceCases}: {f.residencyEffectiveness.casesPassed} / {f.residencyEffectiveness.caseRuns}</div><div>{copy.assuranceCasePassRate}: {f.residencyEffectiveness.casePassRate === null ? '—' : Math.round(f.residencyEffectiveness.casePassRate * 100) + '%'}</div><div>{copy.assuranceCompetencyEvidence}: {f.residencyEffectiveness.competencyEvidence}</div></> : <div role="alert">{f.residencyEffectiveness.error}</div>}</div>
              <div><b>{copy.assuranceWorkforce}</b>{f.workforceEffectiveness.available ? <><div>{copy.assuranceAssignments}: {f.workforceEffectiveness.assignments}</div><div>{copy.assuranceVerified}: {f.workforceEffectiveness.verified} · {copy.assuranceRemediation}: {f.workforceEffectiveness.remediation}</div><div>{copy.assuranceRuntimeFailed}: {f.workforceEffectiveness.runtimeFailed} · {copy.assuranceAwaiting}: {f.workforceEffectiveness.servedAwaitingVerification}</div></> : <div role="alert">{f.workforceEffectiveness.error}</div>}</div>
              <div><b>{copy.assuranceEconomics}</b>{f.economics.available ? <><div>{copy.assuranceObservedCost}: {'$' + f.economics.observedProviderCostUsd.toFixed(2)}</div><div>{copy.assuranceSettledJobs}: {f.economics.settledProviderJobs}</div><div>{copy.assuranceCostGraduate}: {f.economics.costPerGraduatedArtifactUsd === null ? '—' : '$' + f.economics.costPerGraduatedArtifactUsd.toFixed(2)}</div><div>{copy.assuranceCoverage}: {f.economics.coverage}</div></> : <div role="alert">{f.economics.error}</div>}</div>
              <div><b>{copy.assuranceProvenance}</b>{f.provenance.available ? <><div>{copy.assuranceTraceable}: {f.provenance.traceableGraduates} / {f.provenance.graduates}</div><div>{copy.assurancePermanentAssignments}: {f.provenance.workforceAssignmentsWithPermanentId}</div></> : <div role="alert">{f.provenance.error}</div>}</div>
            </div>
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

          <div className="rounded-lg border p-3 text-xs" data-testid="operational-explanation">
            <div className="font-semibold">{copy.operationalTitle}</div>
            {f.operationalExplanation.available ? (
              <div className="mt-2 space-y-1">
                <div><b>{copy.operationalState}:</b> {f.operationalExplanation.state} · <b>{copy.operationalClassification}:</b> {f.operationalExplanation.classification} · <b>{copy.operationalCauseStatus}:</b> {f.operationalExplanation.causeStatus}</div>
                <div><b>{copy.operationalWhy}:</b> {f.operationalExplanation.cause}</div>
                <div><b>{copy.operationalImpact}:</b> {f.operationalExplanation.impact}</div>
                <div><b>{copy.operationalSystemResponse}:</b> {f.operationalExplanation.systemResponse}</div>
                <div><b>{copy.operationalBuyerMeaning}:</b> {f.operationalExplanation.buyerMeaning}</div>
                <div className="font-mono text-[10px]">{copy.operationalActiveCampaigns}={f.operationalExplanation.activeCampaigns} · {copy.operationalUnsettledJobs}={f.operationalExplanation.unsettledProviderJobs} · {copy.operationalOverdueJobs}={f.operationalExplanation.overdueProviderJobs} · {copy.operationalAutoRecovery}={String(f.operationalExplanation.automaticRecoveryAuthorized)}</div>
                {f.operationalExplanation.reasons.length ? <div className="font-mono text-[10px]">{copy.operationalReasons}: {f.operationalExplanation.reasons.join(', ')}</div> : null}
                <div className="text-[10px] opacity-50">{copy.source}: {f.operationalExplanation.source}</div>
              </div>
            ) : <p role="alert">{f.operationalExplanation.error}</p>}
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
                  <div className="mt-3 space-y-2" data-testid="evaluation-causal-explanations">
                    {f.evaluationFailures.explanations.map(item => (
                      <div key={item.reason} className="rounded border p-2">
                        <div className="font-mono text-[10px]" style={{ overflowWrap: 'anywhere' }}>{item.reason} × {item.count}</div>
                        <div className="mt-1"><b>{uiText('generatedUi.u_dc3d2ce7d8a25ca4')}</b> {item.attribution} · <b>{uiText('generatedUi.u_1a39eedbb9df45e9')}</b> {item.causeStatus}</div>
                        <div><b>{uiText('generatedUi.u_ad389aa4c08e3d7c')}</b> {item.cause}</div>
                        <div><b>{uiText('generatedUi.u_caa811e967d61158')}</b> {item.impact}</div>
                        <div><b>{uiText('generatedUi.u_78a5353147445dec')}</b> {item.systemResponse}</div>
                        <div><b>{copy.operationalBuyerMeaning}:</b> {item.buyerMeaning}</div>
                      </div>
                    ))}
                  </div>
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
