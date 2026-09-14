import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('RunPod primary is a separate transport and does not overwrite DeepInfra fallback variables', () => {
  const config = source('../lib/ai/cos/runpodConfig.ts')
  const primary = source('../lib/ai/cos/runpodPrimaryInference.ts')
  assert.match(config, /RUNPOD_PRIMARY_POD_ID/)
  assert.match(config, /LOCAL_AI_BASE_URL/)
  assert.match(primary, /provider:\s*'runpod'/)
  assert.match(primary, /routeOwner:\s*'itmounts'/)
  assert.doesNotMatch(primary, /process\.env\.LOCAL_AI_API_KEY/)
})

test('Builder tries graduate then RunPod primary before DeepInfra coding fallback', () => {
  const port = source('../lib/cos/aiPort.ts')
  const builderStart = port.indexOf('export function createBuilderCodingAiPort')
  const builder = port.slice(builderStart, port.indexOf('export function createLocalApplianceAiPort', builderStart))
  const graduate = builder.indexOf("tryActiveGraduate('coder'")
  const runpod = builder.indexOf('tryRunpodPrimaryInference')
  const deepinfra = builder.indexOf('builderCodingModelFromEnv()')
  assert.ok(graduate >= 0 && runpod > graduate && deepinfra > runpod)
  assert.match(builder, /fallbackFromOwned:\s*ownedAttempted/)
})

test('shared Platform AI tries active graduate then RunPod before governed base fallback', () => {
  const port = source('../lib/cos/aiPort.ts')
  const platformStart = port.indexOf('export function createPlatformAiPort')
  const platform = port.slice(platformStart, port.indexOf('export function createBuilderCodingAiPort', platformStart))
  const graduate = platform.indexOf("tryActiveGraduate('primary'")
  const runpod = platform.indexOf('tryRunpodPrimaryInference')
  const fallback = platform.indexOf('callCosText')
  assert.ok(graduate >= 0 && runpod > graduate && fallback > runpod)
})

test('University controlled-comparison contexts never acquire RunPod primary routing', () => {
  const port = source('../lib/cos/aiPort.ts')
  assert.match(port, /currentReasoningEvaluationContext\(\)/)
  assert.match(port, /\? \{ text: null, attempted: false \}\s*:\s*await tryRunpodPrimaryInference/s)
})

test('warm primary defaults to no idle stop while unhealthy orphan protection remains enabled', () => {
  const lifecycle = source('../lib/ai/cos/runpodLifecycle.ts')
  assert.match(lifecycle, /COS_RUNPOD_AUTO_STOP_ENABLED'\) === true/)
  assert.match(lifecycle, /COS_RUNPOD_ORPHAN_GUARD_ENABLED'\) !== false/)
})

test('admin probe reports configuration booleans without returning the RunPod account key', () => {
  const route = source('../app/api/admin/cos-runpod/route.ts')
  assert.match(route, /apiKeyPresent/)
  assert.match(route, /queryRunpodAccountStatus/)
  assert.doesNotMatch(route, /RUNPOD_API_KEY\s*:/)
})
