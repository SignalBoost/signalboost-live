import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')

function numericConstant(source: string, name: string): number {
  const match = new RegExp(`const ${name} = ([0-9_]+)`).exec(source)
  assert.ok(match, `${name} must remain an explicit numeric deadline`)
  return Number(match[1].replaceAll('_', ''))
}

test('the page no longer waits for the whole Builder execution', () => {
  assert.match(route, /export const maxDuration = 300/)
  assert.match(route, /after\(async \(\) => \{/)
  assert.match(route, /await runBuilderJob\(jobId, access\.userId\)/)
  assert.match(route, /\{ status: 202 \}/)
  assert.doesNotMatch(route, /await new BuilderToolLoop/)
})

test('background Builder work owns a deadline below Vercel maxDuration', () => {
  const budget = numericConstant(runner, 'BUILDER_JOB_BUDGET_MS')
  const reserve = numericConstant(runner, 'BUILDER_JOB_RESULT_RESERVE_MS')
  assert.ok(budget > 0)
  assert.ok(reserve >= 10_000)
  assert.ok(budget + reserve <= 280_000)
  assert.match(runner, /deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS/)
  assert.match(runner, /BUILDER_TURN_TIMEOUT_ERROR/)
  assert.match(runner, /finishBuilderJob/)
})

test('browser polling is bounded to about thirty seconds and never controls execution', () => {
  const attempts = numericConstant(boundary, 'BUILDER_JOB_POLL_ATTEMPTS')
  const delay = numericConstant(boundary, 'BUILDER_JOB_POLL_DELAY_MS')
  const pollWindow = (attempts - 1) * delay
  assert.ok(pollWindow >= 20_000)
  assert.ok(pollWindow <= 30_000)
  assert.match(boundary, /method: 'GET'/)
  assert.match(boundary, /The page does not wait for the entire debug lifecycle/)
})
