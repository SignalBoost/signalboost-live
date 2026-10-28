// saas/tests/builderVerificationCampaignHost.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runCampaignJobSlice, campaignStateFromCheckpoint, CAMPAIGN_ENGINE, CAMPAIGN_TOTAL_DEADLINE_MS } from '../lib/builder/campaign/job.ts'
import { PAC_01_PROMPT, PAC_CATALOG } from '../lib/builder/campaign/catalog.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'
import type { CampaignPorts } from '../lib/builder/campaign/ports.ts'

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

function fullAnswer(prompt: string): string {
  return requestedAnalyticalTasks(prompt).map((task, index) => `${index + 1}. ${task}\n` + `Section ${index + 1} analyses ${task.toLowerCase()}: connection pool saturation, lock contention timeline, fraud-scoring deployment window, consumer lag growth and database wait events are weighed with explicit uncertainty, naming which observation supports which hypothesis and which measurement would settle it. `.repeat(2)).join('\n\n')
}

test('a campaign job slice pauses with its ledger in the checkpoint and resumes from it; the final reply is the evidence package', async () => {
  let clock = 0
  const ports: CampaignPorts = {
    deployment: async () => ({ mainCommit: 'c0ffee' }),
    analysis: async prompt => { clock += 45_000; return { status: 200, ok: true, reply: fullAnswer(prompt), source: 'cos-local-primary', correlationId: 'turn-' + clock, latencyMs: 45_000, servedCommit: 'c0ffee', model: 'owned', localModelInvoked: true, executionAllowed: false } },
  }
  let checkpoint: unknown = null
  const outcomes: string[] = []
  for (let slice = 0; slice < 15; slice++) {
    const start = clock
    const outcome = await runCampaignJobSlice({ checkpoint, workspaceId: 'ws-1', ports, remainingMs: () => 240_000 - (clock - start) })
    outcomes.push(outcome.status)
    if (outcome.status === 'paused') {
      checkpoint = outcome.checkpoint
      // The pause RPC persists only a checkpoint with version '1' and the job's workspaceId (Codex on #4973).
      assert.equal(outcome.checkpoint.version, '1')
      assert.equal(outcome.checkpoint.workspaceId, 'ws-1')
      assert.match(outcome.reply, /in progress: \d+ of 20 checks executed/)
      clock = start + 240_000
      continue
    }
    assert.equal(outcome.status, 'succeeded', 'no FAIL: blocked items make the campaign BLOCKED, not failed')
    assert.equal(outcome.outcome, 'BLOCKED')
    assert.match(outcome.reply, /PAC-01 — Eight-part forensic investigation\nStatus: PASS/)
    assert.match(outcome.reply, /PAC-13 — Playwright browser workflow\nStatus: BLOCKED/)
    assert.match(outcome.reply, /Final certification outcome: BLOCKED/)
    assert.equal((outcome.result as any).certification.passed, 8)
    break
  }
  assert.ok(outcomes.filter(o => o === 'paused').length >= 3, outcomes.join(','))
  assert.equal(outcomes.at(-1), 'succeeded')
  // A foreign or empty checkpoint starts a fresh ledger.
  assert.equal(campaignStateFromCheckpoint(null).ledger.rows.length, 0)
  assert.equal(campaignStateFromCheckpoint({ trace: [] }).ledger.rows.length, 0)
})

