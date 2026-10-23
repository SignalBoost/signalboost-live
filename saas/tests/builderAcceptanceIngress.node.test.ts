import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import * as roles from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import * as scope from '../lib/builder/repository-repair-target.ts'
import * as continuity from '../lib/builder/project-continuity.ts'
import * as admission from '../lib/builder/execution-admission.ts'
import * as requestContract from '../lib/builder/request-contract.ts'
import * as isolatedIntent from '../lib/builder/isolated-project-intent.ts'
import * as publication from '../lib/builder/isolated-publication.ts'
import * as assistance from '../lib/ai/cos/assistanceMode.ts'
const { BUILDER_RUNNING } = assistance

const objective = readFileSync(new URL('./fixtures/builder-isolated-acceptance.txt', import.meta.url), 'utf8')
const userId = '11111111-1111-4111-8111-111111111111'
const selectedWorkspace = '33333333-3333-4333-8333-333333333333'

// Admission rejection cases must be deterministic on Vercel, where the real
// publication credentials may be configured in the build environment.
const publicationKeys = ['BUILDER_ISOLATED_GITHUB_OWNER', 'GITHUB_WRITE_TOKEN', 'VERCEL_TOKEN', 'BUILDER_ISOLATED_VERCEL_PROJECT_ID'] as const
async function withoutPublicationConfig<T>(run: () => Promise<T>): Promise<T> {
  const previous = publicationKeys.map(key => process.env[key])
  for (const key of publicationKeys) delete process.env[key]
  try { return await run() }
  finally {
    publicationKeys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]
      else process.env[key] = previous[index]
    })
  }
}

class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } })
  }
}

// Execute the checked-in production handlers. Only their external ports are replaced; no Next,
// provider, storage, or network dependency is needed for this no-cost admission/receipt test.
function handler(path: string, exported: string, modules: Record<string, any>, fallback: any): any {
  let code = stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
  code = code.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm, (_, names, specifier) => {
    const bindings = names.replace(/\b(\w+)\s+as\s+(\w+)/g, '$1: $2')
    return `const {${bindings}} = new Proxy(modules[${JSON.stringify(specifier)}] || {}, {get: (target, key) => key in target ? target[key] : fallback[key]});`
  })
  code = code.replace(/^export\s+\{[^}]*\}\s+from[^\n]*$/gm, '')
    .replace(/^export\s+/gm, '')
  return new Function('modules', 'fallback', `${code}\nreturn ${exported}`)(modules, fallback)
}

function setup(owner: boolean, specialistResponse?: any, forceClassifierFalse = false) {
  const calls = { model: 0, workspace: 0, jobs: [] as any[], repairs: 0, scheduled: 0 }
  const unexpected = (name: string) => () => { throw new Error(`unexpected port: ${name}`) }
  const fallback = new Proxy({}, { get: () => () => false })
  const modules: Record<string, any> = {
    'next/server': { NextResponse, after: () => { calls.scheduled++ } },
    '@/lib/auth/access': { getAccess: async () => ({ userId, isOwner: owner }) },
    // The person-facing progress sentence is real product copy, not an external port.
    '@/lib/ai/cos/assistanceMode': { assistanceCopy: assistance.assistanceCopy, BUILDER_RUNNING: assistance.BUILDER_RUNNING },
    '@/lib/auth/publicAuditIdentity': { publicAuditUserId: () => userId, withPublicAuditIdentity: (_: any, work: any) => work() },
    '@/lib/auth/publicDeliveryScope': { withPublicDeliveryScope: (work: any) => work() },
    '@/lib/ai/cos/cosReasoningRolePolicy': forceClassifierFalse ? { ...roles, isConciergeBuilderObjective: () => false } : roles,
    '@/lib/builder/isolated-project-intent': isolatedIntent,
    '@/lib/builder/isolated-publication': publication,
    '@/lib/builder/repository-repair-target': scope,
    '@/lib/builder/project-continuity': continuity,
    '@/lib/builder/execution-admission': admission,
    '@/lib/builder/request-contract': requestContract,
    '@/lib/ai/cos/softwareSpecialistRecovery': {
      trimObjectiveForHarness: (value: string) => value,
      runSoftwareDelegationWithSafeRetry: (run: any, execute: any) => run(execute),
    },
    '@/platform-harness/adapters/cos-ingress': {
      currentCosHarnessIngress: () => ({ manifest: { identity: { tenantId: 'test' } } }),
    },
    '@/lib/ai/cos/softwareSpecialistHarness': {
      runCosSoftwareSpecialistProductionHarness: async ({ execute }: any) => ({ ok: true, value: await execute() }),
    },
    '@/lib/builder/execution-evidence': { builderEvidenceReply: async () => null },
    '@/lib/builder/job-store': {
      enqueueBuilderJob: async (job: any) => { calls.jobs.push(job) },
      readBuilderEvidenceJob: unexpected('borrowed job history'),
    },
    '@/lib/builder/repository-repair-job': { enqueueSignalBoostRepositoryRepairJob: () => { calls.repairs++; throw new Error('platform repair forbidden') } },
    '@/lib/builder/workspace-supabase': {
      createSupabaseBuilderWorkspace: () => { calls.workspace++; return { ensureWorkspace: async () => {}, setObjective: async () => {}, writeFile: unexpected('unexpected staged file') } },
    },
    '@/lib/builder/debug-file-job': { extractBuilderSourceFiles: () => [], planDebugFileJob: () => null },
    '@/lib/ai/cos/cosTurnBudget': { turnDeadlineRemainingMs: () => 100_000 },
    '@/lib/i18n/responseLanguage': { resolveResponseLanguage: () => 'en' },
    '@/lib/ai/cos/pastedOperationalLog': { analyzeOperationalLog: () => ({}), isOperationalLogEvidence: () => false },
    '@/lib/ai/cos/publicConciergeIdentity': { publicConciergeIdentityReply: () => null },
    '@/lib/ai/cos/publicConciergeIdentityIntent': { shouldResolveSemanticPublicIdentity: () => true, resolveSemanticPublicIdentity: unexpected('identity model') },
    '@/lib/public-brand': { PUBLIC_BRAND: { name: 'iTMounts' } },
    '@/app/api/cos-primary/route': { POST: () => { calls.model++; return NextResponse.json({ reply: 'HTTP\nPASS\nINCOMPLETE' }) } },
    '@/lib/ai/cos/cosAgentDecision': { decideCosAgentTurn: unexpected('general planner') },
  }
  const specialist = handler('../lib/ai/cos/softwareSpecialist.ts', 'tryCosSoftwareSpecialist', modules, fallback)
  modules['@/lib/ai/cos/softwareSpecialist'] = { tryCosSoftwareSpecialist: specialistResponse || (async (input: any) => { const r = await specialist(input); assert.ok(r, 'eligible build must produce a specialist response'); return r }) }
  return { calls, specialist, browser: handler('../app/api/cos-browser/route.ts', 'POST', modules, fallback), developer: handler('../app/api/builder/route.ts', 'POST', modules, fallback) }
}

