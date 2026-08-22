import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/dashboard/cos-reasoning-comparison/page.tsx', import.meta.url), 'utf8')

test('reasoning comparison dashboard calls the owner-only comparison API', () => {
  assert.match(page, /\/api\/admin\/cos-reasoning-comparison/)
  assert.match(page, /method:\s*'POST'/)
  assert.match(page, /credentials:\s*'include'/)
  assert.match(page, /roles:\s*\[roleA, roleB\]/)
})

test('dashboard makes billable comparison explicit and defaults to incident reasoning when available', () => {
  assert.match(page, /incident-reasoning/)
  assert.match(page, /two billable model evaluations/i)
  assert.match(page, /Run Comparison/)
})

test('dashboard prevents comparing a worker with itself', () => {
  assert.match(page, /roleA === roleB/)
  assert.match(page, /Choose two different workers/)
})
