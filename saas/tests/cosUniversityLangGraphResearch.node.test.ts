import assert from 'node:assert/strict'
import test from 'node:test'
import {
  runUniversityResearchGraph,
  type UniversityResearchCheckpoint,
  type UniversityResearchGraphDependencies,
  type UniversityResearchSource,
} from '../lib/cos-core/orchestration/university-research.ts'

const input = {
  runId: 'university-research:test:1',
  agentId: 'cos',
  subject: 'Research methods',
  question: 'What does the evidence support, and where do sources disagree?',
}

const source = (index: number): UniversityResearchSource => ({
  id: `source-${index}`,
  uri: `https://example.test/paper-${index}`,
  title: `Paper ${index}`,
  sourceKind: 'research_paper',
})

const evidenceFor = (item: UniversityResearchSource) => ({
  sourceId: item.id,
  summary: `Evidence from ${item.id}`,
  claims: [{ statement: `Claim from ${item.id}`, evidenceRefs: [`${item.id}:claim:1`], confidence: 0.9 }],
  provenance: [{
    sourceId: item.id,
    sourceUri: item.uri,
    observedAt: '2026-09-11T19:00:00.000Z',
    locator: 'abstract',
    contentHash: `hash-${item.id}`,
  }],
})

test('University research graph bounds source fan-out, preserves provenance and contradictions, and requires reviewed durable handoff', async () => {
  let active = 0
  let maxActive = 0
  const checkpoints: string[] = []
  let synthesisContradictions = -1
  let reviewContradictions = -1
  let handoffContradictions = -1

  const result = await runUniversityResearchGraph(
    input,
    {
      planSources: () => [source(1), source(2), source(3), source(4), source(5)],
      researchSource: async ({ source: item }) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return evidenceFor(item)
      },
      identifyContradictions: ({ evidence }) => [{
        topic: 'measured effect',
        statementA: 'The effect is positive.',
        statementB: 'The effect is not distinguishable from zero.',
        sourceIds: [evidence[0].sourceId, evidence[1].sourceId],
        evidenceRefs: ['cross-source:1'],
      }],
      synthesize: ({ evidence, contradictions, planStats }) => {
        synthesisContradictions = contradictions.length
        return { evidenceCount: evidence.length, contradictionCount: contradictions.length, planStats }
      },
      specialistReview: ({ evidence, contradictions }) => {
        reviewContradictions = contradictions.length
        return {
          status: 'approved_for_handoff',
          reviewerRole: 'research-specialist',
          evidenceRefs: evidence.flatMap(item => item.provenance.map(provenance => provenance.contentHash || '')),
        }
      },
      durableHandoff: ({ contradictions, review }) => {
        handoffContradictions = contradictions.length
        return { handoffId: 'handoff-1', reviewStatus: review.status }
      },
      persistCheckpoint: checkpoint => { checkpoints.push(checkpoint.completedStage) },
    },
    { maxSources: 3, concurrency: 2 },
  )

  assert.equal(result.status, 'approved_for_handoff')
  assert.equal(result.academicAuthority, 'none')
  assert.equal(result.planStats.proposedSources, 5)
  assert.equal(result.planStats.selectedSources, 3)
  assert.equal(result.planStats.truncatedSources, 2)
  assert.equal(result.planStats.concurrency, 2)
  assert.equal(result.evidence.length, 3)
  assert.equal(result.failures.length, 0)
  assert.equal(result.contradictions.length, 1)
  assert.ok(result.evidence.every(item => item.provenance.length > 0))
  assert.equal(maxActive, 2)
  assert.equal(synthesisContradictions, 1)
  assert.equal(reviewContradictions, 1)
  assert.equal(handoffContradictions, 1)
  assert.deepEqual(checkpoints, [
    'planned',
    'researched',
    'contradictions_mapped',
    'synthesized',
    'reviewed',
    'handed_off',
  ])
})

