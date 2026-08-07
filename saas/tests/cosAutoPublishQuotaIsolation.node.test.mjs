import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const routePath = path.resolve('app/api/cron/cos-auto-publish-exact/route.ts')
const source = fs.readFileSync(routePath, 'utf8')

test('quota backoff remains campaign-specific', () => {
  assert.match(source, /if \(quotaRetryWindowActive\(campaign\)\) return false/)
  assert.doesNotMatch(source, /if \(activeQuotaBlock\)/)
  assert.doesNotMatch(source, /eligible:\s*0,[\s\S]*quotaBlockedUntil:\s*activeQuotaBlock/)
})

test('video generation code is not part of the publish retry route', () => {
  assert.doesNotMatch(source, /startSiteVideo|addVoiceToCampaignVideo|ffmpeg|brand-overlay-worker/)
})
