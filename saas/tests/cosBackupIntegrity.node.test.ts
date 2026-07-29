import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { compareCosDecisions, createCosSyncLog } from '../lib/cos-backup/index.ts'
import { detectPrimaryCorruption } from '../lib/cos-backup/policy.ts'
import { runCosReasoning } from '../lib/ai/cos/reasoningCore.ts'
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

test('Concierge preserves Primary denials and returns healthy Primary without waiting for Backup COS', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /POST as supportPost/)
  assert.match(source, /supportPost\(new NextRequest\(req\.clone\(\)\)\)/)
  assert.match(source, /primary\.status >= 400 && primary\.status < 500\) return primary/)
  assert.match(source, /if \(primary && immediateReasons\.length === 0\)/)
  assert.match(source, /after\(async \(\) =>/)
  assert.match(source, /return healthyPrimary/)
  assert.doesNotMatch(source, /const backupPromise = runBackupCos/)
  assert.doesNotMatch(source, /Promise\.all\s*\(\s*\[\s*primaryPromise\s*,\s*backupPromise/)
})

test('Concierge bounds long Primary work and returns a terminal timeout response', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /const PRIMARY_TIMEOUT_MS = 195_000/)
  assert.match(source, /function boundedPrimary/)
  assert.match(source, /source: 'cos-bounded-timeout'/)
  assert.match(source, /timed_out: true/)
  assert.match(source, /execution_allowed: false/)
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
