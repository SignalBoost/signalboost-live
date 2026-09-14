// saas/regression/powerStabilizationRelease.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  isPowerStabilizationPrompt,
  powerStabilizationDefects,
  powerStabilizationRepairInstruction,
} from '../lib/ai/cos/powerStabilizationRelease.ts'

/**
 * REBUILT 2026-09-13. This path held an older copy of `lib/ai/cos/reasonerQuality.ts` — 349 lines of
 * source with `./`-relative imports that cannot resolve from tests/, exporting eleven functions and
 * registering no tests. It was never in the gate, so it simply failed to run and nobody saw it. The
 * module it is named after had no regression at all.
 *
 * It lives in saas/regression/ rather than saas/tests/ because that directory has passed GitHub's
 * 1,000-file cap and no longer accepts commits through the web editor. The gate runs an explicit
 * path list, so the location costs nothing there. New suites go here until tests/ is split up.
 *
 * `powerStabilizationRelease.ts` is the deterministic gate for the 1.2 MW / DVFS / ToR / checkpoint
 * vignette. Its whole point is that prompt text does not bind the model, so the checks have to be
 * asserted here rather than trusted to a directive.
 */

function file(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

test('the vignette is recognized from its own vocabulary', () => {
  assert.equal(isPowerStabilizationPrompt(
    'We have a 1.2 MW hall. Can DVFS and ToR packet pacing hold the PDU within limits?'), true)
  assert.equal(isPowerStabilizationPrompt('DVFS plus checkpoint preempt during a PDU excursion'), true)
})

test('DVFS alone is not the vignette, and neither is an unrelated power question', () => {
  assert.equal(isPowerStabilizationPrompt('Explain what DVFS does on a modern GPU.'), false)
  assert.equal(isPowerStabilizationPrompt('What is a PDU?'), false)
  for (const value of ['', '   ', null, undefined]) {
    assert.equal(isPowerStabilizationPrompt(value as never), false, String(value))
  }
})

test('ranking the levers is the defect the gate exists to catch', () => {
  for (const answer of [
    'DVFS is the primary defense, with checkpoint preemption as a last resort.',
    'The optimal strategy is a hierarchical control scheme across the three levers.',
    'Prioritize DVFS first.',
    'Tertiary (checkpoint preemption) follows the immediate (0-100ms) response.',
  ]) {
    assert.deepEqual(powerStabilizationDefects(answer), ['named_a_winning_lever'], answer)
  }
})

test('security scrubbing cannot be offered as power evidence, in either order', () => {
  assert.deepEqual(
    powerStabilizationDefects('Memory scrubbing between tenants lets us preempt the breaker trip.'),
    ['security_scrub_used_as_power_evidence'])
  assert.deepEqual(
    powerStabilizationDefects('To stabilize power we rely on compute context resets across tenants.'),
    ['security_scrub_used_as_power_evidence'])
})

test('both defects are reported together rather than the first one winning', () => {
  const answer = [
    'DVFS is the primary defense here.',
    'Memory scrubbing also lets us preempt the excursion.',
  ].join(' ')
  assert.deepEqual(powerStabilizationDefects(answer),
    ['named_a_winning_lever', 'security_scrub_used_as_power_evidence'])
})

test('a discrimination brief that ranks nothing passes clean', () => {
  const answer = [
    'Three levers are available: DVFS, ToR packet pacing, and checkpoint preemption.',
    'The readings supplied do not separate a supply-side excursion from a workload transient,',
    'so each lever addresses a different candidate cause and none is established as sufficient.',
    'ASSUMPTION — standard published practice — override if this site differs: controller response is sub-second.',
    'You cannot stand behind a single cause or a single winning lever with the readings given.',
  ].join(' ')
  assert.deepEqual(powerStabilizationDefects(answer), [])
  for (const value of ['', null, undefined]) {
    assert.deepEqual(powerStabilizationDefects(value as never), [], String(value))
  }
})

test('the repair instruction forbids each defect by name and pins the closing sentence', () => {
  const instruction = powerStabilizationRepairInstruction()
  for (const rule of ['primary defense', 'last resort', 'hierarchical approach', 'prioritize one lever']) {
    assert.ok(instruction.includes(rule), `repair instruction does not forbid: ${rule}`)
  }
  assert.match(instruction, /memory residue, context reset, or tenant scrubbing/)
  assert.match(instruction, /ASSUMPTION — standard published practice/)
  assert.match(instruction, /Last sentence exactly: You cannot stand behind a single cause or a single winning lever with the readings given\.$/)
})

test('the repair instruction would itself fail the gate it describes, so it is never released as prose', () => {
  // It quotes the forbidden phrases in order to forbid them. That is correct for an instruction and
  // fatal for an answer, which is why the defect check runs on the draft and never on this text.
  assert.ok(powerStabilizationDefects(powerStabilizationRepairInstruction()).length > 0)
  const quality = file('lib/ai/cos/reasonerQuality.ts')
  assert.match(quality, /import \{ isPowerStabilizationPrompt, powerStabilizationDefects, powerStabilizationRepairInstruction \}/)
})

test('the reasoner consults the gate before deciding a draft is releasable', () => {
  const quality = file('lib/ai/cos/reasonerQuality.ts')
  const detect = quality.indexOf('isPowerStabilizationPrompt(')
  const defects = quality.indexOf('powerStabilizationDefects(')
  assert.ok(detect > 0 && defects > 0, 'the gate is imported but not used')
})
