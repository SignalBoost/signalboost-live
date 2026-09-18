// saas/tests/runpodDistilledLocalDeploy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  DISTILLED_BASE_MODEL_REFERENCE,
  DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS,
  DISTILLED_ENDPOINT_NAME,
  DISTILLED_IDLE_TIMEOUT_SECONDS,
  DISTILLED_STARTUP_READY_TIMEOUT_MS,
  DISTILLED_TEMPLATE_NAME,
  DISTILLED_WORST_CASE_CANARY_COST_USD,
  provisionRunpodServerlessDistilledLlm,
  runpodServerlessOpenAiBaseUrl,
  safeRunpodErrorDetail,
} from '../lib/ai/cos/runpodServerlessDistilledProvision.ts'

const provision = readFileSync(new URL('../lib/ai/cos/runpodServerlessDistilledProvision.ts', import.meta.url), 'utf8')
const cleanup = readFileSync(new URL('../lib/ai/cos/runpodServerlessLegacyQueueCleanup.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('distilled runtime is pinned to the exact trained Qwen artifact', () => {
  assert.match(provision, /Qwen\/Qwen3-4B/)
  assert.match(provision, /1cfa9a7208912126459214e8b04321603b3df60c/)
  assert.match(provision, /cadomos\/itmounts-student-f993a365a01e/)
  assert.match(provision, /9f03387d87de550b96d973f9f30a3f02e783997e/)
  assert.match(provision, /vllm\/vllm-openai:v0\.29\.0/)
  assert.equal(
    DISTILLED_BASE_MODEL_REFERENCE,
    'https://huggingface.co/Qwen/Qwen3-4B:1cfa9a7208912126459214e8b04321603b3df60c',
  )
  assert.match(provision, /snapshot_download/)
  assert.match(provision, /--enable-lora/)
  assert.match(provision, /"--max-lora-rank", "16"/)
})

