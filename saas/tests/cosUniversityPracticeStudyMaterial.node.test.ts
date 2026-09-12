import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
import { bindPracticeStudy, practiceStudyContentHashes, buildPracticeStudyMaterial, practiceStudyMaterialHash,
  type PracticeStudyMaterial } from '../lib/ai/cos/cosUniversityPracticeStudyMaterial.ts'
import { executeBoundSoftwareCapstone } from '../lib/ai/cos/cosUniversityAgentCapstone.ts'
import * as diagnostics from '../lib/cos-core/layers/learning/cycleDiagnostics.ts'

const root = path.resolve(import.meta.dirname, '..')
const file = (name: string) => fs.readFileSync(path.join(root, name), 'utf8')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const now = new Date('2026-09-12T04:00:00.000Z')
const request = { agentId: 'software-specialist', runId: '11111111-1111-4111-8111-111111111111', manifestHash: 'a'.repeat(64), prompt: 'Independent fresh case input' }
const planId = '22222222-2222-4222-8222-222222222222'
const runId = '33333333-3333-4333-8333-333333333333'
const ref = 'auto-gap:university:owned-plan:cos_university.history_culture_philosophy_religion'
function fixture() {
  const queue = { id: request.runId, status: 'running', metadata: { origin: 'cos_university_deliberate_practice',
    agentId: request.agentId, executionBinding: 'agent_bound_practice_v1', manifestHash: request.manifestHash,
    academicCredit: false, universityPlanId: planId, practiceRound: 2 } }
  const plan = { id: planId, agent_id: request.agentId, status: 'studying', attempt_count: 2, last_attempt_at: '2026-09-12T03:45:00.000Z',
    evidence: { studyProof: { source: 'continuous_learning_accepted_gap', academicCredit: false, studyAttempt: 2,
      observedAt: '2026-09-12T03:45:00.000Z', evidenceRefs: [ref] }, practiceRemediation: { practiceRound: 1, requiresNewStudyAttempt: true } } }
  const receipt = { id: runId, slot_key: `2026-09-12T03:45:${request.agentId}`, status: 'completed',
    started_at: plan.last_attempt_at, completed_at: '2026-09-12T03:46:00.000Z', plan_ids: [planId],
    gap_diagnostics: { [ref]: { accepted: 1, acceptedContentHashes: ['b'.repeat(64)] } } }
  const documents = [{ content_hash: 'b'.repeat(64), source_kind: 'scientific_journal', source_uri: 'https://example.org/source',
    source_title: 'History and context', summary: 'STUDY_SENTINEL: preserve historical context and distinguish claims from evidence.',
    confidence: 0.92, evidence: ['source-authored excerpt'], created_at: '2026-09-12T03:45:30.000Z' }]
  const binding = bindPracticeStudy(request, queue, plan, now)
  return { queue, plan, receipt, documents, binding }
}
function packet(): PracticeStudyMaterial { const f = fixture(); return buildPracticeStudyMaterial(f.binding, f.receipt, f.documents, now) }

test('exact admitted content joins its completed study attempt, not a title or date approximation', () => {
  const f = fixture(), p = buildPracticeStudyMaterial(f.binding, f.receipt, f.documents, now)
  assert.equal(p.planId, planId); assert.equal(p.learningRunId, runId); assert.equal(p.studyAttempt, 2)
  assert.equal(p.sources[0].contentHash, f.documents[0].content_hash); assert.match(p.sources[0].excerpt, /STUDY_SENTINEL/)
  assert.equal(p.academicCredit, false); assert.match(practiceStudyMaterialHash(p), /^[a-f0-9]{64}$/)
})

