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

const RESEARCH_CHAIN: readonly CosUniversityPhdEvidenceStage[] = Object.freeze([
  'primary_literature_synthesis',
  'hypothesis_proposal',
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

const CRITICAL_INDEPENDENCE_STAGES: readonly CosUniversityPhdEvidenceStage[] = Object.freeze([
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

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

export type CosUniversityPhdResearchLineage = Readonly<{
  candidateActorId: string
  researchProjectId: string
  protocolId: string
}>

export type CosUniversityPhdEvidence = {
  evidenceId: string
  programId: CosUniversityPhdProgramId
  stage: CosUniversityPhdEvidenceStage
  researchProjectId: string
  protocolId: string
  candidateActorId: string
  performerActorIds: readonly string[]
  evaluatorActorIds: readonly string[]
  identityProvenance: 'host_identity_ledger'
  parentEvidenceIds?: readonly string[]
  passed: boolean
  variantHash: string
  observedAt: string
  validUntil: string
  independent: boolean
  authority: CosUniversityPhdEvidenceAuthority
  primarySourceCount?: number
  protocolFrozen?: boolean
  reproducibleArtifactHash?: string | null
  replicatedArtifactHash?: string | null
  independentReplication?: boolean
  critiqueResolved?: boolean
  noveltyJudgedIndependent?: boolean
}

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

function cleanId(value: unknown): string {
  return String(value || '').trim()
}

function normalizedDistinctIds(values: readonly string[] | undefined): { valid: boolean; ids: string[] } {
  if (!Array.isArray(values)) return { valid: false, ids: [] }
  const ids = values.map(value => cleanId(value))
  if (ids.some(value => !value)) return { valid: false, ids: [] }
  if (new Set(ids).size !== ids.length) return { valid: false, ids: [] }
  return { valid: true, ids }
}

function parentIds(row: CosUniversityPhdEvidence): { valid: boolean; ids: string[] } {
  if (row.parentEvidenceIds === undefined) return { valid: true, ids: [] }
  const parents = normalizedDistinctIds(row.parentEvidenceIds)
  if (!parents.valid || parents.ids.includes(cleanId(row.evidenceId))) return { valid: false, ids: [] }
  return parents
}

function minimumEvaluatorCount(stage: CosUniversityPhdEvidenceStage): number {
  return stage === 'research_methodology_exam' || stage === 'preregistered_experiment' ? 1 : 2
}

function identityEligible(row: CosUniversityPhdEvidence): boolean {
  const evidenceId = cleanId(row.evidenceId)
  const candidateActorId = cleanId(row.candidateActorId)
  const researchProjectId = cleanId(row.researchProjectId)
  const protocolId = cleanId(row.protocolId)
  if (!evidenceId || !candidateActorId || !researchProjectId || !protocolId) return false
  if (row.identityProvenance !== 'host_identity_ledger') return false

  const performers = normalizedDistinctIds(row.performerActorIds)
  const evaluators = normalizedDistinctIds(row.evaluatorActorIds)
  const parents = parentIds(row)
  if (!performers.valid || !evaluators.valid || !parents.valid) return false
  if (!performers.ids.length || evaluators.ids.length < minimumEvaluatorCount(row.stage)) return false

  const evaluatorSet = new Set(evaluators.ids)
  if (evaluatorSet.has(candidateActorId)) return false
  if (performers.ids.some(actorId => evaluatorSet.has(actorId))) return false

  if (row.stage === 'independent_replication') {
    if (performers.ids.includes(candidateActorId)) return false
  } else if (!performers.ids.includes(candidateActorId)) {
    return false
  }
  return true
}

function evidenceEnvelopeEligible(row: CosUniversityPhdEvidence, now: Date, requireCurrent: boolean): boolean {
  const observedAt = validTime(row.observedAt)
  const validUntil = validTime(row.validUntil)
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs) || observedAt === null || validUntil === null) return false
  if (!String(row.variantHash || '').trim()) return false
  if (!COS_UNIVERSITY_PHD_PROGRAMS[row.programId]) return false
  if (observedAt > nowMs || validUntil <= observedAt) return false
  if (requireCurrent && validUntil <= nowMs) return false
  if (!row.independent) return false
  if (row.authority !== cosUniversityPhdExpectedAuthority(row.stage)) return false
  if (!identityEligible(row)) return false
  return true
}

export function cosUniversityPhdEvidenceEligible(row: CosUniversityPhdEvidence, now = new Date()): boolean {
  if (!row.passed || !evidenceEnvelopeEligible(row, now, true)) return false

  const parents = parentIds(row).ids
  if (RESEARCH_CHAIN.includes(row.stage) && row.stage !== 'primary_literature_synthesis' && !parents.length) return false
  if (row.stage === 'primary_literature_synthesis' && (row.primarySourceCount ?? 0) < 3) return false
  if (row.stage === 'preregistered_experiment') {
    if (row.protocolFrozen !== true) return false
    if (!String(row.reproducibleArtifactHash || '').trim()) return false
  }
  if (row.stage === 'independent_replication') {
    if (row.independentReplication !== true) return false
    if (!String(row.replicatedArtifactHash || '').trim()) return false
  }
  if (row.stage === 'peer_critique_defense' && row.critiqueResolved !== true) return false
  if (row.stage === 'dissertation_defense' && row.noveltyJudgedIndependent !== true) return false
  return true
}

function cosUniversityPhdFailureResetEligible(row: CosUniversityPhdEvidence, now: Date): boolean {
  // A host-verified failure is a durable reset event, not positive mastery credit. It remains the
  // reset boundary even after its ordinary evidence freshness window expires, so older passes can
  // never reappear without fresh post-failure evidence.
  return !row.passed && evidenceEnvelopeEligible(row, now, false)
}

function lineageForRow(row: CosUniversityPhdEvidence): CosUniversityPhdResearchLineage | null {
  const candidateActorId = cleanId(row.candidateActorId)
  const researchProjectId = cleanId(row.researchProjectId)
  const protocolId = cleanId(row.protocolId)
  if (!candidateActorId || !researchProjectId || !protocolId) return null
  return { candidateActorId, researchProjectId, protocolId }
}

function sameLineage(row: CosUniversityPhdEvidence, lineage: CosUniversityPhdResearchLineage): boolean {
  return cleanId(row.candidateActorId) === lineage.candidateActorId
    && cleanId(row.researchProjectId) === lineage.researchProjectId
    && cleanId(row.protocolId) === lineage.protocolId
}

function stageRows(
  evidence: readonly CosUniversityPhdEvidence[],
  programId: CosUniversityPhdProgramId,
  stage: CosUniversityPhdEvidenceStage,
  lineage: CosUniversityPhdResearchLineage,
  now: Date,
): CosUniversityPhdEvidence[] {
  return evidence
    .filter(row => row.programId === programId && row.stage === stage && sameLineage(row, lineage))
    .filter(row => row.passed
      ? cosUniversityPhdEvidenceEligible(row, now)
      : cosUniversityPhdFailureResetEligible(row, now))
    .slice()
    .sort((a, b) => {
      const observedDelta = Date.parse(a.observedAt) - Date.parse(b.observedAt)
      if (observedDelta !== 0) return observedDelta
      if (a.passed !== b.passed) return a.passed ? -1 : 1
      return cleanId(a.evidenceId).localeCompare(cleanId(b.evidenceId))
    })
}

function currentStagePassRows(
  evidence: readonly CosUniversityPhdEvidence[],
  programId: CosUniversityPhdProgramId,
  stage: CosUniversityPhdEvidenceStage,
  lineage: CosUniversityPhdResearchLineage,
  now: Date,
): CosUniversityPhdEvidence[] {
  const rows = stageRows(evidence, programId, stage, lineage, now)
  let variants = new Map<string, CosUniversityPhdEvidence>()
  for (const row of rows) {
    if (!row.passed) {
      variants = new Map<string, CosUniversityPhdEvidence>()
      continue
    }
    variants.set(row.variantHash.trim(), row)
  }
  return [...variants.values()]
}

export function cosUniversityPhdDistinctPassesAfterLatestFailure(
  evidence: readonly CosUniversityPhdEvidence[],
  programId: CosUniversityPhdProgramId,
  stage: CosUniversityPhdEvidenceStage,
  lineage: CosUniversityPhdResearchLineage,
  now = new Date(),
): number {
  return currentStagePassRows(evidence, programId, stage, lineage, now).length
}

function lineagesForCandidate(
  evidence: readonly CosUniversityPhdEvidence[],
  programId: CosUniversityPhdProgramId,
  candidateActorId: string,
): CosUniversityPhdResearchLineage[] {
  const seen = new Map<string, CosUniversityPhdResearchLineage>()
  for (const row of evidence) {
    if (row.programId !== programId || cleanId(row.candidateActorId) !== candidateActorId) continue
    const lineage = lineageForRow(row)
    if (!lineage) continue
    const key = `${lineage.candidateActorId}\u0000${lineage.researchProjectId}\u0000${lineage.protocolId}`
    if (!seen.has(key)) seen.set(key, lineage)
  }
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, lineage]) => lineage)
}

