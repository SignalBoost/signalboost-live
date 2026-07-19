import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { compareCosDecisions, createCosSyncLog } from '../lib/cos-backup/index.ts'
import { detectPrimaryCorruption } from '../lib/cos-backup/continuityPolicy.ts'

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

test('continuity detector quarantines known canned corruption', () => {
  const reasons = detectPrimaryCorruption({
    status: 200,
    reply: 'Concierge created the Press & Print campaign with a verified publisher target.',
    source: 'anthropic-chief',
  })
  assert.equal(reasons.some((reason) => reason.startsWith('canned_response:')), true)
})

test('continuity detector catches degraded HTTP 200 responses', () => {
  const reasons = detectPrimaryCorruption({
    status: 200,
    reply: 'I hit a snag handling that and could not finish.',
    source: 'error-degraded',
  })
  assert.deepEqual(reasons, ['primary_degraded_source:error-degraded'])
})

test('continuity detector catches unavailable Primary responses', () => {
  const reasons = detectPrimaryCorruption({ status: 500, reply: '', source: '' })
  assert.deepEqual(reasons, ['primary_http_failure', 'primary_empty_reply'])
})

test('continuity detector preserves Primary 4xx authorization and validation responses', () => {
  assert.deepEqual(detectPrimaryCorruption({ status: 401, reply: '', source: '' }), [])
  assert.deepEqual(detectPrimaryCorruption({ status: 403, reply: '', source: '' }), [])
  assert.deepEqual(detectPrimaryCorruption({ status: 429, reply: '', source: 'error-degraded' }), [])
})

test('continuity detector leaves healthy Primary responses alone', () => {
  const reasons = detectPrimaryCorruption({
    status: 200,
    reply: 'Here is the complete answer based on the current request.',
    source: 'anthropic-chief',
  })
  assert.deepEqual(reasons, [])
})

test('continuity policy stays dependency-free for direct Node tests', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'lib/cos-backup/continuityPolicy.ts'), 'utf8')
  assert.doesNotMatch(source, /from\s+['"]@\//)
  assert.doesNotMatch(source, /next\/server|supabase|callModel/)
})

test('Concierge preserves denials and does not block healthy responses on Backup COS', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8')
  assert.match(source, /POST as supportPost/)
  assert.match(source, /detectPrimaryCorruption/)
  assert.match(source, /primary\.status >= 400 && primary\.status < 500\) return primary/)
  assert.match(source, /if \(primary && reasons\.length === 0\) return primary/)
  assert.match(source, /const backup = await runBackupWithDeadline/)
  assert.match(source, /execution_allowed: false/)
  assert.doesNotMatch(source, /Promise\.all\(\[primaryPromise,\s*backupPromise/)
  assert.doesNotMatch(source, /createClient|\.from\(|\.insert\(|\.update\(|proposeCampaign|socialPlatformFrom|isPressCreationRequest/i)
})

test('approved brain is traced into the Concierge deployment and runtime fails closed without it', async () => {
  const [config, runtime] = await Promise.all([
    readFile(path.resolve(process.cwd(), 'next.config.mjs'), 'utf8'),
    readFile(path.resolve(process.cwd(), 'lib/cos-backup/runtime.ts'), 'utf8'),
  ])
  assert.match(config, /outputFileTracingRoot/)
  assert.match(config, /['"]\/api\/concierge['"]/)
  assert.match(config, /\.\.\/cos-core\/brain\.md/)
  assert.match(runtime, /Approved COS brain snapshot is unavailable/)
  assert.doesNotMatch(runtime, /FALLBACK_BRAIN/)
}
