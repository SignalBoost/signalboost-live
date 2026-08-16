// saas/tests/cosDynamicLearningGaps.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

test('the failure-driven curriculum is wired into gap generation', () => {
  const daily = read('../lib/cos/dailyAutonomousLearning.ts')
  assert.match(daily, /loadCosCurriculumSignals/)
  assert.match(daily, /generateDynamicKnowledgeGaps\(12, weaknessCurriculumSignals\)/)

  const dynamic = read('../lib/cos-core/layers/learning/dynamicGaps.ts')
  // The kernel must accept host-supplied signals without importing anything host-specific.
  assert.match(dynamic, /injectedSignals: KnowledgeGapSignal\[\] = \[\]/)
  assert.doesNotMatch(dynamic, /@\/lib\/ai\//)
})

test('daily autonomous learning includes retained-corpus expansion gaps', () => {
  const daily = read('../lib/cos/dailyAutonomousLearning.ts')
  assert.match(daily, /generateDynamicKnowledgeGaps/)
  assert.match(daily, /corpusExpansionGaps/)
  assert.match(daily, /retainedKnowledge/)
  assert.match(daily, /externalCostUsd:\s*0/)
})

test('dynamic learning audits retained knowledge and queued reasoning gaps', () => {
  const dynamic = read('../lib/cos-core/layers/learning/dynamicGaps.ts')
  assert.match(dynamic, /cos_continuous_learning/)
  assert.match(dynamic, /cos_learning_gaps/)
  assert.match(dynamic, /lower-confidence knowledge/)
  assert.match(dynamic, /What has changed recently/)
  assert.match(dynamic, /source_kinds=/)
})

test('dynamic learning fails closed when persistence is unavailable', () => {
  const dynamic = read('../lib/cos-core/layers/learning/dynamicGaps.ts')
  assert.match(dynamic, /if \(!db\) return \{ gaps: \[\], retained: 0, reasoningGaps: 0, curriculumSignals: curriculum\.length \}/)
  assert.match(dynamic, /dynamic gap generation failed/)
})
