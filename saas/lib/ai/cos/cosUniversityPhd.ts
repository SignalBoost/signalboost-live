import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  type CosUniversityMastersProgramId,
} from './cosUniversityMasters.ts'

export type CosUniversityPhdProgramId =
  | 'ai_systems_research'
  | 'security_trust_research'
  | 'quantitative_methods_research'
  | 'enterprise_systems_research'
  | 'physical_systems_research'

export type CosUniversityPhdResearchCompetency =
  | 'research_methodology'
  | 'primary_literature_review'
  | 'hypothesis_generation'
  | 'experimental_design'
  | 'replication_reproducibility'
  | 'statistical_causal_inference'
  | 'peer_criticism_response'
  | 'research_integrity_governance'
  | 'novel_synthesis'

export type CosUniversityPhdEvidenceStage =
  | 'research_methodology_exam'
  | 'primary_literature_synthesis'
  | 'hypothesis_proposal'
  | 'preregistered_experiment'
  | 'independent_replication'
  | 'peer_critique_defense'
  | 'dissertation_defense'

export type CosUniversityPhdEvidenceAuthority =
  | 'host_private_exam'
  | 'primary_literature_panel'
  | 'research_committee'
  | 'verified_experiment'
  | 'independent_replication_panel'
  | 'peer_review_panel'
  | 'dissertation_committee'

export type CosUniversityPhdProgram = Readonly<{
  id: CosUniversityPhdProgramId
  title: string
  mastersPrerequisite: CosUniversityMastersProgramId
  objective: string
  competencies: readonly CosUniversityPhdResearchCompetency[]
  minimumDistinctPasses: Readonly<Record<CosUniversityPhdEvidenceStage, number>>
  aPlusDistinctPasses: Readonly<Record<CosUniversityPhdEvidenceStage, number>>
}>

export const COS_UNIVERSITY_PHD_RESEARCH_COMPETENCIES: readonly CosUniversityPhdResearchCompetency[] = Object.freeze([
  'research_methodology',
  'primary_literature_review',
  'hypothesis_generation',
  'experimental_design',
  'replication_reproducibility',
  'statistical_causal_inference',
  'peer_criticism_response',
  'research_integrity_governance',
  'novel_synthesis',
])

const MINIMUM_PASSES: Readonly<Record<CosUniversityPhdEvidenceStage, number>> = Object.freeze({
  research_methodology_exam: 2,
  primary_literature_synthesis: 3,
  hypothesis_proposal: 3,
  preregistered_experiment: 2,
  independent_replication: 2,
  peer_critique_defense: 2,
  dissertation_defense: 2,
})

const A_PLUS_PASSES: Readonly<Record<CosUniversityPhdEvidenceStage, number>> = Object.freeze({
  research_methodology_exam: 3,
  primary_literature_synthesis: 5,
  hypothesis_proposal: 4,
  preregistered_experiment: 3,
  independent_replication: 3,
  peer_critique_defense: 3,
  dissertation_defense: 3,
})

function phdProgram(
  id: CosUniversityPhdProgramId,
  title: string,
  mastersPrerequisite: CosUniversityMastersProgramId,
  objective: string,
): CosUniversityPhdProgram {
  return Object.freeze({
    id,
    title,
    mastersPrerequisite,
    objective,
    competencies: COS_UNIVERSITY_PHD_RESEARCH_COMPETENCIES,
    minimumDistinctPasses: MINIMUM_PASSES,
    aPlusDistinctPasses: A_PLUS_PASSES,
  })
}

export const COS_UNIVERSITY_PHD_PROGRAMS: Readonly<Record<CosUniversityPhdProgramId, CosUniversityPhdProgram>> = Object.freeze({
  ai_systems_research: phdProgram(
    'ai_systems_research',
    'Doctor of Philosophy in AI Systems Research',
    'applied_ai_systems',
    'Produce reproducible research on AI-system behavior, evaluation, reliability, adaptation, and deployment under real operational constraints.',
  ),
  security_trust_research: phdProgram(
    'security_trust_research',
    'Doctor of Philosophy in Security & Trust Research',
    'security_and_trust',
    'Produce reproducible adversarial research on secure systems, identity, resilience, assurance, and trust boundaries.',
  ),
  quantitative_methods_research: phdProgram(
    'quantitative_methods_research',
    'Doctor of Philosophy in Quantitative Methods Research',
    'quantitative_decision_science',
    'Develop and validate quantitative methods for inference, uncertainty, causality, forecasting, optimization, and decision-making.',
  ),
  enterprise_systems_research: phdProgram(
    'enterprise_systems_research',
    'Doctor of Philosophy in Enterprise Systems Research',
    'enterprise_operations_and_governance',
    'Research how complex organizations, controls, incentives, governance, and operating systems behave and can be improved.',
  ),
  physical_systems_research: phdProgram(
    'physical_systems_research',
    'Doctor of Philosophy in Physical Systems Research',
    'scientific_and_physical_systems',
    'Conduct reproducible scientific research on instrumented physical systems using falsifiable hypotheses, measurement, and replication.',
  ),
})

