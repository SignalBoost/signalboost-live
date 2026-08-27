// saas/tests/describeThrownValue.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describeThrownValue } from '../lib/ai/cos/describeThrownValue.ts'

test('a Supabase-shaped rejection no longer prints [object Object]', () => {
  // The exact shape that produced ~96 consecutive undiagnosable cron failures.
  const supabase = {
    message: 'insert or update on table "cos_cognitive_skills" violates foreign key constraint',
    details: 'Key (skill_key)=(x) is not present in table "cos_skill_families".',
    hint: null,
    code: '23503',
  }
  const described = describeThrownValue(supabase)
  assert.ok(!described.includes('[object Object]'))
  assert.match(described, /violates foreign key constraint/)
  assert.match(described, /23503/)
})

test('nothing ever degrades to [object Object]', () => {
  const circular: Record<string, unknown> = { a: 1 }
  circular.self = circular
  for (const value of [
    {},
    { unexpected: 'shape' },
    circular,
    Object.create(null),
    new Map([['a', 1]]),
    [1, 2, 3],
    Symbol('x'),
    () => undefined,
  ]) {
    const described = describeThrownValue(value as unknown)
    assert.ok(!described.includes('[object Object]'), JSON.stringify(String(described)))
    assert.ok(described.length > 0)
  }
})

test('Errors keep their message, and a wrapped cause is surfaced', () => {
  assert.equal(describeThrownValue(new Error('boom')), 'boom')
  const wrapped = new Error('outer', { cause: new Error('inner reason') })
  const described = describeThrownValue(wrapped)
  assert.match(described, /outer/)
  assert.match(described, /inner reason/)
})

test('an Error with no message still identifies itself', () => {
  assert.equal(describeThrownValue(new TypeError('')), 'TypeError')
})

test('primitives and nullish values are described plainly', () => {
  assert.equal(describeThrownValue('plain string'), 'plain string')
  assert.equal(describeThrownValue(42), '42')
  assert.equal(describeThrownValue(false), 'false')
  assert.equal(describeThrownValue(null), 'null')
  assert.equal(describeThrownValue(undefined), 'undefined')
})

test('output is length-bounded so a log line cannot explode', () => {
  assert.ok(describeThrownValue(new Error('x'.repeat(9000))).length <= 2000)
  assert.ok(describeThrownValue({ message: 'y'.repeat(9000) }).length <= 2000)
})

test('the failing cron uses it', () => {
  const source = readFileSync('lib/ai/cos/autoPromoteLearning.ts', 'utf8')
  assert.match(source, /import \{ describeThrownValue \}/)
  assert.match(source, /const message = describeThrownValue\(error\)/)
  assert.ok(
    !/\[cos-learning-auto-promotion-failed\][\s\S]{0,200}String\(error\)/.test(source),
    'the promotion failure path must not fall back to String(error)',
  )
})
