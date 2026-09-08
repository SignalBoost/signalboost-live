// saas/lib/ai/cos/cosUniversityMasters.ts
// Canonical Master's specialization catalog plus evidence-backed degree semantics.

import type { CosUniversitySubjectId } from './cosUniversity.ts'

export type CosUniversityMastersTrackId =
  | 'applied_ai_systems'
  | 'security_and_trust'
  | 'quantitative_decision_science'
  | 'enterprise_operations_and_governance'
  | 'scientific_and_physical_systems'

export type CosUniversityMastersProgramId = CosUniversityMastersTrackId

export type CosUniversityMastersEvidenceStage =
  | 'graduate_coursework'
  | 'independent_specialist_exam'
  | 'cross_domain_transfer'
  | 'verified_practical_work'
  | 'masters_capstone'

export type CosUniversityMastersEvidenceAuthority =
  | 'university_coursework'
  | 'host_private_exam'
  | 'verified_production'
  | 'host_capstone'

export type CosUniversityMastersModule = Readonly<{
  key: string
  title: string
  subjectId: CosUniversitySubjectId
  objective: string
}>

export type CosUniversityMastersTrack = Readonly<{
  id: CosUniversityMastersTrackId
  title: string
  objective: string
  coreSubjects: readonly CosUniversitySubjectId[]
  supportingSubjects: readonly CosUniversitySubjectId[]
  curriculumModules: readonly CosUniversityMastersModule[]
  requiredDepthPasses: number
}>

function module(key: string, title: string, subjectId: CosUniversitySubjectId, objective: string): CosUniversityMastersModule {
  return Object.freeze({ key, title, subjectId, objective })
}