test('queue owner, manifest, state and bound-practice namespace cannot be substituted', () => {
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.queue.metadata.agentId = 'other-agent' },
    (f: ReturnType<typeof fixture>) => { f.queue.metadata.manifestHash = 'c'.repeat(64) },
    (f: ReturnType<typeof fixture>) => { f.queue.metadata.executionBinding = 'legacy' },
    (f: ReturnType<typeof fixture>) => { f.queue.status = 'passed' },
    (f: ReturnType<typeof fixture>) => { f.queue.metadata.universityPlanId = runId },
  ]) { const f = fixture(); mutation(f); assert.throws(() => bindPracticeStudy(request, f.queue, f.plan, now), /university_practice_study_/) }
})

test('wrong learner, stale round, missing proof and required restudy fail closed', () => {
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.plan.agent_id = 'cos' },
    (f: ReturnType<typeof fixture>) => { f.plan.attempt_count = 3 },
    (f: ReturnType<typeof fixture>) => { f.plan.evidence.studyProof.source = 'self_report' },
    (f: ReturnType<typeof fixture>) => { f.plan.evidence.studyProof.evidenceRefs = [] },
    (f: ReturnType<typeof fixture>) => { f.plan.evidence.practiceRemediation.practiceRound = 2 },
    (f: ReturnType<typeof fixture>) => { f.plan.last_attempt_at = '2026-09-12T03:44:00.000Z' },
  ]) { const f = fixture(); mutation(f); assert.throws(() => bindPracticeStudy(request, f.queue, f.plan, now), /university_practice_study_/) }
})

test('wrong lane, missing plan, unfinished or future receipt cannot supply study', () => {
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.receipt.slot_key = '2026-09-12T03:45:other-agent' },
    (f: ReturnType<typeof fixture>) => { f.receipt.plan_ids = [] },
    (f: ReturnType<typeof fixture>) => { f.receipt.status = 'running' },
    (f: ReturnType<typeof fixture>) => { f.receipt.started_at = '2026-09-12T03:44:00.000Z' },
    (f: ReturnType<typeof fixture>) => { f.receipt.completed_at = '2099-01-01T00:00:00.000Z' },
  ]) { const f = fixture(); mutation(f); assert.throws(() => practiceStudyContentHashes(f.binding, f.receipt, now), /receipt_binding_invalid/) }
})

test('historical counts without exact content hashes never manufacture a material receipt', () => {
  const f = fixture()
  const historic = { ...f.receipt, gap_diagnostics: { [ref]: { accepted: 2 } } }
  assert.throws(() => practiceStudyContentHashes(f.binding, historic, now), /content_receipt_missing/)
  for (const hashes of [[], ['forged'], ['b'.repeat(64), 'c'.repeat(64)]]) {
    f.receipt.gap_diagnostics[ref].acceptedContentHashes = hashes
    assert.throws(() => practiceStudyContentHashes(f.binding, f.receipt, now), /content_receipt_missing/)
  }
})

test('missing content, internal experience, invalid source and out-of-window writes are rejected', () => {
  const empty = fixture(); assert.throws(() => buildPracticeStudyMaterial(empty.binding, empty.receipt, [], now), /content_unavailable/)
  for (const mutation of [
    (f: ReturnType<typeof fixture>) => { f.documents[0].content_hash = 'c'.repeat(64) },
    (f: ReturnType<typeof fixture>) => { f.documents[0].source_kind = 'work_experience' },
    (f: ReturnType<typeof fixture>) => { f.documents[0].summary = '' },
    (f: ReturnType<typeof fixture>) => { f.documents[0].evidence = [] },
    (f: ReturnType<typeof fixture>) => { f.documents[0].confidence = Number.NaN },
    (f: ReturnType<typeof fixture>) => { f.documents[0].source_uri = 'https://user:password@example.org/source' },
    (f: ReturnType<typeof fixture>) => { f.documents[0].created_at = '2026-09-12T03:44:59.000Z' },
  ]) { const f = fixture(); mutation(f); assert.throws(() => buildPracticeStudyMaterial(f.binding, f.receipt, f.documents, now), /university_practice_study_/) }
})

