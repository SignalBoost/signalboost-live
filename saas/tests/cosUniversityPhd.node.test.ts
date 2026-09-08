import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_PHD_PROGRAMS,
  COS_UNIVERSITY_PHD_RESEARCH_COMPETENCIES,
  cosUniversityPhdDistinctPassesAfterLatestFailure,
  cosUniversityPhdEvidenceEligible,
  cosUniversityPhdExpectedAuthority,
  evaluateCosUniversityPhdAdmission,
  evaluateCosUniversityPhdGraduation,
  relevantMastersExists,
  type CosUniversityPhdEvidence,
  type CosUniversityPhdEvidenceStage,
  type CosUniversityPhdResearchLineage,
} from '../lib/ai/cos/cosUniversityPhd.ts'

const NOW = new Date('2027-09-08T00:00:00Z')
const PROGRAM = 'ai_systems_research' as const
const CANDIDATE = 'candidate-cos'
const LINEAGE: CosUniversityPhdResearchLineage = Object.freeze({
  candidateActorId: CANDIDATE,
  researchProjectId: 'project-alpha',
  protocolId: 'protocol-alpha',
})

const STAGES: readonly CosUniversityPhdEvidenceStage[] = Object.freeze([
  'research_methodology_exam',
  'primary_literature_synthesis',
  'hypothesis_proposal',
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

const EVALUATORS: Readonly<Record<CosUniversityPhdEvidenceStage, readonly string[]>> = Object.freeze({
  research_methodology_exam: Object.freeze(['method-examiner-1']),
  primary_literature_synthesis: Object.freeze(['literature-panel-1', 'literature-panel-2']),
  hypothesis_proposal: Object.freeze(['hypothesis-committee-1', 'hypothesis-committee-2']),
  preregistered_experiment: Object.freeze(['experiment-evaluator-1']),
  independent_replication: Object.freeze(['replication-panel-1', 'replication-panel-2']),
  peer_critique_defense: Object.freeze(['peer-panel-1', 'peer-panel-2']),
  dissertation_defense: Object.freeze(['dissertation-panel-1', 'dissertation-panel-2']),
})

function evidence(
  stage: CosUniversityPhdEvidenceStage,
  variantHash: string,
  extra: Partial<CosUniversityPhdEvidence> = {},
): CosUniversityPhdEvidence {
  const chainParent = stage === 'primary_literature_synthesis' || stage === 'research_methodology_exam'
    ? undefined
    : [`parent:${stage}:${variantHash}`]
  return {
    evidenceId: `${stage}:${variantHash}`,
    programId: PROGRAM,
    stage,
    researchProjectId: LINEAGE.researchProjectId,
    protocolId: LINEAGE.protocolId,
    candidateActorId: CANDIDATE,
    performerActorIds: stage === 'independent_replication' ? ['replicator-1'] : [CANDIDATE],
    evaluatorActorIds: EVALUATORS[stage],
    identityProvenance: 'host_identity_ledger',
    ...(chainParent ? { parentEvidenceIds: chainParent } : {}),
    passed: true,
    variantHash,
    observedAt: '2027-06-01T00:00:00Z',
    validUntil: '2028-06-01T00:00:00Z',
    independent: true,
    authority: cosUniversityPhdExpectedAuthority(stage),
    ...(stage === 'primary_literature_synthesis' ? { primarySourceCount: 6 } : {}),
    ...(stage === 'preregistered_experiment'
      ? { protocolFrozen: true, reproducibleArtifactHash: `artifact-${variantHash}` }
      : {}),
    ...(stage === 'independent_replication'
      ? { independentReplication: true, replicatedArtifactHash: 'artifact-seed' }
      : {}),
    ...(stage === 'peer_critique_defense' ? { critiqueResolved: true } : {}),
    ...(stage === 'dissertation_defense' ? { noveltyJudgedIndependent: true } : {}),
    ...extra,
  }
}

test('PhD catalog aligns five research programs to the five canonical Master’s prerequisites', () => {
  assert.equal(Object.keys(COS_UNIVERSITY_PHD_PROGRAMS).length, 5)
  for (const program of Object.values(COS_UNIVERSITY_PHD_PROGRAMS)) {
    assert.equal(relevantMastersExists(program.id), true)
    assert.equal(program.competencies.length, COS_UNIVERSITY_PHD_RESEARCH_COMPETENCIES.length)
  }
})

test('research curriculum explicitly covers methodology literature hypotheses experiments replication peer criticism integrity and novelty', () => {
  assert.deepEqual(COS_UNIVERSITY_PHD_RESEARCH_COMPETENCIES, [
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
})

test('PhD admission requires the relevant awarded Master’s, current A standing, generalist currency, and justified research need', () => {
  const good = evaluateCosUniversityPhdAdmission(PROGRAM, {
    mastersCredentialAwarded: true,
    mastersProgramId: 'applied_ai_systems',
    mastersCredentialStanding: 'A+',
    currentMastersStanding: 'A+',
    currentGeneralistStanding: 'A',
    researchNeedJustified: true,
  })
  assert.equal(good.admitted, true)

  const bad = evaluateCosUniversityPhdAdmission(PROGRAM, {
    mastersCredentialAwarded: true,
    mastersProgramId: 'security_and_trust',
    mastersCredentialStanding: 'A',
    currentMastersStanding: 'A',
    currentGeneralistStanding: 'A',
    researchNeedJustified: false,
  })
  assert.equal(bad.admitted, false)
  assert.ok(bad.reasons.includes('relevant_masters_required:applied_ai_systems'))
  assert.ok(bad.reasons.includes('research_need_not_justified'))
})

test('research evidence fails closed unless authority, identity separation, and stage integrity proof are present', () => {
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('primary_literature_synthesis', 'lit', { primarySourceCount: 2 }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('preregistered_experiment', 'exp', { protocolFrozen: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('independent_replication', 'rep', { independentReplication: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('peer_critique_defense', 'peer', { critiqueResolved: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('dissertation_defense', 'thesis', { noveltyJudgedIndependent: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('research_methodology_exam', 'self', { independent: false }), NOW), false)

  const untrustedIdentity = {
    ...evidence('research_methodology_exam', 'untrusted'),
    identityProvenance: 'untrusted',
  } as unknown as CosUniversityPhdEvidence
  assert.equal(cosUniversityPhdEvidenceEligible(untrustedIdentity, NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('research_methodology_exam', 'candidate-grades-self', {
    evaluatorActorIds: [CANDIDATE],
  }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('preregistered_experiment', 'performer-is-evaluator', {
    evaluatorActorIds: [CANDIDATE],
  }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('independent_replication', 'candidate-replicates-self', {
    performerActorIds: [CANDIDATE],
  }), NOW), false)
})

test('a later failed research stage resets earlier passes until fresh distinct evidence is re-earned', () => {
  const rows = [
    evidence('independent_replication', 'r1'),
    evidence('independent_replication', 'r2'),
    evidence('independent_replication', 'failure', { passed: false, observedAt: '2027-07-01T00:00:00Z' }),
    evidence('independent_replication', 'r3', { observedAt: '2027-08-01T00:00:00Z' }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', LINEAGE, NOW), 1)
})

test('a pass at the exact failure timestamp is not post-failure evidence', () => {
  const tiedAt = '2027-07-01T00:00:00Z'
  const rows = [
    evidence('independent_replication', 'r1'),
    evidence('independent_replication', 'failure', { passed: false, observedAt: tiedAt }),
    evidence('independent_replication', 'same-time-r2', { observedAt: tiedAt }),
    evidence('independent_replication', 'same-time-r3', { observedAt: tiedAt }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', LINEAGE, NOW), 0)
})

test('a failed stage resets prior passes even when the failure lacks success-only proof', () => {
  const rows = [
    evidence('independent_replication', 'r1'),
    evidence('independent_replication', 'r2'),
    evidence('independent_replication', 'failure', {
      passed: false,
      observedAt: '2027-07-01T00:00:00Z',
      independentReplication: false,
      replicatedArtifactHash: null,
    }),
    evidence('independent_replication', 'r3', { observedAt: '2027-08-01T00:00:00Z' }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', LINEAGE, NOW), 1)
})

test('an expired failure event cannot resurrect older still-current passes', () => {
  const rows = [
    evidence('independent_replication', 'r1', { validUntil: '2029-06-01T00:00:00Z' }),
    evidence('independent_replication', 'r2', { validUntil: '2029-06-01T00:00:00Z' }),
    evidence('independent_replication', 'failure', {
      passed: false,
      observedAt: '2027-07-01T00:00:00Z',
      validUntil: '2027-08-01T00:00:00Z',
      independentReplication: false,
      replicatedArtifactHash: null,
    }),
    evidence('independent_replication', 'r3', {
      observedAt: '2027-08-15T00:00:00Z',
      validUntil: '2029-06-01T00:00:00Z',
    }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', LINEAGE, NOW), 1)
})

function completeEvidence(aPlus = false): CosUniversityPhdEvidence[] {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[PROGRAM]
  const thresholds = aPlus ? program.aPlusDistinctPasses : program.minimumDistinctPasses
  const rows: CosUniversityPhdEvidence[] = []
  const byStage = {} as Record<CosUniversityPhdEvidenceStage, CosUniversityPhdEvidence[]>
  for (const stage of STAGES) byStage[stage] = []

  for (const stage of STAGES) {
    const count = thresholds[stage]
    for (let index = 0; index < count; index += 1) {
      const variant = `${stage}-${index}`
      const extra: Partial<CosUniversityPhdEvidence> = {}
      if (stage === 'hypothesis_proposal') {
        extra.parentEvidenceIds = [byStage.primary_literature_synthesis[index % byStage.primary_literature_synthesis.length].evidenceId]
      } else if (stage === 'preregistered_experiment') {
        extra.parentEvidenceIds = [byStage.hypothesis_proposal[index % byStage.hypothesis_proposal.length].evidenceId]
      } else if (stage === 'independent_replication') {
        const experiment = byStage.preregistered_experiment[index % byStage.preregistered_experiment.length]
        extra.parentEvidenceIds = [experiment.evidenceId]
        extra.replicatedArtifactHash = experiment.reproducibleArtifactHash
      } else if (stage === 'peer_critique_defense') {
        extra.parentEvidenceIds = [byStage.independent_replication[index % byStage.independent_replication.length].evidenceId]
      } else if (stage === 'dissertation_defense') {
        extra.parentEvidenceIds = [byStage.peer_critique_defense[index % byStage.peer_critique_defense.length].evidenceId]
      }
      const row = evidence(stage, variant, extra)
      rows.push(row)
      byStage[stage].push(row)
    }
  }
  return rows
}

test('unrelated research projects cannot be aggregated into a PhD', () => {
  const mixed = completeEvidence().map(row => row.stage === 'dissertation_defense'
    ? { ...row, researchProjectId: 'project-beta', protocolId: 'protocol-beta' }
    : row)
  const decision = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, mixed, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('coherent_research_lineage_incomplete'))
})

test('replication must link to the counted preregistered experiment and reproduce its artifact', () => {
  const unrelatedParent = completeEvidence()
  const firstReplication = unrelatedParent.findIndex(row => row.stage === 'independent_replication')
  unrelatedParent[firstReplication] = { ...unrelatedParent[firstReplication], parentEvidenceIds: ['unrelated-experiment'] }
  const brokenLink = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, unrelatedParent, NOW)
  assert.equal(brokenLink.graduated, false)
  assert.ok(brokenLink.blockers.includes('research_lineage_link_failed'))

  const wrongArtifact = completeEvidence()
  const replicationIndex = wrongArtifact.findIndex(row => row.stage === 'independent_replication')
  wrongArtifact[replicationIndex] = { ...wrongArtifact[replicationIndex], replicatedArtifactHash: 'different-artifact' }
  const mismatch = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, wrongArtifact, NOW)
  assert.equal(mismatch.graduated, false)
  assert.ok(mismatch.blockers.includes('research_replication_target_mismatch'))
})

test('critical research evaluators and replication actors must be separated across stages', () => {
  const rows = completeEvidence()
  const dissertationIndex = rows.findIndex(row => row.stage === 'dissertation_defense')
  rows[dissertationIndex] = {
    ...rows[dissertationIndex],
    evaluatorActorIds: ['replication-panel-1', 'dissertation-panel-2'],
  }
  const decision = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, rows, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('research_independence_separation_failed'))
})

test('PhD graduation requires one coherent research lineage and never expands execution authority', () => {
  const incomplete = completeEvidence()
  incomplete.splice(incomplete.findIndex(row => row.stage === 'peer_critique_defense'), 1)
  const blocked = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, incomplete, NOW)
  assert.equal(blocked.graduated, false)
  assert.ok(blocked.blockers.includes('peer_critique_defense_incomplete'))

  const passed = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, completeEvidence(), NOW)
  assert.equal(passed.graduated, true)
  assert.equal(passed.standing, 'A')
  assert.equal(passed.candidateActorId, CANDIDATE)
  assert.equal(passed.researchProjectId, LINEAGE.researchProjectId)
  assert.equal(passed.protocolId, LINEAGE.protocolId)
  assert.equal(passed.authorityExpanded, false)

  const exceptional = evaluateCosUniversityPhdGraduation(PROGRAM, CANDIDATE, completeEvidence(true), NOW)
  assert.equal(exceptional.graduated, true)
  assert.equal(exceptional.standing, 'A+')
  assert.equal(exceptional.authorityExpanded, false)
})