test('RunPod distilled deployment stays scale-to-zero, one-worker bounded and inside the owner canary ceiling', () => {
  assert.equal(DISTILLED_IDLE_TIMEOUT_SECONDS, 60)
  assert.equal(DISTILLED_STARTUP_READY_TIMEOUT_MS, 220_000)
  assert.equal(DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS, 60_000)
  assert.equal(DISTILLED_WORST_CASE_CANARY_COST_USD, ((60 + 220 + 60) * 0.69) / 3600)
  assert.ok(DISTILLED_WORST_CASE_CANARY_COST_USD < 0.2)
  assert.match(provision, /workersMin:\s*0/)
  assert.match(provision, /workersMax:\s*1/)
  assert.match(provision, /idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(provision, /NVIDIA RTX A4000/)
  assert.match(provision, /NVIDIA RTX A4500/)
  assert.match(provision, /NVIDIA RTX 4000 Ada Generation/)
  assert.match(provision, /NVIDIA RTX A5000/)
  assert.match(provision, /NVIDIA GeForce RTX 3090/)
  assert.match(provision, /NVIDIA L4/)
})

test('exact bootstrap template is isolated while endpoint discovery uses REST v2 and creation atomically attaches the cache', () => {
  assert.match(provision, /const REST_V1 = 'https:\/\/rest\.runpod\.io\/v1'/)
  assert.match(provision, /const CONTROL_API_V2 = 'https:\/\/api\.runpod\.io\/v2'/)
  assert.match(provision, /const GRAPHQL_API = 'https:\/\/api\.runpod\.io\/graphql'/)
  assert.match(provision, /DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v5'/)
  assert.match(provision, /DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v7'/)
  assert.match(provision, /requestV1<RunpodTemplateV1\[]>\('\/templates'\)/)
  assert.match(provision, /requestV2<\{ endpoints\?: RunpodEndpointV2\[] \}>\('\/serverless'\)/)
  assert.match(provision, /mutation SaveDistilledEndpoint\(\$input: EndpointInput!\)/)
  assert.match(provision, /type:\s*'LB'/)
  assert.match(provision, /templateId:\s*input\.templateId/)
  assert.match(provision, /gpuIds:\s*input\.pools\.join\(','\)/)
  assert.match(provision, /modelReferences:\s*\[DISTILLED_BASE_MODEL_REFERENCE\]/)
  assert.match(route, /baseModelReference:\s*provisioned\.baseModelReference/)
  assert.match(provision, /containerDiskInGb:\s*50/)
  assert.match(provision, /dockerEntrypoint:\s*\['bash', '-lc'\]/)
  assert.match(provision, /dockerStartCmd:\s*\[startupCommand\(\)\]/)
})

test('provisioning creates an exact cached-model load balancer without waking a worker', async (t) => {
  const previousFetch = globalThis.fetch
  const previousRunpodKey = process.env.RUNPOD_API_KEY
  const previousHfToken = process.env.HF_TOKEN
  const calls: Array<{ url: string; method: string; body: any }> = []
  let endpointListReads = 0

  process.env.RUNPOD_API_KEY = 'runpod-test-key'
  process.env.HF_TOKEN = 'hf_test_token_long_enough_for_validation'
  t.after(() => {
    globalThis.fetch = previousFetch
    if (previousRunpodKey === undefined) delete process.env.RUNPOD_API_KEY
    else process.env.RUNPOD_API_KEY = previousRunpodKey
    if (previousHfToken === undefined) delete process.env.HF_TOKEN
    else process.env.HF_TOKEN = previousHfToken
  })

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = String(init?.method || 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    calls.push({ url, method, body })

    if (url === 'https://rest.runpod.io/v1/templates' && method === 'GET') return jsonResponse([])
    if (url === 'https://rest.runpod.io/v1/templates' && method === 'POST') {
      return jsonResponse({ id: 'template-v5', name: DISTILLED_TEMPLATE_NAME })
    }
    if (url === 'https://api.runpod.io/v2/catalog/gpus') {
      return jsonResponse({
        gpus: [
          { id: 'NVIDIA RTX A4000', pool: 'AMPERE_16', manufacturer: 'NVIDIA', memory: 16, availability: 'HIGH', price: { serverless: 0.34 } },
          { id: 'NVIDIA RTX A5000', pool: 'AMPERE_24', manufacturer: 'NVIDIA', memory: 24, availability: 'HIGH', price: { serverless: 0.69 } },
        ],
      })
    }
    if (url === 'https://api.runpod.io/v2/serverless') {
      endpointListReads += 1
      if (endpointListReads === 1) return jsonResponse({ endpoints: [] })
      return jsonResponse({
        endpoints: [{
          id: 'endpoint-v7',
          name: DISTILLED_ENDPOINT_NAME,
          type: 'LOAD_BALANCER',
          workers: { min: 0, max: 1, idleTimeout: 60 },
          scaling: { type: 'REQUEST_COUNT', requestCount: 1 },
          timeout: 300_000,
          gpu: { pools: ['AMPERE_16', 'AMPERE_24'], count: 1 },
        }],
      })
    }
    if (url.startsWith('https://api.runpod.io/graphql?api_key=')) {
      if (String(body?.query || '').includes('mutation SaveDistilledEndpoint')) {
        return jsonResponse({
          data: {
            saveEndpoint: {
              id: 'endpoint-v7',
              name: DISTILLED_ENDPOINT_NAME,
              type: 'LB',
              templateId: 'template-v5',
              modelReferences: [DISTILLED_BASE_MODEL_REFERENCE],
            },
          },
        })
      }
      return jsonResponse({
        data: {
          myself: {
            endpoint: {
              id: 'endpoint-v7',
              type: 'LB',
              modelReferences: [DISTILLED_BASE_MODEL_REFERENCE],
            },
          },
        },
      })
    }
    throw new Error(`unexpected test request: ${method} ${url}`)
  }) as typeof fetch

  const result = await provisionRunpodServerlessDistilledLlm()
  assert.equal(result.createdTemplate, true)
  assert.equal(result.createdEndpoint, true)
  assert.equal(result.endpointId, 'endpoint-v7')
  assert.equal(result.baseModelReference, DISTILLED_BASE_MODEL_REFERENCE)

  const mutation = calls.find(call => String(call.body?.query || '').includes('mutation SaveDistilledEndpoint'))
  assert.ok(mutation)
  assert.deepEqual(mutation.body.variables.input.modelReferences, [DISTILLED_BASE_MODEL_REFERENCE])
  assert.equal(mutation.body.variables.input.type, 'LB')
  assert.equal(mutation.body.variables.input.gpuIds, 'AMPERE_16,AMPERE_24')
  assert.equal(mutation.body.variables.input.workersMin, 0)
  assert.equal(mutation.body.variables.input.workersMax, 1)
  assert.equal(mutation.body.variables.input.scalerType, 'REQUEST_COUNT')
  assert.equal(calls.some(call => call.url.includes('.api.runpod.ai')), false)
})

test('startup gateway becomes routable before exact model initialization and can use RunPod cached base weights', () => {
  assert.match(provision, /function startupGatewaySource\(\)/)
  assert.match(provision, /\/runpod-volume\/huggingface-cache\/hub/)
  assert.match(provision, /models--\{org\}--\{name\}/)
  assert.match(provision, /snapshots.*BASE_REV/)
  assert.match(provision, /@app\.get\("\/ping"\)/)
  assert.match(provision, /@app\.get\("\/ready"\)/)
  assert.match(provision, /asyncio\.create_task\(bootstrap\(\)\)/)
  assert.match(provision, /ITMOUNTS_INTERNAL_VLLM_PORT/)
  assert.match(provision, /127\.0\.0\.1/)
  assert.match(provision, /distilled_bootstrap_failed/)
  assert.match(provision, /waitForRunpodServerlessDistilledReady/)
  assert.match(provision, /DISTILLED_STARTUP_READY_TIMEOUT_MS/)
  assert.match(provision, /"--max-model-len", "8192"/)
  assert.match(provision, /"--enforce-eager"/)
})

test('a healthy gateway still loading at the readiness deadline uses the bounded inference window', () => {
  assert.match(provision, /if \(response\.status === 204\) lastError = null/)
  assert.match(provision, /if \(!readiness\.ok && readiness\.httpStatus !== 204\)/)
  const readinessGate = provision.indexOf("readiness.httpStatus !== 204")
  const inferenceCall = provision.indexOf("${baseUrl}/chat/completions")
  assert.ok(readinessGate >= 0 && inferenceCall > readinessGate)
})

test('startup gateway falls back to exact Hugging Face revisions without changing artifact identity', () => {
  assert.match(provision, /repo_id=BASE_ID/)
  assert.match(provision, /revision=BASE_REV/)
  assert.match(provision, /repo_id=ADAPTER_ID/)
  assert.match(provision, /revision=ADAPTER_REV/)
  assert.match(provision, /local_dir="\/models\/base"/)
  assert.match(provision, /local_dir="\/models\/adapter"/)
  assert.match(provision, /"--lora-modules", lora/)
})

test('GraphQL endpoint policy preserves the bounded worker and request-count fields', () => {
  const policyStart = provision.indexOf('function endpointGraphQlPolicyPayload()')
  const policyEnd = provision.indexOf('function serverlessGpuCandidates')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  const policy = provision.slice(policyStart, policyEnd)
  assert.match(policy, /workersMin:\s*0/)
  assert.match(policy, /workersMax:\s*1/)
  assert.match(policy, /idleTimeout:\s*DISTILLED_IDLE_TIMEOUT_SECONDS/)
  assert.match(policy, /scalerType:\s*'REQUEST_COUNT'/)
  assert.match(policy, /scalerValue:\s*1/)
  assert.match(policy, /executionTimeoutMs:\s*300_000/)
  assert.match(policy, /flashBootType:\s*'FLASHBOOT'/)
  assert.doesNotMatch(policy, /gpuTypeIds\s*:/)
})

test('v5 GPU selection stays on the standard 16 GB and 24 GB pools inside the owner ceiling', () => {
  assert.match(provision, /requestV2<\{ gpus\?: RunpodGpuCatalogItemV2\[] \}>\('\/catalog\/gpus'\)/)
  assert.match(provision, /Number\(item\.memory \|\| 0\) >= 16/)
  assert.match(provision, /Number\(item\.memory \|\| 0\) <= 24/)
  assert.match(provision, /APPROVED_SERVERLESS_GPU_POOLS = \[[\s\S]*'AMPERE_16',[\s\S]*'AMPERE_24'/)
  assert.doesNotMatch(provision, /APPROVED_SERVERLESS_GPU_POOLS = \[[\s\S]*'ADA_24'/)
  assert.match(provision, /MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0\.69/)
  assert.match(provision, /item\.availability !== 'NONE'/)
  assert.match(provision, /pools\.length < APPROVED_SERVERLESS_GPU_POOLS\.length/)
  assert.match(provision, /RunPod catalog does not currently expose both approved 16 GB and 24 GB Serverless pools/)
})

test('existing endpoint policy is reconciled before a paid canary', () => {
  assert.match(route, /reconcileRunpodServerlessDistilledEndpoint\(endpointId\)/)
  assert.match(route, /CANARY_HTTP_ATTEMPTS_PER_INVOCATION = 1/)
  assert.match(route, /timeoutMs:\s*DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS/)
  assert.match(route, /httpAttempts:\s*CANARY_HTTP_ATTEMPTS_PER_INVOCATION/)
})

test('each provider invocation is durably receipted before the bounded network call', () => {
  assert.match(route, /CANARY_STARTED_CLAIM = 'local_distilled_runtime_canary_started'/)
  assert.match(route, /const starts = refreshed\.filter/)
  assert.match(route, /const consumedInvocations = Math\.max\(failures, starts\)/)
  assert.match(route, /consumedInvocations >= approvedMaxCanaryInvocations/)
  const receipt = route.indexOf('await record(CANARY_STARTED_CLAIM')
  const providerCall = route.indexOf('const canary = await canaryRunpodServerlessDistilledLlm')
  assert.ok(receipt >= 0 && providerCall > receipt)
  assert.match(route.slice(receipt, providerCall), /startedAt/)
  assert.match(route.slice(receipt, providerCall), /productionTrafficAuthorized:\s*false/)
})

test('official RunPod endpoint health is captured around canary execution', () => {
  assert.match(provision, /\$\{SERVERLESS_API\}\/\$\{id\}\/health/)
  assert.match(provision, /workers:\s*Object\.freeze/)
  assert.match(provision, /inProgress:/)
  assert.match(provision, /inQueue:/)
  assert.match(route, /healthBefore = await runpodServerlessEndpointHealth\(endpointId\)/)
  assert.match(route, /healthAfter = await runpodServerlessEndpointHealth\(endpointId\)/)
  assert.match(route, /healthBefore,/)
  assert.match(route, /healthAfter,/)
})

test('append-only host suspension overrides older approval and performs only legacy queue cleanup', () => {
  assert.match(route, /SUSPEND_CLAIM = 'local_distilled_runtime_canary_suspended'/)
  assert.match(route, /function latestCanaryControl/)
  assert.match(route, /\[APPROVAL_CLAIM, SUSPEND_CLAIM\]/)
  assert.match(route, /cleanupLegacyQueueEndpoints\(rows\)/)
  assert.match(route, /canary_suspended_by_host_controller/)
  const controlIndex = route.indexOf('const control = latestCanaryControl(rows)')
  const cleanupIndex = route.indexOf('const cleanup = await cleanupLegacyQueueEndpoints(rows)')
  const approvalIndex = route.indexOf('const approval = validApproval(rows)')
  assert.ok(controlIndex >= 0 && cleanupIndex > controlIndex && approvalIndex > cleanupIndex)
})

test('legacy cleanup can only target provisioned endpoints superseded by the new load-balancer identity', () => {
  assert.match(route, /function legacyQueueEndpointIds/)
  assert.match(route, /evidence\?\.claim !== 'local_distilled_runtime_endpoint_provisioned'/)
  assert.match(route, /String\(evidence\?\.endpointName \|\| ''\) === DISTILLED_ENDPOINT_NAME/)
  assert.match(route, /String\(evidence\?\.routing \|\| ''\) === DISTILLED_ENDPOINT_ROUTING/)
  assert.match(route, /if \(!isCurrentLoadBalancer\) ids\.add\(endpointId\)/)
})

test('legacy queue purge removes pending jobs only and is idempotently receipted', () => {
  assert.match(cleanup, /\/purge-queue/)
  assert.match(cleanup, /method:\s*'POST'/)
  assert.match(cleanup, /runpodServerlessEndpointHealth\(endpointId\)/)
  assert.doesNotMatch(cleanup, /\/cancel\//)
  assert.doesNotMatch(cleanup, /workersMin|workersMax|templateId|train|chat\/completions/)
  assert.match(route, /LEGACY_QUEUE_CLEANED_CLAIM/)
  assert.match(route, /cleanupSucceeded:\s*true/)
  assert.match(route, /already_cleaned/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
})

test('the distilled runtime is addressed as a load-balancer endpoint, not through the job queue', () => {
  assert.equal(runpodServerlessOpenAiBaseUrl('abc_123'), 'https://abc_123.api.runpod.ai/v1')
  assert.throws(() => runpodServerlessOpenAiBaseUrl('../bad'), /endpoint id is invalid/)
  assert.match(provision, /\$\{baseUrl\}\/chat\/completions/)
  assert.doesNotMatch(provision, /api\.runpod\.ai\/v2\/\$\{id\}\/openai\/v1/)
  assert.match(provision, /DISTILLED_ENDPOINT_ROUTING = 'LOAD_BALANCER'/)
  assert.match(provision, /type:\s*'LB'/)
  assert.match(provision, /HEALTH_CHECK_PATH: '\/ping'/)
  assert.match(provision, /PORT_HEALTH: String\(DISTILLED_CONTAINER_PORT\)/)
})

test('load-balancer template identity cannot reuse the failed pre-gateway runtime', () => {
  assert.match(provision, /DISTILLED_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v5'/)
  assert.match(provision, /DISTILLED_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v7'/)
  assert.match(provision, /templateHasExactBootstrap/)
  assert.match(provision, /command\.includes\(DISTILLED_BASE_MODEL_REVISION\)/)
  assert.match(provision, /command\.includes\(DISTILLED_ADAPTER_MODEL_REVISION\)/)
  assert.match(provision, /command\.includes\('itmounts_distilled_gateway\.py'\)/)
  assert.match(provision, /throw new Error\('RunPod distilled load-balancer template exists but does not match the exact-artifact bootstrap contract'\)/)
})

test('routing mode is fixed at GraphQL creation and not hidden inside the reusable policy payload', () => {
  const policyStart = provision.indexOf('function endpointGraphQlPolicyPayload()')
  const policyEnd = provision.indexOf('function serverlessGpuCandidates')
  assert.ok(policyStart >= 0 && policyEnd > policyStart)
  assert.doesNotMatch(provision.slice(policyStart, policyEnd), /type:\s*DISTILLED_ENDPOINT_ROUTING/)
  assert.match(provision, /type:\s*'LB'/)
})

test('v2 reconciliation validates returned routing and bounded worker policy before canary use', () => {
  assert.match(provision, /endpoint\.type && endpoint\.type !== DISTILLED_ENDPOINT_ROUTING/)
  assert.match(provision, /endpoint\.workers\?\.min/)
  assert.match(provision, /endpoint\.workers\?\.max/)
  assert.match(provision, /endpoint\.workers\?\.idleTimeout/)
  assert.match(provision, /endpoint\.scaling\?\.type/)
  assert.match(provision, /endpoint\.scaling\?\.requestCount/)
  assert.match(provision, /endpoint\.timeout/)
})

test('a previously provisioned endpoint is only reused when its name and routing still match', () => {
  assert.match(route, /String\(row\?\.evidence\?\.endpointName \|\| ''\) === DISTILLED_ENDPOINT_NAME/)
  assert.match(route, /String\(row\?\.evidence\?\.routing \|\| ''\) === DISTILLED_ENDPOINT_ROUTING/)
  assert.match(route, /endpointName: DISTILLED_ENDPOINT_NAME/)
  assert.match(route, /routing: DISTILLED_ENDPOINT_ROUTING/)
})

test('RunPod error details are bounded and credential-like fields are redacted', () => {
  assert.equal(safeRunpodErrorDetail('{"message":"gpuTypePriority is not allowed"}'), 'gpuTypePriority is not allowed')
  assert.equal(safeRunpodErrorDetail('{"error":{"code":"invalid_request","message":"bad field"}}'), 'bad field')
  assert.equal(safeRunpodErrorDetail('{"errors":["additional properties type not allowed"]}'), 'additional properties type not allowed')
  assert.equal(safeRunpodErrorDetail('not-json-provider-body'), null)
  assert.equal(safeRunpodErrorDetail('{"message":"token: super-secret-value rejected"}'), 'token=[redacted] rejected')
})

test('deployment requires explicit durable unexpired approval and does not authorize Production traffic', () => {
  assert.match(route, /local_distilled_runtime_deploy_approved/)
  assert.match(route, /canaryAuthorized === true/)
  assert.match(route, /host_controller/)
  assert.match(route, /expires_at/)
  assert.match(route, /MAX_CANARY_INVOCATIONS = 3/)
  assert.match(route, /MIN_BALANCE_USD = 1/)
  assert.match(route, /maxEstimatedCanaryCostUsd/)
  assert.match(route, /approvedCostUsd >= \(approvedInvocations \* DISTILLED_WORST_CASE_CANARY_COST_USD\)/)
  assert.match(route, /approvedMaxCanaryInvocations = Number\(approval\.evidence\.maxCanaryInvocations\)/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
  assert.doesNotMatch(route, /RUNPOD_PRIMARY_MODE\s*=|RUNPOD_SERVERLESS_LLM_ENDPOINT_ID\s*=/)
})

test('private provider credentials are never returned or logged by the provisioner or queue cleanup', () => {
  assert.match(provision, /HF_TOKEN/)
  assert.match(cleanup, /RUNPOD_API_KEY/)
  assert.doesNotMatch(provision, /console\.(log|info|warn|error).*HF_TOKEN/)
  assert.doesNotMatch(cleanup, /console\.(log|info|warn|error).*RUNPOD_API_KEY/)
  assert.doesNotMatch(route, /RUNPOD_API_KEY.*NextResponse|HF_TOKEN.*NextResponse/)
})