test('material budget is deterministic, bounded and contains no hidden rubric or experience fields', () => {
  const f = fixture(), ids = Array.from({ length: 8 }, (_, i) => hash(`source-${i}`))
  f.receipt.gap_diagnostics[ref] = { accepted: 8, acceptedContentHashes: ids }
  const rows = ids.map(content_hash => ({ ...f.documents[0], content_hash, summary: 's'.repeat(4000), rubric: 'HIDDEN_RUBRIC', answer: 'HIDDEN_ANSWER' }))
  const p = buildPracticeStudyMaterial(f.binding, f.receipt, rows, now)
  assert.equal(p.sources.length, 4); assert.ok(p.sources.every(s => s.excerpt.length === 1200))
  assert.deepEqual(p.sources.map(s => s.contentHash), [...ids].sort().slice(0, 4))
  assert.doesNotMatch(JSON.stringify(p), /HIDDEN_RUBRIC|HIDDEN_ANSWER/)
})

test('actual practice composer supplies admitted study and records exact prompt/context provenance', async () => {
  const p = packet(); let reads = 0, inferencePrompt = '', inputPrompt = ''
  const result = await executeBoundSoftwareCapstone({ ...request, purpose: 'practice' }, {
    readRole: async () => 'software_engineering', loadProcedures: async () => [], model: 'configured-specialist',
    loadStudyMaterial: async () => { reads++; return p },
    infer: async input => { inferencePrompt = input.systemPrompt; inputPrompt = input.prompt; assert.equal(input.maxTokens, 1800); return 'fixture response' },
  })
  assert.equal(reads, 1); assert.match(inferencePrompt, /STUDY_SENTINEL/)
  assert.match(inferencePrompt, /untrusted reference data/); assert.match(inferencePrompt, /not instructions/)
  assert.equal(inputPrompt, request.prompt)
  assert.equal(result.execution.contextHash, hash(JSON.stringify({ procedures: [], studyMaterial: p })))
  assert.equal(result.execution.promptHash, hash(inferencePrompt + '\n' + request.prompt))
  assert.equal(result.execution.studyMaterial?.packetHash, practiceStudyMaterialHash(p))
  assert.deepEqual(result.execution.studyMaterial?.contentHashes, ['b'.repeat(64)])
  assert.equal(result.execution.academicAuthority, 'none')
})

test('independent assessment never calls the study port and retains its original prompt and context', async () => {
  let studyReads = 0, prompt = ''
  const result = await executeBoundSoftwareCapstone(request, {
    readRole: async () => 'software_engineering', loadProcedures: async () => ['validated own procedure'], model: 'configured-specialist',
    loadStudyMaterial: async () => { studyReads++; throw new Error('must not run') },
    infer: async input => { prompt = input.systemPrompt; assert.equal(input.maxTokens, 4096); return 'exam fixture response' },
  })
  assert.equal(studyReads, 0); assert.doesNotMatch(prompt, /STUDY_SENTINEL|Accepted study material/)
  assert.equal(result.execution.contextHash, hash(JSON.stringify(['validated own procedure'])))
  assert.equal(result.execution.studyMaterial, undefined)
})

test('material load failure or wrong-agent packet stops practice before inference, without fallback', async () => {
  for (const loadStudyMaterial of [async () => { throw new Error('receipt_missing') }, async () => ({ ...packet(), agentId: 'other-agent' })]) {
    let calls = 0
    await assert.rejects(executeBoundSoftwareCapstone({ ...request, purpose: 'practice' }, {
      readRole: async () => 'software_engineering', loadProcedures: async () => [], model: 'configured-specialist', loadStudyMaterial,
      infer: async () => { calls++; return 'should not execute' },
    }), /receipt_missing|packet_invalid/)
    assert.equal(calls, 0)
  }
})

