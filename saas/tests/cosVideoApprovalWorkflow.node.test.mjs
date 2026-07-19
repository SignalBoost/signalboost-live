import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function between(value, start, end) {
  const startIndex = value.indexOf(start)
  const endIndex = value.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`)
  return value.slice(startIndex, endIndex)
}

test('existing notifier remains the single approval-email sender and deduplicates by approvalRequestedAt', async () => {
  const notifier = await source('../app/api/cos/video-approval-notify/route.ts')
  assert.equal((notifier.match(/sendEmail\s*\(/g) || []).length, 1)
  assert.match(notifier, /if \(video\?\.approvalRequestedAt\) return false/)
  assert.match(notifier, /approvalRequestedAt: new Date\(\)\.toISOString\(\)/)
  assert.match(notifier, /'approve'/)
  assert.match(notifier, /'hold'/)
  assert.match(notifier, /'changes'/)
})

test('email actions approve the same campaign while hold and edits never publish', async () => {
  const actions = await source('../app/api/cos/campaign-queue/email-action/route.ts')
  const approve = between(actions, 'async function approveCampaign', 'async function holdCampaign')
  const hold = between(actions, 'async function holdCampaign', 'function changesForm')
  const changes = between(actions, 'async function saveChanges', 'export async function GET')

  assert.match(approve, /status: 'approved'/)
  assert.match(approve, /\.eq\('id', campaign\.id\)/)
  assert.match(approve, /autoPublishApprovedCampaign/)
  assert.match(hold, /status: 'waiting_approval'/)
  assert.doesNotMatch(hold, /autoPublishApprovedCampaign/)
  assert.match(changes, /status: 'waiting_approval'/)
  assert.match(changes, /changes_requested/)
  assert.doesNotMatch(changes, /autoPublishApprovedCampaign/)
})

test('publishing remains owner-gated and the real live URL is stored and emailed', async () => {
  const publishCore = await source('../lib/cos/campaign-queue/publish-core.ts')
  assert.match(publishCore, /Boolean\(campaign\.approved_at\) && Boolean\(campaign\.approved_by\)/)
  assert.match(publishCore, /Campaign must be approved by the owner before publishing/)
  assert.match(publishCore, /result\.liveUrl/)
  assert.match(publishCore, /\[publishedKey\]: \{ result, publishedAt/)
  assert.match(publishCore, /<a href="\$\{result\.liveUrl\}">\$\{result\.liveUrl\}<\/a>/)
})

test('the scheduled exact-publish route invokes the existing notifier before publishing', async () => {
  const cron = await source('../app/api/cron/cos-auto-publish-exact/route.ts')
  assert.match(cron, /GET as notifyFinalVideoApprovals/)
  assert.match(cron, /const approvalEmail = await approvalEmailSummary\(req\)/)
  assert.match(cron, /String\(campaign\.status\) !== 'approved'/)
  assert.match(cron, /!campaign\.approved_at \|\| !campaign\.approved_by/)
})
