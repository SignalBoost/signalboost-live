import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('applied knowledge is a universal independently verified Production qualification', () => {
  const bridge = file('lib/ai/cos/cosUniversityAppliedKnowledge.ts')
  const cycle = file('lib/ai/cos/cosUniversityAutonomousAgentCycle.ts')
  assert.match(bridge, /\.eq\('candidate_id', id\)/)
  assert.match(bridge, /\.eq\('verifier', 'independent_scorer'\)/)
  assert.match(bridge, /evaluateRealWorldLearningEvidence\(measurement\)/)
  assert.match(bridge, /!decision\.promotionEligible/)
  assert.match(bridge, /recordedDecision\.evidenceHash !== decision\.evidenceHash/)
  assert.match(bridge, /kind: 'production_transfer'/)
  assert.match(bridge, /scorerAuthority: 'verified_production'/)
  assert.match(cycle, /syncCosUniversityAppliedKnowledge\(agent\.agentId, now\)/)
})

test('retrieval, practice, self-report and unimproved outcomes cannot become applied credit', () => {
  const bridge = file('lib/ai/cos/cosUniversityAppliedKnowledge.ts')
  assert.match(bridge, /cannot\s*\n \* create credit from practice, retrieval, self-report, or an outcome that did not improve/)
  assert.doesNotMatch(bridge, /kind: 'practice_checkpoint'/)
  assert.doesNotMatch(bridge, /scorerAuthority: 'self'/)
})
