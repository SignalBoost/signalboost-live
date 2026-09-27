import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builderEngineeringGoal, builderEngineeringControlState, formatBuilderEngineeringGoal } from '../lib/builder/engineering-control-plane.ts'

test('production requests become explicit engineering goals', () => {
  const goal = builderEngineeringGoal('Fix checkout in production. Run: npm test')
  assert.equal(goal.requiresProductionAcceptance, true)
  assert.deepEqual(goal.acceptance.commands, ['npm test'])
  assert.match(formatBuilderEngineeringGoal(goal), /Do not claim completion/)
})

test('local verification cannot satisfy a production goal', () => {
  const state = builderEngineeringControlState({
    objective: 'Fix checkout in production. Run: npm test',
    paths: [],
    trace: [{ round: 1, toolId: 'run', input: { command: 'npm test' }, ok: true,
      output: { exitCode: 0, timedOut: false } }],
    productionAccepted: false,
  })
  assert.equal(state.state, 'production_acceptance')
  assert.deepEqual(state.remaining, ['production_acceptance'])
})

test('production acceptance is terminal goal evidence', () => {
  const state = builderEngineeringControlState({
    objective: 'Fix checkout in production. Run: npm test',
    paths: [],
    trace: [{ round: 1, toolId: 'run', input: { command: 'npm test' }, ok: true,
      output: { exitCode: 0, timedOut: false } }],
    productionAccepted: true,
  })
  assert.equal(state.state, 'satisfied')
})

test('tool loop receives the engineering goal contract every model round', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(source, /formatBuilderEngineeringGoal\(engineeringGoal\)/)
})
