import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/runpod-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('distilled canary retry ceiling is observable without another provider call', () => {
  const ceilingIndex = route.indexOf("reason: 'distilled_canary_retry_ceiling'")
  const providerIndex = route.indexOf('const canary = await canaryRunpodServerlessDistilledLlm')
  assert.ok(ceilingIndex >= 0)
  assert.ok(providerIndex > ceilingIndex)
  assert.match(route, /consumedInvocations/)
  assert.match(route, /maxCanaryInvocations:\s*approvedMaxCanaryInvocations/)
  assert.match(route, /latestFailure:/)
})

test('live canary failures log bounded provider health without secrets', () => {
  assert.match(route, /reason:\s*'distilled_canary_failed'/)
  assert.match(route, /healthBefore:\s*compactHealth\(healthBefore\)/)
  assert.match(route, /healthAfter:\s*compactHealth\(healthAfter\)/)
  assert.match(route, /boundedOperationalText/)
  assert.match(route, /\$1=\[redacted\]/)
  assert.doesNotMatch(route, /console\.(info|log|warn|error)\([^\n]*(RUNPOD_API_KEY|HF_TOKEN)/)
})

test('observability does not widen canary authority or retry budget', () => {
  assert.match(route, /MAX_CANARY_INVOCATIONS = 3/)
  assert.match(route, /CANARY_HTTP_ATTEMPTS_PER_INVOCATION = 1/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
  assert.doesNotMatch(route, /MAX_CANARY_INVOCATIONS = [4-9]/)
})
