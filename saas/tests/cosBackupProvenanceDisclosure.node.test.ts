// saas/tests/cosBackupProvenanceDisclosure.node.test.ts
//
// Incident (2026-08-23): a turn served by the read-only Backup COS — primary quarantined by
// continuity policy — was rendered by the provenance report as ORDINARY telemetry. It showed
// "Local Reasoning Engine : INVOKED", every retrieval layer as "NOT USED", and
// "COS Confidence : 1.00 — threshold 0.00". Nothing said backup, nothing said quarantined.
//
// Read plainly, that describes a maximally confident healthy answer that happened to need no
// retrieval. It was the opposite: a degraded-mode answer with no memory, no corpus, no learning,
// and a flat default confidence that was never gated. The "threshold 0.00" was invented by the
// formatter — the backup record's threshold is null, and rendering null as 0.00 implied a gate had
// been evaluated and cleared.
//
// Backup turns began persisting earlier the same night, which is what made this visible at all;
// before that they left no record to render. Source-text assertions because
// cosOrchestrationLive.ts imports through '@/' aliases that bare `node --test` cannot resolve.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const LIVE = readFileSync(new URL('../lib/ai/cos/cosOrchestrationLive.ts', import.meta.url), 'utf8')

test('continuity mode is declared before anything else in the report', () => {
  const header = LIVE.slice(LIVE.indexOf("'Answer Origin',"), LIVE.indexOf('if(origin?.from_cache)'))
  assert.match(header, /continuity_mode==='backup_read_only'/)
  assert.match(header, /Continuity Mode        : BACKUP \(read-only\)/)
  assert.match(header, /quarantined by continuity policy/)
})

test('the quarantine reason is surfaced, not just the fact of quarantine', () => {
  assert.match(LIVE, /Quarantine Reason      : \$\{reasons\.join\('; '\)\}/)
})

test('backup limitations are stated explicitly rather than implied by empty layers', () => {
  // Every layer reading NOT USED looks identical to a healthy answer that needed no retrieval.
  assert.match(LIVE, /no evidence retrieval, no memory or corpus access, and no learning/)
})

test('a backup confidence is never rendered as a calibrated score against a threshold', () => {
  assert.match(LIVE, /fixed backup default; no confidence gate was evaluated for this answer/)
  // The null threshold must not be coerced to 0.00 in backup mode.
  const confidenceBlock = LIVE.slice(LIVE.indexOf('const backupMode='), LIVE.indexOf('const backupMode=') + 900)
  assert.match(confidenceBlock, /if\(backupMode\)\{/)
})

test('ordinary answers keep the normal threshold rendering', () => {
  assert.match(LIVE, /COS Confidence         : \$\{Number\(provenance\.local_reasoning\.confidence\)\.toFixed\(2\)\} — threshold \$\{Number\(threshold\?\?0\)\.toFixed\(2\)\}\./)
})
