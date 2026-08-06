import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { compareCosDecisions, createCosSyncLog } from '../lib/cos-backup/index.ts'
import { detectPrimaryCorruption } from '../lib/cos-backup/policy.ts'
import { runCosReasoning } from '../lib/ai/cos/reasoningCore.ts'
import { buildBoundedResearchPartial, planResearchTask } from '../lib/ai/cos/researchBudget.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

const backup = {
  ok: true,
  answer: 'This is a complete read-only Backup COS continuity answer that cannot execute tools or actions.',
  intent: 'general_assistance',
  requiresApproval: false,
  proposedTool: null,
  confidence: 80,
  brainDigest: 'abc',
}

test('Backup COS is advisory-only and flags material divergence', () => {
  const result = compareCosDecisions({
    normalizedInput: 'prepare a social campaign',
    approvedBrain: 'approved brain',
    primary: { intent: 'campaign', proposedTool: 'campaign.create', requiresApproval: true, confidence: 90, summary: 'Create governed draft' },
    backup: { intent: 'press', proposedTool: 'press.create', requiresApproval: false, confidence: 40, summary: 'Create press item' },
  })

  assert.equal(result.advisoryOnly, true)
  assert.equal(result.executionAllowed, false)
  assert.equal(result.diverged, true)
  assert.equal(result.supervisorFlagRequired, true)
  assert.deepEqual(result.divergenceReasons, ['intent_mismatch', 'tool_mismatch', 'approval_mismatch', 'confidence_gap'])
})

test('sync log uses the required stable schema', () => {
  assert.deepEqual(createCosSyncLog('abc123', true), {
    ok: true,
    sourceCommit: 'abc123',
    synced: true,
    message: 'Update applied',
  })
  assert.deepEqual(createCosSyncLog('bad123', false), {
    ok: false,
    sourceCommit: 'bad123',
    synced: false,
    message: 'Rejected - invalid commit',
  })
})

test('continuity policy detects the Primary error-degraded 200 response', () => {
  assert.deepEqual(detectPrimaryCorruption({
    status: 200,
    reply: 'I hit a snag handling that and could not finish.',
    source: 'error-degraded',
  }), ['primary_degraded_response'])
})

test('continuity policy quarantines HTTP, empty, and canned failures', () => {
  assert.deepEqual(
    detectPrimaryCorruption({ status: 500, reply: '', source: '' }),
    ['primary_http_failure', 'primary_empty_reply'],
  )
  const reasons = detectPrimaryCorruption({
    status: 200,
    reply: 'Concierge created the Press & Print campaign with a verified publisher target.',
    source: 'anthropic-chief',
  })
  assert.equal(reasons.some((reason) => reason.startsWith('canned_response:')), true)
})

test('continuity policy preserves Primary 4xx authorization and validation responses', () => {
  assert.deepEqual(detectPrimaryCorruption({ status: 401, reply: '', source: '' }), [])
  assert.deepEqual(detectPrimaryCorruption({ status: 403, reply: '', source: '' }), [])
  assert.deepEqual(detectPrimaryCorruption({ status: 429, reply: '', source: 'error-degraded' }), [])
})

test('continuity policy flags material short-answer shadow divergence', () => {
  assert.deepEqual(detectPrimaryCorruption({
    status: 200,
    reply: 'Okay.',
    source: 'anthropic-chief',
    backup,
  }), ['primary_backup_quality_divergence'])
})

test('the full buyer-research brief routes to the live web and remains read-only', () => {
  const result = runCosReasoning({
    objective: `Find 20 strong potential buyers, starting in the United States.
Prioritize cloud-focused MSPs that serve multiple business customers and provide monitoring, incident response, DevOps, SRE, or cloud operations.
For each company provide the best person or job title to contact, a LinkedIn profile when available, and a qualification score.
Do not contact anyone, send messages, submit forms, or share product files. Only produce the researched prospect list for my review.`,
  })
  assert.equal(result.sourceRouting.requiredSource, 'live_public_website')
  assert.equal(result.sourceRouting.mustUseTool, true)
  assert.equal(result.executionPlan.proposesAction, false)
  assert.equal(result.executionPlan.requiredApproval, false)
  assert.equal(result.executionPlan.state, 'RETRIEVE_AND_ANSWER')
})

