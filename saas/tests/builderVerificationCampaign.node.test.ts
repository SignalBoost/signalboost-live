// saas/tests/builderVerificationCampaign.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { PAC_CATALOG, PAC_01_PROMPT, PAC_CAMPAIGN_ID } from '../lib/builder/campaign/catalog.ts'
import { certifyCampaign, renderCampaignReport, pendingItems } from '../lib/builder/campaign/ledger.ts'
import { runCampaignSlice, emptyCampaignLedger, judgeAnalysis, CAMPAIGN_ITEM_RESERVE_MS } from '../lib/builder/campaign/runner.ts'
import type { AnalysisOutcome, CampaignPorts } from '../lib/builder/campaign/ports.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const deployment = async () => ({ productionCommit: 'abc123', mainCommit: 'abc123' })

function fullAnswer(prompt: string): string {
  // One substantive section per numbered deliverable, each with its own vocabulary, so the deterministic contract is met.
  const tasks = requestedAnalyticalTasks(prompt)
  return tasks.map((task, index) => `${index + 1}. ${task}\n` + `Section ${index + 1} analyses ${task.toLowerCase()} in depth: the connection pool saturation, lock contention timeline, fraud-scoring deployment window, consumer lag growth and database wait events are weighed against each other with explicit uncertainty, naming which observation supports which hypothesis and which measurement would settle it. `.repeat(2)).join('\n\n')
}

const released = (prompt: string, over: Partial<AnalysisOutcome> = {}): AnalysisOutcome => ({
  status: 200, ok: true, reply: fullAnswer(prompt), source: 'cos-local-primary', correlationId: 'corr-' + Math.random().toString(36).slice(2, 8),
  latencyMs: 1200, model: 'owned', localModelInvoked: true, executionAllowed: false, ...over,
})

test('the catalog is the brief: twenty items, PAC-01 keeps the original Kafka prompt, every analysis prompt has numbered deliverables', () => {
  assert.equal(PAC_CATALOG.length, 20)
  assert.deepEqual(PAC_CATALOG.map(item => item.id), Array.from({ length: 20 }, (_, i) => `PAC-${String(i + 1).padStart(2, '0')}`))
  assert.match(PAC_01_PROMPT, /payments\.events/)
  assert.equal(requestedAnalyticalTasks(PAC_01_PROMPT).length, 8)
  for (const item of PAC_CATALOG.filter(item => item.port === 'analysis' || item.port === 'routing')) {
    assert.ok(requestedAnalyticalTasks(item.prompt || '').length >= 3, item.id)
  }
  assert.equal(PAC_CAMPAIGN_ID, 'COS-PAC-001')
})

test('an analysis is PASS only when the production path released it and every deliverable has substance', () => {
  assert.equal(judgeAnalysis(PAC_01_PROMPT, released(PAC_01_PROMPT)).verdict, 'PASS')
  assert.equal(judgeAnalysis(PAC_01_PROMPT, released(PAC_01_PROMPT, { ok: false, reply: 'I could not finish a reliable answer…', source: 'failed_closed' })).verdict, 'FAIL')
  assert.equal(judgeAnalysis(PAC_01_PROMPT, released(PAC_01_PROMPT, { source: 'cos-bounded-timeout' })).verdict, 'FAIL')
  assert.equal(judgeAnalysis(PAC_01_PROMPT, released(PAC_01_PROMPT, { status: 500 })).verdict, 'FAIL')
  const headingsOnly = judgeAnalysis(PAC_01_PROMPT, released(PAC_01_PROMPT, { reply: '1. Root causes\n2. Hypotheses\n3. Correlation\n4. Evidence\n5. Plan\n6. Experiments\n7. Mechanisms\n8. Explanation' }))
  assert.equal(headingsOnly.verdict, 'FAIL')
  assert.match(headingsOnly.failureCause || '', /without real substance/)
})

