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
} from '../lib/ai/cos/cosUniversityPhd.ts'

const NOW = new Date('2027-09-08T00:00:00Z')
const PROGRAM = 'ai_systems_research' as const

function evidence(
  stage: CosUniversityPhdEvidenceStage,
  variantHash: string,
  extra: Partial<CosUniversityPhdEvidence> = {},
): CosUniversityPhdEvidence {
  return {
    programId: PROGRAM,
    stage,
    passed: true,
    variantHash,
    observedAt: '2027-06-01T00:00:00Z',
    validUntil: '2028-06-01T00:00:00Z',
    independent: true,
    authority: cosUniversityPhdExpectedAuthority(stage),
    ...(stage === 'primary_literature_synthesis' ? { primarySourceCount: 6 } : {}),
    ...(stage === 'preregistered_experiment' ? { protocolFrozen: true, reproducibleArtifactHash: `artifact-${variantHash}` } : {}),
    ...(stage === 'independent_replication' ? { independentReplication: true } : {}),
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

test('research evidence fails closed unless authority independence and stage-specific integrity proof are present', () => {
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('primary_literature_synthesis', 'lit', { primarySourceCount: 2 }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('preregistered_experiment', 'exp', { protocolFrozen: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('independent_replication', 'rep', { independentReplication: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('peer_critique_defense', 'peer', { critiqueResolved: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('dissertation_defense', 'thesis', { noveltyJudgedIndependent: false }), NOW), false)
  assert.equal(cosUniversityPhdEvidenceEligible(evidence('research_methodology_exam', 'self', { independent: false }), NOW), false)
})

test('a later failed research stage resets earlier passes until fresh distinct evidence is re-earned', () => {
  const rows = [
    evidence('independent_replication', 'r1'),
    evidence('independent_replication', 'r2'),
    evidence('independent_replication', 'failure', { passed: false, observedAt: '2027-07-01T00:00:00Z' }),
    evidence('independent_replication', 'r3', { observedAt: '2027-08-01T00:00:00Z' }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', NOW), 1)
})

test('a failed stage resets prior passes even when the failure lacks success-only proof', () => {
  const rows = [
    evidence('independent_replication', 'r1'),
    evidence('independent_replication', 'r2'),
    evidence('independent_replication', 'failure', {
      passed: false,
      observedAt: '2027-07-01T00:00:00Z',
      independentReplication: false,
    }),
    evidence('independent_replication', 'r3', { observedAt: '2027-08-01T00:00:00Z' }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', NOW), 1)
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
    }),
    evidence('independent_replication', 'r3', {
      observedAt: '2027-08-15T00:00:00Z',
      validUntil: '2029-06-01T00:00:00Z',
    }),
  ]
  assert.equal(cosUniversityPhdDistinctPassesAfterLatestFailure(rows, PROGRAM, 'independent_replication', NOW), 1)
})

function completeEvidence(aPlus = false): CosUniversityPhdEvidence[] {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[PROGRAM]
  const thresholds = aPlus ? program.aPlusDistinctPasses : program.minimumDistinctPasses
  const rows: CosUniversityPhdEvidence[] = []
  for (const [stage, count] of Object.entries(thresholds) as [CosUniversityPhdEvidenceStage, number][]) {
    for (let index = 0; index < count; index += 1) rows.push(evidence(stage, `${stage}-${index}`))
  }
  return rows
}

test('PhD graduation requires every research stage and never expands execution authority', () => {
  const incomplete = completeEvidence()
  incomplete.splice(incomplete.findIndex(row => row.stage === 'peer_critique_defense'), 1)
  const blocked = evaluateCosUniversityPhdGraduation(PROGRAM, incomplete, NOW)
  assert.equal(blocked.graduated, false)
  assert.ok(blocked.blockers.includes('peer_critique_defense_incomplete'))

  const passed = evaluateCosUniversityPhdGraduation(PROGRAM, completeEvidence(), NOW)
  assert.equal(passed.graduated, true)
  assert.equal(passed.standing, 'A')
  assert.equal(passed.authorityExpanded, false)

  const exceptional = evaluateCosUniversityPhdGraduation(PROGRAM, completeEvidence(true), NOW)
  assert.equal(exceptional.graduated, true)
  assert.equal(exceptional.standing, 'A+')
  assert.equal(exceptional.authorityExpanded, false)
})
