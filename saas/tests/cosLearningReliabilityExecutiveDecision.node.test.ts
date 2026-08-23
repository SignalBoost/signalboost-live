import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { executiveDecisionDirective } from '../lib/ai/cos/scriptRequestIntent.ts'
import { ContinuousLearningCycle, type ContinuousLearningSourceAdapter } from '../lib/cos-core/layers/learning/cycle.ts'
import { ContinuousLearningDirector, type ContinuousLearningStore, type KnowledgeGap, type LearningCandidate } from '../lib/cos-core/layers/learning/index.ts'

const mediaClientsSource = readFileSync(new URL('../lib/cos-core/layers/learning/mediaClients.ts', import.meta.url), 'utf8')
const leadershipPrompt = `The leadership team needs to cut operating expenses by 15% across all departments within two weeks to extend runway by nine months. Every department lead claims their budget is already bare-bones. How do you design and facilitate the triage process to decide where cuts are made?`

test('executive cost triage uses evidence-bounded decision discipline', () => {
  const directive = executiveDecisionDirective(leadershipPrompt)
  assert.ok(directive)
  assert.match(directive, /Do not assume an across-the-board percentage cut/i)
  assert.match(directive, /Do not invent savings ranges/i)
  assert.match(directive, /Do not use "revenue center" versus "cost center" as a shortcut/i)
  assert.match(directive, /Sequence actions from reversible to irreversible/i)
  assert.match(directive, /Do not call a person a liability/i)
})

test('ordinary non-executive questions do not get the executive directive', () => {
  assert.equal(executiveDecisionDirective('Explain how DNS recursion works.'), null)
})

test('learning HTTP retries honor Retry-After and use a stronger 429 backoff', () => {
  assert.match(mediaClientsSource, /headers\.get\('retry-after'\)/)
  assert.match(mediaClientsSource, /response\.status === 429 \? 1500 \* \(attempt \+ 1\)/)
  assert.match(mediaClientsSource, /from '\.\/connectors\.ts'/)
})

test('concurrent autonomous gaps dedupe the same document before storage', async () => {
  let stored = false
  let rememberCalls = 0
  const store: ContinuousLearningStore = {
    async hasContent() {
      await new Promise(resolve => setTimeout(resolve, 15))
      return stored
    },
    async remember(_candidate: LearningCandidate) {
      rememberCalls += 1
      await new Promise(resolve => setTimeout(resolve, 15))
      if (stored) throw { code: '23505', message: 'duplicate key value violates unique constraint' }
      stored = true
    },
  }

  const director = new ContinuousLearningDirector(store)
  const repeated = ('operating expenses runway budget department criticality reversibility dependency customer revenue compliance evidence ' +
    'operating expenses runway budget department criticality reversibility dependency customer revenue compliance evidence. ').repeat(20)
  const adapter: ContinuousLearningSourceAdapter = {
    kind: 'official_documentation',
    id: 'test_docs',
    async acquire(gap) {
      return [{
        sourceKind: 'official_documentation',
        sourceUri: 'https://example.test/one-document',
        sourceTitle: 'Operating expense runway decision framework',
        observedAt: '2026-08-23T00:00:00.000Z',
        subject: gap.subject,
        text: repeated,
        license: 'test fixture',
      }]
    },
  }

  const gaps: KnowledgeGap[] = [
    { id:'curriculum:opex:1', subject:'operating expenses runway budget', question:'How should operating expenses be prioritized using criticality reversibility dependency customer revenue compliance evidence?', portableIds:['cos'], expectedReuse:10, expectedAvoidedCostUsd:1, urgency:90, evidence:['fixture'] },
    { id:'curriculum:opex:2', subject:'operating expenses runway budget', question:'Which budget decisions protect customer revenue compliance and downstream dependency while preserving runway?', portableIds:['cos'], expectedReuse:9, expectedAvoidedCostUsd:1, urgency:89, evidence:['fixture'] },
  ]

  const result = await new ContinuousLearningCycle(director, [adapter]).run(gaps, 0)
  assert.equal(result.accepted, 1)
  assert.equal(result.rejected.duplicate, 1)
  assert.equal(result.sourceErrors.storage ?? 0, 0)
  assert.equal(rememberCalls, 1)
})
