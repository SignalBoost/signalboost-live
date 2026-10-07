// saas/lib/ai/cos/cosUniversityStep1Evidence.ts
//
// Step 1 evidence report: the current University factory measured against the owner's Step 1 exit criterion.
//
// Owner, 2026-10-06 (scope): "the main goal is to commercialize my portable/software so users can create, train and
// distil not make the artifacts created to work on my platform, it will be the next project". Step 1 is therefore the
// FACTORY a buyer uses - creation, curriculum/distillation, training, independent examination, Builder Residency and
// graduation - running end to end with failures correctly attributed and standards unweakened. Graduates serving work
// and independently verified Production outcomes belong to the NEXT project: they are still printed here, marked
// next_project, and never block Step 1.
// Owner, 2026-10-06: "COS can recommend READY / NOT READY, but it should not silently declare the project phase
// complete." The declaration belongs to the owner.
//
// This module is pure. It reads the Artifact Effectiveness Funnel (the tables' own record) and states, per criterion,
// whether evidence is present, absent, unreadable, or not measurable from a single snapshot. It never sets a
// threshold the owner has not set: "present" means the stage has non-zero sourced evidence, nothing more.
//
// It can never recommend READY. Three parts of the criterion (repeated operation, no manual intervention, standards
// not weakened) cannot be established from one snapshot of the tables, so the strongest recommendation this report
// can make is INSUFFICIENT_EVIDENCE_FOR_READY. Repetition is shown by comparing dated runs of this report.
import type { EffectivenessFunnel } from './cosUniversityEffectivenessFunnel.ts'

export const STEP1_EVIDENCE_SCHEMA_VERSION = 'cos-university-step1-evidence-v2' as const

export type Step1CriterionStatus =
  | 'evidence_present'
  | 'partial'
  | 'no_evidence'
  | 'unavailable'
  | 'not_measured'

/** step1 = the factory a buyer uses; next_project = graduates working (reported, never blocking Step 1). */
export type Step1CriterionScope = 'step1' | 'next_project'

export type Step1Criterion = Readonly<{
  id: string
  scope: Step1CriterionScope
  question: string
  status: Step1CriterionStatus
  observed: Readonly<Record<string, number | string | boolean | null>>
  source: string
  note: string | null
}>

export type Step1Recommendation = 'NOT_READY' | 'INSUFFICIENT_EVIDENCE_FOR_READY'

export type Step1EvidenceReport = Readonly<{
  schemaVersion: typeof STEP1_EVIDENCE_SCHEMA_VERSION
  generatedAt: string
  window: EffectivenessFunnel['window']
  since: string | null
  cohort: EffectivenessFunnel['cohort']
  criteria: readonly Step1Criterion[]
  recommendation: Step1Recommendation
  blocking: readonly string[]
  declaration: 'owner_only'
  readOnly: true
  authorityExpanded: false
}>

const stageCount = (funnel: EffectivenessFunnel, id: string): number | null => {
  const stage = funnel.stages.find(entry => entry.id === id)
  return stage ? stage.count : null
}

const stageSource = (funnel: EffectivenessFunnel, id: string): string =>
  funnel.stages.find(entry => entry.id === id)?.source || 'unknown'

/** A stage whose chapter could not be read is unavailable, never a real zero. */
function stageCriterion(funnel: EffectivenessFunnel, input: {
  id: string
  scope?: Step1CriterionScope
  question: string
  stages: readonly string[]
  extra?: Readonly<Record<string, number | string | boolean | null>>
  note?: string | null
}): Step1Criterion {
  const observed: Record<string, number | string | boolean | null> = {}
  let missing = false
  let allPresent = true
  for (const id of input.stages) {
    const count = stageCount(funnel, id)
    observed[id] = count
    if (count === null) missing = true
    else if (count <= 0) allPresent = false
  }
  Object.assign(observed, input.extra || {})
  const status: Step1CriterionStatus = missing || input.stages.some(id => unavailableFor(funnel, id))
    ? 'unavailable'
    : allPresent ? 'evidence_present' : 'no_evidence'
  return Object.freeze({
    id: input.id,
    scope: input.scope ?? 'step1',
    question: input.question,
    status,
    observed: Object.freeze(observed),
    source: [...new Set(input.stages.map(id => stageSource(funnel, id)))].join(' + '),
    note: input.note ?? null,
  })
}