test('an affirmative contact request still requires approval', () => {
  const result = runCosReasoning({ objective: 'Contact the strongest prospects and send them an outreach message.' })
  assert.equal(result.executionPlan.proposesAction, true)
  assert.equal(result.executionPlan.requiredApproval, true)
  assert.equal(result.executionPlan.state, 'PREPARE_AND_HOLD')
})

test('bounded research planning recognizes sequential research and drafting deliverables', () => {
  const plan = planResearchTask('Find 4 potential buyers with public contact details, then draft an outreach email. Do not contact anyone or send anything.')
  assert.deepEqual(plan, {
    requestedTotal: 4,
    researchQuery: 'Find 4 potential buyers with public contact details,',
    hasDraftDeliverable: true,
  })
})

test('bounded research returns the completed verified subset and a continuation prompt', () => {
  const plan = planResearchTask('Find 4 potential buyers, then draft an outreach email. Do not contact anyone or send anything.')
  assert.ok(plan)

  const partial = buildBoundedResearchPartial(plan, [
    { title: 'Alpha Cloud', url: 'https://alpha.example.com', snippet: 'Managed cloud and incident response provider.' },
    { title: 'Beta SRE', url: 'https://beta.example.com', snippet: 'SRE consultancy serving multiple businesses.' },
    { title: 'Duplicate Alpha', url: 'https://alpha.example.com', snippet: 'Duplicate source must not inflate completion.' },
  ], 'en')

  assert.equal(partial.completed, 2)
  assert.equal(partial.total, 4)
  assert.equal(partial.remaining, 2)
  assert.equal(partial.researchState, 'partial')
  assert.equal(partial.draftState, 'pending')
  assert.equal(partial.continuationAvailable, true)
  assert.match(partial.reply, /2 of 4 completed; 2 remain/)
  assert.match(partial.reply, /Alpha Cloud/)
  assert.match(partial.reply, /Beta SRE/)
  assert.match(partial.reply, /Outreach draft: not started/)
  assert.match(partial.continuationPrompt || '', /research 2 additional companies to reach 4/)
})

test('bounded research partials cannot authorize or claim external action', () => {
  const plan = planResearchTask('Find 2 potential buyers and draft an outreach email. Do not contact anyone, send email, or submit forms.')
  assert.ok(plan)
  const partial = buildBoundedResearchPartial(plan, [
    { title: 'Gamma Ops', url: 'https://gamma.example.com', snippet: 'Cloud operations company.' },
  ], 'en')

  assert.equal(partial.executionAllowed, false)
  assert.equal(partial.externalActionTaken, false)
  assert.match(partial.reply, /No one was contacted\. No email was sent\. No form was submitted/)
  assert.match(partial.continuationPrompt || '', /Do not contact anyone, send email, submit forms, or take any external action/)
})

test('Concierge preserves Primary denials and returns healthy Primary without waiting for Backup COS', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /POST as supportPost/)
  assert.match(source, /supportPost\(new NextRequest\(req\.clone\(\)\)\)/)
  assert.match(source, /researchLifeline\?\.cancel\(\)/)
  assert.match(source, /primary\.status >= 400 && primary\.status < 500\) return primary/)
  assert.match(source, /if \(primary && immediateReasons\.length === 0\)/)
  assert.match(source, /after\(async \(\) =>/)
  assert.match(source, /return healthyPrimary/)
  assert.doesNotMatch(source, /const backupPromise = runBackupCos/)
  assert.doesNotMatch(source, /Promise\.all\s*\(\s*\[\s*primaryPromise\s*,\s*backupPromise/)
})

test('Concierge queues owner multi-prospect campaigns before the long model transport', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /async function directProspectCampaign/)
  assert.match(source, /parseProspectCampaignRequest\(input, language\)/)
  assert.match(source, /if \(!access\?\.isOwner\) return null/)
  assert.match(source, /createProspectCampaignJob\(/)
  assert.match(source, /advanceProspectCampaigns\(\)/)
  assert.match(source, /source: 'cos-prospect-campaign-queued'/)
  assert.match(source, /const prospectCampaign = await directProspectCampaign\(body, input, language\)/)
  assert.match(source, /if \(prospectCampaign\) return prospectCampaign/)
})

