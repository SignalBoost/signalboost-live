// saas/tests/cosWholeTurnDeadline.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runWithTurnDeadline, startTurnBudget, turnDeadlineRemainingMs, turnBudgetMs } from '../lib/ai/cos/cosTurnBudget.ts'

test('outside a durable turn nothing changes', () => {
  assert.equal(turnDeadlineRemainingMs(), null)
  const start = 1_000_000
  assert.equal(startTurnBudget(start).deadlineAt, start + turnBudgetMs())
})

test('every budget started inside one turn shares the whole-turn deadline instead of a fresh clock', async () => {
  const now = Date.now()
  await runWithTurnDeadline(now + 10_000, async () => {
    const first = startTurnBudget(now)
    const later = startTurnBudget(now + 8_000)
    assert.equal(first.deadlineAt, now + 10_000)
    assert.equal(later.deadlineAt, now + 10_000, 'a later stage must not get a new 45 s clock')
    const left = turnDeadlineRemainingMs()
    assert.ok(left !== null && left <= 10_000 && left > 0)
  })
  assert.equal(turnDeadlineRemainingMs(), null)
})

test('nested scopes can only tighten the deadline', async () => {
  const now = Date.now()
  await runWithTurnDeadline(now + 5_000, async () => {
    await runWithTurnDeadline(now + 60_000, async () => {
      const left = turnDeadlineRemainingMs()
      assert.ok(left !== null && left <= 5_000)
    })
  })
})

test('model calls and the durable worker are bound to the whole-turn deadline', () => {
  const inference = readFileSync(join(process.cwd(), 'lib/ai/local-inference.ts'), 'utf8')
  assert.match(inference, /const turnRemainingMs = turnDeadlineRemainingMs\(\)/)
  assert.match(inference, /Math\.min\(callerBoundTimeoutMs, turnRemainingMs\)/)
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  assert.match(route, /const requestStartedAt = Date\.now\(\)/)
  assert.match(route, /DURABLE_TURN_MODEL_DEADLINE_MS = 150_000/)
  assert.match(route, /DURABLE_TURN_WATCHDOG_MS = 172_000/)
  assert.match(route, /source: deadlineElapsed \? 'cos-durable-turn-deadline'/)
})

test('direct (non-durable) turns run under the same clock and always record the question', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  assert.match(route, /const syncWorker = runWithTurnDeadline\(\s*requestStartedAt \+ DURABLE_TURN_MODEL_DEADLINE_MS,/)
  assert.match(route, /response = await Promise\.race\(\[syncWorker, syncWatchdog\]\)/)
  assert.match(route, /source: 'cos-turn-deadline'/)
  assert.match(route, /if \(successful \|\| \(deadlineElapsed && reply\)\)/)
})


test('completed read-only browser answers persist History after response delivery', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  const syncSection = route.slice(route.indexOf('if (synchronousReadOnlyTurn)'), route.indexOf('return delivered'))
  assert.match(syncSection, /after\(async \(\) => \{/)
  assert.match(syncSection, /await persistTurn\(/)
  const beforeAfter = syncSection.slice(0, syncSection.indexOf('after(async () => {'))
  assert.doesNotMatch(beforeAfter, /await persistTurn\(/)
})
