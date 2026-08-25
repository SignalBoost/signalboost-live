import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessReasonerDraft,
  buildDiagnosticRepairPrompt,
  preferRepairedDraft,
  promptEchoNonAnswer,
  reasonerDraftNeedsRepair,
} from '../lib/ai/cos/reasonerQuality.ts'

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

const H100_PROMPT = 'An LLM pretraining job running across 512 H100s needs to be migrated from US-East to EU-North to take advantage of zero-marginal-cost hydro curtailment. Calculate the break-even data egress and network checkpoint synchronization overhead versus power cost savings ($0.11/kWh vs $0.03/kWh), and define the exact state-checkpoint consistency protocol needed to prevent gradient loss.'

const H100_ECHO = JSON.stringify({
  answer: 'The break-even data egress and network checkpoint synchronization overhead versus power cost savings ($0.11/kWh vs $0.03/kWh), and define the exact state-checkpoint consistency protocol needed to prevent gradient loss.',
  confidence: 0,
})

const H100_SUBSTANTIVE = JSON.stringify({
  answer: [
    'The energy-price delta is $0.08/kWh. Let P be the average electrical draw per H100 in kW and T the post-migration runtime in hours; GPU-only power savings are 512 × P × T × $0.08.',
    'If egress is priced at E dollars per GB and D GB must cross regions, the migration breaks even on egress when D × E <= 512 × P × T × 0.08. A numeric D cannot be determined until P, T, and E are supplied.',
    'For checkpoint transfer, let C be checkpoint bytes and B effective bytes/s; one copy costs C/B seconds plus barrier and verification time. Compare that pause and any repeated synchronization cost with the remaining training wall-clock savings.',
    'Use optimizer-step-boundary checkpoints only: finish backward and all-reduce, finish the optimizer update, quiesce async writes, barrier all ranks, persist model weights, optimizer state, scheduler/scaler state, RNG states, global step and data-loader/shard cursor, hash every shard, atomically publish a manifest only after all shards validate, then resume from global_step + 1. Never publish a partial manifest.',
  ].join(' '),
  confidence: 0.88,
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
})

test('non-diagnostic answers are never rewritten merely for style', () => {
  const simple = JSON.stringify({ answer: 'Your invoice is due on the 14th.', confidence: 0.95 })
  assert.equal(reasonerDraftNeedsRepair('When is my invoice due?', simple), false)
})

test('the exact H100 production failure is rejected as a prompt-echo non-answer', () => {
  assert.equal(promptEchoNonAnswer(H100_PROMPT, H100_ECHO), true)
  assert.equal(reasonerDraftNeedsRepair(H100_PROMPT, H100_ECHO), true)
  assert.equal(promptEchoNonAnswer(H100_PROMPT, H100_SUBSTANTIVE), false)
  assert.equal(preferRepairedDraft(H100_PROMPT, H100_ECHO, H100_SUBSTANTIVE), true)
})

test('quantitative echo repair requires formulas, missing inputs, and completion of the protocol', () => {
  const repair = buildDiagnosticRepairPrompt(H100_PROMPT, H100_ECHO)
  assert.match(repair, /restated or paraphrased the request instead of answering it/i)
  assert.match(repair, /equation, units/i)
  assert.match(repair, /missing variable/i)
  assert.match(repair, /symbolic break-even formula/i)
  assert.match(repair, /protocol, consistency rule, algorithm, decision procedure/i)
  assert.match(repair, /Do not present an illustrative assumption as measured reality/i)
})

test('long technical answers that reuse domain terms but add real reasoning are not prompt echoes', () => {
  const prompt = 'A 400-node storage system reports rising tail latency during compaction. Compare queueing delay, write amplification, and cache churn, then recommend which telemetry to inspect first and why.'
  const answer = JSON.stringify({
    answer: 'Start with queue-depth and compaction-worker saturation because they distinguish backlog from device latency. Then compare bytes-written per logical byte to quantify write amplification, and finally inspect cache hit rate plus eviction churn to see whether compaction is displacing the read working set.',
    confidence: 0.86,
  })
  assert.equal(promptEchoNonAnswer(prompt, answer), false)
})