test('Concierge bounds long Primary work and returns verified partial research', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /const PRIMARY_TIMEOUT_MS = 260_000/)
  assert.match(source, /const RESEARCH_LIFELINE_START_MS = 235_000/)
  assert.match(source, /function boundedPrimary/)
  assert.match(source, /function createResearchLifeline/)
  assert.match(source, /buildBoundedResearchPartial/)
  assert.match(source, /source: 'cos-bounded-research-partial'/)
  assert.match(source, /partial_completion: true/)
  assert.match(source, /completed_count: partial\.completed/)
  assert.match(source, /remaining_count: partial\.remaining/)
  assert.match(source, /continuation_prompt: partial\.continuationPrompt/)
  assert.match(source, /timed_out: true/)
  assert.match(source, /execution_allowed: partial\.executionAllowed/)
  assert.match(source, /external_action_taken: partial\.externalActionTaken/)
  const boundedFallbackStart = source.indexOf('planResearchTask(input)')
  const boundedFallbackEnd = source.indexOf(
    'researchLifeline?.cancel()',
    boundedFallbackStart,
  )
  assert.ok(boundedFallbackStart >= 0)
  assert.ok(boundedFallbackEnd > boundedFallbackStart)
  const boundedFallback = source.slice(boundedFallbackStart, boundedFallbackEnd)
  assert.doesNotMatch(
    boundedFallback,
    /createOutreachDraft|createCustomerDraft|sendMail|submitForm|proposeMarketingCampaign|createPressCampaign/,
  )
})

test('prospect evidence never substitutes affiliate counts for CRM or discovery', async () => {
  const bridge = await readFile(path.resolve(process.cwd(), 'lib/ai/cos/knowledgeBridge.ts'), 'utf8').then(hydrateLocalizedSource)
  const router = await readFile(path.resolve(process.cwd(), 'lib/ai/cos/sourceRouter.ts'), 'utf8').then(hydrateLocalizedSource)
  const search = await readFile(path.resolve(process.cwd(), 'lib/ai/tools/getExternalInfo.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(bridge, /case 'crm_or_leads':\s*return notWired/)
  assert.doesNotMatch(bridge, /getAffiliateCount/)
  assert.match(bridge, /INITIAL PROSPECT-DISCOVERY EVIDENCE/)
  assert.match(router, /PROSPECT_DISCOVERY_PATTERN/)
  assert.match(search, /const DEFAULT_RESULT_COUNT = 10/)
})

test('Concierge keeps Backup COS read-only and free of direct business effects', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /execution_allowed: false/)
  assert.match(source, /primary_quarantined: true/)
  assert.match(source, /recordCosRecovery/)
  assert.doesNotMatch(source, /createClient|\.from\(|\.insert\(|\.update\(|proposeCampaign|socialPlatformFrom|isPressCreationRequest/i)
})

test('Backup provider wait is bounded and policy remains directly importable', async () => {
  const runtimeSource = await readFile(path.resolve(process.cwd(), 'lib/cos-backup/runtime.ts'), 'utf8').then(hydrateLocalizedSource)
  const policySource = await readFile(path.resolve(process.cwd(), 'lib/cos-backup/policy.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(runtimeSource, /withDeadline/)
  assert.match(runtimeSource, /COS_BACKUP_TIMEOUT_MS/)
  assert.doesNotMatch(policySource, /@\/|next\/server|supabase|callModel/)
})

test('approved brain is traced into Concierge and runtime fails closed without it', async () => {
  const [config, runtimeSource] = await Promise.all([
    readFile(path.resolve(process.cwd(), 'next.config.mjs'), 'utf8').then(hydrateLocalizedSource),
    readFile(path.resolve(process.cwd(), 'lib/cos-backup/runtime.ts'), 'utf8').then(hydrateLocalizedSource),
  ])
  assert.match(config, /outputFileTracingRoot/)
  assert.match(config, /['"]\/api\/concierge['"]/)
  assert.match(config, /\.\.\/cos-core\/brain\.md/)
  assert.match(runtimeSource, /Approved COS brain snapshot is unavailable/)
  assert.doesNotMatch(runtimeSource, /FALLBACK_BRAIN/)
})
