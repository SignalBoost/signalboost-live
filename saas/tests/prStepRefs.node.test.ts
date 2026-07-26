// saas/tests/prStepRefs.node.test.ts
//
// Tests for infrastructure-PR step-output references (lib/hub/pr-step-refs.ts).
//
// Multi-step PRs run sequentially, and a later step frequently needs a value
// only the earlier step could produce — Stripe "create product" then "create a
// price for that product". The step is staged with "{{steps[0].id}}" and the
// real id is substituted at merge time.
//
// Two guarantees are pinned here, both of which are safety properties rather
// than conveniences:
//   1. A literal "{{steps[N].field}}" must NEVER reach a provider. If it cannot
//      be resolved, the step fails before the network call.
//   2. Resolution never widens what the owner approved: it substitutes values
//      into the payload shape that was reviewed, and never adds, drops or
//      reorders steps.
//
// Pure functions, no DB, no network, no provider.
//
// Run: node --test tests/prStepRefs.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'
import { validateStepRefs, resolveStepRefs, findStepRefs, hasStepRefs } from '../lib/hub/pr-step-refs.ts'

// The exact shape /api/hub/action returns for stripe.create_product.
const PRODUCT_OUTPUT = { id: 'prod_TEST1', name: 'Pro' }

// ── Staging-time validation ────────────────────────────────────────────────

test('accepts a backward reference to an earlier step', () => {
  const err = validateStepRefs([
    { templateId: 'stripe.create_product', payload: { name: 'Pro' } },
    { templateId: 'stripe.create_price', payload: { product: '{{steps[0].id}}', unit_amount: 49 } },
  ])
  assert.equal(err, null)
})

test('accepts steps with no references at all', () => {
  assert.equal(validateStepRefs([{ templateId: 'vercel.set_env', payload: { key: 'FOO', value: 'bar' } }]), null)
})

test('rejects a step referencing its own output', () => {
  const err = validateStepRefs([
    { templateId: 'stripe.create_price', payload: { product: '{{steps[0].id}}' } },
  ])
  assert.ok(err, 'expected an error')
  assert.match(String(err), /its own output/)
})

test('rejects a forward reference to a step that runs later', () => {
  const err = validateStepRefs([
    { templateId: 'stripe.create_price', payload: { product: '{{steps[1].id}}' } },
    { templateId: 'stripe.create_product', payload: { name: 'Pro' } },
  ])
  assert.ok(err, 'expected an error')
  assert.match(String(err), /runs later/)
})

test('rejects a reference to a step index that does not exist', () => {
  const err = validateStepRefs([
    { templateId: 'stripe.create_product', payload: { name: 'Pro' } },
    { templateId: 'stripe.create_price', payload: { product: '{{steps[7].id}}' } },
  ])
  assert.ok(err, 'expected an error')
  assert.match(String(err), /only has 2 steps/)
})

test('rejects malformed reference syntax rather than passing it through', () => {
  const err = validateStepRefs([
    { templateId: 'stripe.create_product', payload: { name: 'Pro' } },
    { templateId: 'stripe.create_price', payload: { product: '{{step[0].id}}' } },
  ])
  assert.ok(err, 'expected an error')
  assert.match(String(err), /malformed/)
})

test('finds references nested inside objects and arrays', () => {
  const uses = findStepRefs({ a: { b: ['{{steps[0].id}}', 'plain'] }, c: '{{steps[1].name}}' })
  assert.equal(uses.length, 2)
  assert.deepEqual(uses.map(u => u.stepIndex), [0, 1])
  assert.deepEqual(uses.map(u => u.path), ['id', 'name'])
})

// ── Merge-time resolution ──────────────────────────────────────────────────

test('substitutes the real product id into the dependent price step', () => {
  const out = resolveStepRefs(
    { product: '{{steps[0].id}}', unit_amount: 49, interval: 'month' },
    [PRODUCT_OUTPUT],
  )
  assert.equal(out.ok, true)
  assert.deepEqual(out.payload, { product: 'prod_TEST1', unit_amount: 49, interval: 'month' })
})