/** True when the chapter feeding this stage was unreadable (the funnel reports it by chapter name). */
function unavailableFor(funnel: EffectivenessFunnel, stageId: string): boolean {
  const chapterOf: Readonly<Record<string, string>> = {
    birth_certificate: 'certified',
    examined: 'examined',
    passed_all_gates: 'examined',
    residency_enrolled: 'residency',
    residency_complete: 'residency',
    graduated: 'graduation',
    activated: 'graduation',
    hired: 'hired',
    performed_work: 'work',
    served_successfully: 'work',
    verified_outcome: 'verified',
  }
  const chapter = chapterOf[stageId]
  return Boolean(chapter && Object.prototype.hasOwnProperty.call(funnel.unavailable || {}, chapter))
}

export function assessStep1Evidence(funnel: EffectivenessFunnel, now: Date = new Date()): Step1EvidenceReport {
  const criteria: Step1Criterion[] = []

  criteria.push(stageCriterion(funnel, {
    id: 'artifact_creation',
    question: 'Are artifacts being born with a birth certificate?',
    stages: ['born', 'birth_certificate'],
    extra: { cohortTruncated: funnel.cohort.truncated },
  }))

  criteria.push(stageCriterion(funnel, {
    id: 'qualification',
    question: 'Are artifacts independently examined, and do some pass all four gates?',
    stages: ['examined', 'passed_all_gates'],
    extra: funnel.capabilityGain.available
      ? { gainSampleSize: funnel.capabilityGain.sampleSize, meanAbsoluteGain: funnel.capabilityGain.meanAbsoluteGain, improved: funnel.capabilityGain.improved, regressed: funnel.capabilityGain.regressed }
      : { capabilityGain: 'unavailable' },
  }))

  {
    const f = funnel.evaluationFailures
    if (!f.available) {
      criteria.push(Object.freeze({ id: 'failure_attribution', scope: 'step1' as const, question: 'Is every evaluation failure attributed to infrastructure or merit with an evidence-backed cause?', status: 'unavailable' as const, observed: Object.freeze({ error: f.error }), source: 'cos_university_distilled_evaluation_runs', note: null }))
    } else {
      const unresolved = f.explanations.filter(entry => entry.causeStatus !== 'evidence_backed')
      const unresolvedCount = unresolved.reduce((sum, entry) => sum + entry.count, 0)
      // An internally inconsistent failure ledger cannot establish complete attribution.
      // Counts alone are insufficient if the infrastructure/merit split or reason totals disagree.
      const countsConsistent = Number.isSafeInteger(f.total) && f.total > 0
        && Number.isSafeInteger(f.infrastructure) && f.infrastructure >= 0
        && Number.isSafeInteger(f.merit) && f.merit >= 0
        && f.infrastructure + f.merit === f.total
        && f.explanations.every(entry => Number.isSafeInteger(entry.count) && entry.count >= 0)
        && f.explanations.reduce((sum, entry) => sum + entry.count, 0) === f.total
      criteria.push(Object.freeze({
        id: 'failure_attribution',
        scope: 'step1' as const,
        question: 'Is every evaluation failure attributed to infrastructure or merit with an evidence-backed cause?',
        // Zero failures means attribution was never exercised in this window: untested, not proven.
        status: f.total === 0 ? 'no_evidence' as const : (unresolvedCount > 0 || !countsConsistent) ? 'partial' as const : 'evidence_present' as const,
        observed: Object.freeze({ total: f.total, infrastructure: f.infrastructure, merit: f.merit, infrastructureShare: f.total > 0 ? Math.round((f.infrastructure / f.total) * 1000) / 1000 : null, unresolvedFailures: unresolvedCount, countsConsistent, unresolvedReasons: unresolved.map(entry => entry.reason).slice(0, 10).join(',') || null, topReasons: f.explanations.slice(0, 10).map(entry => `${entry.reason}=${entry.count}`).join(',') || null }),
        source: f.source,
        note: f.total === 0 ? 'no evaluation failures in this window; attribution is untested rather than proven' : null,
      }))
    }
  }

  {
    // Whether residents fail on skill (agent_failure) or on the platform (infrastructure/harness/verification) decides
    // the repair, so the case evidence the funnel already reads is printed with the stage counts.
    const r = funnel.residencyEffectiveness
    const kv = (map: Readonly<Record<string, number>>) => Object.entries(map).map(([k, v]) => `${k}=${v}`).join(',') || null
    criteria.push(stageCriterion(funnel, {
      id: 'builder_residency',
      question: 'Do Computer Science artifacts complete Builder Residency?',
      stages: ['residency_enrolled', 'residency_complete'],
      extra: r?.available
        ? {
            standings: kv(r.standings),
            caseRuns: r.caseRuns,
            casesPassed: r.casesPassed,
            casesFailed: r.casesFailed,
            casesRejected: r.casesRejected,
            casePassRate: r.casePassRate === null ? null : Math.round(r.casePassRate * 1000) / 1000,
            caseOutcomes: kv(r.caseOutcomes),
            topFailureCodes: kv(r.topFailureCodes),
            failedCaseLoopStops: kv(r.failedCaseLoopStops),
            failedCasesWithNoFileChange: r.failedCasesWithNoFileChange,
            // Content-free loop shapes of failed cases (2026-10-07), most common first: "[n] shape | [n] shape".
            failedCaseLoopShapes: Object.entries(r.failedCaseLoopShapes || {}).map(([shape, n]) => `[${n}] ${shape}`).join(' | ') || null,
            competencyPasses: r.competencyPasses,
            competencyFailures: r.competencyFailures,
            competencyFailuresById: kv(r.competencyFailuresById),
          }
        : { residencyEvidence: 'unavailable' },
    }))
  }

  criteria.push(stageCriterion(funnel, {
    id: 'graduation',
    question: 'Do qualified artifacts graduate?',
    stages: ['graduated'],
  }))

  // NEXT PROJECT (owner 2026-10-06): graduates put to work. Reported for continuity, never blocking Step 1.
  criteria.push(stageCriterion(funnel, {
    id: 'production_serving',
    scope: 'next_project',
    question: 'Are graduates hired and serving real work successfully?',
    stages: ['hired', 'performed_work', 'served_successfully'],
    extra: funnel.reliability.available
      ? { servingAttempts: funnel.reliability.attempts, servingSuccesses: funnel.reliability.successes, servingFailures: funnel.reliability.failures, servingFallbacks: funnel.reliability.fallbacks, p90LatencyMs: funnel.reliability.p90LatencyMs }
      : { reliability: 'unavailable' },
  }))

  criteria.push(stageCriterion(funnel, {
    id: 'verified_production_outcomes',
    scope: 'next_project',
    question: 'Do graduates produce independently verified Production outcomes?',
    stages: ['verified_outcome'],
    extra: funnel.workforceEffectiveness.available
      ? { assignments: funnel.workforceEffectiveness.assignments, verifiedAssignments: funnel.workforceEffectiveness.verified, remediation: funnel.workforceEffectiveness.remediation, runtimeFailed: funnel.workforceEffectiveness.runtimeFailed, servedAwaitingVerification: funnel.workforceEffectiveness.servedAwaitingVerification }
      : { workforceEffectiveness: 'unavailable' },
  }))

  {
    const h = funnel.lineHistory
    const health = funnel.lineHealth
    criteria.push(Object.freeze({
      id: 'line_flow',
      scope: 'step1' as const,
      question: 'Is the line moving units between stations in this window?',
      status: !h.available ? 'unavailable' as const : h.transitions > 0 ? 'evidence_present' as const : 'no_evidence' as const,
      observed: Object.freeze({
        transitions: h.available ? h.transitions : null,
        throughputPerHour: h.available ? h.throughputPerHour : null,
        liveUnits: health.available ? health.liveUnits : null,
        overdueUnits: health.available ? health.overdueUnits : null,
        bottleneckStation: health.available ? health.bottleneckStation : null,
      }),
      source: 'cos_university_lifecycle_transition_history + cos_university_lifecycle_orchestration',
      note: null,
    }))
  }

  // Repetition is read from the cohort's own dated events (2026-10-07): a "full-line day" is a UTC day on which the cohort
  // had at least one birth, one exam and one graduate promotion. Two such days is what "more than once" means; no other
  // threshold is set. Exam and graduation days need their chapters; an unreadable chapter reports unavailable, not zero.
  {
    const days = funnel.dailyActivity?.days ?? []
    const chaptersRead = !funnel.unavailable.examined && !funnel.unavailable.graduation
    const fullLineDays = days.filter(d => d.born > 0 && d.examined > 0 && d.graduated > 0).map(d => d.day)
    const stageDays = { born: days.filter(d => d.born > 0).length, examined: days.filter(d => d.examined > 0).length, graduated: days.filter(d => d.graduated > 0).length }
    criteria.push(Object.freeze({
      id: 'repeated_operation',
      scope: 'step1' as const,
      question: 'Does the whole line operate repeatedly, not once?',
      status: !funnel.dailyActivity || !chaptersRead ? 'unavailable' as const
        : fullLineDays.length >= 2 ? 'evidence_present' as const
          : (stageDays.born >= 2 || stageDays.examined >= 2 || stageDays.graduated >= 2) ? 'partial' as const
            : 'no_evidence' as const,
      observed: Object.freeze({
        fullLineDays: fullLineDays.length,
        bornDays: stageDays.born,
        examinedDays: stageDays.examined,
        graduatedDays: stageDays.graduated,
        lastFullLineDay: fullLineDays[fullLineDays.length - 1] ?? null,
      }),
      source: funnel.dailyActivity?.source ?? 'dailyActivity unavailable',
      note: 'a full-line day has a birth, an exam and a graduate promotion among cohort artifacts on the same UTC day; unattended operation is a separate criterion',
    }))
  }
  criteria.push(Object.freeze({
    id: 'no_manual_intervention',
    scope: 'step1' as const,
    question: 'Does the loop continue without manual intervention?',
    status: 'not_measured' as const,
    observed: Object.freeze({}),
    source: 'none in the tables',
    note: 'the tables do not record who unblocked a unit; requires an operator-action ledger or owner attestation',
  }))
  // Two halves (2026-10-07). Code: every pass threshold is pinned by tests/cosUniversityStandardsRatchet.node.test.ts in the
  // release gate and may only tighten, so no deployed build can carry a loosened standard. Data: the cohort's latest exams
  // name the evaluator version and the fixed safety/transfer/retention suites they were graded with; one of each means
  // one exam standard throughout the window. More than one is reported as partial for a reviewer to read, never hidden.
  {
    const e = funnel.examStandards
    const kv = (map: Readonly<Record<string, number>>) => Object.entries(map).map(([k, v]) => `${k}=${v}`).join(',') || null
    const versions = e?.available ? Object.keys(e.evaluatorVersions).length : 0
    const suites = e?.available ? Object.keys(e.fixedSuites).length : 0
    const unrecorded = e?.available ? Boolean(e.evaluatorVersions.unrecorded || e.fixedSuites.unrecorded) : false
    criteria.push(Object.freeze({
      id: 'standards_unweakened',
      scope: 'step1' as const,
      question: 'Were graduation and evaluation standards kept unchanged?',
      status: !e || !e.available ? 'unavailable' as const
        : e.examined === 0 ? 'no_evidence' as const
          : versions === 1 && suites === 1 && !unrecorded ? 'evidence_present' as const
            : 'partial' as const,
      observed: Object.freeze({
        examined: e?.available ? e.examined : null,
        evaluatorVersions: e?.available ? kv(e.evaluatorVersions) : null,
        fixedSuites: e?.available ? kv(e.fixedSuites) : null,
        thresholdRatchet: 'tests/cosUniversityStandardsRatchet.node.test.ts (release gate)',
      }),
      source: e?.available ? `${e.source} + release-gate threshold ratchet` : 'examStandards unavailable',
      note: 'thresholds can only tighten (release-gate ratchet); several evaluator versions or exam suites in one window are shown for review, not judged',
    }))
  }

  const blocking = criteria
    .filter(entry => entry.scope === 'step1')
    .filter(entry => entry.status === 'no_evidence' || entry.status === 'unavailable' || entry.status === 'partial')
    .map(entry => entry.id)
  return Object.freeze({
    schemaVersion: STEP1_EVIDENCE_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    window: funnel.window,
    since: funnel.since,
    cohort: funnel.cohort,
    criteria: Object.freeze(criteria),
    recommendation: blocking.length ? 'NOT_READY' : 'INSUFFICIENT_EVIDENCE_FOR_READY',
    blocking: Object.freeze(blocking),
    declaration: 'owner_only',
    readOnly: true,
    authorityExpanded: false,
  })
}