function request(prompt: string, assistant = false) {
  const req = new Request('https://itmounts.com/api/cos-browser', {
    method: 'POST', headers: assistant ? { 'x-signalboost-surface': 'cos' } : {},
    body: JSON.stringify({ objective: prompt, workspaceId: selectedWorkspace, messages: [{ role: 'user', content: prompt }] }),
  })
  return Object.assign(req, { nextUrl: new URL(req.url) })
}

test('Concierge and COS return the real admission blocker instead of words from the request', async () => withoutPublicationConfig(async () => {
  for (const owner of [false, true]) for (const assistant of [false, true]) {
    const { browser, calls } = setup(owner)
    const response = await browser(request(objective, assistant))
    const result = await response.json()
    assert.equal(response.status, 422)
    assert.equal(result.error, 'builder_isolated_publication_unavailable')
    assert.equal(result.status, 'incomplete')
    assert.equal(result.jobId, undefined)
    assert.equal(result.execution_allowed, false)
    assert.deepEqual(calls, { model: 0, workspace: 0, jobs: [], repairs: 0, scheduled: 0 })
  }
}))

test('Developer never substitutes a workspace-only result for an isolated PR/preview request', async () => withoutPublicationConfig(async () => {
  const { developer, calls } = setup(true)
  const response = await developer(request(objective))
  assert.equal(response.status, 422)
  assert.equal((await response.json()).error, 'builder_isolated_publication_unavailable')
  assert.deepEqual(calls, { model: 0, workspace: 0, jobs: [], repairs: 0, scheduled: 0 })
}))

test('an admitted isolated build queues V2 once and carries the same job ID through public presentation', async () => {
  const prompt = 'Create an isolated Node.js repository with sum.js and sum.test.js. Repair the function and run node --test sum.test.js. Limits: maximum $0.50 inference spending and maximum 10 minutes. Do not modify production/main.'
  const { browser, calls } = setup(true)
  const response = await browser(request(prompt))
  const result = await response.json()
  assert.equal(response.status, 202)
  assert.equal(calls.jobs.length, 1)
  assert.equal(calls.jobs[0].metadata.builderEngine, 'v2')
  assert.equal(calls.repairs, 0)
  assert.equal(calls.model, 0)
  assert.equal(calls.scheduled, 1)
  assert.equal(result.jobId, calls.jobs[0].jobId)
  assert.equal(result.workspaceId, calls.jobs[0].workspaceId)
  assert.notEqual(result.workspaceId, selectedWorkspace)
  // The job id travels in the response data; the person reads a plain progress sentence (Production 2026-10-23).
  assert.equal(result.reply, BUILDER_RUNNING.en)
  assert.equal(result.orchestrator, undefined)
})


test('Developer admits explicit isolated PR and preview jobs when generic classifier misses the task', async () => {
  const { developer, calls } = setup(true, undefined, true)
  // Intake must not depend solely on a prose-oriented Concierge classifier.
  const keys = ['BUILDER_ISOLATED_GITHUB_OWNER', 'GITHUB_WRITE_TOKEN', 'VERCEL_TOKEN', 'BUILDER_ISOLATED_VERCEL_PROJECT_ID'] as const
  const previous = keys.map(key => process.env[key])
  keys.forEach(key => { process.env[key] = 'test-only' })
  let response: Response
  try { response = await developer(request(objective)) }
  finally { keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key]
    else process.env[key] = previous[index]
  }) }
  const data = await response.json()
  assert.equal(response.status, 202, JSON.stringify(data))
  assert.equal(calls.jobs.length, 1)
  assert.equal(calls.jobs[0].metadata.builderEngine, 'v2')
  assert.equal(calls.repairs, 0)
})