test('a host without a port leaves the item BLOCKED with the cause, never PASS and never skipped', async () => {
  const ports: CampaignPorts = { deployment, analysis: async prompt => released(prompt) }
  const result = await runCampaignSlice({ catalog: PAC_CATALOG, state: { ledger: emptyCampaignLedger(PAC_CAMPAIGN_ID), reliability: null }, ports, remainingMs: () => 10 * 60_000, reliabilityPrompts: [PAC_01_PROMPT] })
  assert.equal(result.stopped, 'complete')
  assert.equal(result.ledger.rows.length, 20)
  const byId = Object.fromEntries(result.ledger.rows.map(row => [row.testId, row]))
  for (const id of ['PAC-01', 'PAC-02', 'PAC-03', 'PAC-04', 'PAC-05', 'PAC-06', 'PAC-11', 'PAC-20']) assert.equal(byId[id].verdict, 'PASS', id)
  for (const id of ['PAC-07', 'PAC-12', 'PAC-13', 'PAC-16', 'PAC-17', 'PAC-18', 'PAC-19']) {
    assert.equal(byId[id].verdict, 'BLOCKED', id)
    assert.match(byId[id].failureCause || '', /on this host/)
  }
  const certification = certifyCampaign(result.ledger, PAC_CATALOG)
  assert.equal(certification.outcome, 'BLOCKED')
  assert.equal(certification.passed, 8)
  assert.equal(certification.blocked, 12)
  const report = renderCampaignReport(result.ledger, PAC_CATALOG)
  assert.match(report, /PAC-20 — Production reliability\nStatus: PASS/)
  assert.match(report, /Final certification outcome: BLOCKED/)
  assert.match(report, /Production commit: abc123/)
})

test('the slice stops before an item it cannot finish and resumes from the ledger; the reliability loop keeps its count', async () => {
  let calls = 0
  let clock = 0
  const ports: CampaignPorts = { deployment, analysis: async prompt => { calls++; clock += 30_000; return released(prompt) } }
  const sliceMs = 200_000
  let state = { ledger: emptyCampaignLedger(PAC_CAMPAIGN_ID), reliability: null as any }
  const slices: string[] = []
  for (let slice = 0; slice < 12 && pendingItems(state.ledger, PAC_CATALOG).length; slice++) {
    const start = clock
    const result = await runCampaignSlice({ catalog: PAC_CATALOG, state, ports, remainingMs: () => sliceMs - (clock - start), reliabilityPrompts: [PAC_01_PROMPT] })
    slices.push(result.stopped)
    state = { ledger: result.ledger, reliability: result.reliability }
    clock = start + sliceMs
  }
  assert.equal(pendingItems(state.ledger, PAC_CATALOG).length, 0)
  assert.ok(slices.filter(s => s === 'budget').length >= 2, 'the campaign needed several slices: ' + slices.join(','))
  assert.equal(slices.at(-1), 'complete')
  const pac20 = state.ledger.rows.find(row => row.testId === 'PAC-20')!
  assert.equal(pac20.verdict, 'PASS')
  assert.equal(calls, 7 + 20, 'seven analysis/contract items plus twenty reliability requests, none repeated')
})

test('one failed request in the reliability loop is FAIL with the count reached; any FAIL makes the campaign FAIL', async () => {
  let n = 0
  const ports: CampaignPorts = { deployment, analysis: async prompt => (++n === 11 ? released(prompt, { ok: false, source: 'failed_closed', reply: '' }) : released(prompt)) }
  const onlyPac20 = PAC_CATALOG.filter(item => item.id === 'PAC-20')
  const result = await runCampaignSlice({ catalog: onlyPac20, state: { ledger: emptyCampaignLedger(PAC_CAMPAIGN_ID), reliability: null }, ports, remainingMs: () => 10 * 60_000, reliabilityPrompts: [PAC_01_PROMPT] })
  const row = result.ledger.rows[0]
  assert.equal(row.verdict, 'FAIL')
  assert.match(row.actual, /Request 11 of 20/)
  assert.equal(certifyCampaign(result.ledger, onlyPac20).outcome, 'FAIL')
})

test('a routing item fails when the investigation entered the Builder, and the certification needs production to match main', async () => {
  const ports: CampaignPorts = {
    deployment: async () => ({ productionCommit: 'abc', mainCommit: 'def' }),
    analysis: async prompt => released(prompt),
    routing: async prompt => ({ outcome: released(prompt), enteredBuilder: true }),
  }
  const only = PAC_CATALOG.filter(item => item.id === 'PAC-12' || item.id === 'PAC-01')
  const result = await runCampaignSlice({ catalog: only, state: { ledger: emptyCampaignLedger(PAC_CAMPAIGN_ID), reliability: null }, ports, remainingMs: () => 10 * 60_000 })
  const routing = result.ledger.rows.find(row => row.testId === 'PAC-12')!
  assert.equal(routing.verdict, 'FAIL')
  assert.equal(routing.failureCause, 'misrouted to Builder')
  const passingOnly = { ...result.ledger, rows: result.ledger.rows.filter(row => row.testId === 'PAC-01') }
  const cert = certifyCampaign(passingOnly, only.filter(item => item.id === 'PAC-01'))
  assert.equal(cert.deployedMatchesMain, false)
  assert.equal(cert.outcome, 'BLOCKED', 'all PASS but production is not the tested release')
})

test('the slice reserve is one minute per item', () => {
  assert.equal(CAMPAIGN_ITEM_RESERVE_MS, 60_000)
})
