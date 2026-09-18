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

test('RunPod primary dependency chain is directly Node-resolvable without Next alias fallback', () => {
  const primary = source('../lib/ai/cos/runpodPrimaryInference.ts')
  const lifecycle = source('../lib/ai/cos/runpodLifecycle.ts')
  const resolver = source('../lib/ai/cos/runpodPodResolver.ts')
  const telemetry = source('../lib/hub/runpodTelemetry.ts')
  for (const text of [primary, lifecycle, resolver, telemetry]) assert.doesNotMatch(text, /from ['"]@\/lib\//)
  assert.match(primary, /from '\.\.\/local-inference\.ts'/)
  assert.match(primary, /from '\.\/runpodLifecycle\.ts'/)
  assert.match(primary, /from '\.\/runpodPodResolver\.ts'/)
  assert.match(lifecycle, /from '\.\.\/\.\.\/hub\/runpodTelemetry\.ts'/)
  assert.match(telemetry, /from '\.\.\/ai\/cos\/runpodConfig\.ts'/)
})

test('stale configured pod ids recover only to the unique canonical SignalBoost reasoner pod', () => {
  const resolver = source('../lib/ai/cos/runpodPodResolver.ts')
  const config = source('../lib/ai/cos/runpodConfig.ts')
  assert.match(resolver, /CANONICAL_REASONER_NAME = 'signalboost-cos-reasoner-v2'/)
  assert.match(resolver, /pods\.some\(pod => pod\.id === configured\)/)
  assert.match(resolver, /exact\.length === 1/)
  assert.match(resolver, /branded\.length === 1/)
  assert.match(resolver, /runpod_primary_resolution_failed/)
  assert.match(resolver, /setRuntimeRunpodPodIdOverride\(recovered\.id\)/)
  assert.match(config, /runtimeRunpodPodIdOverride \|\| explicitRunpodPodId\(\)/)
  assert.doesNotMatch(resolver, /yvj6e9zboi7ofo|wh4k8f1imxrxft/)
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

test('ordinary shared text inference prefers RunPod and treats LOCAL_AI DeepInfra as fallback', () => {
  const inference = source('../lib/ai/local-inference.ts')
  const publicEntry = inference.indexOf('export async function callLocalModel')
  const health = inference.indexOf('export async function checkLocalInferenceHealth', publicEntry)
  const routing = inference.slice(publicEntry, health)
  const resolveRunpod = routing.indexOf("import('./cos/runpodPrimaryInference.ts')")
  const callRunpod = routing.indexOf('callConfiguredModel(args, runpodConfig)')
  const fallback = routing.lastIndexOf('callConfiguredModel(args, ownedAttempted')
  assert.ok(resolveRunpod >= 0 && callRunpod > resolveRunpod && fallback > callRunpod)
  assert.match(inference, /protectedIndependentEvaluation/)
  assert.match(inference, /independent_assessment/)
  assert.match(inference, /fallbackFromOwned: true/)
})

test('University independent assessments never acquire RunPod primary routing', () => {
  const port = source('../lib/cos/aiPort.ts')
  const inference = source('../lib/ai/local-inference.ts')
  assert.match(port, /currentReasoningEvaluationContext\(\)/)
  assert.match(port, /\? \{ text: null, attempted: false \}\s*:\s*await tryRunpodPrimaryInference/s)
  assert.match(inference, /feature\.includes\('independent_exam'\)/)
  assert.match(inference, /purpose\.includes\('independent_assessment'\)/)
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
