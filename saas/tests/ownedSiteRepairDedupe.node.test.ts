// saas/tests/ownedSiteRepairDedupe.node.test.ts
//
// 2026-09-27: 35 queued website-optimizer repairs for the SAME findings piled up because the "already active?" check
// matched the remediation key including the deployed revision, and every merge to main changes the revision.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  OWNED_SITE_REPAIR_RETRY_SUPPRESSION_MS,
  OWNED_SITE_REPAIR_RUNNING_STALE_MS,
  ownedSiteRepairBlocker,
  ownedSiteRepairScope,
} from '../self-healing-host/owned-site-repair-dedupe.ts'

const now = Date.parse('2026-09-27T21:20:00Z')
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
const OLD_REV = 'a'.repeat(40)
const NEW_REV = 'b'.repeat(40)
const key = (rev: string, codes = 'many_scripts,missing_csp') => `${rev}:website-optimizer:${codes}`
const row = (id: string, status: string, k: string, createdAgo: number, updatedAgo = createdAgo) => ({
  id, status, created_at: iso(createdAgo), updated_at: iso(updatedAgo),
  metadata: { selfHealingOwnedSite: true, selfHealingSource: 'website-optimizer', selfHealingKey: k },
})

test('the scope drops only the revision prefix', () => {
  assert.equal(ownedSiteRepairScope(key(OLD_REV)), 'website-optimizer:many_scripts,missing_csp')
  assert.equal(ownedSiteRepairScope(key(OLD_REV)), ownedSiteRepairScope(key(NEW_REV)))
  assert.notEqual(ownedSiteRepairScope(key(OLD_REV)), ownedSiteRepairScope(key(OLD_REV, 'missing_csp')))
})

test('a queued repair from an older deploy blocks a duplicate for the same findings', () => {
  const blocker = ownedSiteRepairBlocker({ rows: [row('job-old', 'queued', key(OLD_REV), 60 * 60_000)], key: key(NEW_REV), nowMs: now })
  assert.deepEqual(blocker, { disposition: 'already_active', jobId: 'job-old' })
})

test('paused and freshly running repairs block; a dead running claim does not', () => {
  assert.equal(ownedSiteRepairBlocker({ rows: [row('p', 'paused', key(OLD_REV), 3_600_000)], key: key(NEW_REV), nowMs: now })?.jobId, 'p')
  assert.equal(ownedSiteRepairBlocker({ rows: [row('r', 'running', key(OLD_REV), 3_600_000, 60_000)], key: key(NEW_REV), nowMs: now })?.jobId, 'r')
  // Production had a `running` owned-site row from 2026-09-20: it must never block repairs forever.
  const dead = row('dead', 'running', key(OLD_REV), 7 * 86_400_000, OWNED_SITE_REPAIR_RUNNING_STALE_MS + 1)
  assert.equal(ownedSiteRepairBlocker({ rows: [dead], key: key(NEW_REV), nowMs: now }), null)
})

test('different findings are a different repair', () => {
  const rows = [row('other', 'queued', key(OLD_REV, 'missing_nosniff'), 60_000)]
  assert.equal(ownedSiteRepairBlocker({ rows, key: key(NEW_REV), nowMs: now }), null)
})

test('a success within the suppression window counts across revisions; failures and old successes do not', () => {
  const recent = row('ok', 'succeeded', key(OLD_REV), OWNED_SITE_REPAIR_RETRY_SUPPRESSION_MS - 60_000)
  assert.deepEqual(ownedSiteRepairBlocker({ rows: [recent], key: key(NEW_REV), nowMs: now }), { disposition: 'recently_attempted', jobId: 'ok' })
  const stale = row('old-ok', 'succeeded', key(OLD_REV), OWNED_SITE_REPAIR_RETRY_SUPPRESSION_MS + 60_000)
  const failed = row('bad', 'failed', key(OLD_REV), 60_000)
  assert.equal(ownedSiteRepairBlocker({ rows: [stale, failed], key: key(NEW_REV), nowMs: now }), null)
})

test('the newest active match is reported and active wins over recently succeeded', () => {
  const rows = [
    row('ok', 'succeeded', key(OLD_REV), 60_000),
    row('q-old', 'queued', key(OLD_REV), 10 * 3_600_000),
    row('q-new', 'queued', key(OLD_REV), 5 * 60_000),
  ]
  assert.deepEqual(ownedSiteRepairBlocker({ rows, key: key(NEW_REV), nowMs: now }), { disposition: 'already_active', jobId: 'q-new' })
})

test('the enqueuer dedupes by source and scope, not by the exact revision key', () => {
  const source = readFileSync(new URL('../self-healing-host/owned-site-autonomous-repair.ts', import.meta.url), 'utf8')
  assert.match(source, /ownedSiteRepairBlocker\(/)
  assert.match(source, /contains\('metadata', \{ selfHealingOwnedSite: true, selfHealingSource: kind \}\)/)
  assert.doesNotMatch(source, /contains\('metadata', \{ selfHealingOwnedSite: true, selfHealingKey: key \}\)/)
  assert.match(source, /findExistingAttempt\(key, kind\)/)
})
