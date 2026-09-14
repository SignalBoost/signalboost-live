// tests/powerStabilizationRelease.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPowerStabilizationPrompt,
  powerStabilizationDefects,
  powerStabilizationRepairInstruction,
} from '../lib/ai/cos/powerStabilizationRelease.ts'

test('power stabilization release recognizes advisory and explicit DVFS lever prompts', () => {
  assert.equal(
    isPowerStabilizationPrompt('Build a hypothesis discrimination brief for a DVFS power transient.'),
    true,
  )
  assert.equal(
    isPowerStabilizationPrompt('Compare DVFS with packet pacing for a 1.2 MW power transient.'),
    true,
  )
  assert.equal(isPowerStabilizationPrompt('Explain DVFS at a high level.'), false)
})

test('power stabilization release rejects winning-lever and memory-scrubbing power claims', () => {
  const defects = powerStabilizationDefects(
    'The primary line of defense is DVFS. Memory scrubbing will preempt the power spike.',
  )

  assert.deepEqual(defects, [
    'named_a_winning_lever',
    'security_scrub_used_as_power_evidence',
  ])
})

test('power stabilization repair keeps the answer as a discrimination brief', () => {
  const instruction = powerStabilizationRepairInstruction()

  assert.match(instruction, /Rewrite as a discrimination brief only\./)
  assert.match(instruction, /DVFS, ToR packet pacing, and checkpoint preemption as levers/)
  assert.match(instruction, /Do not use memory residue, context reset, or tenant scrubbing as power or cooling evidence\./)
  assert.ok(
    instruction.endsWith(
      'You cannot stand behind a single cause or a single winning lever with the readings given.',
    ),
  )
})
