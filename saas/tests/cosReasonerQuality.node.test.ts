import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessReasonerDraft,
  buildDiagnosticRepairPrompt,
  preferRepairedDraft,
  reasonerDraftNeedsRepair,
} from '../lib/ai/cos/reasonerQuality'

const PROMPT = 'A multi-tenant SaaS has normal DB CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants are unaffected, no deployment occurred, and traffic is unchanged. Diagnose and rank the most likely architectural causes without making production changes.'

const GENERIC = JSON.stringify({
  answer: [
    '1. Resource Contention from Enterprise Tenants: enterprise tenants may consume more resources than expected.',
    'Observable: check pg_stat_activity wait_event distribution and I/O waits. Falsify if there is no difference.',
    '2. Network Latency Issues: routing changes or congestion may affect enterprise traffic.',
    'Observable: use ping or traceroute. Falsify if latency is the same.',
    '3. Application-Level Bottlenecks: enterprise tenants may have more complex business logic.',
    'Observable: inspect logs and garbage collection pauses. Falsify if app metrics are the same.',
  ].join(' '),
  confidence: 0.9,
})

const MECHANISTIC = JSON.stringify({
  answer: [
    '1. Tenant-size query-plan flip. A statistics refresh can move the enterprise-sized row cardinality onto a sequential scan while small tenants remain on the old index plan, with no deploy required.',
    'Read-only discriminator: compare pg_stat_statements statement timing and captured plan hash or EXPLAIN from an existing replica/snapshot; falsify if the plan shape and statement latency distribution did not change for enterprise tenant IDs.',
    '2. Enterprise connection-pool starvation. A larger working set or longer transaction hold time can saturate only the pool/resource group assigned to enterprise traffic while global DB CPU stays normal.',
    'Read pool queue time plus pg_stat_activity wait_event and connection counts; falsify if enterprise pool wait is flat and no queue formed.',
    '3. Enterprise cache working-set eviction. A tenant-size threshold can push enterprise key prefixes past cache capacity and create repeated cache misses without changing total request volume.',
    'Read cache hit rate/eviction counters by tenant keyspace and API span breakdown; falsify if enterprise cache hit rate and backend span time are unchanged.',
  ].join(' '),
  confidence: 0.86,
})

test('the currently observed generic benchmark draft triggers one local repair', () => {
  const quality = assessReasonerDraft(PROMPT, GENERIC)
  assert.equal(quality.parseable, true)
  assert.equal(quality.diagnostic, true)
  assert.ok(quality.genericBuckets >= 2)
  assert.ok(quality.mechanisms < 3)
  assert.equal(reasonerDraftNeedsRepair(PROMPT, GENERIC), true)
})

test('a mechanism-level diagnostic does not trigger repair', () => {
  const quality = assessReasonerDraft(PROMPT, MECHANISTIC)
  assert.equal(quality.parseable, true)
  assert.ok(quality.mechanisms >= 3)
  assert.equal(reasonerDraftNeedsRepair(PROMPT, MECHANISTIC), false)
})

test('the deterministic selector prefers a materially better repaired draft', () => {
  assert.equal(preferRepairedDraft(PROMPT, GENERIC, MECHANISTIC), true)
  assert.equal(preferRepairedDraft(PROMPT, MECHANISTIC, GENERIC), false)
})

test('repair instruction explicitly preserves read-only diagnosis constraints', () => {
  const repairedPrompt = buildDiagnosticRepairPrompt(PROMPT, GENERIC)
  assert.match(repairedPrompt, /no production mutation/i)
  assert.match(repairedPrompt, /all asymmetries/i)
  assert.match(repairedPrompt, /falsify/i)
  assert.match(repairedPrompt, /first draft to replace/i)
})

test('non-diagnostic answers are never rewritten merely for style', () => {
  const simple = JSON.stringify({ answer: 'Your invoice is due on the 14th.', confidence: 0.95 })
  assert.equal(reasonerDraftNeedsRepair('When is my invoice due?', simple), false)
})