export function cosUniversityPhdProgramById(id: string): CosUniversityPhdProgram | null {
  return COS_UNIVERSITY_PHD_PROGRAMS[id as CosUniversityPhdProgramId] ?? null
}

export function cosUniversityPhdProgramKey(programId: CosUniversityPhdProgramId): string {
  return `specialist_phd_${programId}_v1`
}

export function cosUniversityPhdCredentialKey(agentId: string, programId: CosUniversityPhdProgramId): string {
  return `${String(agentId || '').trim()}:phd:${programId}:v1`
}

export function cosUniversityPhdExpectedAuthority(stage: CosUniversityPhdEvidenceStage): CosUniversityPhdEvidenceAuthority {
  if (stage === 'research_methodology_exam') return 'host_private_exam'
  if (stage === 'primary_literature_synthesis') return 'primary_literature_panel'
  if (stage === 'hypothesis_proposal') return 'research_committee'
  if (stage === 'preregistered_experiment') return 'verified_experiment'
  if (stage === 'independent_replication') return 'independent_replication_panel'
  if (stage === 'peer_critique_defense') return 'peer_review_panel'
  return 'dissertation_committee'
}

export type CosUniversityPhdAdmissionInput = {
  mastersCredentialAwarded: boolean
  mastersProgramId: CosUniversityMastersProgramId | null
  mastersCredentialStanding: 'A' | 'A+' | null
  currentMastersStanding: 'not_graduated' | 'A' | 'A+'
  currentGeneralistStanding: 'not_graduated' | 'A' | 'A+'
  researchNeedJustified: boolean
}

export type CosUniversityPhdAdmissionDecision = {
  admitted: boolean
  reasons: string[]
}

export function evaluateCosUniversityPhdAdmission(
  programId: CosUniversityPhdProgramId,
  input: CosUniversityPhdAdmissionInput,
): CosUniversityPhdAdmissionDecision {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[programId]
  const reasons: string[] = []
  if (!program) return { admitted: false, reasons: ['unknown_phd_program'] }
  if (!input.mastersCredentialAwarded) reasons.push('masters_credential_required')
  if (input.mastersProgramId !== program.mastersPrerequisite) reasons.push(`relevant_masters_required:${program.mastersPrerequisite}`)
  if (input.mastersCredentialStanding !== 'A' && input.mastersCredentialStanding !== 'A+') reasons.push('masters_A_credential_required')
  if (input.currentMastersStanding !== 'A' && input.currentMastersStanding !== 'A+') reasons.push('current_masters_A_required')
  if (input.currentGeneralistStanding !== 'A' && input.currentGeneralistStanding !== 'A+') reasons.push('current_generalist_A_required')
  if (!input.researchNeedJustified) reasons.push('research_need_not_justified')
  return { admitted: reasons.length === 0, reasons }
}

export type CosUniversityPhdEvidence = {
  programId: CosUniversityPhdProgramId
  stage: CosUniversityPhdEvidenceStage
  passed: boolean
  variantHash: string
  observedAt: string
  validUntil: string
  independent: boolean
  authority: CosUniversityPhdEvidenceAuthority
  primarySourceCount?: number
  protocolFrozen?: boolean
  reproducibleArtifactHash?: string | null
  independentReplication?: boolean
  critiqueResolved?: boolean
  noveltyJudgedIndependent?: boolean
}

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function cosUniversityPhdEvidenceEligible(row: CosUniversityPhdEvidence, now = new Date()): boolean {
  const observedAt = validTime(row.observedAt)
  const validUntil = validTime(row.validUntil)
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs) || observedAt === null || validUntil === null) return false
  if (!String(row.variantHash || '').trim()) return false
  if (!COS_UNIVERSITY_PHD_PROGRAMS[row.programId]) return false
  if (observedAt > nowMs || validUntil <= observedAt || validUntil <= nowMs) return false
  if (!row.independent) return false
  if (row.authority !== cosUniversityPhdExpectedAuthority(row.stage)) return false

  if (row.stage === 'primary_literature_synthesis' && (row.primarySourceCount ?? 0) < 3) return false
  if (row.stage === 'preregistered_experiment') {
    if (row.protocolFrozen !== true) return false
    if (!String(row.reproducibleArtifactHash || '').trim()) return false
  }
  if (row.stage === 'independent_replication' && row.independentReplication !== true) return false
  if (row.stage === 'peer_critique_defense' && row.critiqueResolved !== true) return false
  if (row.stage === 'dissertation_defense' && row.noveltyJudgedIndependent !== true) return false
  return true
}

