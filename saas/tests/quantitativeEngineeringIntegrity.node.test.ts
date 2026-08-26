import assert from 'node:assert/strict'
import test from 'node:test'
import {
  quantitativeEngineeringRepairInstruction,
  quantitativeEngineeringUnsupportedClaims,
} from '../lib/ai/cos/quantitativeEngineeringIntegrity.ts'

const prompt = 'An LLM pretraining job running across 512 H100s needs to be migrated from US-East to EU-North. Calculate break-even data egress and network checkpoint synchronization overhead versus power savings ($0.11/kWh vs $0.03/kWh), and define the exact state-checkpoint consistency protocol needed to prevent gradient loss.'

const unsafe = JSON.stringify({
  answer: [
    'This request contains a fundamental category error because there is no single break-even.',
    'Assumptions: 700W per GPU, $0.05/GB, 420GB checkpoints, and ten checkpoints per day. Therefore the break-even is immediate and migrate immediately.',
    'All 512 nodes synchronize. Write a single atomic directory to S3 and use CompleteMultipartUpload to ensure atomicity.',
    'Store model, optimizer, RNG and global step. The daily volume needs 488 Mbps.',
  ].join(' '),
  confidence: 0.9,
})

const safe = JSON.stringify({
  answer: [
    'The supplied price delta is $0.08/kWh. If total measured cluster power is P kW and remaining runtime is T hours, energy savings are 0.08 × P × T dollars.',
    'If egress price is E dollars/GB and D GB must cross regions, break-even is D × E <= 0.08 × P × T. Those missing measurements determine the decision.',
    'Checkpoint transfer time is checkpoint bytes C divided by effective throughput B, plus quiesce, barrier and verification time.',
    'After required collectives and a completed optimizer update, checkpoint model state, optimizer state, scheduler/scaler state when used, RNG state, global step, data-loader/sampler cursor, and sharding topology.',
    'Write immutable generation-scoped shards, verify each checksum, publish a COMMITTED manifest only after every required shard validates, fence the source site, activate the destination as the sole writer, and resume from the next optimizer step.',
    'A migrate/no-migrate decision remains conditional on measured cluster power, egress tariff, bytes transferred, throughput, remaining runtime, and slowdown.',
  ].join(' '),
  confidence: 0.88,
})

test('the observed production H100 answer raises every material integrity defect', () => {
  const signals = quantitativeEngineeringUnsupportedClaims(prompt, unsafe)
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
  ]) assert.ok(signals.includes(expected), `${expected}: ${signals.join(', ')}`)
})

test('a parameterized break-even answer with committed generation semantics is clean', () => {
  assert.deepEqual(quantitativeEngineeringUnsupportedClaims(prompt, safe), [])
})

test('repair contract keeps assumptions conditional and protects exact continuation', () => {
  const repair = quantitativeEngineeringRepairInstruction(prompt, quantitativeEngineeringUnsupportedClaims(prompt, unsafe))
  assert.match(repair, /GIVEN facts, DERIVED values, and ILLUSTRATIVE assumptions/i)
  assert.match(repair, /unconditional recommendation/i)
  assert.match(repair, /count of GPUs\/accelerators is not a count of nodes/i)
  assert.match(repair, /checkpoint bytes divided by effective transfer throughput/i)
  assert.match(repair, /completed optimizer-step boundary/i)
  assert.match(repair, /data-loader\/sampler position/i)
  assert.match(repair, /manifest\/COMMITTED pointer/i)
  assert.match(repair, /object-store “directory” is not an atomic transaction/i)
  assert.match(repair, /sole active writer/i)
})

test('ordinary derived arithmetic remains allowed when the request is arithmetic-only', () => {
  const arithmeticPrompt = 'For a 512-GPU cluster, express the power-cost savings from a $0.11/kWh to $0.03/kWh price change and the break-even egress volume symbolically when actual cluster power P, remaining runtime T, and egress price E are not provided.'
  const answer = JSON.stringify({
    answer: 'The supplied price delta is $0.08/kWh. If power is P kW and runtime is T hours, savings are 0.08 × P × T dollars. If egress costs E dollars/GB, break-even transfer volume is (0.08 × P × T) / E GB. No unconditional migration recommendation follows until P, T and E are measured.',
    confidence: 0.9,
  })
  assert.deepEqual(quantitativeEngineeringUnsupportedClaims(arithmeticPrompt, answer), [])
})