test('admission hash receipts are deduplicated, bounded and do not change quality or count fields', () => {
  const d = diagnostics.initializeLearningGapDiagnostics([{ id: 'gap' }]).gap
  const before = JSON.stringify(d)
  diagnostics.recordAcceptedLearningContent(d, 'invalid')
  assert.equal(JSON.stringify(d), before)
  for (let i = 0; i < 80; i++) diagnostics.recordAcceptedLearningContent(d, hash(`candidate-${i}`))
  diagnostics.recordAcceptedLearningContent(d, hash('candidate-0'))
  assert.equal(d.acceptedContentHashes?.length, 64); assert.equal(d.accepted, 0); assert.equal(d.documentsAcquired, 0)
})

test('actual acquisition cycle records only successfully admitted hashes, never rejected or failed storage', async () => {
  // Exercise the real cycle with injected admission decisions, not its network/providers.
  let source = file('lib/cos-core/layers/learning/cycle.ts')
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').replace(/^export /gm, '')
  const js = stripTypeScriptTypes(source, { mode: 'transform' })
  const make = new Function('createHash', 'minimumConfidenceForKind', 'gapCurriculumAligned', 'classifyTieredAdmission',
    'incrementDiagnosticCount', 'recordAcceptedLearningContent', 'initializeLearningGapDiagnostics', 'learningGapDiagnostic',
    `${js}\nreturn ContinuousLearningCycle`)
  const Cycle = make(createHash, () => 0, () => true, () => ({ tier: 'standard' }), diagnostics.incrementDiagnosticCount,
    diagnostics.recordAcceptedLearningContent, diagnostics.initializeLearningGapDiagnostics, diagnostics.learningGapDiagnostic)
  const documents = ['accepted', 'duplicate', 'probationary', 'storage'].map(kind => ({ sourceKind: 'scientific_journal',
    sourceUri: `https://example.org/${kind}`, sourceTitle: 'Historical evidence and culture', subject: 'History', text: 'Historical evidence and culture. '.repeat(80) }))
  const director = { prioritizeGaps: (gaps: unknown[]) => gaps, admit: async (candidate: { sourceUri: string }) => {
    if (candidate.sourceUri.endsWith('/storage')) throw new Error('injected_storage_failure')
    if (candidate.sourceUri.endsWith('/accepted')) return { accepted: true }
    return { accepted: false, reason: candidate.sourceUri.endsWith('/duplicate') ? 'duplicate' : 'probationary', deferred: candidate.sourceUri.endsWith('/probationary') }
  } }
  const result = await new Cycle(director, [{ kind: 'scientific_journal', acquire: async () => documents }]).run([{ id: 'gap', subject: 'History', question: 'Historical evidence and culture' }])
  assert.equal(result.accepted, 1); assert.equal(result.probationary, 1); assert.equal(result.sourceErrors.storage, 1)
  assert.deepEqual(result.gapDiagnostics.gap.acceptedContentHashes,
    [hash(documents[0].sourceUri + '\n' + documents[0].text.replace(/\s+/g, ' ').trim())])
})

test('runtime wires practice-only material and performs bounded same-agent reads without academic writes', () => {
  const runtime = file('lib/ai/cos/cosUniversityAgentExamRuntime.ts'), loader = file('lib/ai/cos/cosUniversityPracticeStudyMaterialRuntime.ts')
  assert.match(runtime, /request\.purpose === 'practice' \? \{ loadStudyMaterial: \(\) => loadUniversityPracticeStudyMaterial\(request\) \}/)
  assert.match(loader, /\.eq\('agent_id', request\.agentId\)/)
  assert.match(loader, /\.eq\('started_at', binding\.observedAt\)/)
  assert.match(loader, /\.contains\('plan_ids', \[binding\.planId\]\)/)
  assert.match(loader, /\.in\('content_hash', hashes\)\.limit\(4\)/)
  assert.doesNotMatch(loader, /\.(?:insert|update|upsert|delete|rpc)\(/)
  assert.doesNotMatch(loader, /from\('cos_(?:university_(?:assessments|exam_runs|credentials)|cognitive_experiences)'\)/)
})
