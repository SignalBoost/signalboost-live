import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('University practice revalidates the exact plan round after inference and fences reconciliation', () => {
  const runner = file('lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  const inferenceAt = runner.indexOf('execution = await callCosReasoner')
  const postInferenceFenceAt = runner.indexOf("university_practice_post_inference_fence_failed")
  const resultRpcAt = runner.indexOf("db.rpc('cos_record_cognitive_practice_result'")
  assert.ok(inferenceAt >= 0)
  assert.ok(postInferenceFenceAt > inferenceAt)
  assert.ok(resultRpcAt > postInferenceFenceAt)
  assert.match(runner, /practice_round_advanced_during_inference/)
  assert.match(runner, /practice_round_advanced_before_reconciliation/)
  assert.match(runner, /select\('status,evidence,attempt_count'\)/)
  assert.match(runner, /\.eq\('status', 'studying'\)\s*\.eq\('attempt_count', practiceRound\)/)
  assert.match(runner, /return ready && Boolean\(update\.data\?\.id\)/)
})