function researchLineageLinkageBlockers(
  passes: Readonly<Record<CosUniversityPhdEvidenceStage, CosUniversityPhdEvidence[]>>,
): string[] {
  const evidenceIds = new Set<string>()
  for (const rows of Object.values(passes)) {
    for (const row of rows) {
      const evidenceId = cleanId(row.evidenceId)
      if (evidenceIds.has(evidenceId)) return ['research_evidence_identity_collision']
      evidenceIds.add(evidenceId)
    }
  }

  for (let index = 1; index < RESEARCH_CHAIN.length; index += 1) {
    const stage = RESEARCH_CHAIN[index]
    const previousStage = RESEARCH_CHAIN[index - 1]
    const previousRows = passes[previousStage]
    const previousById = new Map(previousRows.map(row => [cleanId(row.evidenceId), row]))
    for (const row of passes[stage]) {
      const linkedParents = parentIds(row).ids
        .map(id => previousById.get(id))
        .filter((parent): parent is CosUniversityPhdEvidence => Boolean(parent))
        .filter(parent => Date.parse(parent.observedAt) < Date.parse(row.observedAt))
      if (!linkedParents.length) return ['research_lineage_link_failed']
      if (stage === 'independent_replication') {
        const replicatedArtifactHash = String(row.replicatedArtifactHash || '').trim()
        if (!linkedParents.some(parent => String(parent.reproducibleArtifactHash || '').trim() === replicatedArtifactHash)) {
          return ['research_replication_target_mismatch']
        }
      }
    }
  }
  return []
}

