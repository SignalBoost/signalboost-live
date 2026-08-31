import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/internal/runtime-acceptance/route.ts', import.meta.url), 'utf8')
const gates = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('acceptance harness is short-lived, production-only, canonical-host-only, and token-locked', () => {
  assert.match(route, /export const maxDuration = 300/)
  assert.match(route, /CANONICAL_PRODUCTION_HOST = 'saas\.signalboostapp\.com'/)
  assert.match(route, /process\.env\.VERCEL_ENV !== 'production'/)
  assert.match(route, /Date\.now\(\) > ACCEPTANCE_EXPIRES_AT_MS/)
  assert.match(route, /createHash\('sha256'\)/)
  assert.match(route, /timingSafeEqual\(actual, expected\)/)
  assert.match(route, /ACCEPTANCE_TOKEN_SHA256 = '[a-f0-9]{64}'/)
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)\([^\n]*(?:token|password|email)/i)
})

test('harness derives an isolated identity only from the valid token and cleans every app record', () => {
  assert.match(route, /function acceptanceCredentials\(token: string\)/)
  assert.match(route, /createHash\('sha256'\)\.update\(token\)/)
  assert.match(route, /createHash\('sha256'\)\.update\(`\$\{token\}:password`\)/)
  assert.match(route, /runtime-acceptance-\$\{identity\}@example\.com/)
  assert.match(route, /browserSession\.auth\.signInWithPassword\(credentials\)/)
  assert.doesNotMatch(route, /auth\.admin\.createUser|auth\.admin\.deleteUser/)
  assert.match(route, /cleanApplicationData\(admin, userId\)/)
  assert.match(route, /countRows\(admin, 'builder_jobs', userId\)/)
  assert.match(route, /countRows\(admin, 'assistant_conversations', userId\)/)
  assert.match(route, /countRows\(admin, 'builder_workspaces', userId\)/)
  assert.match(route, /temporary-application-data-cleaned/)
})

test('Builder acceptance uses one POST, read-only polling, and durable History', () => {
  assert.equal((route.match(/httpJson\(origin, '\/api\/builder', cookies/g) ?? []).length, 1)
  assert.match(route, /builder-post-202/)
  assert.match(route, /\/api\/assistant\/chats\?id=/)
  assert.match(route, /\/api\/builder\?jobId=/)
  assert.match(route, /history-running-after-202/)
  assert.match(route, /history-user-before-assistant/)
  assert.match(route, /builder-terminal-without-replay/)
  assert.match(route, /history-row-updated-in-place/)
  assert.match(route, /history-terminal-without-send/)
})

test('Builder acceptance requires fail, one edit, same command, and exit zero evidence', () => {
  assert.match(route, /BROKEN_SOURCE = 'const answer = 6 \* 7\\nconsole\.log\(result\)\\n'/)
  assert.match(route, /broken-file-stack-visible/)
  assert.match(route, /ReferenceError\|result is not defined/)
  assert.match(route, /exactly-one-edit/)
  assert.match(route, /same-command-rerun/)
  assert.match(route, /verification-exit-zero/)
  assert.match(route, /Verification exit code:\\s\*0/)
})

test('pay-gap request is checked against production routing and durable job count', () => {
  assert.match(route, /PAY_GAP_PROMPT = 'does a pay gap exist\?'/)
  assert.match(route, /!isConciergeBuilderObjective\(PAY_GAP_PROMPT\)/)
  assert.match(route, /httpJson\(origin, '\/api\/cos-browser'/)
  assert.match(route, /pay-gap-created-no-builder-job/)
  assert.match(route, /jobsAfterPayGap === jobsAfterDebug/)
})

test('visual acceptance proves precise validation, inline preview, and download', () => {
  assert.match(route, /visual_objective_too_large/)
  assert.match(route, /objective_source === 'prompt'/)
  assert.match(route, /legacy-visual-error-removed/)
  assert.match(route, /visual-concierge-success/)
  assert.match(route, /visual-inline-preview-loads/)
  assert.match(route, /visual-download-loads/)
  assert.match(route, /preview\.contentType\.startsWith\('image\/'\)/)
})

test('temporary runtime acceptance remains deployment-gated', () => {
  assert.match(gates, /tests\/runtimeAcceptanceHarness\.node\.test\.ts/)
})
