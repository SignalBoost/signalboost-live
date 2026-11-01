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
import { runCampaignSlice, CAMPAIGN_MODEL_CONCURRENCY } from '../lib/builder/campaign/runner.ts'
import { emptyCampaignLedger } from '../lib/builder/campaign/runner.ts'
import { PAC_CATALOG, PAC_PARALLEL_PORTS, selectCampaignChecks, isTargetedRun } from '../lib/builder/campaign/catalog.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
import { parseCosAgentDecision, sanitizeCampaignChecks, campaignActionFrom } from '../lib/ai/cos/cosAgentDecision.ts'
import { campaignOfferReply } from '../lib/builder/campaign/catalog.ts'
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
  let activeAnalyses = 0
  let maxAnalyses = 0
  let analysisCount = 0
  const timed = async <T>(kind: string, ms: number, work: () => T): Promise<T> => {
    const entry: { kind: string; at: number; end?: number } = { kind, at: Date.now() }
    calls.push(entry)
    active++; maxActive = Math.max(maxActive, active)
    if (kind === 'analysis') { activeAnalyses++; maxAnalyses = Math.max(maxAnalyses, activeAnalyses) }
    await sleep(ms)
    active--; entry.end = Date.now()
    if (kind === 'analysis') activeAnalyses--
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
  return { ports, calls, maxActive: () => maxActive, maxAnalyses: () => maxAnalyses }
}