function cosUniversityPhdFailureResetEligible(row: CosUniversityPhdEvidence, now: Date): boolean {
  const observedAt = validTime(row.observedAt)
  const validUntil = validTime(row.validUntil)
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs) || observedAt === null || validUntil === null) return false
  if (!String(row.variantHash || '').trim()) return false
  if (!COS_UNIVERSITY_PHD_PROGRAMS[row.programId]) return false
  if (observedAt > nowMs || validUntil <= observedAt || validUntil <= nowMs) return false
  if (!row.independent) return false
  if (row.authority !== cosUniversityPhdExpectedAuthority(row.stage)) return false
  return true
}

function stageRows(
  evidence: readonly CosUniversityPhdEvidence[],
  programId: CosUniversityPhdProgramId,
  stage: CosUniversityPhdEvidenceStage,
  now: Date,
): CosUniversityPhdEvidence[] {
  return evidence
    .filter(row => row.programId === programId && row.stage === stage)
    .filter(row => row.passed
      ? cosUniversityPhdEvidenceEligible(row, now)
      : cosUniversityPhdFailureResetEligible(row, now))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
}

export function cosUniversityPhdDistinctPassesAfterLatestFailure(
  evidence: readonly CosUniversityPhdEvidence[],
  programId: CosUniversityPhdProgramId,
  stage: CosUniversityPhdEvidenceStage,
  now = new Date(),
): number {
  const rows = stageRows(evidence, programId, stage, now)
  let variants = new Set<string>()
  for (const row of rows) {
    if (!row.passed) {
      variants = new Set<string>()
      continue
    }
    variants.add(row.variantHash.trim())
  }
  return variants.size
}

export type CosUniversityPhdGraduationDecision = {
  graduated: boolean
  standing: 'not_graduated' | 'A' | 'A+'
  blockers: string[]
  authorityExpanded: false
  semantics: 'research_process_and_novelty_require_independent_host_evidence'
}

export function evaluateCosUniversityPhdGraduation(
  programId: CosUniversityPhdProgramId,
  evidence: readonly CosUniversityPhdEvidence[],
  now = new Date(),
): CosUniversityPhdGraduationDecision {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[programId]
  if (!program) {
    return {
      graduated: false,
      standing: 'not_graduated',
      blockers: ['unknown_phd_program'],
      authorityExpanded: false,
      semantics: 'research_process_and_novelty_require_independent_host_evidence',
    }
  }

  const blockers: string[] = []
  const counts = {} as Record<CosUniversityPhdEvidenceStage, number>
  for (const stage of Object.keys(program.minimumDistinctPasses) as CosUniversityPhdEvidenceStage[]) {
    const count = cosUniversityPhdDistinctPassesAfterLatestFailure(evidence, programId, stage, now)
    counts[stage] = count
    if (count < program.minimumDistinctPasses[stage]) blockers.push(`${stage}_incomplete`)
  }

  if (blockers.length) {
    return {
      graduated: false,
      standing: 'not_graduated',
      blockers,
      authorityExpanded: false,
      semantics: 'research_process_and_novelty_require_independent_host_evidence',
    }
  }

  const aPlus = (Object.keys(program.aPlusDistinctPasses) as CosUniversityPhdEvidenceStage[])
    .every(stage => counts[stage] >= program.aPlusDistinctPasses[stage])

  return {
    graduated: true,
    standing: aPlus ? 'A+' : 'A',
    blockers: [],
    authorityExpanded: false,
    semantics: 'research_process_and_novelty_require_independent_host_evidence',
  }
}

export function relevantMastersExists(programId: CosUniversityPhdProgramId): boolean {
  const prerequisite = COS_UNIVERSITY_PHD_PROGRAMS[programId]?.mastersPrerequisite
  return Boolean(prerequisite && COS_UNIVERSITY_MASTERS_PROGRAMS[prerequisite])
}
