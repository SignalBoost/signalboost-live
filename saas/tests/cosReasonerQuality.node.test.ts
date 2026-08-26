import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessReasonerDraft,
  buildDiagnosticRepairPrompt,
  preferRepairedDraft,
  promptEchoNonAnswer,
  reasonerDraftNeedsRepair,
} from '../lib/ai/cos/reasonerQuality.ts'
import { quantitativeEngineeringRepairSignals, quantitativeEngineeringUnsupportedClaims } from '../lib/ai/cos/quantitativeEngineeringIntegrity.ts'

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
    'For checkpoint transfer, let C be checkpoint bytes and B effective bytes/s; transfer time is C/B seconds plus quiesce, barrier, verification, and any throughput penalty.',
    'Use optimizer-step-boundary checkpoints only: finish backward and all-reduce, finish the optimizer update, quiesce async writes, barrier all ranks, persist model weights, optimizer state, scheduler/scaler state, RNG states, global step, data-loader/sampler cursor, and sharding topology. Hash every immutable generation-scoped shard, publish a COMMITTED manifest only after all shards validate, fence the source site, activate the destination as the sole writer, then resume from global_step + 1. Never publish or load a partial generation.',
    'Any move/no-move recommendation remains conditional on measured cluster power, contracted egress price, bytes to transfer, effective throughput, remaining runtime, and observed training slowdown.',
  ].join(' '),
  confidence: 0.88,
})

const H100_OVERCONFIDENT = JSON.stringify({
  answer: [
    'This request contains a fundamental category error because there is no single break-even data egress cost versus power savings.',
    'Assumptions: H100 power draw is 700W, egress is $0.05/GB, a 70B model has a 420GB checkpoint, and ten checkpoints are transferred per day.',
    'The example yields $28.67/hour of savings and $210/day of checkpoint sync cost. Conclusion: the break-even is immediate and the recommendation is to migrate immediately.',
    'All 512 nodes synchronize before checkpointing. Flush gradient accumulation, snapshot optimizer state and weights, record the global step and RNG state.',
    'Write all components to a single atomic directory on S3 or GCS and use CompleteMultipartUpload to ensure atomicity. Verify checksums and resume from the recorded step.',
    'The required daily volume corresponds to about 488 Mbps sustained bandwidth, so the key constraint is bandwidth rather than cost.',
  ].join(' '),
  confidence: 0.91,
})

