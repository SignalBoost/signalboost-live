// saas/tests/builderCampaignTraceAndFixture.node.test.ts
//
// Production campaign 2026-11-01 20:36 UTC: PAC-18 (9.7 min) ran alone after every other check, and no request carried
// a turn id, so PAC-16/PAC-17 were BLOCKED and a failed request could not be traced to the stage that ended it.
// Now PAC-18 starts together with the model checks, and a signed campaign request gets back the turn ids its records
// carry.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stubOutcomeJudge } from './helpers/answerOutcomeJudgeStub.ts'
import { runCampaignSlice, emptyCampaignLedger } from '../lib/builder/campaign/runner.ts'
import { PAC_CATALOG } from '../lib/builder/campaign/catalog.ts'
import { newFixtureSession } from '../lib/builder/campaign/fixture.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
import { noteRequestTurnId, requestTurnIds, withRequestTurnCorrelation } from '../lib/ai/cos/requestTurnCorrelation.ts'
import { captureEvidenceSourceUseTurnId } from '../lib/ai/cos/evidenceSourceUseTurnContext.ts'
import { productionAnalysis } from '../lib/builder/campaign/hostPorts.ts'
import type { CampaignPorts } from '../lib/builder/campaign/ports.ts'

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const full = (prompt: string) => requestedAnalyticalTasks(prompt).map((task, i) => `${i + 1}. ${task}\nSection ${i + 1} weighs ${task.toLowerCase()} with explicit uncertainty.`).join('\n\n')

test('PAC-18 starts together with the model checks instead of after them', async () => {
  const events: string[] = []
  let fixtureStarted = -1
  let fixtureEnded = -1
  let analysesEnded = 0
  const t0 = Date.now()
  const ports: CampaignPorts = {
    outcomeJudge: stubOutcomeJudge,
    deployment: async () => ({ mainCommit: 'abc', productionCommit: 'abc' }),
    analysis: async prompt => {
      await sleep(50)
      analysesEnded = Date.now() - t0
      events.push('analysis')
      return { status: 200, ok: true, reply: full(prompt), source: 'cos-local-primary', correlationId: null, latencyMs: 50, servedCommit: 'abc', model: 'm', localModelInvoked: true, executionAllowed: false }
    },
    builderFixture: async session => {
      fixtureStarted = Date.now() - t0
      await sleep(40)
      fixtureEnded = Date.now() - t0
      events.push('fixture')
      return { status: 'done', session: session ?? newFixtureSession(0), result: { verdict: 'PASS', actual: 'fixture passed', evidence: [] } }
    },
  }
  const only = PAC_CATALOG.filter(item => ['PAC-01', 'PAC-02', 'PAC-03', 'PAC-04', 'PAC-05', 'PAC-06', 'PAC-18'].includes(item.id))
  const slice = await runCampaignSlice({ catalog: only, state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null }, ports, remainingMs: () => 240_000 })
  assert.equal(slice.stopped, 'complete')
  assert.ok(fixtureStarted < 20, `the fixture started with the first model checks (+${fixtureStarted} ms)`)
  assert.ok(fixtureEnded < analysesEnded, 'the six model checks (two rounds of three) were still running while the fixture worked')
  assert.ok(slice.ledger.rows.some(row => row.testId === 'PAC-18' && row.verdict === 'PASS'))
  assert.equal(slice.ledger.rows.length, 7)
})

test('without model checks left to run, PAC-18 runs in its place in the order', async () => {
  let calls = 0
  const ports: CampaignPorts = {
    outcomeJudge: stubOutcomeJudge,
    deployment: async () => ({ mainCommit: 'abc', productionCommit: 'abc' }),
    builderFixture: async session => { calls++; return { status: 'done', session: session ?? newFixtureSession(0), result: { verdict: 'PASS', actual: 'ok', evidence: [] } } },
  }
  const only = PAC_CATALOG.filter(item => item.id === 'PAC-18')
  const slice = await runCampaignSlice({ catalog: only, state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null }, ports, remainingMs: () => 240_000 })
  assert.equal(calls, 1)
  assert.equal(slice.ledger.rows[0].verdict, 'PASS')
})

test('every reasoner turn of a request is noted in that request only; outside a request nothing is kept', async () => {
  captureEvidenceSourceUseTurnId('outside-any-request')
  assert.deepEqual(requestTurnIds(), [])
  const [first, second] = await Promise.all([
    withRequestTurnCorrelation(async () => {
      captureEvidenceSourceUseTurnId('turn-a1')
      await sleep(5)
      captureEvidenceSourceUseTurnId('turn-a2')
      captureEvidenceSourceUseTurnId('turn-a2')
      return requestTurnIds()
    }),
    withRequestTurnCorrelation(async () => {
      await sleep(1)
      noteRequestTurnId('turn-b1')
      return requestTurnIds()
    }),
  ])
  assert.deepEqual(first, ['turn-a1', 'turn-a2'])
  assert.deepEqual(second, ['turn-b1'])
})

test('a signed campaign request gets the last turn record the request wrote when its provenance names none', async () => {
  const route = read('app/api/cos-provenance-browser/route.ts')
  const post = route.slice(route.indexOf('export async function POST('), route.indexOf('async function handleBrowserTurn('))
  assert.match(post, /return withRequestTurnCorrelation\(async \(\) => \{\n\s+const response = await handleBrowserTurn\(req\)/)
  // The provenance's own turn id (#5186) wins; the request's recorded turn is the fallback, through the same signed check.
  assert.match(post, /if \(response\.headers\.get\(CAMPAIGN_TURN_ID_HEADER\)\) return response/)
  assert.match(post, /const recorded = signedCampaignTurnId\(\{ turnId: requestTurnIds\(\)\.at\(-1\) \}, campaignHeader\)\n\s+if \(!recorded\) return response/)
  // The out-of-pipeline turn record is noted only after it is written.
  assert.match(read('lib/ai/cos/cosPrimaryTurnProvenance.ts'), /if \(result\.error\) throw result\.error\n\s+noteRequestTurnId\(turnId\)/)
  const { signedCampaignTurnId, campaignLiveInferenceToken } = await import('../lib/ai/cos/campaignLiveInference.ts')
  const id = '22222222-2222-4222-8222-222222222222'
  const token = campaignLiveInferenceToken(Date.now(), 'test-secret')
  assert.equal(signedCampaignTurnId({ turnId: id }, token, Date.now(), 'test-secret'), id)
  assert.equal(signedCampaignTurnId({ turnId: id }, null, Date.now(), 'test-secret'), null, 'unsigned requests never get it')
  assert.equal(signedCampaignTurnId({ turnId: undefined }, token, Date.now(), 'test-secret'), null, 'no recorded turn, no id')
  const fetchImpl = (async () => new Response(JSON.stringify({ reply: 'x', source: 'failed_closed', ok: false, execution_provenance: {} }), { status: 200, headers: { 'x-itmounts-campaign-turn-id': id } })) as typeof fetch
  assert.equal((await productionAnalysis('prompt', undefined, fetchImpl)).correlationId, id)
})