export const COS_UNIVERSITY_MASTERS_TRACKS: ReadonlyArray<CosUniversityMastersTrack> = Object.freeze([
  Object.freeze({
    id: 'applied_ai_systems',
    title: 'Applied AI Systems',
    objective: 'Design, evaluate, and operate AI systems end to end, including failure analysis and evaluation design.',
    coreSubjects: Object.freeze(['computer_science', 'statistics_data_science'] as const),
    supportingSubjects: Object.freeze(['mathematics', 'reasoning_decision_science'] as const),
    curriculumModules: Object.freeze([
      module('ai_evaluation_failure_analysis', 'AI Evaluation & Failure Analysis', 'statistics_data_science', 'Design trustworthy evaluation, detect benchmark/Production mismatch, diagnose model failures, and distinguish measurement defects from learner defects.'),
      module('ai_system_architecture', 'AI System Architecture', 'computer_science', 'Design bounded, observable, resilient AI systems with explicit control planes, fallbacks, data flows, and failure containment.'),
      module('ai_deployment_operations', 'AI Deployment & Operations', 'computer_science', 'Operate model-backed services using canaries, rollback, latency/quality tradeoffs, telemetry, and Production verification.'),
      module('ai_reasoning_governance', 'AI Reasoning & Governance', 'reasoning_decision_science', 'Make evidence-bounded AI decisions under uncertainty, preserve authority boundaries, and define verification before irreversible action.'),
    ]),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'security_and_trust',
    title: 'Security & Trust Engineering',
    objective: 'Reason adversarially about systems, identity, and incidents, and defend designs under hostile assumptions.',
    coreSubjects: Object.freeze(['cybersecurity', 'computer_science'] as const),
    supportingSubjects: Object.freeze(['law_regulation_governance', 'reasoning_decision_science'] as const),
    curriculumModules: Object.freeze([
      module('security_threat_modeling', 'Adversarial Threat Modeling', 'cybersecurity', 'Model assets, trust boundaries, attacker goals, abuse paths, and layered controls without assuming benign behavior.'),
      module('security_identity_access', 'Identity & Access Engineering', 'cybersecurity', 'Design least-privilege identity, authentication, authorization, credential rotation, and auditable access controls.'),
      module('security_incident_response', 'Incident Response & Evidence', 'cybersecurity', 'Contain incidents while preserving evidence, scoping impact, distinguishing facts from hypotheses, and verifying recovery.'),
      module('security_secure_architecture', 'Secure Systems Architecture', 'computer_science', 'Build resilient service boundaries, secret handling, isolation, patch/rollback paths, and defense-in-depth into system design.'),
    ]),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'quantitative_decision_science',
    title: 'Quantitative Decision Science',
    objective: 'Draw defensible conclusions from data under uncertainty and state what the evidence cannot support.',
    coreSubjects: Object.freeze(['statistics_data_science', 'mathematics'] as const),
    supportingSubjects: Object.freeze(['economics_finance', 'reasoning_decision_science'] as const),
    curriculumModules: Object.freeze([
      module('quant_experimental_design', 'Experimental Design', 'statistics_data_science', 'Design experiments with appropriate baselines, randomization, measurement plans, stopping rules, and bias controls.'),
      module('quant_causal_inference', 'Causal Inference', 'statistics_data_science', 'Separate association from causation, identify confounding, reason about counterfactuals, and communicate causal limits.'),
      module('quant_optimization_decisions', 'Optimization & Decision Models', 'mathematics', 'Formulate objectives, constraints, tradeoffs, sensitivity, and robust choices under imperfect information.'),
      module('quant_forecasting_uncertainty', 'Forecasting & Uncertainty', 'statistics_data_science', 'Build calibrated forecasts, quantify uncertainty, compare scenarios, and avoid false precision in operational decisions.'),
    ]),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'enterprise_operations_and_governance',
    title: 'Enterprise Operations & Governance',
    objective: 'Run and govern operating businesses: process, control, regulation, and accountable decision records.',
    coreSubjects: Object.freeze(['business_operations', 'law_regulation_governance'] as const),
    supportingSubjects: Object.freeze(['economics_finance', 'social_behavioral_sciences'] as const),
    curriculumModules: Object.freeze([
      module('enterprise_operating_systems', 'Enterprise Operating Systems', 'business_operations', 'Design accountable operating rhythms, ownership, dependencies, escalation, service levels, and measurable outcomes.'),
      module('enterprise_controls_governance', 'Controls & Governance', 'law_regulation_governance', 'Design auditable controls, segregation of duties, policy boundaries, exception handling, and evidence-backed compliance.'),
      module('enterprise_resource_tradeoffs', 'Resource & Financial Tradeoffs', 'economics_finance', 'Allocate constrained resources using cost, value, risk, opportunity cost, and reversibility rather than single-metric optimization.'),
      module('enterprise_change_human_systems', 'Change & Human Systems', 'social_behavioral_sciences', 'Plan organizational change with incentives, communication, adoption evidence, feedback loops, and resistance analysis.'),
    ]),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'scientific_and_physical_systems',
    title: 'Scientific & Physical Systems',
    objective: 'Apply scientific method and physical reasoning to instrumented real-world systems.',
    coreSubjects: Object.freeze(['physics_natural_sciences', 'mathematics'] as const),
    supportingSubjects: Object.freeze(['statistics_data_science', 'computer_science'] as const),
    curriculumModules: Object.freeze([
      module('science_measurement_instrumentation', 'Measurement & Instrumentation', 'physics_natural_sciences', 'Reason from calibrated measurements, sensor limitations, units, uncertainty, and correlated physical evidence.'),
      module('science_physical_modeling', 'Physical & Mathematical Modeling', 'mathematics', 'Build dimensional, conservation-based, and quantitative models while checking plausibility and boundary conditions.'),
      module('science_experiment_replication', 'Experiment & Replication', 'statistics_data_science', 'Design controlled experiments, replication, falsification checks, and uncertainty-aware interpretation.'),
      module('science_computational_systems', 'Computational Scientific Systems', 'computer_science', 'Use software, simulation, telemetry, and reproducible computation as tools for scientific reasoning without confusing model output with observation.'),
    ]),
    requiredDepthPasses: 3,
  }),
])

export function cosUniversityMastersTrackById(id: string): CosUniversityMastersTrack | null {
  return COS_UNIVERSITY_MASTERS_TRACKS.find((track) => track.id === id) ?? null
}

export function cosUniversityMastersModuleByKey(programId: CosUniversityMastersProgramId, moduleKey: string): CosUniversityMastersModule | null {
  return cosUniversityMastersTrackById(programId)?.curriculumModules.find(item => item.key === moduleKey) ?? null
}

export function cosUniversityMastersProgramKey(trackId: CosUniversityMastersTrackId): string {
  return `specialist_masters_${trackId}_v1`
}

export function cosUniversityMastersTrackIdFromProgramKey(programKey: string): CosUniversityMastersTrackId | null {
  const value = String(programKey || '').trim()
  for (const track of COS_UNIVERSITY_MASTERS_TRACKS) {
    if (cosUniversityMastersProgramKey(track.id) === value) return track.id
  }
  return null
}

export const COS_UNIVERSITY_MASTERS_PROGRAM_KEY_PREFIX = 'specialist_masters_'

export function rankCosUniversityMastersTracks(
  subjectStanding: ReadonlyMap<CosUniversitySubjectId, number>,
): ReadonlyArray<{ track: CosUniversityMastersTrack; score: number }> {
  return COS_UNIVERSITY_MASTERS_TRACKS
    .map((track, index) => {
      const core = track.coreSubjects.reduce((sum, id) => sum + (subjectStanding.get(id) ?? 0), 0)
      const supporting = track.supportingSubjects.reduce((sum, id) => sum + (subjectStanding.get(id) ?? 0), 0)
      const denominator = track.coreSubjects.length + track.supportingSubjects.length * 0.5
      const score = denominator > 0 ? (core + supporting * 0.5) / denominator : 0
      return { track, score, index }
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ track, score }) => ({ track, score }))
}

