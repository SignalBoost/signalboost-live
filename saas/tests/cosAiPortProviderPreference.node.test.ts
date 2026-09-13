import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('first-party COS model seams discard stale hosted-provider hints', () => {
  const aiPort = source('../lib/cos/aiPort.ts')
  const modelRouter = source('../lib/ai/modelRouter.ts')

  assert.match(aiPort, /callCosText\(\{\s*\.\.\.input,\s*modelPreference:\s*'local',\s*taskId:\s*'cos-portable-text'/s)
  assert.match(modelRouter, /callCosText\(\{\s*\.\.\.args,\s*modelPreference:\s*'local'\s*\}\)/s)
  assert.match(modelRouter, /callCosTextDetailed\(\{\s*\.\.\.args,\s*modelPreference:\s*'local'\s*\}\)/s)

  // Customer/explicit evaluation integrations stay a separate adapter instead of being
  // silently conflated with ordinary first-party COS generation.
  assert.match(aiPort, /export function createExternalTeacherAiPort/)
})

test('COS autonomy readiness is not satisfied by Anthropic or OpenAI keys', () => {
  const readiness = source('../app/api/cos/autonomy/readiness/route.ts')

  assert.match(readiness, /resolveCosReasoner\(\)/)
  assert.match(readiness, /modelProvider:\s*!\('reason' in reasoner\)/)
  assert.doesNotMatch(readiness, /ANTHROPIC_API_KEY/)
  assert.doesNotMatch(readiness, /OPENAI_API_KEY/)
  assert.match(readiness, /hosted provider keys do not satisfy COS readiness/i)
})

test('admin COS reasoner health reports hosted fallback only on exact opt-in', () => {
  const health = source('../app/api/admin/cos-reasoner/health/route.ts')

  assert.match(health, /COS_EXTERNAL_AI_FALLBACK_ENABLED\s*===\s*'true'/)
  assert.doesNotMatch(health, /COS_EXTERNAL_AI_FALLBACK_ENABLED\s*!==\s*'false'/)
})

test('COS autonomy cannot select a hosted model at route or type boundaries', () => {
  const cron = source('../app/api/cron/cos-autonomy/route.ts')
  const liveRuntime = source('../lib/ai/cos/autonomy/liveRuntime.ts')
  const missionDirector = source('../lib/ai/cos/autonomy/missionDirector.ts')
  const modelBrain = source('../lib/ai/cos/autonomy/modelBrain.ts')

  assert.match(cron, /function modelPreference\(\): 'local'/)
  assert.match(cron, /return 'local'/)
  assert.doesNotMatch(cron, /COS_AUTONOMY_MODEL/)
  assert.doesNotMatch(cron, /'claude'|'openai'/)

  for (const runtimeSource of [liveRuntime, missionDirector, modelBrain]) {
    assert.match(runtimeSource, /modelPreference\?: 'local'/)
    assert.doesNotMatch(runtimeSource, /modelPreference\?: 'claude'|modelPreference\?: 'openai'/)
  }
})
