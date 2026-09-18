// saas/tests/cosUniversityMassDistillationSemanticReconciliation.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidePreparedBatchSemanticCohesion } from '../lib/ai/cos/cosUniversityMassDistillationSemanticReconciliation.ts'

const h = (n: number) => n.toString(16).padStart(64, '0')
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('legacy labels may revalidate into one canonical Computer Science batch', () => {
  const hashes = Array.from({ length: 20 }, (_, index) => h(index + 1))
  const decision = decidePreparedBatchSemanticCohesion({
    batchSubjectId: 'Computer Science & Coding',
    expectedSourceHashes: hashes,
    rows: hashes.map((contentHash, index) => ({
      contentHash,
      subject: index % 2 ? 'cos data center' : 'TypeScript and Next.js',
      summary: 'TypeScript Next.js API routes databases software testing production engineering.',
    })),
  })
  assert.equal(decision.coherent, true)
  assert.equal(decision.mismatches.length, 0)
  assert.equal(decision.missingSourceHashes.length, 0)
})

test('one semantically foreign retained item quarantines a prepared batch instead of training it', () => {
  const hashes = Array.from({ length: 20 }, (_, index) => h(index + 101))
  const rows = hashes.map(contentHash => ({
    contentHash,
    subject: 'Computer Science & Coding',
    summary: 'TypeScript Next.js API routes databases software testing production engineering.',
  }))
  rows[19] = {
    contentHash: hashes[19],
    subject: 'cos data center',
    summary: 'Special relativity spacetime invariant time dilation and inertial reference frames.',
  }
  const decision = decidePreparedBatchSemanticCohesion({
    batchSubjectId: 'Computer Science & Coding',
    expectedSourceHashes: hashes,
    rows,
  })
  assert.equal(decision.coherent, false)
  assert.equal(decision.mismatches.length, 1)
  assert.equal(decision.mismatches[0].resolvedSubject, 'Physics & Natural Sciences')
})

test('missing retained source material fails semantic revalidation closed', () => {
  const hashes = Array.from({ length: 20 }, (_, index) => h(index + 201))
  const decision = decidePreparedBatchSemanticCohesion({
    batchSubjectId: 'Cybersecurity',
    expectedSourceHashes: hashes,
    rows: hashes.slice(0, 19).map(contentHash => ({
      contentHash,
      subject: 'Cybersecurity',
      summary: 'Authentication authorization incident response secure coding threat modeling.',
    })),
  })
  assert.equal(decision.coherent, false)
  assert.equal(decision.missingSourceHashes.length, 1)
})

test('semantic reconciliation is non-spending, skips live batches, and runs before authorization', () => {
  const reconciliation = source('../lib/ai/cos/cosUniversityMassDistillationSemanticReconciliation.ts')
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  assert.match(reconciliation, /\.eq\('status', 'prepared'\)/)
  assert.match(reconciliation, /stages\.length === 0 \|\| stages\.every\(stage => stage === 'failed'\)/)
  assert.match(reconciliation, /status: 'quarantined'/)
  assert.match(reconciliation, /providerDispatchAuthorized: false/)
  assert.match(reconciliation, /externalCostUsd: 0/)
  assert.match(reconciliation, /productionTrafficAuthorized: false/)
  assert.match(reconciliation, /authorityExpanded: false/)
  assert.doesNotMatch(reconciliation, /submitHuggingFaceJob|authorizeNextUniversityMassDistillationCampaign|runMassDistillationCampaignConsumer/)
  const reconcileAt = workflow.indexOf('await reconcilePreparedMassDistillationSemanticCohesion')
  const packageAt = workflow.indexOf('await prepareUniversityMassDistillationCurriculum')
  const authorizeAt = workflow.indexOf('await authorizeNextUniversityMassDistillationCampaign')
  assert.ok(reconcileAt > 0 && packageAt > reconcileAt && authorizeAt > packageAt)
  assert.match(workflow, /&& semanticReconciliation\.ok === true/)
})
