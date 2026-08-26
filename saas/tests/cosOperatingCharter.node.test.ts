// saas/tests/cosOperatingCharter.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COS_OPERATING_CHARTER, cosOperatingCharterText } from '../lib/ai/cos/cosOperatingCharter.ts'

test('both reasoner prompts carry the charter', () => {
  // Same guarantee as the answer policy: one disposition, both channels, no drift.
  for (const path of ['lib/ai/cos/cosFirstAnswer.ts', 'lib/ai/cos/cosFirstAnswerEnterprise.ts']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /import \{ COS_OPERATING_CHARTER \}/, path)
    assert.match(source, /\.\.\.COS_OPERATING_CHARTER,/, path)
  }
})

test('the charter sits with the answer policy, not somewhere else in the file', () => {
  for (const path of ['lib/ai/cos/cosFirstAnswer.ts', 'lib/ai/cos/cosFirstAnswerEnterprise.ts']) {
    const source = readFileSync(path, 'utf8')
    const policyAt = source.indexOf('...QUANTITATIVE_ANSWER_POLICY,')
    const charterAt = source.indexOf('...COS_OPERATING_CHARTER,')
    assert.ok(policyAt > 0 && charterAt > 0, path)
    assert.ok(charterAt - policyAt < 200, `${path}: charter must be adjacent to the policy`)
  }
})

test('the priority order is stated as an order, not a list', () => {
  const text = cosOperatingCharterText()
  const safety = text.indexOf('safety')
  const accuracy = text.indexOf('accuracy')
  const autonomy = text.indexOf('autonomy')
  const speed = text.indexOf('speed')
  const cost = text.indexOf('cost')
  const convenience = text.indexOf('convenience')
  assert.ok(safety > 0 && safety < accuracy, 'safety before accuracy')
  assert.ok(accuracy < autonomy, 'accuracy before autonomy')
  assert.ok(autonomy < speed, 'autonomy before speed')
  assert.ok(speed < cost, 'speed before cost')
  assert.ok(cost < convenience, 'cost before convenience')
  assert.match(text, /when two of these conflict/i)
})

test('decision rights name the high-impact actions that require approval', () => {
  const text = cosOperatingCharterText()
  for (const action of [
    /external communications/i,
    /spending money/i,
    /production systems/i,
    /deleting data/i,
  ]) {
    assert.match(text, action)
  }
  assert.match(text, /routine, reversible/i)
})

test('the charter preserves willingness to disagree', () => {
  // The single line most easily lost to a well-meaning edit. Losing it makes COS agreeable
  // rather than useful, which is the opposite of what the charter is for.
  const text = cosOperatingCharterText()
  assert.match(text, /Disagree when you have grounds/i)
  assert.match(text, /Agreeing with something you believe is wrong is a failure/i)
})

test('the charter carries no quantitative rules and no domain constants', () => {
  // Three concerns, three places: disposition here, quantitative rules in cosAnswerPolicyCore,
  // domain facts in the learned corpus. Mixing them makes all three harder to change.
  const text = cosOperatingCharterText()
  assert.ok(!/decomposition|dimensional|bytes per|0\.0698|80%|invert the problem/i.test(text))
})

test('the charter names no model, vendor or internal component', () => {
  // It ships inside a prompt used on the public surface.
  const text = cosOperatingCharterText()
  assert.ok(!/qwen|deepinfra|supabase|vercel|openai|anthropic|google/i.test(text))
  assert.ok(!/enterprise memory|learned corpus|release gate|confidence threshold/i.test(text))
})

test('the charter is a non-empty array of strings', () => {
  assert.ok(Array.isArray(COS_OPERATING_CHARTER))
  assert.ok(COS_OPERATING_CHARTER.length >= 15)
  for (const line of COS_OPERATING_CHARTER) assert.equal(typeof line, 'string')
})

// ---------------------------------------------------------------------------------------------
// Policies 5, 12, 14 and 18 (2026-08-26).
// ---------------------------------------------------------------------------------------------

test('completion means the whole cycle, and unverified is not finished', () => {
  const text = cosOperatingCharterText()
  for (const stage of [/implement/i, /test/i, /deploy/i, /verify/i, /record what changed/i]) {
    assert.match(text, stage)
  }
  // The line that makes it enforceable rather than aspirational.
  assert.match(text, /not verified is not finished/i)
  assert.match(text, /false report/i)
})

test('conflicting sources are ranked, and the choice is stated', () => {
  const text = cosOperatingCharterText()
  assert.match(text, /primary source over a report of it/i)
  assert.match(text, /stronger evidence over weaker/i)
  assert.match(text, /Say which source you preferred/i)
  // A blended answer hides which source won, which is the failure being prevented.
  assert.match(text, /belongs to neither/i)
})

test('documentation and production are both evidence, neither authoritative by default', () => {
  const text = cosOperatingCharterText()
  assert.match(text, /neither overrides the other by default/i)
  assert.match(text, /documentation may be stale, or the system may have drifted/i)
})

test('verified and assumed are kept distinct', () => {
  assert.match(cosOperatingCharterText(), /Distinguish what you verified from what you assumed/i)
})

test('the mission states both halves — automate work, not judgement', () => {
  const text = cosOperatingCharterText()
  assert.match(text, /Automate as much human work as can be automated safely/i)
  // Without the second half this reads as a mandate to take over decisions.
  assert.match(text, /every consequential decision you take away from them is the job failing/i)
})

test('the charter still separates its concerns after extension', () => {
  const text = cosOperatingCharterText()
  assert.ok(!/decomposition|dimensional|bytes per|0\.0698|invert the problem/i.test(text))
  assert.ok(!/qwen|deepinfra|supabase|vercel|openai|anthropic|google/i.test(text))
  assert.ok(!/enterprise memory|learned corpus|release gate|confidence threshold/i.test(text))
})

test('sections are ordered so disposition precedes decision rights', () => {
  const headers = COS_OPERATING_CHARTER.filter(line => line.endsWith(':'))
  assert.deepEqual(headers, [
    'HOW YOU OPERATE:',
    'HANDLING EVIDENCE:',
    'DECISION RIGHTS:',
    'HOW YOU COMMUNICATE:',
    'WHAT YOU ARE FOR:',
  ])
})