export type CosUniversityMastersProgram = Readonly<{
  id: CosUniversityMastersProgramId
  title: string
  primarySubjects: readonly CosUniversitySubjectId[]
  courseworkModuleKeys: readonly string[]
  admissionMinimumStanding: 'A'
  requiredEvidenceStages: readonly CosUniversityMastersEvidenceStage[]
  minimumDistinctIndependentPasses: number
  minimumDistinctTransferPasses: number
  minimumDistinctPracticalPasses: number
  minimumDistinctCapstonePasses: number
  aPlusDistinctIndependentPasses: number
  aPlusDistinctTransferPasses: number
  aPlusDistinctPracticalPasses: number
  aPlusDistinctCapstonePasses: number
}>

const STANDARD_EVIDENCE: readonly CosUniversityMastersEvidenceStage[] = Object.freeze([
  'graduate_coursework',
  'independent_specialist_exam',
  'cross_domain_transfer',
  'verified_practical_work',
  'masters_capstone',
])

function academicProgram(track: CosUniversityMastersTrack): CosUniversityMastersProgram {
  return Object.freeze({
    id: track.id,
    title: `Master of ${track.title}`,
    primarySubjects: track.coreSubjects,
    courseworkModuleKeys: Object.freeze(track.curriculumModules.map(item => item.key)),
    admissionMinimumStanding: 'A' as const,
    requiredEvidenceStages: STANDARD_EVIDENCE,
    minimumDistinctIndependentPasses: Math.max(2, track.requiredDepthPasses),
    minimumDistinctTransferPasses: 2,
    minimumDistinctPracticalPasses: 1,
    minimumDistinctCapstonePasses: 2,
    aPlusDistinctIndependentPasses: Math.max(4, track.requiredDepthPasses + 1),
    aPlusDistinctTransferPasses: 3,
    aPlusDistinctPracticalPasses: 2,
    aPlusDistinctCapstonePasses: 3,
  })
}

export const COS_UNIVERSITY_MASTERS_PROGRAMS: Readonly<Record<CosUniversityMastersProgramId, CosUniversityMastersProgram>> = Object.freeze(
  Object.fromEntries(COS_UNIVERSITY_MASTERS_TRACKS.map(track => [track.id, academicProgram(track)])) as Record<CosUniversityMastersProgramId, CosUniversityMastersProgram>,
)

export function cosUniversityMastersCredentialKey(agentId: string, programId: CosUniversityMastersProgramId): string {
  return `${String(agentId || '').trim()}:masters:${programId}:v1`
}

export function cosUniversityMastersExpectedAuthority(stage: CosUniversityMastersEvidenceStage): CosUniversityMastersEvidenceAuthority {
  if (stage === 'graduate_coursework') return 'university_coursework'
  if (stage === 'verified_practical_work') return 'verified_production'
  if (stage === 'masters_capstone') return 'host_capstone'
  return 'host_private_exam'
}

export type CosUniversityMastersAdmissionInput = {
  undergraduateCredentialAwarded: boolean
  currentGeneralistStanding: 'not_graduated' | 'A' | 'A+'
  currentSubjectStanding: Partial<Record<CosUniversitySubjectId, string>>
}

export type CosUniversityMastersAdmissionDecision = {
  admitted: boolean
  reasons: string[]
}

export function evaluateCosUniversityMastersAdmission(
  programId: CosUniversityMastersProgramId,
  input: CosUniversityMastersAdmissionInput,
): CosUniversityMastersAdmissionDecision {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const reasons: string[] = []
  if (!input.undergraduateCredentialAwarded) reasons.push('undergraduate_credential_required')
  if (input.currentGeneralistStanding !== 'A' && input.currentGeneralistStanding !== 'A+') reasons.push('current_generalist_A_required')
  for (const subjectId of program.primarySubjects) {
    const standing = input.currentSubjectStanding[subjectId]
    if (standing !== 'A' && standing !== 'A+') reasons.push(`subject_A_required:${subjectId}`)
  }
  return { admitted: reasons.length === 0, reasons }
}

