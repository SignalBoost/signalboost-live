#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const cwd = process.cwd()
const saasRoot = basename(cwd) === 'saas' && existsSync(join(cwd, 'package.json'))
  ? cwd
  : join(cwd, 'saas')

function readRequired(relativePath) {
  const absolutePath = join(saasRoot, relativePath)
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath}: required file is missing`)
    return ''
  }
  return readFileSync(absolutePath, 'utf8')
}

function requireMatch(source, relativePath, pattern, message) {
  if (!pattern.test(source)) failures.push(`${relativePath}: ${message}`)
}

function requireOrder(source, relativePath, beforePattern, afterPattern, message) {
  const before = source.search(beforePattern)
  const after = source.search(afterPattern)
  if (before === -1 || after === -1 || before > after) failures.push(`${relativePath}: ${message}`)
}

const failures = []

if (!existsSync(saasRoot)) {
  failures.push(`Unable to locate SaaS workspace at ${saasRoot}. Run from the repository root or saas/ workspace.`)
}

const approvalBindingPath = 'lib/cos/campaign-queue/approvalBinding.ts'
const queueRoutePath = 'app/api/cos/campaign-queue/route.ts'
const publishRoutePath = 'app/api/cos/campaign-queue/publish/route.ts'
const publishCorePath = 'lib/cos/campaign-queue/publish-core.ts'
const cronPublishPath = 'app/api/cron/cos-auto-publish/route.ts'
const approvalTestPath = 'tests/approvalBinding.node.test.ts'

const approvalBinding = readRequired(approvalBindingPath)
const queueRoute = readRequired(queueRoutePath)
const publishRoute = readRequired(publishRoutePath)
const publishCore = readRequired(publishCorePath)
const cronPublish = readRequired(cronPublishPath)
const approvalTest = readRequired(approvalTestPath)

requireMatch(approvalBinding, approvalBindingPath, /export\s+function\s+computeCampaignContentHash\s*\(/, 'must export computeCampaignContentHash for approval version binding')
requireMatch(approvalBinding, approvalBindingPath, /export\s+function\s+withApprovalBinding\s*\(/, 'must export withApprovalBinding for approval-time metadata binding')
requireMatch(approvalBinding, approvalBindingPath, /export\s+function\s+verifyApprovalBinding\s*\(/, 'must export verifyApprovalBinding for publish-time enforcement')
requireMatch(approvalBinding, approvalBindingPath, /createHash\(['"]sha256['"]\)/, 'must use a stable SHA-256 content hash')
requireMatch(approvalBinding, approvalBindingPath, /metadata\?\.approval\?\.contentHash|metadata\.approval\.contentHash/, 'must read the stored approval content hash')
requireMatch(approvalBinding, approvalBindingPath, /changed after approval/i, 'must reject content that changes after approval')
requireMatch(approvalBinding, approvalBindingPath, /no approval binding/i, 'must reject campaigns without an approval binding')

requireMatch(queueRoute, queueRoutePath, /withApprovalBinding/, 'approval route must write an approval binding when a campaign is approved')
requireMatch(queueRoute, queueRoutePath, /computeCampaignContentHash/, 'approval route must compute the approved content hash')
requireMatch(queueRoute, queueRoutePath, /status\s*===\s*['"]approved['"]/, 'approval route must have an explicit approved-status branch')
requireMatch(queueRoute, queueRoutePath, /patch\.approved_by\s*=\s*ctx\.user\.id/, 'approval route must stamp the approving owner/admin user')
requireMatch(queueRoute, queueRoutePath, /patch\.approved_at\s*=\s*new Date\(\)\.toISOString\(\)/, 'approval route must stamp approval time')
requireMatch(queueRoute, queueRoutePath, /branded\s*!==\s*true|branded\s*===\s*true/, 'video approval must require branded preview state')
requireMatch(queueRoute, queueRoutePath, /voicedUrl/, 'video approval must require a final preview URL')
requireOrder(queueRoute, queueRoutePath, /computeCampaignContentHash\(/, /withApprovalBinding\(/, 'must compute the content hash before storing the approval binding')

requireMatch(publishRoute, publishRoutePath, /Boolean\(campaign\.approved_at\)\s*&&\s*Boolean\(campaign\.approved_by\)/, 'manual publish route must require owner approval fields')
requireMatch(publishRoute, publishRoutePath, /\[['"]approved['"],\s*['"]queued['"],\s*['"]running['"]\]\.includes\(String\(campaign\.status\)\)/, 'manual publish route must restrict publishing to the approved lifecycle band')
requireMatch(publishRoute, publishRoutePath, /if\s*\(\s*!ownerApproved\s*\|\|\s*!publishableStatus\s*\)/, 'manual publish route must refuse campaigns outside the owner-approved lifecycle band')
requireMatch(publishRoute, publishRoutePath, /verifyApprovalBinding\(campaign\)/, 'manual publish route must verify approval binding before publishing')
requireOrder(publishRoute, publishRoutePath, /verifyApprovalBinding\(campaign\)/, /publishSocialPost\(/, 'manual publish route must verify approval binding before calling social publishing')
requireMatch(publishRoute, publishRoutePath, /branded\s*!==\s*true/, 'manual video publish must block unbranded video')
requireMatch(publishRoute, publishRoutePath, /resolveFinalVideoForLanguage\(campaign, language\)/, 'manual video publish must resolve the exact final video for the requested language')

requireMatch(publishCore, publishCorePath, /Boolean\(campaign\.approved_at\)\s*&&\s*Boolean\(campaign\.approved_by\)/, 'auto-publish core must require owner approval fields')
requireMatch(publishCore, publishCorePath, /verifyApprovalBinding\(campaign\)/, 'auto-publish core must verify approval binding before publishing')
requireOrder(publishCore, publishCorePath, /verifyApprovalBinding\(campaign\)/, /publishSocialPost\(/, 'auto-publish core must verify approval binding before calling social publishing')
requireMatch(publishCore, publishCorePath, /branded\s*!==\s*true/, 'auto-publish core must block unbranded video unless explicitly overridden')

requireMatch(cronPublish, cronPublishPath, /approved_by/, 'cron publisher must require an approving owner/admin user')
requireMatch(cronPublish, cronPublishPath, /approved_at/, 'cron publisher must require an approval timestamp')
requireMatch(cronPublish, cronPublishPath, /verifyApprovalBinding\(campaign\)/, 'cron publisher must verify approval binding before publishing')
requireOrder(cronPublish, cronPublishPath, /verifyApprovalBinding\(campaign\)/, /publishSocialPost\(/, 'cron publisher must verify approval binding before calling social publishing')

requireMatch(approvalTest, approvalTestPath, /changed after approval/i, 'approval binding tests must cover post-approval content edits')
requireMatch(approvalTest, approvalTestPath, /no approval binding/i, 'approval binding tests must cover missing approval binding')
requireMatch(approvalTest, approvalTestPath, /volatile production bookkeeping/i, 'approval binding tests must preserve legitimate pipeline bookkeeping')

if (failures.length) {
  console.error('Enterprise approval guard failed:\n' + failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log('Enterprise approval guard passed')
