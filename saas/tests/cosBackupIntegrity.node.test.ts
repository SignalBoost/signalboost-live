import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { compareCosDecisions, createCosSyncLog } from '../lib/cos-backup/index.ts'

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

test('Concierge remains the exact canonical thin alias', async () => {
  const source = await readFile(path.resolve(process.cwd(), 'app/api/concierge/route.ts'), 'utf8')
  assert.equal(source.trim(), [
    "import { NextRequest } from 'next/server'",
    "import { POST as supportPost } from '@/app/api/support/route'",
    '',
    'export async function POST(req: NextRequest) {',
    '  return supportPost(req)',
    '}',
  ].join('\n'))
})
