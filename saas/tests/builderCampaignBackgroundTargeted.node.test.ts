// saas/tests/builderCampaignBackgroundTargeted.node.test.ts
//
// Production 2026-10-31: a pasted PAC report started the whole twenty-check campaign, and the chat followed the job
// until it finished, so the owner's message stayed open for about ten minutes with no result until the end.
// Now: the planner decides by meaning whether to run checks, "run PAC-03" runs only PAC-03, the chat turn ends with
// the receipt, checks that never call the model run first side by side, and every failure is shown the moment it is
// recorded.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stubOutcomeJudge } from './helpers/answerOutcomeJudgeStub.ts'
import { runCampaignJobSlice } from '../lib/builder/campaign/job.ts'
import { runCampaignSlice } from '../lib/builder/campaign/runner.ts'
import { emptyCampaignLedger } from '../lib/builder/campaign/runner.ts'
import { PAC_CATALOG, PAC_PARALLEL_PORTS, selectCampaignChecks, isTargetedRun } from '../lib/builder/campaign/catalog.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
import { parseCosAgentDecision, sanitizeCampaignChecks } from '../lib/ai/cos/cosAgentDecision.ts'
import { campaignInBackground } from '../lib/ai/cos/agentProgressClient.ts'
import type { CampaignPorts, PortResult } from '../lib/builder/campaign/ports.ts'

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function fullAnswer(prompt: string): string {
  return requestedAnalyticalTasks(prompt).map((task, index) => `${index + 1}. ${task}\nSection ${index + 1} weighs the stated facts for ${task.toLowerCase()} with explicit uncertainty and the evidence that would refute it.`).join('\n\n')
}

const pass = (label: string): PortResult => ({ verdict: 'PASS', actual: `${label} passed`, evidence: [{ kind: 'note', label, detail: 'ok' }] })

function recordingPorts(options: { productionCommit: string | null; failFirstAnalysis?: boolean }) {
  const calls: Array<{ kind: string; at: number; end?: number }> = []
  let active = 0
  let maxActive = 0
  let analysisCount = 0
  const timed = async <T>(kind: string, ms: number, work: () => T): Promise<T> => {
    const entry: { kind: string; at: number; end?: number } = { kind, at: Date.now() }
    calls.push(entry)
    active++; maxActive = Math.max(maxActive, active)
    await sleep(ms)
    active--; entry.end = Date.now()
    return work()
  }
  const ports: CampaignPorts = {
    outcomeJudge: stubOutcomeJudge,
    deployment: async () => ({ mainCommit: 'c0ffee', productionCommit: options.productionCommit }),
    analysis: prompt => timed('analysis', 5, () => {
      analysisCount++
      const failed = options.failFirstAnalysis && analysisCount === 1
      return { status: 200, ok: !failed, reply: failed ? '' : fullAnswer(prompt), source: failed ? 'cos-primary-failed_closed' : 'cos-local-primary', correlationId: `turn-${analysisCount}`, latencyMs: 5, servedCommit: 'c0ffee', model: 'owned', localModelInvoked: true, executionAllowed: false }
    }),
    fault: fault => timed(`fault:${fault}`, 60, () => pass(fault)),
    release: () => timed('release', 60, () => pass('release')),
  }
  return { ports, calls, maxActive: () => maxActive }
}

