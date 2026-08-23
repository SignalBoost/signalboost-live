// saas/tests/cosBackupContinuityPersistence.node.test.ts
//
// Incident (2026-08-23), confirmed by querying the three most recent assistant_messages rows
// immediately after a Backup-served turn: the turn was ABSENT. Persistence lives inside
// /api/support, and the continuity failover path in /api/concierge bypasses it entirely — so any
// answer served by the read-only Backup COS left no record anywhere.
//
// Two user-visible failures came from that one gap, both reported in the same turn:
//   1. "Could not save feedback." — feedback resolves against a stored assistant row; none existed.
//   2. Asking "show me the complete provenance for the answer you just gave" returned "this is the
//      start of our conversation". That was accurate for what Backup received: runBackupCos takes a
//      single string and no conversation history, and no stored turn existed to look up either.
//
// The provenance written here must stay HONEST about Backup's nature — read-only, advisory-only,
// no evidence retrieval, no learning. It must never read like a Primary lineage record, because
// the introspection formatter presents stored provenance as authoritative server telemetry.
//
// Source-text assertions: app/api/concierge/route.ts uses '@/' path aliases that resolve only
// under tsc, not bare `node --test`. Pre-existing property of the file.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ROUTE = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
const BACKUP_BRANCH = ROUTE.slice(ROUTE.indexOf('if (recovered && backup)'), ROUTE.indexOf("source: 'cos-immutable-core-fallback'"))

test('a backup-served turn is persisted, so feedback and introspection have a record to resolve against', () => {
  assert.match(BACKUP_BRANCH, /recordLatestUserTurnProvenance\(backupUserId, backup\.answer, backupProvenance, 'backup-cos-continuity'\)/)
  assert.match(BACKUP_BRANCH, /persistTurn\(\{ conversationId: backupConversationId, userId: backupUserId/)
  assert.match(BACKUP_BRANCH, /attachRecordedTurnProvenance\(backupConversationId, backupUserId, backup\.answer, backupProvenance\)/)
})

test('persistence runs after the response, never blocking the reply the user is waiting on', () => {
  assert.match(BACKUP_BRANCH, /after\(async \(\) => \{/)
  assert.match(BACKUP_BRANCH, /Promise\.allSettled/)
})

test('the recorded provenance is honest that backup mode retrieves no evidence and learns nothing', () => {
  assert.match(BACKUP_BRANCH, /continuity_mode: 'backup_read_only'/)
  assert.match(BACKUP_BRANCH, /primary_quarantined: true/)
  for (const layer of ['enterprise_memory', 'learned_corpus', 'knowledge_graph', 'cognitive_skills', 'user_memory']) {
    assert.match(BACKUP_BRANCH, new RegExp(`${layer}: \\{ used: false`), `${layer} must be recorded as unused in backup mode`)
  }
  assert.match(BACKUP_BRANCH, /autonomous_research: \{ used: false, documents_acquired: 0, new_knowledge_retained: 0 \}/)
  assert.match(BACKUP_BRANCH, /status: 'not_available_in_backup_mode'/)
})

test('backup provenance records no primary threshold rather than inventing one', () => {
  assert.match(BACKUP_BRANCH, /threshold: null/)
  const formatter = readFileSync(new URL('../lib/ai/cos/cosOrchestration.ts', import.meta.url), 'utf8')
  assert.match(formatter, /Primary acceptance threshold N\/A in read-only continuity mode/)
  assert.match(formatter, /continuity_mode !== 'backup_read_only'/)
})

test('the escalation reason names quarantine explicitly rather than implying a normal answer', () => {
  assert.match(BACKUP_BRANCH, /escalation_reason_code: 'primary_quarantined_backup_continuity'/)
  assert.match(BACKUP_BRANCH, /quarantined by continuity policy/)
})

test('the response carries its provenance so the client is not left guessing what served it', () => {
  assert.match(BACKUP_BRANCH, /execution_provenance: backupProvenance/)
})

test('an unauthenticated backup turn is skipped rather than written against a null user', () => {
  assert.match(BACKUP_BRANCH, /if \(backupUserId\) \{/)
})
