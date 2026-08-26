// saas/tests/calcExpressions.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  evaluateExpression,
  formatComputed,
  resolveCalcMarkers,
  hasCalcMarker,
  collapseDuplicatedComputedValues,
} from '../lib/ai/cos/calcExpressions.ts'

test('the calculations this model got wrong five times now come out right', () => {
  // Every one of these appeared, wrong, in a production answer during 2026-08-26 testing.
  const cases: Array<[string, number]> = [
    ['64 * 10.2', 652.8],          // 512 H100s at node level — answered 358kW, 1.8MW, 83.2kW, "1-2MW"
    ['512 * 0.7', 358.4],          // GPU silicon only
    ['512 / 8', 64],               // nodes
    ['653 * 0.08', 52.24],         // hourly saving at the correct power figure
    ['12000 * 0.04', 480],         // egress for a 12 TB checkpoint
    ['480 / 89.6', 5.357142857142857],
    ['70 * 2 + 70 * 4 * 3', 980],  // 70B checkpoint decomposition in GB
    ['4.2e12 * 8 / 86400', 388888888.8888889], // TB/day -> bits/sec, answered 488 Mbps
  ]
  for (const [expression, expected] of cases) {
    const result = evaluateExpression(expression)
    assert.ok(result.ok, `${expression}: ${result.ok ? '' : result.error}`)
    assert.ok(Math.abs(result.value - expected) < 1e-6, `${expression} = ${result.ok && result.value}`)
  }
})

test('operator precedence and associativity are correct', () => {
  const expect = (src: string, value: number) => {
    const r = evaluateExpression(src)
    assert.ok(r.ok, src)
    assert.equal(r.value, value)
  }
  expect('2 + 3 * 4', 14)
  expect('(2 + 3) * 4', 20)
  expect('2 ^ 3 ^ 2', 512)        // right-associative
  expect('-2 ^ 2', -4)            // unary binds looser than power
  expect('10 - 3 - 2', 5)         // left-associative
  expect('100 / 10 / 2', 5)
  expect('10 % 3', 1)
})

test('the notation a model actually writes is accepted', () => {
  for (const [src, value] of [['700 x 8', 5600], ['700 \u00d7 8', 5600], ['10 \u00f7 4', 2.5], ['1,024 * 10', 10240]] as const) {
    const r = evaluateExpression(src)
    assert.ok(r.ok, src)
    assert.equal(r.value, value)
  }
})

test('malformed input fails safely instead of throwing', () => {
  for (const src of ['', '   ', '2 +', 'abc', '1/0', '(1+2', '1+2)', '$500 * 2', '1 ; 2', 'x'.repeat(300)]) {
    const result = evaluateExpression(src)
    assert.equal(result.ok, false, src)
    assert.ok(typeof (result as { error: string }).error === 'string')
  }
})