test('checks that never call the model run first, side by side, before the first model request', async () => {
  const { ports, calls, maxActive } = recordingPorts({ productionCommit: 'c0ffee' })
  const slice = await runCampaignSlice({ catalog: PAC_CATALOG, state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null }, ports, remainingMs: () => 240_000 })
  const parallel = PAC_CATALOG.filter(item => PAC_PARALLEL_PORTS.has(item.port)).map(item => item.id)
  assert.deepEqual(parallel, ['PAC-07', 'PAC-08', 'PAC-09', 'PAC-10', 'PAC-19'])
  // All five started together, and finished before any model request started.
  assert.equal(maxActive(), 5)
  const firstAnalysis = calls.find(call => call.kind === 'analysis')!
  for (const call of calls.filter(call => call.kind !== 'analysis')) assert.ok(call.end! <= firstAnalysis.at, `${call.kind} ran before the model requests`)
  // Their rows are the first five recorded, and the production revision came from the deployment read.
  assert.deepEqual(slice.ledger.rows.slice(0, 5).map(row => row.testId).sort(), parallel)
  assert.equal(slice.ledger.productionCommit, 'c0ffee')
  // Model checks never overlap one another.
  const analyses = calls.filter(call => call.kind === 'analysis')
  for (let i = 1; i < analyses.length; i++) assert.ok(analyses[i].at >= analyses[i - 1].end!, 'model requests run one at a time')
})

test('without a readable production revision the checks keep their original order and still run', async () => {
  const { ports, calls, maxActive } = recordingPorts({ productionCommit: null })
  const slice = await runCampaignSlice({ catalog: PAC_CATALOG, state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null }, ports, remainingMs: () => 240_000 })
  // The first model request supplies the revision; after it, the fast checks still run side by side.
  assert.equal(calls[0].kind, 'analysis')
  assert.equal(slice.ledger.productionCommit, 'c0ffee')
  assert.equal(maxActive(), 5)
  assert.ok(slice.ledger.rows.some(row => row.testId === 'PAC-19' && row.verdict === 'PASS'))
})

test('"run PAC-03" runs only PAC-03 and reports a targeted retest, never a certification', async () => {
  assert.deepEqual(selectCampaignChecks(['pac-03', 'not-a-check']).map(item => item.id), ['PAC-03'])
  assert.equal(selectCampaignChecks([]).length, 20)
  assert.equal(isTargetedRun(selectCampaignChecks(['PAC-03'])), true)
  const { ports, calls } = recordingPorts({ productionCommit: 'c0ffee' })
  const outcome = await runCampaignJobSlice({ checkpoint: null, workspaceId: 'ws-1', ports, remainingMs: () => 240_000, checks: ['PAC-03'] })
  assert.equal(outcome.status, 'succeeded')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].kind, 'analysis')
  assert.match(outcome.reply, /PAC-03 — Unseen infrastructure incident\nStatus: PASS/)
  assert.doesNotMatch(outcome.reply, /PAC-01 —/)
  assert.match(outcome.reply, /Targeted run of PAC-03 \(1 of 20 checks of COS-PAC-001\): PASS/)
  assert.match(outcome.reply, /not a certification of the campaign/)
  assert.doesNotMatch(outcome.reply, /Final certification outcome/)
  assert.deepEqual((outcome as any).result.checks, ['PAC-03'])
})

test('a failure is shown in the live status the moment it is recorded, before the next check runs', async () => {
  const { ports, calls } = recordingPorts({ productionCommit: 'c0ffee', failFirstAnalysis: true })
  const updates: Array<{ reply: string; done: number; total: number; analysesSoFar: number }> = []
  await runCampaignJobSlice({
    checkpoint: null, workspaceId: 'ws-1', ports, remainingMs: () => 240_000, checks: ['PAC-01', 'PAC-02', 'PAC-07', 'PAC-19'],
    progress: async update => { updates.push({ ...update, analysesSoFar: calls.filter(call => call.kind === 'analysis').length }) },
  })
  // First update: the two fast checks, before any model request.
  assert.equal(updates[0].analysesSoFar, 0)
  assert.match(updates[0].reply, /^Targeted run of PAC-01, PAC-02, PAC-07, PAC-19 \(4 of 20 checks of COS-PAC-001\) in progress: 2 of 4 checks done \(2 PASS, 0 FAIL, 0 BLOCKED\)\./)
  // Second update: PAC-01 failed, reported with its cause while PAC-02 has not run yet.
  assert.equal(updates[1].analysesSoFar, 1)
  assert.match(updates[1].reply, /3 of 4 checks done \(2 PASS, 1 FAIL, 0 BLOCKED\)/)
  assert.match(updates[1].reply, /Not passing so far:\n- PAC-01 Eight-part forensic investigation: FAIL, production path did not release an answer/)
  assert.equal(updates.at(-1)!.done, 4)
  for (const update of updates) assert.equal(update.total, 4)
})

