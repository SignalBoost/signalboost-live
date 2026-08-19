// saas/tests/cosCapabilityBenchmarkPreflight.node.test.ts
//
// Source-shape test, same style as cosCapabilityBenchmarkReadiness: the route imports Supabase and
// the whole COS answer path through '@/' aliases, so it cannot be imported under plain node --test.
// What matters here is ORDER and OUTCOME, both of which are visible in the source.
//
// Pins the Aug 19 2026 defect: a full day of 0% pass rate that meant "no free GPU on the host",
// recorded as if COS had answered the questions wrongly.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'app/api/admin/cos-capability-benchmark/route.ts'), 'utf8')

test('the route probes the reasoner before it scores any case', () => {
  const probeAt = source.indexOf('await probeReasoner()')
  const firstCaseAt = source.indexOf('runPrivateCapabilityCase(')
  assert.ok(probeAt > 0, 'the pre-flight probe must be present')
  assert.ok(firstCaseAt > 0, 'the case runner must still be called')
  assert.ok(probeAt < firstCaseAt, 'the probe must run BEFORE the first scored case')
})

test('a non-ok verdict skips scoring entirely rather than recording failures', () => {
  const guard = source.slice(source.indexOf("if (probe.verdict !== 'ok')"), source.indexOf('for (const row of selected)'))
  assert.match(guard, /blockedVerdict = probe\.verdict/)
  assert.match(guard, /return/, 'the blocked path must return before the scoring loop')
})

test('a blocked run is stored as failed with zero attempts, never as completed', () => {
  const blocked = source.slice(source.indexOf('if (blockedVerdict)'), source.indexOf("status: 'completed'"))
  assert.match(blocked, /status: 'failed'/)
  assert.match(blocked, /attempted: 0, passed: 0/)
  // The stored reason must name the verdict, so the dashboard row explains itself.
  assert.match(blocked, /Reasoner unavailable \(\$\{blockedVerdict\}\)/)
})

test('the blocked response points at the endpoint that explains why', () => {
  assert.match(source, /cos-reasoner\/diagnose/)
})

test('the wake attempt is still made before the probe, so a sleeping pod is not reported as broken', () => {
  const wakeAt = source.indexOf('ensureLocalInferenceRuntimeReady()')
  const probeAt = source.indexOf('await probeReasoner()')
  assert.ok(wakeAt > 0 && wakeAt < probeAt)
})