export type CosUniversityMastersEvidence = {
  programId: CosUniversityMastersProgramId
  moduleKey?: string | null
  stage: CosUniversityMastersEvidenceStage
  passed: boolean
  variantHash: string
  observedAt: string
  validUntil: string
  independent: boolean
  authority: CosUniversityMastersEvidenceAuthority
  verifiedPractical?: boolean
}

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function cosUniversityMastersEvidenceEligible(
  row: CosUniversityMastersEvidence,
  now = new Date(),
): boolean {
  const nowMs = now.getTime()
  const observedAt = validTime(row.observedAt)
  const validUntil = validTime(row.validUntil)
  const variantHash = String(row.variantHash || '').trim()
  if (!Number.isFinite(nowMs) || !variantHash || observedAt === null || validUntil === null) return false
  if (observedAt > nowMs || validUntil <= observedAt || validUntil <= nowMs) return false
  if (!COS_UNIVERSITY_MASTERS_PROGRAMS[row.programId]) return false
  if (row.stage === 'graduate_coursework') {
    if (!row.moduleKey || !cosUniversityMastersModuleByKey(row.programId, row.moduleKey)) return false
  } else if (row.moduleKey) {
    return false
  }
  if (row.authority !== cosUniversityMastersExpectedAuthority(row.stage)) return false
  if (row.stage !== 'graduate_coursework' && !row.independent) return false
  if (row.stage === 'verified_practical_work' && row.verifiedPractical !== true) return false
  return true
}

function eligibleStageRows(
  evidence: CosUniversityMastersEvidence[],
  programId: CosUniversityMastersProgramId,
  stage: CosUniversityMastersEvidenceStage,
  now: Date,
): CosUniversityMastersEvidence[] {
  return evidence
    .filter(row => row.programId === programId && row.stage === stage && cosUniversityMastersEvidenceEligible(row, now))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
}

export function cosUniversityMastersDistinctPassesAfterLatestFailure(
  evidence: CosUniversityMastersEvidence[],
  programId: CosUniversityMastersProgramId,
  stage: CosUniversityMastersEvidenceStage,
  now = new Date(),
): number {
  const rows = eligibleStageRows(evidence, programId, stage, now)
  let seen = new Set<string>()
  for (const row of rows) {
    if (!row.passed) {
      seen = new Set<string>()
      continue
    }
    seen.add(String(row.variantHash).trim())
  }
  return seen.size
}

export function cosUniversityMastersCourseworkModulePasses(
  evidence: CosUniversityMastersEvidence[],
  programId: CosUniversityMastersProgramId,
  now = new Date(),
): ReadonlyMap<string, boolean> {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const rows = eligibleStageRows(evidence, programId, 'graduate_coursework', now)
  const state = new Map<string, boolean>(program.courseworkModuleKeys.map(key => [key, false]))
  for (const row of rows) {
    if (row.moduleKey && state.has(row.moduleKey)) state.set(row.moduleKey, row.passed)
  }
  return state
}

export type CosUniversityMastersGraduationDecision = {
  graduated: boolean
  standing: 'not_graduated' | 'A' | 'A+'
  blockers: string[]
  authorityExpanded: false
}

export function evaluateCosUniversityMastersGraduation(
  programId: CosUniversityMastersProgramId,
  evidence: CosUniversityMastersEvidence[],
  now = new Date(),
): CosUniversityMastersGraduationDecision {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const blockers: string[] = []
  const coursework = cosUniversityMastersCourseworkModulePasses(evidence, programId, now)
  const incompleteModules = program.courseworkModuleKeys.filter(key => coursework.get(key) !== true)
  const independentPasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'independent_specialist_exam', now)
  const transferPasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'cross_domain_transfer', now)
  const practicalPasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'verified_practical_work', now)
  const capstonePasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'masters_capstone', now)

  if (incompleteModules.length) {
    blockers.push('graduate_coursework_incomplete')
    blockers.push(...incompleteModules.map(key => `coursework_module_incomplete:${key}`))
  }
  if (independentPasses < program.minimumDistinctIndependentPasses) blockers.push('independent_specialist_exam_incomplete')
  if (transferPasses < program.minimumDistinctTransferPasses) blockers.push('cross_domain_transfer_incomplete')
  if (practicalPasses < program.minimumDistinctPracticalPasses) blockers.push('verified_practical_work_incomplete')
  if (capstonePasses < program.minimumDistinctCapstonePasses) blockers.push('masters_capstone_incomplete')

  if (blockers.length) return { graduated: false, standing: 'not_graduated', blockers, authorityExpanded: false }
  const aPlus = independentPasses >= program.aPlusDistinctIndependentPasses
    && transferPasses >= program.aPlusDistinctTransferPasses
    && practicalPasses >= program.aPlusDistinctPracticalPasses
    && capstonePasses >= program.aPlusDistinctCapstonePasses
  return { graduated: true, standing: aPlus ? 'A+' : 'A', blockers: [], authorityExpanded: false }
}
