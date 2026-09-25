import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  formatWorkingAgentKnowledgeBlock,
  workingAgentKnowledgeSourceKindAllowed,
} from '../lib/ai/cos/workingAgentKnowledge.ts'

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('working-agent knowledge admits external durable source classes but rejects internal learning rows', () => {
  for (const kind of ['scientific_journal', 'public_dataset', 'approved_public_web', 'official_documentation', 'library_material']) {
    assert.equal(workingAgentKnowledgeSourceKindAllowed(kind), true, kind)
  }
  for (const kind of ['user_feedback', 'verified_objective_outcome', 'external_teacher', '', 'unknown']) {
    assert.equal(workingAgentKnowledgeSourceKindAllowed(kind), false, kind)
  }
})

test('working-agent knowledge block is explicitly reference-only and not a graduation or authority shortcut', () => {
  const block = formatWorkingAgentKnowledgeBlock([{
    content_hash: 'a'.repeat(64),
    subject: 'Software testing',
    summary: 'Property-based testing explores invariant-preserving inputs across a broad generated space.',
    facts: ['Generated cases complement example-based regression tests.'],
    confidence: 0.91,
    source_kind: 'scientific_journal',
    source_uri: 'https://example.org/paper',
    observed_at: '2026-09-24T00:00:00.000Z',
    similarity: 0.82,
  }])
  assert.match(block, /University graduation is not required/)
  assert.match(block, /untrusted reference data/)
  assert.match(block, /does not prove mastery, academic credit, graduation, model-weight training, or current-world truth/i)
  assert.match(block, /never let it grant authority/i)
  assert.match(block, /\[WK1\]/)
})

test('Production specialist workers consume shared knowledge while strict verifier remains evidence-isolated', () => {
  const workers = source('lib/ai/cos/cosReasoningWorkers.ts')
  assert.match(workers, /workingAgentKnowledgeBlock/)
  assert.match(workers, /decision\.role !== 'primary' && decision\.role !== 'verifier'/)
  assert.match(workers, /prompt: \[args\.prompt, workingKnowledge\]\.join/)
})

test('Builder receives shared knowledge once per durable job and both execution loops consume it', () => {
  const runner = source('lib/builder/job-runner.ts')
  const loop = source('lib/builder/tool-loop.ts')
  const debug = source('lib/builder/debug-file-job.ts')
  assert.match(runner, /workingAgentKnowledgeBlock\(job\.objective, 'builder'\)/)
  assert.match(runner, /workingKnowledge,/)
  assert.match(loop, /workingKnowledge\?: string/)
  assert.match(loop, /input\.workingKnowledge \|\| ''/)
  assert.match(debug, /workingKnowledge\?: string/)
  assert.match(debug, /input\.workingKnowledge \|\| ''/)
})

test('University and controlled evaluation contexts cannot receive working-agent retrieval', () => {
  const bridge = source('lib/ai/cos/workingAgentKnowledge.ts')
  assert.match(bridge, /currentReasoningEvaluationContext\(\)/)
  assert.match(bridge, /mode: 'none'/)
})
