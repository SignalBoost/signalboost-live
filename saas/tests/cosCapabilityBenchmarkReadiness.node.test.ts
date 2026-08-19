import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/admin/cos-capability-benchmark/route.ts', import.meta.url), 'utf8')

test('the route imports readiness and wake permission helpers', () => {
  assert.match(route, /ensureLocalInferenceRuntimeReady, withRunpodWakePermission/)
  assert.match(route, /RunpodWakePermission/)
})

test('readiness is requested inside the permission wrapper', () => {
  const wrapStart = route.indexOf('withRunpodWakePermission(ownerWakePermission, async () => {')
  const readiness = route.indexOf('await ensureLocalInferenceRuntimeReady()')
  assert.ok(wrapStart > 0)
  assert.ok(readiness > wrapStart)
})

test('owner action grants wake permission explicitly', () => {
  const permIndex = route.indexOf('ownerWakePermission: RunpodWakePermission')
  assert.ok(permIndex > 0)
  assert.match(route.slice(permIndex, permIndex + 300), /allowed: true/)
})

test('whole benchmark loop stays inside permission scope', () => {
  const wrapStart = route.indexOf('withRunpodWakePermission(ownerWakePermission, async () => {')
  const loopStart = route.indexOf('for (const row of selected)')
  const wrapEnd = route.lastIndexOf('})')
  assert.ok(loopStart > wrapStart)
  assert.ok(wrapEnd > loopStart)
})

test('reasoner readiness failures are exposed without aborting the run', () => {
  assert.match(route, /reasonerReady = false/)
  assert.match(route, /reasonerError/)
})
