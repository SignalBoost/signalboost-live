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
  const lease = source('../lib/ai/cos/runpodInferenceLease.ts')
  const lifecycle = source('../lib/ai/cos/runpodLifecycle.ts')
  const resolver = source('../lib/ai/cos/runpodPodResolver.ts')
  const telemetry = source('../lib/hub/runpodTelemetry.ts')
  for (const text of [primary, lease, lifecycle, resolver, telemetry]) assert.doesNotMatch(text, /from ['"]@\/lib\//)
  assert.match(primary, /from '\.\.\/local-inference\.ts'/)
  assert.match(primary, /from '\.\/runpodLifecycle\.ts'/)
  assert.match(primary, /from '\.\/runpodPodResolver\.ts'/)
  assert.match(primary, /from '\.\/runpodInferenceLease\.ts'/)
  assert.match(lease, /from '\.\.\/\.\.\/cos-core\/storage\/supabase\.ts'/)
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

test('RunPod serializes the physical reasoner and Builder does not buy fallback for queue contention', () => {
  const primary = source('../lib/ai/cos/runpodPrimaryInference.ts')
  const lease = source('../lib/ai/cos/runpodInferenceLease.ts')
  const port = source('../lib/cos/aiPort.ts')
  const builderStart = port.indexOf('export function createBuilderCodingAiPort')
  const builder = port.slice(builderStart, port.indexOf('export function createLocalApplianceAiPort', builderStart))
  assert.match(primary, /acquireRunpodInferenceLease\(config\.timeoutMs\)/)
  assert.match(primary, /reason: 'runpod_primary_busy'/)
  assert.match(primary, /releaseRunpodInferenceLease\(lease\)/)
  assert.match(lease, /__cos_runpod_primary_inference_slot__/)
  assert.match(lease, /\.eq\('updated_at', read\.data\.updated_at\)/)
  assert.match(builder, /runpod\.reason === 'runpod_primary_busy'/)
  assert.match(builder, /throw new Error\('builder_runpod_primary_busy'\)/)
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

test('primary cron probe reports model-serving health, not only pod/account state', () => {
  const route = source('../app/api/cron/runpod-primary-probe/route.ts')
  assert.match(route, /checkLocalInferenceHealth/)
  assert.match(route, /runpodPrimaryConfig\('reasoner'/)
  assert.match(route, /inferenceReady/)
  assert.match(route, /inferenceError/)
})

test('primary cron repairs only hard HTTP 502 serving failures after cold-start grace without releasing the GPU', () => {
  const route = source('../app/api/cron/runpod-primary-probe/route.ts')
  assert.match(route, /\^HTTP 502\\b/)
  assert.match(route, /configuredPod\.uptimeSeconds >= graceSeconds/)
  assert.match(route, /runpodOrphanGuardEnabled\(\)/)
  assert.match(route, /await configurePodStartupContract\(/)
  assert.match(route, /runpodPrimaryModel\('reasoner'\)/)
  assert.match(route, /repairMode: 'in_place_update_reset'/)
  assert.match(route, /repairAttempted/)
  assert.match(route, /repairStarted/)
  assert.doesNotMatch(route, /stopRunpodReasoner|ensureRunpodReasonerStarted/)
  assert.doesNotMatch(route, /inferenceError.*AbortError.*configurePodStartupContract/s)
})

test('admin probe reports configuration booleans without returning the RunPod account key', () => {
  const route = source('../app/api/admin/cos-runpod/route.ts')
  assert.match(route, /apiKeyPresent/)
  assert.match(route, /queryRunpodAccountStatus/)
  assert.doesNotMatch(route, /RUNPOD_API_KEY\s*:/)
})