test('the planner reads which checks to run; a pasted report is answered, not executed', () => {
  assert.deepEqual(sanitizeCampaignChecks(['pac-03', 'PAC-3', 'PAC-03', 'COS-PAC-001', 7]), ['PAC-03'])
  const parsed = parseCosAgentDecision('{"mode":"orchestrate","answer":"","confidence":0.9,"capabilities":["verification_campaign"],"checks":["PAC-01","pac-20"],"reason":"run"}', 'test')
  assert.equal(parsed?.mode, 'orchestrate')
  assert.deepEqual(parsed?.mode === 'orchestrate' ? parsed.campaignChecks : null, ['PAC-01', 'PAC-20'])
  const decision = read('lib/ai/cos/cosAgentDecision.ts')
  assert.match(decision, /name === 'verification_campaign' \? VERIFICATION_CAMPAIGN_PARAMETERS/)
  assert.match(decision, /\.\.\.\(campaignCall \? \{ campaignChecks: campaignChecksFromToolArguments\(campaignCall\.function\.arguments\) \} : \{\}\)/)
  assert.match(decision, /A pasted campaign report or result, a question about why a check failed, or a request to fix, explain or review a failure is NOT a request to run anything: COS answers that in writing\./)
})

test('the chat turn ends with the campaign receipt; the live panel shows its status', () => {
  assert.equal(campaignInBackground({ source: 'cos-verification-campaign', jobId: 'x', status: 'queued' }), true)
  assert.equal(campaignInBackground({ source: 'builder-job-running', jobId: 'x', status: 'queued' }), false)
  const client = read('lib/ai/cos/agentProgressClient.ts')
  const handoff = client.indexOf('if (campaignInBackground(data)) {')
  const follow = client.indexOf('const followUntil = Date.now() + BUILDER_JOB_FOLLOW_WINDOW_MS')
  assert.ok(handoff > 0 && handoff < follow, 'a campaign is handed to the live panel before the follow loop')
  assert.match(client.slice(handoff, follow), /announceLiveBuilder\(\{ jobId,[\s\S]*return \{ ok: true, status: response\.status, data \}/)
  // The live panel polls /api/builder, which answers a campaign with its live status.
  const builder = read('app/api/builder/route.ts')
  assert.match(builder, /const campaignStatus = job\.metadata\.builderEngine === CAMPAIGN_ENGINE && typeof job\.result\?\.reply === 'string' && job\.result\.reply/)
  assert.match(builder, /: campaignStatus \? campaignStatus\n/)
  // The job runner writes that status after every check, only while its own claim still runs the job.
  const runner = read('lib/builder/job-runner.ts')
  assert.match(runner, /\.eq\('id', runningJob\.id\)\.eq\('user_id', runningJob\.userId\)\.eq\('claim_generation', runningJob\.claimGeneration\)\.eq\('status', 'running'\)/)
  assert.match(runner, /checks: Array\.isArray\(job\.metadata\.campaignChecks\) \? job\.metadata\.campaignChecks : null/)
  // The production revision is read from the live ingress without running a turn.
  assert.match(read('app/api/cos-browser/route.ts'), /export async function GET\(\) \{\n\s+return withServingRevision\(/)
  assert.match(read('lib/builder/campaign/hostPorts.ts'), /fetchImpl\(`\$\{PUBLIC_BRAND\.siteUrl\}\/api\/cos-browser`, \{ method: 'GET'/)
})
