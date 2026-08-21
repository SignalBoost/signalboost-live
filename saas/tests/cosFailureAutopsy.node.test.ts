import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  retainedLessonAfterRetest,
  selectFailureAutopsyRetestCase,
} from '../lib/ai/cos/failureAutopsyPolicy.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const candidates = [
  { id: 'sre-a', domain: 'sre', problemClass: 'incident diagnosis' },
  { id: 'sre-b', domain: 'sre', problemClass: 'incident diagnosis' },
  { id: 'postgres-a', domain: 'postgres', problemClass: 'database performance' },
  { id: 'incident-c', domain: 'cloud', problemClass: 'incident diagnosis' },
]

test('a source benchmark failure is retested on a different case in the same domain', () => {
  const selected = selectFailureAutopsyRetestCase({
    problemClass: 'incident diagnosis',
    sourceCaseId: 'sre-a',
  }, candidates)
  assert.equal(selected?.id, 'sre-b')
  assert.notEqual(selected?.id, 'sre-a')
})

test('without a source fixture the retest falls back to the same bounded problem class', () => {
  const selected = selectFailureAutopsyRetestCase({
    problemClass: 'incident diagnosis',
    attemptedCaseIds: ['sre-a', 'sre-b'],
  }, candidates)
  assert.equal(selected?.id, 'incident-c')
})

test('a case already used for this autopsy is never recycled as independent evidence', () => {
  const selected = selectFailureAutopsyRetestCase({
    problemClass: 'incident diagnosis',
    sourceCaseId: 'sre-a',
    attemptedCaseIds: ['sre-b', 'incident-c'],
  }, candidates)
  assert.equal(selected, null)
})

test('a corrective lesson is retained only after the guided shadow retest passes', () => {
  assert.equal(retainedLessonAfterRetest(true), true)
  assert.equal(retainedLessonAfterRetest(false), false)
})

test('migration creates race-safe exact-turn autopsy triggers without raw prompt or answer storage', () => {
  const source = file('../supabase/migrations/20260821_cos_general_failure_autopsy.sql')
  assert.match(source, /create table if not exists public\.cos_turn_failure_autopsies/i)
  assert.match(source, /create table if not exists public\.cos_turn_failure_autopsy_retests/i)
  assert.match(source, /create or replace function public\.cos_refresh_turn_failure_autopsy/i)
  assert.match(source, /cos_failure_autopsy_on_outcome/)
  assert.match(source, /cos_failure_autopsy_on_experience/)
  assert.match(source, /cos_failure_autopsy_on_evidence/)
  for (const stage of ['retrieval','evidence_selection','reasoning','grounding','calibration','tool_execution','stale_or_missing_knowledge']) {
    assert.match(source, new RegExp(`'${stage}'`))
  }
  assert.doesNotMatch(source, /raw_prompt|assistant_answer|response_excerpt/)
})

test('failure autopsy uses a different controlled case and guided shadow semantics', () => {
  const source = file('../lib/ai/cos/turnFailureAutopsy.ts')
  assert.match(source, /selectFailureAutopsyRetestCase/)
  assert.match(source, /shadowGuidance:/)
  assert.match(source, /failure_autopsy_retest:/)
  assert.match(source, /lesson_retained:/)
  assert.match(source, /guided_shadow_retest_no_live_policy_promotion/)
})

test('benchmark runner enriches exact turn telemetry and keeps autopsy guidance explicitly shadow-only', () => {
  const source = file('../lib/ai/cos/capabilityBenchmarkRunner.ts')
  assert.match(source, /recordTurnLearningEnrichment/)
  assert.match(source, /SHADOW FAILURE-AUTOPSY RETEST GUIDANCE/)
  assert.match(source, /Do not mention this guidance in the answer/)
  assert.match(source, /never widens authorization/i)
})

test('ordinary turn enrichment stores bounded learning metadata without raw prompt or answer fields', () => {
  const source = file('../lib/ai/cos/turnExperienceStore.ts')
  assert.match(source, /problem_class:/)
  assert.match(source, /predicted_confidence:/)
  assert.match(source, /evidence_summary:/)
  assert.match(source, /failure_reason:/)
  assert.doesNotMatch(source, /raw_prompt\s*:/)
  assert.doesNotMatch(source, /assistant_answer\s*:/)
})