/** One line per criterion, for a CI log a human reads. */
export function describeStep1Evidence(report: Step1EvidenceReport): string {
  const lines = [
    `STEP 1 EVIDENCE window=${report.window} cohort=${report.cohort.size}${report.cohort.truncated ? '+ (truncated)' : ''} recommendation=${report.recommendation} declaration=owner_only`,
  ]
  const line = (entry: Step1Criterion) => {
    const observed = Object.entries(entry.observed).map(([key, value]) => `${key}=${value === null ? 'n/a' : value}`).join(' ')
    return `  [${entry.status}] ${entry.id}${observed ? ` :: ${observed}` : ''}${entry.note ? ` (${entry.note})` : ''}`
  }
  for (const entry of report.criteria.filter(item => item.scope === 'step1')) lines.push(line(entry))
  if (report.blocking.length) lines.push(`  blocking: ${report.blocking.join(', ')}`)
  const next = report.criteria.filter(item => item.scope === 'next_project')
  if (next.length) {
    lines.push('  next project (graduates at work; reported only, not part of Step 1):')
    for (const entry of next) lines.push(`  ${line(entry)}`)
  }
  return lines.join('\n')
}
// end of saas/lib/ai/cos/cosUniversityStep1Evidence.ts (if this line is missing, the paste was cut short)