test('the job runner routes engine "campaign" to the campaign slice, checkpoints through the ordinary pause RPC, and never opens a workspace or repository', () => {
  const runner = read('lib/builder/job-runner.ts')
  assert.equal(CAMPAIGN_ENGINE, 'campaign')
  const start = runner.indexOf("job.metadata.builderEngine === CAMPAIGN_ENGINE")
  const end = runner.indexOf('// V2 is selected by durable job metadata for all surfaces.')
  assert.ok(start > 0 && end > start)
  const block = runner.slice(start, end)
  assert.match(block, /runCampaignJobSlice\(\{/)
  assert.match(block, /builderJobOverTotalDeadline\(job\.createdAt, Date\.now\(\), CAMPAIGN_TOTAL_DEADLINE_MS\)/)
  assert.ok(CAMPAIGN_TOTAL_DEADLINE_MS <= 24 * 240_000, 'inside the 24-slice continuation budget')
  assert.match(block, /createCampaignHostPorts\(\)/)
  assert.match(block, /const \{ data, error \} = await db\.rpc\('pause_builder_job_slice'/)
  assert.match(block, /if \(data !== true\) \{ await terminalFailure\(job, 'builder_campaign_checkpoint_refused'\); return \}/)
  assert.match(block, /finishBuilderJob\(\{/)
  assert.doesNotMatch(block, /createSupabaseBuilderWorkspace|publishIsolatedJobFiles|enqueueRepositoryRepair|BuilderV2Agent/)
  // The campaign runs before the V2 branch, so a campaign job never reaches the coding agent.
  assert.ok(start < runner.indexOf("job.metadata.builderEngine === 'v2'"))
})

test('the signed-in owner starts the campaign on either surface: by its identifier directly, or through the planner; nobody else can', async () => {
  const { namesVerificationCampaign, PAC_CAMPAIGN_ID } = await import('../lib/builder/campaign/catalog.ts')
  assert.equal(namesVerificationCampaign('# iTMounts / COS — Production Acceptance Campaign\n\n**Campaign ID:** COS-PAC-001'), true)
  assert.equal(namesVerificationCampaign(`run ${PAC_CAMPAIGN_ID} now`), true)
  assert.equal(namesVerificationCampaign('COS-PAC-0010 is something else'), false)
  assert.equal(namesVerificationCampaign('Investigate why the payment service returned 5xx errors'), false)
  const decision = read('lib/ai/cos/cosAgentDecision.ts')
  assert.match(decision, /'verification_campaign',/)
  assert.match(decision, /verification_campaign: 'Run the production acceptance campaign/)
  // The public Concierge catalog stays the fixed public-safe list; the owner reaches the campaign on that surface by identifier.
  assert.match(decision, /input\.surface === 'concierge'\n\s+\? \['live_web', 'compute', 'software_specialist'\]/)
  const route = read('app/api/cos-browser/route.ts')
  // Direct admission by identifier comes right after the owner's identity is known, before any router or planner.
  const direct = route.indexOf("if (authenticatedOwner && access?.userId && namesVerificationCampaign(prompt))")
  assert.ok(direct > 0)
  assert.ok(direct < route.indexOf('const fastAuthoringIngress'))
  assert.ok(direct < route.indexOf('agentDecision = await decideCosAgentTurn('))
  assert.match(route, /agentDecision\.capabilities\.includes\('verification_campaign'\) && authenticatedOwner && access\?\.userId\)/)
  assert.doesNotMatch(route, /verification_campaign'\) && authenticatedOwner && browserSurface === 'assistant'/)
  assert.match(route, /source: 'cos-verification-campaign'/)
  const starter = read('lib/builder/campaign/start.ts')
  assert.match(starter, /metadata: \{ builderEngine: CAMPAIGN_ENGINE, campaignId: PAC_CAMPAIGN_ID/)
  assert.match(starter, /ownerAuthorized: true/)
  assert.match(starter, /jobKind: 'standard'/)
})

test('the host ports execute against the live production path and read facts back; unprovided ports stay absent', async () => {
  const host = await import('../lib/builder/campaign/hostPorts.ts')
  const calls: { url: string; init: any }[] = []
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith('/api/cos-browser')) {
      return new Response(JSON.stringify({ reply: fullAnswer(PAC_01_PROMPT), source: 'cos-local-primary', local_model_invoked: true, execution_allowed: false, execution_provenance: { turnId: '11111111-1111-4111-8111-111111111111', local_reasoning: { model: 'owned-model' } } }), { status: 200, headers: { 'content-type': 'application/json', 'x-itmounts-revision': 'deadbeef' } })
    }
    if (/\/commits\/main$/.test(String(url))) return new Response(JSON.stringify({ sha: 'deadbeef' }), { status: 200 })
    if (/check-runs/.test(String(url))) return new Response(JSON.stringify({ check_runs: [{ name: 'SaaS CI', status: 'completed', conclusion: 'success' }, { name: 'Playwright', status: 'completed', conclusion: 'success' }] }), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const outcome = await host.productionAnalysis(PAC_01_PROMPT, undefined, fetchImpl)
  assert.equal(outcome.status, 200)
  assert.equal(outcome.ok, true)
  assert.equal(outcome.correlationId, '11111111-1111-4111-8111-111111111111')
  assert.equal(outcome.model, 'owned-model')
  assert.equal(outcome.servedCommit, 'deadbeef', 'the revision comes from the live site\'s own response header')
  assert.equal(host.SERVING_REVISION_HEADER, 'x-itmounts-revision')
  assert.match(read('app/api/cos-browser/route.ts'), /const SERVING_REVISION_HEADER = 'x-itmounts-revision'/)
  assert.match(read('app/api/cos-browser/route.ts'), /return withServingRevision\(await postBrowserTurn\(req\)\)/)
  assert.match(calls[0].url, /^https:\/\/itmounts\.com\/api\/cos-browser$/)
  assert.equal(JSON.parse(calls[0].init.body).messages[0].content, PAC_01_PROMPT, 'the prompt is sent unmodified')
  const routing = await host.productionRouting(PAC_01_PROMPT, undefined, fetchImpl)
  assert.equal(routing.enteredBuilder, false)
  const builderFetch = (async () => new Response(JSON.stringify({ jobId: 'abc', reply: 'running', source: 'cos-builder' }), { status: 202 })) as typeof fetch
  assert.equal((await host.productionRouting(PAC_01_PROMPT, undefined, builderFetch)).enteredBuilder, true)
  process.env.GITHUB_TOKEN = 'test-token'
  process.env.VERCEL_GIT_COMMIT_SHA = 'preview-worker-sha'
  assert.deepEqual(await host.deploymentFacts(fetchImpl), { mainCommit: 'deadbeef' }, 'the worker\'s own environment is never the production commit')
  const release = await host.releaseChecks('deadbeef', undefined, fetchImpl)
  assert.equal(release.verdict, 'PASS')
  const failing = (async () => new Response(JSON.stringify({ check_runs: [{ name: 'Unit tests', status: 'completed', conclusion: 'failure' }] }), { status: 200 })) as typeof fetch
  assert.equal((await host.releaseChecks('deadbeef', undefined, failing)).verdict, 'FAIL')
  const none = (async () => new Response(JSON.stringify({ check_runs: [] }), { status: 200 })) as typeof fetch
  assert.equal((await host.releaseChecks('deadbeef', undefined, none)).verdict, 'FAIL', 'no checks is not green')
  const timedOut = (async () => { throw new Error('network down') }) as typeof fetch
  const failedRequest = await host.productionAnalysis(PAC_01_PROMPT, undefined, timedOut)
  assert.equal(failedRequest.status, null)
  assert.equal(failedRequest.ok, false)
  const ports = host.createCampaignHostPorts()
  assert.equal(ports.browser, undefined)
  assert.equal(ports.governance, undefined)
  assert.equal(ports.builderFixture, undefined)
  assert.ok(ports.analysis && ports.routing && ports.release && ports.observability && ports.fault)
  assert.equal(PAC_CATALOG.filter(item => ['browser', 'governance', 'builder_fixture'].includes(item.port)).length, 5, 'five items stay BLOCKED until their host ports exist')
})

