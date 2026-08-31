import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const repositoryRepair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
const repositorySession = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
const assistantPage = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')

function numericConstant(source: string, name: string): number {
  const match = new RegExp(`const ${name} = ([0-9_]+)`).exec(source)
  assert.ok(match, `${name} must remain an explicit numeric deadline`)
  return Number(match[1].replaceAll('_', ''))
}

test('Builder owns a hard deadline below the Assistant page deadline', () => {
  const requestBudget = numericConstant(route, 'BUILDER_REQUEST_BUDGET_MS')
  const responseReserve = numericConstant(route, 'BUILDER_RESPONSE_RESERVE_MS')
  const clientDeadline = numericConstant(assistantPage, 'CLIENT_DEADLINE_MS')

  assert.ok(requestBudget > 0)
  assert.ok(responseReserve > 0)
  assert.ok(requestBudget < clientDeadline)
  assert.ok(requestBudget + responseReserve <= clientDeadline)
  assert.match(route, /const requestDeadlineAtMs = Date\.now\(\) \+ BUILDER_REQUEST_BUDGET_MS/)
  assert.match(route, /deadlineAtMs: requestDeadlineAtMs,/)
  assert.match(route, /deadlineAtMs: requestDeadlineAtMs - BUILDER_RESPONSE_RESERVE_MS/)
})

test('a Builder deadline is persisted and returned as HTTP 504 instead of losing the turn', () => {
  assert.match(route, /result\.error === BUILDER_TURN_TIMEOUT_ERROR \? 504 : 422/)
  assert.match(route, /const reply = `COS Builder stopped: \$\{result\.error\}`/)
  assert.match(
    route,
    /await persistBuilderTurn\(\{ conversationId, userId: access\.userId, objective, reply, workspaceId, files \}\)/,
  )
  assert.match(route, /message === BUILDER_TURN_TIMEOUT_ERROR\s*\? 504/)
})

test('repository repair reserves cleanup time and skips unverified diff collection on timeout', () => {
  const reserve = numericConstant(repositoryRepair, 'REPOSITORY_RESULT_RESERVE_MS')
  assert.ok(reserve >= 30_000)
  assert.match(repositoryRepair, /VercelRepositoryRepairSession\.create\(target, \{ deadlineAtMs \}\)/)
  assert.match(repositoryRepair, /createGovernedBuilderAiPort\(createPlatformAiPort\(\), \{ deadlineAtMs: aiDeadlineAtMs \}\)/)
  const timeoutBoundary = repositoryRepair.indexOf("result.error === BUILDER_TURN_TIMEOUT_ERROR")
  const diffCollection = repositoryRepair.indexOf('const changes = await session.collectChanges()')
  assert.ok(timeoutBoundary >= 0)
  assert.ok(diffCollection > timeoutBoundary, 'timeout must return before repository diff collection')
  assert.match(repositoryRepair, /status: input\.error === BUILDER_TURN_TIMEOUT_ERROR \? 504 : 422/)
})

test('repository setup, commands, output reads, and cleanup share the absolute deadline', () => {
  const stopTimeout = numericConstant(repositorySession, 'SANDBOX_STOP_TIMEOUT_MS')
  assert.ok(stopTimeout > 0 && stopTimeout <= 10_000)
  assert.match(repositorySession, /private readonly deadlineAtMs: number \| null/)
  assert.match(repositorySession, /withinAbsoluteDeadline\(Sandbox\.create\(/)
  assert.match(repositorySession, /timeout: sandboxLifetimeMs/)
  assert.match(repositorySession, /withinAbsoluteDeadline\(sandbox\.update\(\{ networkPolicy: 'deny-all' \}\), deadlineAtMs\)/)
  assert.match(repositorySession, /const commandTimeoutMs = this\.commandTimeout\(timeoutMs\)/)
  assert.match(repositorySession, /withinAbsoluteDeadline\(commandOutput\(result, maximum\), this\.deadlineAtMs\)/)
  assert.match(repositorySession, /if \(message === BUILDER_TURN_TIMEOUT_ERROR\) throw error/)
  assert.match(repositorySession, /this\.sandbox\.stop\(\)/)
})