function researchIndependenceBlockers(
  passes: Readonly<Record<CosUniversityPhdEvidenceStage, CosUniversityPhdEvidence[]>>,
): string[] {
  const externalActors = new Map<CosUniversityPhdEvidenceStage, Set<string>>()
  for (const stage of CRITICAL_INDEPENDENCE_STAGES) {
    const actors = new Set<string>()
    for (const row of passes[stage]) {
      for (const actorId of row.evaluatorActorIds) actors.add(cleanId(actorId))
      if (stage === 'preregistered_experiment') {
        const candidateActorId = cleanId(row.candidateActorId)
        for (const actorId of row.performerActorIds) {
          const performerActorId = cleanId(actorId)
          if (performerActorId !== candidateActorId) actors.add(performerActorId)
        }
      }
      if (stage === 'independent_replication') {
        for (const actorId of row.performerActorIds) actors.add(cleanId(actorId))
      }
    }
    externalActors.set(stage, actors)
  }

  for (let left = 0; left < CRITICAL_INDEPENDENCE_STAGES.length; left += 1) {
    for (let right = left + 1; right < CRITICAL_INDEPENDENCE_STAGES.length; right += 1) {
      const leftActors = externalActors.get(CRITICAL_INDEPENDENCE_STAGES[left]) ?? new Set<string>()
      const rightActors = externalActors.get(CRITICAL_INDEPENDENCE_STAGES[right]) ?? new Set<string>()
      if ([...leftActors].some(actorId => rightActors.has(actorId))) return ['research_independence_separation_failed']
    }
  }
  return []
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export type CosUniversityPhdGraduationDecision = {
  graduated: boolean
  standing: 'not_graduated' | 'A' | 'A+'
  blockers: string[]
  candidateActorId: string | null
  researchProjectId: string | null
  protocolId: string | null
  authorityExpanded: false
  semantics: 'research_process_and_novelty_require_independent_host_evidence'
}

export function evaluateCosUniversityPhdGraduation(
  programId: CosUniversityPhdProgramId,
  candidateActorIdInput: string,
  evidence: readonly CosUniversityPhdEvidence[],
  now = new Date(),
): CosUniversityPhdGraduationDecision {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[programId]
  const candidateActorId = cleanId(candidateActorIdInput)
  const empty = (blockers: string[]): CosUniversityPhdGraduationDecision => ({
    graduated: false,
    standing: 'not_graduated',
    blockers,
    candidateActorId: candidateActorId || null,
    researchProjectId: null,
    protocolId: null,
    authorityExpanded: false,
    semantics: 'research_process_and_novelty_require_independent_host_evidence',
  })
  if (!program) return empty(['unknown_phd_program'])
  if (!candidateActorId) return empty(['candidate_identity_required'])

  const lineages = lineagesForCandidate(evidence, programId, candidateActorId)
  if (!lineages.length) return empty(['coherent_research_lineage_required'])

  const failedLineageBlockers: string[][] = []
  const qualifying: Array<{
    lineage: CosUniversityPhdResearchLineage
    standing: 'A' | 'A+'
  }> = []

  for (const lineage of lineages) {
    const passes = {} as Record<CosUniversityPhdEvidenceStage, CosUniversityPhdEvidence[]>
    const counts = {} as Record<CosUniversityPhdEvidenceStage, number>
    const blockers: string[] = []
    for (const stage of Object.keys(program.minimumDistinctPasses) as CosUniversityPhdEvidenceStage[]) {
      passes[stage] = currentStagePassRows(evidence, programId, stage, lineage, now)
      counts[stage] = passes[stage].length
      if (counts[stage] < program.minimumDistinctPasses[stage]) blockers.push(`${stage}_incomplete`)
    }

    if (!blockers.length) {
      blockers.push(...researchLineageLinkageBlockers(passes))
      blockers.push(...researchIndependenceBlockers(passes))
    }

    if (blockers.length) {
      failedLineageBlockers.push(unique(blockers))
      continue
    }

    const aPlus = (Object.keys(program.aPlusDistinctPasses) as CosUniversityPhdEvidenceStage[])
      .every(stage => counts[stage] >= program.aPlusDistinctPasses[stage])
    qualifying.push({ lineage, standing: aPlus ? 'A+' : 'A' })
  }

  if (qualifying.length) {
    qualifying.sort((left, right) => {
      if (left.standing !== right.standing) return left.standing === 'A+' ? -1 : 1
      const leftKey = `${left.lineage.researchProjectId}\u0000${left.lineage.protocolId}`
      const rightKey = `${right.lineage.researchProjectId}\u0000${right.lineage.protocolId}`
      return leftKey.localeCompare(rightKey)
    })
    const best = qualifying[0]
    return {
      graduated: true,
      standing: best.standing,
      blockers: [],
      candidateActorId,
      researchProjectId: best.lineage.researchProjectId,
      protocolId: best.lineage.protocolId,
      authorityExpanded: false,
      semantics: 'research_process_and_novelty_require_independent_host_evidence',
    }
  }

  const bestBlockers = failedLineageBlockers
    .slice()
    .sort((a, b) => a.length - b.length || a.join('|').localeCompare(b.join('|')))[0] ?? []
  return empty(unique([...bestBlockers, 'coherent_research_lineage_incomplete']))
}

export function relevantMastersExists(programId: CosUniversityPhdProgramId): boolean {
  const prerequisite = COS_UNIVERSITY_PHD_PROGRAMS[programId]?.mastersPrerequisite
  return Boolean(prerequisite && COS_UNIVERSITY_MASTERS_PROGRAMS[prerequisite])
}