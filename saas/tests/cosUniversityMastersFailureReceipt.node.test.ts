import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const AGENT = 'software-specialist'
const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/** Run the checked-in route with isolated ports, never a real registry or receipt ledger. */
function moduleWithPorts(path: string, names: string[], ports: Record<string, unknown>): any {
  const js = stripTypeScriptTypes(file(path), { mode: 'strip' })
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, '')
    .replace(/^export\s+/gm, '')
  return new Function(...Object.keys(ports), `${js}\nreturn { ${names.join(', ')} };`)(...Object.values(ports))
}

function cronHarness(options: {
  registryError?: boolean; schedulingError?: boolean; receiptFailures?: number; workerError?: boolean
} = {}) {
  const receipts: any[] = [], dispatches: string[] = [], logs: unknown[][] = []
  let registryReads = 0
  const m = moduleWithPorts('app/api/cron/cos-university-masters-learning/route.ts', ['GET'], {
    NextResponse: { json: (body: unknown, init: { status: number }) => ({ body, status: init.status }) },
    console: { error: (...args: unknown[]) => { logs.push(args) } },
    listCosUniversityRegisteredAgents: async () => {
      registryReads++
      if (options.registryError) throw new Error('registry_unavailable')
      return [{ agentId: AGENT }]
    },
    runOneMastersLearningAgent: async (agents: { agentId: string }[], _now: Date, run: (agentId: string) => Promise<any>) => {
      const result = await run(agents[0].agentId)
      return { result, checked: [result] }
    },
    runCosUniversityMastersLearning: async ({ agentId }: { agentId: string }) => {
      dispatches.push(agentId)
      if (options.schedulingError) throw new Error('worker_unavailable')
      return { agentId, claimed: false, status: options.workerError ? 'error' : 'not_enrolled', acquisitionInvoked: false,
        errors: options.workerError ? ['worker_failed'] : [] }
    },
    recordCosUniversityProductionPath: async (input: unknown) => {
      receipts.push(input)
      if (receipts.length <= (options.receiptFailures ?? 0)) throw new Error('receipt_unavailable')
      return 'db://isolated-test-receipt'
    },
  })
  return { GET: m.GET, receipts, dispatches, logs, registryReads: () => registryReads }
}

async function withCronSecret(run: () => Promise<void>) {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'isolated-cron-test'
  try { await run() } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
}
const cronRequest = (authorized = true) => ({ headers: { get: () => authorized ? 'Bearer isolated-cron-test' : 'invalid' } })

test('registry failure records a current failed path receipt instead of leaving an old success latest', async () => withCronSecret(async () => {
  const h = cronHarness({ registryError: true }), response = await h.GET(cronRequest())
  assert.equal(response.status, 500); assert.equal(response.body.error, 'registry_unavailable')
  assert.equal(h.receipts.length, 1); assert.equal(h.receipts[0].path, 'masters_learning')
  assert.equal(h.receipts[0].invocationSucceeded, false)
  assert.equal(h.receipts[0].evidence.failurePhase, 'registry')
  assert.equal(h.receipts[0].evidence.runnerInvoked, false); assert.equal(h.dispatches.length, 0)
}))

test('thrown worker errors are recorded without falsely claiming the runner was not invoked', async () => withCronSecret(async () => {
  const h = cronHarness({ schedulingError: true }), response = await h.GET(cronRequest())
  assert.equal(response.status, 500); assert.equal(response.body.error, 'worker_unavailable')
  assert.equal(h.receipts.length, 1); assert.equal(h.receipts[0].invocationSucceeded, false)
  assert.equal(h.receipts[0].evidence.failurePhase, 'scheduling')
  assert.equal(h.receipts[0].evidence.runnerInvoked, true)
  assert.equal('acquisitionInvoked' in h.receipts[0].evidence, false, 'unknown partial execution must not be guessed')
}))

test('receipt write failure makes one bounded failed-receipt attempt and preserves HTTP failure', async () => withCronSecret(async () => {
  const h = cronHarness({ receiptFailures: 1 }), response = await h.GET(cronRequest())
  assert.equal(response.status, 500); assert.equal(response.body.error, 'receipt_unavailable')
  assert.equal(h.receipts.length, 2)
  assert.equal(h.receipts[1].invocationSucceeded, false)
  assert.equal(h.receipts[1].evidence.failurePhase, 'assurance')
  assert.equal(h.receipts[1].evidence.runnerInvoked, true)
  assert.deepEqual(h.dispatches, [AGENT], 'receipt failure must not rerun study')
}))

test('an unavailable failure ledger cannot convert the original error to success or an unhandled exception', async () => withCronSecret(async () => {
  const h = cronHarness({ registryError: true, receiptFailures: 99 }), response = await h.GET(cronRequest())
  assert.equal(response.status, 500); assert.equal(response.body.error, 'registry_unavailable')
  assert.equal(h.receipts.length, 1); assert.equal(h.receipts[0].invocationSucceeded, false)
  assert.equal(h.logs.length, 2); assert.equal(h.dispatches.length, 0)
}))

test('unauthenticated callers cannot poison the production assurance ledger', async () => withCronSecret(async () => {
  const h = cronHarness(), response = await h.GET(cronRequest(false))
  assert.equal(response.status, 401); assert.equal(h.receipts.length, 0)
  assert.equal(h.registryReads(), 0); assert.equal(h.dispatches.length, 0)
}))

test('returned worker failures retain their original single negative receipt', async () => withCronSecret(async () => {
  const h = cronHarness({ workerError: true }), response = await h.GET(cronRequest())
  assert.equal(response.status, 500); assert.equal(response.body.ok, false)
  assert.equal(h.receipts.length, 1); assert.equal(h.receipts[0].invocationSucceeded, false)
  assert.equal(h.receipts[0].evidence.agentId, AGENT)
  assert.deepEqual(h.receipts[0].evidence.errors, ['worker_failed'])
}))
