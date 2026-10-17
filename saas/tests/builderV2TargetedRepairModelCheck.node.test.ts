import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

// Finite-state check: after a failed host test, reads and failed writes are
// nonproductive observations. A checkpoint resume must not reset their budget.
type State = { reads: number; observations: number; changed: boolean }
function explore(fixed: boolean) {
  const queue: Array<{ state: State; trace: string[] }> = [
    { state: { reads: 0, observations: 0, changed: false }, trace: [] },
  ]
  const visited = new Set<string>()
  while (queue.length) {
    const { state, trace } = queue.shift()!
    const key = JSON.stringify(state)
    if (visited.has(key) || trace.length > 9) continue
    visited.add(key)
    if (state.observations > 4 && !state.changed) return trace
    for (const action of ['read', 'list', 'conflict', 'resume', 'edit']) {
      if (action === 'edit') continue // repair advances revision: property resets
      if (action === 'resume') {
        queue.push({ state, trace: [...trace, action] })
        continue
      }
      const blocked = fixed ? state.observations >= 4 : state.reads >= 2
      if (blocked) continue
      queue.push({ state: {
        reads: state.reads + (action === 'read' || action === 'list' ? 1 : 0),
        observations: state.observations + 1, changed: false,
      }, trace: [...trace, action] })
    }
  }
  return null
}

test('bounded symbolic state model exposes old write-conflict bypass', () => {
  assert.ok(explore(false), 'expected a counterexample to read-only budgeting')
})

test('repaired observation budget excludes no-edit escape paths, including resumes', () => {
  assert.equal(explore(true), null)
  assert.match(src, /const repairObservationsSinceFailure = \(\) =>/)
  assert.match(src, /steps\.slice\(at \+ 1\)\.filter\(step => !step\.changed\)\.length/)
  assert.match(src, /MAX_REPAIR_OBSERVATIONS = 4/)
  assert.match(src, /repairObservationsSinceFailure\(\) >= MAX_REPAIR_OBSERVATIONS/)
  assert.match(src, /action\.tool !== 'edit_file'/)
})
