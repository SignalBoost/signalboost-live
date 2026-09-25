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

test('background shared text inference prefers RunPod and treats LOCAL_AI DeepInfra as fallback', () => {
  const inference = source('../lib/ai/local-inference.ts')
  const publicEntry = inference.indexOf('export async function callLocalModel')
  const health = inference.indexOf('export async function checkLocalInferenceHealth', publicEntry)
  const routing = inference.slice(publicEntry, health)
  const resolveRunpod = routing.indexOf("import('./cos/runpodPrimaryInference.ts')")
  const callRunpod = routing.indexOf('callConfiguredModelTurn(runpodArgs, runpodConfig)')
  const fallback = routing.lastIndexOf('callConfiguredModelTurn(args, ownedAttempted')
  assert.ok(resolveRunpod >= 0 && callRunpod > resolveRunpod && fallback > callRunpod)
  assert.match(inference, /protectedIndependentEvaluation/)
  assert.match(inference, /independent_assessment/)
  assert.match(inference, /fallbackFromOwned: true/)
})

test('interactive COS answers and authoring bypass RunPod primary and use bounded managed profiles', () => {
  const inference = source('../lib/ai/local-inference.ts')
  const firstAnswer = source('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  assert.match(inference, /feature === 'cos_interactive_answer'/)
  assert.match(inference, /feature === 'cos_interactive_authoring'/)
  assert.match(inference, /interactiveUserResponse\(args\)/)
  assert.match(inference, /COS_INTERACTIVE_REASONING_EFFORT/)
  assert.match(inference, /COS_INTERACTIVE_MODEL_TIMEOUT_MS/)
  assert.match(inference, /COS_INTERACTIVE_AUTHORING_TIMEOUT_MS/)
  assert.match(inference, /COS_INTERACTIVE_AUTHORING_MODEL/)
  assert.match(firstAnswer, /function interactiveReasonerFeature/)
  assert.match(firstAnswer, /'cos_interactive_authoring'/)
  assert.match(firstAnswer, /purpose:'user_facing_response'/)
  assert.match(firstAnswer, /COS_INTERACTIVE_REASONER_MAX_TOKENS/)
  assert.match(firstAnswer, /COS_KNOWLEDGE_FACT_RETRIEVAL_BUDGET_MS \|\| '1500'/)
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


test('fresh grounded tasks prefer owned RunPod, cap that attempt, then retain configured fallback', () => {
  const inference = source('../lib/ai/local-inference.ts')
  const workers = source('../lib/ai/cos/cosReasoningWorkers.ts')
  const route = source('../app/api/cos-primary/route.ts')
  assert.match(route, /feature:'cos_fresh_grounded_task'/)
  assert.match(route, /allowConfiguredFallback:true/)
  assert.match(workers, /'cos_fresh_grounded_task'/)
  const interactive = inference.slice(inference.indexOf('function interactiveUserResponse'), inference.indexOf('function freshGroundedTask'))
  assert.doesNotMatch(interactive, /feature === 'cos_fresh_grounded_task'/)
  assert.match(inference, /function freshGroundedTask/)
  assert.match(inference, /FRESH_GROUNDED_RUNPOD_ATTEMPT_MS = 16_000/)
  assert.match(inference, /const runpodArgs = freshGroundedTask\(args\)/)
  assert.match(inference, /timeoutMs: Math\.min\(/)
  assert.match(inference, /return callConfiguredModelTurn\(args, ownedAttempted \? \{ \.\.\.effectiveConfig, fallbackFromOwned: true \} : effectiveConfig\)/)
  const eligible = inference.slice(inference.indexOf('function eligibleForRunpodPrimary'), inference.indexOf('async function callConfiguredModel'))
  assert.match(eligible, /if \(interactiveUserResponse\(args\)\) return false/)
})


test('ordinary knowledge questions are model-first rather than regex-classified at browser ingress', () => {
  const route = source('../app/api/cos-browser/route.ts')
  const decision = source('../lib/ai/cos/cosAgentDecision.ts')
  const inference = source('../lib/ai/local-inference.ts')

  assert.doesNotMatch(route, /isSimpleKnowledgeQuestion\(prompt\)/)
  assert.doesNotMatch(route, /answerSimpleKnowledgeQuestion\(prompt\)/)
  assert.match(route, /await decideCosAgentTurn\(\{/)
  assert.match(route, /agentDecision\?\.mode === 'answer'/)
  assert.match(route, /agentDecision\?\.mode === 'orchestrate'/)

  assert.match(decision, /feature: 'cos_interactive_answer'/)
  assert.match(decision, /purpose: 'agent_native_tool_choice'/)
  assert.match(decision, /purpose: 'agent_answer_or_capability_plan_compat'/)
  assert.match(decision, /toolChoice: 'auto'/)
  assert.match(decision, /disableThinking: true/)
  assert.match(decision, /allowConfiguredFallback: false/)
  assert.match(decision, /persistUsage: false/)
  assert.match(decision, /COS_AGENT_DECISION_TIMEOUT_MS \|\| '10000'/)
  assert.match(inference, /feature === 'cos_interactive_answer'/)
})