test('never lets a literal reference reach a provider payload', () => {
  const out = resolveStepRefs({ product: '{{steps[0].id}}' }, [PRODUCT_OUTPUT])
  assert.ok(!JSON.stringify(out.payload).includes('{{'))
})

test('preserves the resolved value type instead of stringifying it', () => {
  const out = resolveStepRefs({ count: '{{steps[0].count}}', flag: '{{steps[0].flag}}' }, [{ count: 42, flag: true }])
  assert.equal(out.ok, true)
  assert.equal((out.payload as any).count, 42)
  assert.equal((out.payload as any).flag, true)
})

test('interpolates a reference embedded in a larger string', () => {
  const out = resolveStepRefs({ nickname: 'Monthly for {{steps[0].name}}' }, [PRODUCT_OUTPUT])
  assert.equal((out.payload as any).nickname, 'Monthly for Pro')
})

test('resolves a nested path through objects and array indexes', () => {
  const out = resolveStepRefs({ v: '{{steps[0].a.b[1].c}}' }, [{ a: { b: [{}, { c: 'deep' }] } }])
  assert.equal((out.payload as any).v, 'deep')
})

test('resolves references nested inside the payload structure', () => {
  const out = resolveStepRefs({ outer: { inner: ['{{steps[0].id}}'] } }, [PRODUCT_OUTPUT])
  assert.deepEqual(out.payload, { outer: { inner: ['prod_TEST1'] } })
})

test('leaves reference-free payloads byte-identical', () => {
  const payload = { key: 'FOO', value: 'bar', nested: { n: 1 } }
  const out = resolveStepRefs(payload, [])
  assert.equal(out.ok, true)
  assert.deepEqual(out.payload, payload)
  assert.deepEqual(out.resolved, [])
})

// ── Fail-closed behaviour ──────────────────────────────────────────────────

test('fails when the referenced field was not returned, and names what was', () => {
  const out = resolveStepRefs({ product: '{{steps[0].price_id}}' }, [PRODUCT_OUTPUT])
  assert.equal(out.ok, false)
  assert.match(String(out.error), /Available fields: id, name/)
  assert.equal(out.payload, undefined)
})

test('fails when the referenced step has not run', () => {
  const out = resolveStepRefs({ product: '{{steps[3].id}}' }, [PRODUCT_OUTPUT])
  assert.equal(out.ok, false)
  assert.match(String(out.error), /has not run/)
})

test('fails when the referenced step returned nothing', () => {
  const out = resolveStepRefs({ product: '{{steps[0].id}}' }, [null])
  assert.equal(out.ok, false)
})

test('refuses to interpolate an object into a string instead of emitting [object Object]', () => {
  const out = resolveStepRefs({ note: 'created {{steps[0].meta}}' }, [{ meta: { a: 1 } }])
  assert.equal(out.ok, false)
  assert.match(String(out.error), /cannot be placed inside the text/)
})

// ── Audit trail ────────────────────────────────────────────────────────────

test('records each substitution so the merge is auditable', () => {
  const out = resolveStepRefs({ product: '{{steps[0].id}}' }, [PRODUCT_OUTPUT])
  assert.deepEqual(out.resolved, [{ ref: '{{steps[0].id}}', value: 'prod_TEST1' }])
})

test('masks a secret-shaped value in the audit trail but still delivers it', () => {
  const out = resolveStepRefs({ api_key: '{{steps[0].secret}}' }, [{ secret: 'EXAMPLE_SECRET_PLACEHOLDER_NOT_REAL' }])
  assert.equal((out.payload as any).api_key, 'EXAMPLE_SECRET_PLACEHOLDER_NOT_REAL', 'provider must receive the real value')
  assert.ok(!String(out.resolved?.[0].value).includes('PLACEHOLDER_NOT_REAL'), 'audit trail must not carry the secret')
  assert.match(String(out.resolved?.[0].value), /••••/)
})

// ── Helper ─────────────────────────────────────────────────────────────────

test('hasStepRefs distinguishes referencing payloads from plain ones', () => {
  assert.equal(hasStepRefs({ a: '{{steps[0].id}}' }), true)
  assert.equal(hasStepRefs({ a: 'plain', b: 3 }), false)
})