test('University research graph resumes from a durable checkpoint without repeating completed source work', async () => {
  const checkpoints: UniversityResearchCheckpoint<{ answer: string }, { handoffId: string }>[] = []
  const firstDependencies: UniversityResearchGraphDependencies<{ answer: string }, { handoffId: string }> = {
    planSources: () => [source(1), source(2)],
    researchSource: ({ source: item }) => evidenceFor(item),
    identifyContradictions: () => [],
    synthesize: () => { throw new Error('stop after contradiction checkpoint') },
    specialistReview: () => ({ status: 'needs_revision', reviewerRole: 'research-specialist' }),
    durableHandoff: () => ({ handoffId: 'unreachable' }),
    persistCheckpoint: checkpoint => { checkpoints.push(checkpoint) },
  }

  await assert.rejects(
    runUniversityResearchGraph(input, firstDependencies),
    /stop after contradiction checkpoint/,
  )

  const resumeFrom = checkpoints.find(checkpoint => checkpoint.completedStage === 'contradictions_mapped')
  assert.ok(resumeFrom)

  const resumed = await runUniversityResearchGraph(
    input,
    {
      planSources: () => { throw new Error('planning must not repeat') },
      researchSource: () => { throw new Error('source research must not repeat') },
      identifyContradictions: () => { throw new Error('contradiction mapping must not repeat') },
      synthesize: ({ evidence }) => ({ answer: `synthesized ${evidence.length} sources` }),
      specialistReview: () => ({ status: 'approved_for_handoff', reviewerRole: 'research-specialist' }),
      durableHandoff: () => ({ handoffId: 'handoff-resumed' }),
      persistCheckpoint: () => {},
    },
    { resumeFrom },
  )

  assert.equal(resumed.status, 'approved_for_handoff')
  assert.equal(resumed.handoff.handoffId, 'handoff-resumed')
  assert.match(resumed.trace.join('|'), /resume:contradictions_mapped/)
  assert.equal(resumed.academicAuthority, 'none')
})

test('University research graph preserves source failures and skips synthesis when no provenance-backed evidence exists', async () => {
  let synthesizeCalled = false
  const result = await runUniversityResearchGraph(
    input,
    {
      planSources: () => [source(1)],
      researchSource: ({ source: item }) => ({
        sourceId: item.id,
        summary: 'Unsupported summary',
        claims: [],
        provenance: [],
      }),
      identifyContradictions: () => [],
      synthesize: () => {
        synthesizeCalled = true
        return { answer: 'must not run' }
      },
      specialistReview: ({ evidence, failures }) => ({
        status: 'needs_revision',
        reviewerRole: 'research-specialist',
        reason: `evidence=${evidence.length};failures=${failures.length}`,
      }),
      durableHandoff: ({ review }) => ({ handoffId: `revision:${review.status}` }),
      persistCheckpoint: () => {},
    },
  )

  assert.equal(synthesizeCalled, false)
  assert.equal(result.status, 'needs_revision')
  assert.equal(result.evidence.length, 0)
  assert.equal(result.failures.length, 1)
  assert.match(result.failures[0].reason, /complete provenance/i)
  assert.equal(result.academicAuthority, 'none')
})

test('University research graph refuses specialist approval when every source lacks valid evidence', async () => {
  await assert.rejects(
    runUniversityResearchGraph(
      input,
      {
        planSources: () => [source(1)],
        researchSource: ({ source: item }) => ({
          sourceId: item.id,
          summary: 'Unsupported summary',
          claims: [],
          provenance: [],
        }),
        identifyContradictions: () => [],
        synthesize: () => ({ answer: 'must not run' }),
        specialistReview: () => ({ status: 'approved_for_handoff', reviewerRole: 'research-specialist' }),
        durableHandoff: () => ({ handoffId: 'must-not-run' }),
        persistCheckpoint: () => {},
      },
    ),
    /cannot approve a handoff without provenance-backed evidence/i,
  )
})