test('no dynamic evaluation is reachable — the grammar is parsed, not executed', () => {
  const source = readFileSync('lib/ai/cos/calcExpressions.ts', 'utf8')
  assert.ok(!/\beval\s*\(/.test(source), 'must not call eval')
  assert.ok(!/new\s+Function/.test(source), 'must not construct a Function')
  // And an injection attempt is simply a parse error.
  assert.equal(evaluateExpression('process.exit(1)').ok, false)
  assert.equal(evaluateExpression('require("fs")').ok, false)
  assert.equal(evaluateExpression('1;console.log(1)').ok, false)
})

test('depth and length are bounded', () => {
  assert.equal(evaluateExpression('('.repeat(40) + '1' + ')'.repeat(40)).ok, false)
  assert.equal(evaluateExpression('1+'.repeat(150) + '1').ok, false)
})

test('formatting avoids false precision and floating-point noise', () => {
  assert.equal(formatComputed(652.8), '652.8')
  assert.equal(formatComputed(1024), '1,024')
  assert.equal(formatComputed(0.1 + 0.2), '0.3')          // not 0.30000000000000004
  assert.equal(formatComputed(5.357142857142857), '5.35714')
  assert.ok(/e[+-]/.test(formatComputed(1.5e15)))
})

test('markers are replaced with computed values', () => {
  const out = resolveCalcMarkers('The cluster draws [[calc: 64 * 10.2]] kW, saving [[calc: 653 * 0.08]] per hour.')
  assert.equal(out.text, 'The cluster draws 652.8 kW, saving 52.24 per hour.')
  assert.equal(out.evaluated, 2)
  assert.deepEqual(out.failed, [])
})

test('an unevaluable marker degrades to the bare expression, never to raw syntax', () => {
  const out = resolveCalcMarkers('Result: [[calc: 2 +]] units.')
  assert.equal(out.text, 'Result: 2 + units.')
  assert.equal(out.failed.length, 1)
  assert.ok(!hasCalcMarker(out.text), 'marker syntax must never survive to the reader')
})

test('text without markers is returned untouched', () => {
  const text = 'No arithmetic here at all.'
  const out = resolveCalcMarkers(text)
  assert.equal(out.text, text)
  assert.equal(out.evaluated, 0)
})

test('empty and junk input is safe', () => {
  assert.equal(resolveCalcMarkers('').text, '')
  assert.equal(resolveCalcMarkers(undefined as unknown as string).text, '')
  assert.equal(hasCalcMarker(''), false)
})

test('both answer paths resolve markers before anything else sees the text', () => {
  for (const path of ['lib/ai/cos/cosFirstAnswer.ts', 'lib/ai/cos/cosFirstAnswerEnterprise.ts']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /import \{ resolveCalcMarkers \}/, path)
    assert.match(source, /withComputedArithmetic\(parseLocalResult\(reasoned\.text\)\)/, path)
  }
})

test('the reasoner is instructed to emit markers rather than compute', () => {
  const policy = readFileSync('lib/ai/cos/cosAnswerPolicyCore.ts', 'utf8')
  assert.match(policy, /DO NOT COMPUTE ARITHMETIC YOURSELF/)
  assert.match(policy, /\[\[calc: expression\]\]/)
  assert.match(policy, /never write a computed figure outside one/)
})

// ---------------------------------------------------------------------------------------------
// The model writes the marker AND its own answer (2026-08-26).
// ---------------------------------------------------------------------------------------------

test('a duplicated computed value is collapsed, keeping the unit or currency', () => {
  // Observed three times in one production answer: "Egress Cost = 20 = $20."
  assert.equal(resolveCalcMarkers('Egress Cost = [[calc: 1000 * 0.02]] = $20.').text, 'Egress Cost = $20.')
  assert.equal(resolveCalcMarkers('Hourly Savings = [[calc: 1000 * 0.08]] = $80/hour.').text, 'Hourly Savings = $80/hour.')
  assert.equal(resolveCalcMarkers('Break-even Time = [[calc: 20 / 80]] = 0.25 hours.').text, 'Break-even Time = 0.25 hours.')
})

test('a DISAGREEMENT between server and model is never hidden', () => {
  // The whole purpose of the calculator is to expose this. Collapsing it would defeat the point.
  const out = resolveCalcMarkers('Total = [[calc: 64 * 10.2]] = 700 kW.').text
  assert.match(out, /652\.8/)
  assert.match(out, /700/)
})

test('collapsing never touches text that had no marker', () => {
  const prose = 'The ratio 20 = 20 appears here with no calculation at all.'
  assert.equal(resolveCalcMarkers(prose).text, prose)
  // The helper is only applied when a marker was actually resolved.
  assert.equal(collapseDuplicatedComputedValues(prose), 'The ratio 20 appears here with no calculation at all.')
})

test('thousands separators do not defeat the equality check', () => {
  assert.equal(resolveCalcMarkers('Nodes = [[calc: 1024 * 10]] = 10,240 units.').text, 'Nodes = 10,240 units.')
})
