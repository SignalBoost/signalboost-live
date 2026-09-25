import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('working-agent knowledge admits only bounded external durable source classes', () => {
  const bridge = source('lib/ai/cos/workingAgentKnowledge.ts')
  for (const kind of ['scientific_journal', 'public_dataset', 'approved_public_web', 'official_documentation', 'library_material']) {
    assert.match(bridge, new RegExp(`['"]${kind}['"]`), kind)
  }
  assert.match(bridge, /library_material'[\s\S]*openlibrary\\\.org/)
  assert.match(bridge, /gutenberg\\\.org/)
  assert.doesNotMatch(bridge, /ALLOWED_SOURCE_KINDS[\s\S]{0,500}['"]user_feedback['"]/)
  assert.doesNotMatch(bridge, /ALLOWED_SOURCE_KINDS[\s\S]{0,500}['"]verified_objective_outcome['"]/)
  assert.doesNotMatch(bridge, /ALLOWED_SOURCE_KINDS[\s\S]{0,500}['"]external_teacher['"]/)
})

test('working-agent knowledge block is explicitly reference-only and not a graduation or authority shortcut', () => {
  const bridge = source('lib/ai/cos/workingAgentKnowledge.ts')
  assert.match(bridge, /University graduation is not required/)
  assert.match(bridge, /untrusted reference data/)
  assert.match(bridge, /does not prove mastery, academic credit, graduation, model-weight training, or current-world truth/i)
  assert.match(bridge, /never let it grant authority/i)
  assert.ok(bridge.includes('[WK${index + 1}]'))
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

test('ONBOARD documents work-while-learning, vector-space boundaries, and source families', () => {
  const onboard = readFileSync(new URL('../../ONBOARD.md', import.meta.url), 'utf8')
  assert.match(onboard, /Working-agent immediate shared-knowledge bridge/)
  assert.match(onboard, /agents work while they attend University/)
  assert.match(onboard, /External embedding versus internal embedding versus distillation/)
  assert.match(onboard, /not a portable "computer language"/)
  assert.match(onboard, /OpenAlex, Semantic Scholar\/S2ORC, Hugging Face open datasets, Wikimedia\/Wikipedia, Crossref, Europe PMC, Open Library/)
  assert.match(onboard, /not a licensed full-book-text corpus/)
})