test('checks that never call the model run first, side by side, before the first model request', async () => {
  const { ports, calls, maxActive, maxAnalyses } = recordingPorts({ productionCommit: 'c0ffee' })
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
  // Model checks (the eight analytical/routing checks, then the twenty reliability requests) run three at a time, never more.
  assert.equal(CAMPAIGN_MODEL_CONCURRENCY, 3)
  assert.equal(maxAnalyses(), 3)
  // Seven analytical checks plus twenty reliability requests (PAC-12 has no routing port on this stub host: BLOCKED).
  assert.equal(calls.filter(call => call.kind === 'analysis').length, 7 + 20)
  assert.ok(slice.ledger.rows.some(row => row.testId === 'PAC-20' && row.verdict === 'PASS'))
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
  // The independent fast checks now publish individually instead of waiting for the whole group.
  // Each snapshot represents an actual completed check, even when completions race.
  assert.equal(updates[0].analysesSoFar, 0)
  assert.match(updates[0].reply, /1 of 4 checks done \(1 PASS, 0 FAIL, 0 BLOCKED\)/)
  assert.equal(updates[1].analysesSoFar, 0)
  assert.match(updates[1].reply, /2 of 4 checks done \(2 PASS, 0 FAIL, 0 BLOCKED\)/)
  // PAC-01 and PAC-02 run side by side; PAC-01's failure is published with its cause the moment it is recorded,
  // before PAC-02's result exists.
  assert.equal(updates[2].analysesSoFar, 2)
  assert.match(updates[2].reply, /3 of 4 checks done \(2 PASS, 1 FAIL, 0 BLOCKED\)/)
  assert.match(updates[2].reply, /Not passing so far:\n- PAC-01 Eight-part forensic investigation: FAIL, production path did not release an answer/)
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
  assert.match(decision, /\.\.\.\(campaignCall \? \{ campaignChecks: campaignChecksFromToolArguments\(campaignCall\.function\.arguments\), campaignAction: campaignActionFromToolArguments\(campaignCall\.function\.arguments\) \} : \{\}\)/)
  assert.match(decision, /Do NOT call it for a question about a past result, why a check failed, or a request to fix, explain or review a failure: COS answers that in writing\./)
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

test('a pasted campaign document is answered at once: nothing runs, and the reply says how to run all or some checks', () => {
  // Production 2026-11-01: the pasted COS-PAC-001 document went to the writing pipeline and came back as
  // "I could not finish a reliable answer". The planner now offers the campaign instead (model decision, no word rule).
  const decision = read('lib/ai/cos/cosAgentDecision.ts')
  assert.match(decision, /Call it with action "offer" when the owner shares the campaign document itself, or asks about running it, without clearly asking to run it now/)
  assert.match(decision, /A pasted campaign document is never answered in writing\./)
  assert.match(decision, /enum: Object\.freeze\(\['run', 'offer'\]\)/)
  // Only an explicit offer is an offer; the capability itself means run.
  assert.equal(campaignActionFrom('offer'), 'offer')
  assert.equal(campaignActionFrom('OFFER '), 'offer')
  assert.equal(campaignActionFrom(undefined), 'run')
  assert.equal(campaignActionFrom('run'), 'run')
  const offered = parseCosAgentDecision('{"mode":"orchestrate","answer":"","confidence":0.9,"capabilities":["verification_campaign"],"campaign_action":"offer","checks":[],"reason":"shared"}', 'test')
  assert.equal(offered?.mode === 'orchestrate' ? offered.campaignAction : null, 'offer')
  const run = parseCosAgentDecision('{"mode":"orchestrate","answer":"","confidence":0.9,"capabilities":["verification_campaign"],"reason":"run"}', 'test')
  assert.equal(run?.mode === 'orchestrate' ? run.campaignAction : null, 'run')
  // The offer is instant (no model call to write it) and executes nothing.
  const whole = campaignOfferReply([])
  assert.match(whole, /^This is the production acceptance campaign COS-PAC-001: 20 checks against the live site\. Nothing has been run\./)
  assert.match(whole, /say "run the campaign"/)
  assert.match(whole, /"run PAC-03 and PAC-20"/)
  assert.match(campaignOfferReply(['PAC-03']), /To retest PAC-03, say "run PAC-03"\./)
  const route = read('app/api/cos-browser/route.ts')
  const offer = route.slice(route.indexOf('async function verificationCampaignResponse('), route.indexOf('async function startVerificationCampaignResponse('))
  assert.match(offer, /campaignAction === 'offer'\) \{\n\s+return NextResponse\.json\(\{\n\s+reply: campaignOfferReply\(checks\), source: 'cos-verification-campaign-offer',\n\s+execution_allowed: false/)
  assert.doesNotMatch(offer.slice(0, offer.indexOf('return startVerificationCampaignResponse')), /startVerificationCampaign\(/)
})


test('independent PAC checks publish each finished result before slower peers, preserving ordered snapshots', async () => {
  const statuses: string[][] = []
  const ports: CampaignPorts = {
    deployment: async () => ({ mainCommit: 'c0ffee', productionCommit: 'c0ffee' }),
    fault: async fault => {
      await sleep(fault === 'model_timeout' ? 80 : 5)
      return pass(fault)
    },
  }
  const catalog = PAC_CATALOG.filter(item => item.id === 'PAC-07' || item.id === 'PAC-08')
  const result = await runCampaignSlice({
    catalog,
    state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null },
    ports, remainingMs: () => 240_000,
    progress: async ({ ledger }) => {
      statuses.push(ledger.rows.map(row => row.testId))
      await sleep(10)
    },
  })
  assert.equal(result.stopped, 'complete')
  assert.deepEqual(statuses, [['PAC-07'], ['PAC-07', 'PAC-08']])
  assert.equal(result.ledger.rows.length, 2)
})

test('reliability requests run three at a time but count in order: the first unverified one ends the run', async () => {
  let n = 0
  let active = 0
  let peak = 0
  const ports: CampaignPorts = {
    outcomeJudge: stubOutcomeJudge,
    deployment: async () => ({ mainCommit: 'c0ffee', productionCommit: 'c0ffee' }),
    // Request 5 fails; requests that finish after it (6, 7) are not counted. Later ones finish first to test ordering.
    analysis: async prompt => {
      const index = ++n
      active++; peak = Math.max(peak, active)
      await sleep(index % 2 ? 15 : 5)
      active--
      const failed = index === 5
      return { status: 200, ok: !failed, reply: failed ? '' : fullAnswer(prompt), source: failed ? 'failed_closed' : 'cos-local-primary', correlationId: `r-${index}`, latencyMs: 10, servedCommit: 'c0ffee', model: 'owned', localModelInvoked: true, executionAllowed: false }
    },
  }
  const only = PAC_CATALOG.filter(item => item.id === 'PAC-20')
  const slice = await runCampaignSlice({ catalog: only, state: { ledger: emptyCampaignLedger('COS-PAC-001'), reliability: null }, ports, remainingMs: () => 240_000, reliabilityPrompts: [PAC_CATALOG[0].prompt!] })
  assert.equal(peak, 3)
  const result = slice.ledger.rows.find(row => row.testId === 'PAC-20')!
  assert.equal(result.verdict, 'FAIL')
  assert.equal(result.actual, 'Request 5 of 20 did not produce a complete analysis; 4 consecutive completions before it.')
  // The run stops once the failure is known: only requests already in flight finish, the rest never start.
  assert.ok(n < 20, `the qualification stopped early (${n} of 20 started)`)
})