const H100_NEAR_MISS = JSON.stringify({
  answer: [
    'The price delta is $0.08/kWh and the example uses explicitly illustrative power and egress assumptions. Migrate immediately.',
    'After a completed optimizer update, save model, optimizer, scheduler/scaler, RNG, global step, data-loader/sampler cursor, and sharding topology.',
    'Write immutable generation shards, verify checksums, publish a COMMITTED manifest, fence the source, activate the destination as the sole writer, and resume from the next optimizer step.',
  ].join(' '),
  confidence: 0.82,
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
  assert.match(repairedPrompt, /do not require a production mutation/i)
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

test('quantitative echo repair requires formulas, missing inputs, entity fidelity and committed checkpoint semantics', () => {
  const repair = buildDiagnosticRepairPrompt(H100_PROMPT, H100_ECHO)
  assert.match(repair, /restated or paraphrased the request instead of answering it/i)
  assert.match(repair, /equation, units/i)
  assert.match(repair, /missing variable/i)
  assert.match(repair, /symbolic break-even formula/i)
  assert.match(repair, /Do not present an illustrative assumption as measured reality/i)
  assert.match(repair, /count of GPUs\/accelerators is not a count of nodes/i)
  assert.match(repair, /manifest\/COMMITTED pointer/i)
  assert.match(repair, /object-store directory atomic/i)
})

test('the observed overconfident H100 answer triggers repair while structural defects remain blocking', () => {
  const repairSignals = quantitativeEngineeringRepairSignals(H100_PROMPT, H100_OVERCONFIDENT)
  for (const expected of [
    'break_even_mischaracterized',
    'illustrative_assumption_promoted_to_decision',
    'premise_entity_count_mutation',
    'invalid_multi_object_checkpoint_atomicity',
    'checkpoint_not_at_committed_optimizer_step',
    'checkpoint_missing_data_progress_state',
    'checkpoint_missing_generation_manifest',
    'checkpoint_missing_source_fencing',
    'checkpoint_transfer_overhead_not_parameterized',
  ]) assert.ok(repairSignals.includes(expected), `${expected}: ${repairSignals.join(', ')}`)
  const blockers = quantitativeEngineeringUnsupportedClaims(H100_PROMPT, H100_OVERCONFIDENT)
  assert.ok(blockers.includes('invalid_multi_object_checkpoint_atomicity'))
  assert.ok(blockers.includes('checkpoint_missing_generation_manifest'))
  assert.ok(!blockers.includes('illustrative_assumption_promoted_to_decision'))
  assert.ok(!blockers.includes('checkpoint_transfer_overhead_not_parameterized'))
  assert.equal(reasonerDraftNeedsRepair(H100_PROMPT, H100_OVERCONFIDENT), true)
})

test('a near-miss remains a repair target but no longer collapses into a hard release refusal', () => {
  const repairSignals = quantitativeEngineeringRepairSignals(H100_PROMPT, H100_NEAR_MISS)
  assert.ok(repairSignals.includes('illustrative_assumption_promoted_to_decision'))
  assert.ok(repairSignals.includes('checkpoint_transfer_overhead_not_parameterized'))
  assert.deepEqual(quantitativeEngineeringUnsupportedClaims(H100_PROMPT, H100_NEAR_MISS), [])
  assert.equal(reasonerDraftNeedsRepair(H100_PROMPT, H100_NEAR_MISS), true)
})

test('a parameterized H100 answer with a committed checkpoint generation is releasable', () => {
  assert.deepEqual(quantitativeEngineeringRepairSignals(H100_PROMPT, H100_SUBSTANTIVE), [])
  assert.deepEqual(quantitativeEngineeringUnsupportedClaims(H100_PROMPT, H100_SUBSTANTIVE), [])
  assert.equal(reasonerDraftNeedsRepair(H100_PROMPT, H100_SUBSTANTIVE), false)
})

test('derived arithmetic is allowed when it stays conditional instead of becoming an invented premise', () => {
  const arithmeticPrompt = 'For a 512-GPU cluster, express power-cost savings from a $0.11/kWh to $0.03/kWh price change and break-even egress volume symbolically when actual cluster power P, remaining runtime T, and egress price E are not provided.'
  const answer = JSON.stringify({
    answer: 'The stated electricity-price delta is $0.08/kWh. If average cluster power is P kW and the job runs another T hours, power savings are 0.08 × P × T dollars. If egress price is E dollars/GB, the maximum break-even transfer volume is (0.08 × P × T) / E GB. Those variables were not supplied, so this is a relation rather than a migrate/no-migrate recommendation.',
    confidence: 0.9,
  })
  assert.deepEqual(quantitativeEngineeringRepairSignals(arithmeticPrompt, answer), [])
  assert.deepEqual(quantitativeEngineeringUnsupportedClaims(arithmeticPrompt, answer), [])
})

test('quantitative integrity repair explicitly separates assumptions from decisions and fixes distributed commit semantics', () => {
  const repair = buildDiagnosticRepairPrompt(H100_PROMPT, H100_OVERCONFIDENT)
  assert.match(repair, /GIVEN facts, DERIVED values, and ILLUSTRATIVE assumptions/i)
  assert.match(repair, /transfer time = checkpoint bytes \/ effective transfer throughput/i)
  assert.match(repair, /Do NOT write “migrate immediately”/i)
  assert.match(repair, /completed optimizer-step boundary/i)
  assert.match(repair, /data-loader\/sampler position/i)
  assert.match(repair, /manifest\/COMMITTED pointer/i)
  assert.match(repair, /sole active writer/i)
})

test('long technical answers that reuse domain terms but add real reasoning are not prompt echoes', () => {
  const prompt = 'A 400-node storage system reports rising tail latency during compaction. Compare queueing delay, write amplification, and cache churn, then recommend which telemetry to inspect first and why.'
  const answer = JSON.stringify({
    answer: 'Start with queue-depth and compaction-worker saturation because they distinguish backlog from device latency. Then compare bytes-written per logical byte to quantify write amplification, and finally inspect cache hit rate plus eviction churn to see whether compaction is displacing the read working set.',
    confidence: 0.86,
  })
  assert.equal(promptEchoNonAnswer(prompt, answer), false)
})
