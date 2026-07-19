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

test('video email endpoint sends only stored provider-confirmed publication locations', async () => {
  const notifier = await source('../app/api/cos/video-approval-notify/route.ts')

  assert.equal((notifier.match(/sendEmail\s*\(/g) || []).length, 1)
  assert.match(notifier, /provider-confirmed live URL/)
  assert.match(notifier, /campaign\?\.metadata\?\.published/)
  assert.match(notifier, /subject: `Published on \$\{label\}/)
  assert.match(notifier, /<p><strong>\$\{label\}<\/strong><\/p><p><a href=/)
  assert.match(notifier, /if \(!liveUrl \|\| \(entry as any\)\?\.notified === true\) continue/)
  assert.match(notifier, /notifyAttempts/)
  assert.doesNotMatch(notifier, /publishCampaignCore/)
  assert.doesNotMatch(notifier, /Final video ready for approval/)
  assert.doesNotMatch(notifier, /approvalRequestedAt/)
  assert.doesNotMatch(notifier, /actionLink|buttonLink|request edits|hold \/ not yet/i)
})

test('video studio distinguishes approval from real publishing and only retries location delivery', async () => {
  const page = await source('../app/dashboard/cosa/video-pipeline/page.tsx')

  assert.match(page, /fetch\('\/api\/cos\/video-approval-notify'/)
  assert.match(page, /PUBLISHED_STATUSES\.has\(status\)/)
  assert.match(page, /state: 'published'/)
  assert.match(page, /state: 'approved'/)
  assert.match(page, /APPROVED — PUBLISHING/)
  assert.match(page, /Approved, but publishing needs attention:/)
  assert.doesNotMatch(page, /if \(campaign\?\.approved_at\) return \{ state: 'approved', step: 3, note: 'Approved and published/)
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

test('publishing remains owner-gated and cannot succeed without a live location', async () => {
  const publishCore = await source('../lib/cos/campaign-queue/publish-core.ts')

  assert.match(publishCore, /Boolean\(campaign\.approved_at\) && Boolean\(campaign\.approved_by\)/)
  assert.match(publishCore, /Campaign must be approved by the owner before publishing/)
  assert.match(publishCore, /Provider did not return a confirmed live publication URL/)
  assert.match(publishCore, /\[publishedKey\]: \{/)
  assert.match(publishCore, /notified: false/)
  assert.doesNotMatch(publishCore, /sendEmail/)
  assert.doesNotMatch(publishCore, /Your video is live on/)
})

test('approved video recovery retries promptly and stays silent until publication', async () => {
  const cron = await source('../app/api/cron/cos-auto-publish-exact/route.ts')
  const vercel = await source('../vercel.json')

  assert.match(cron, /const RETRY_MINUTES = 10/)
  assert.match(cron, /process\.env\.OWNER_EMAILS/)
  assert.match(cron, /language === firstLanguage\(campaign\)/)
  assert.match(cron, /languageSpecificVideos\.length === 0/)
  assert.match(cron, /GET as notifyPublishedLocations/)
  assert.match(cron, /const publicationEmail = await publicationEmailSummary\(req\)/)
  assert.match(cron, /Provider did not return a confirmed live publication URL/)
  assert.doesNotMatch(cron, /sendEmail/)
  assert.doesNotMatch(cron, /COSA could not publish your approved video/)
  assert.doesNotMatch(cron, /approvalEmailSummary|notifyFinalVideoApprovals/)
  assert.match(vercel, /"path": "\/api\/cron\/cos-auto-publish-exact"[\s\S]*?"schedule": "\*\/10 \* \* \* \*"/)
})

test('compatibility cron wrapper cannot reintroduce approval emails', async () => {
  const wrapper = await source('../app/api/cron/cos-video-approval-email/route.ts')
  assert.match(wrapper, /provider-confirmed publication-location emails/)
  assert.match(wrapper, /No approval, progress, quota, or failure email/)
  assert.match(wrapper, /video-approval-notify\/route/)
})
