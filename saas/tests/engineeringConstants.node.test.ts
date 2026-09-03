// saas/tests/engineeringConstants.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ENGINEERING_CONSTANTS, engineeringConstantsText } from '../lib/ai/cos/engineeringConstants.ts'

test('both reasoner prompts carry the shared policy that pins the constants', () => {
  const policy = readFileSync('lib/ai/cos/cosAnswerPolicyCore.ts', 'utf8')
  assert.match(policy, /import \{ ENGINEERING_CONSTANTS \}/)
  assert.match(policy, /\.\.\.ENGINEERING_CONSTANTS,/)
  for (const path of ['lib/ai/cos/cosFirstAnswerCore.ts', 'lib/ai/cos/cosFirstAnswerEnterprise.ts']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /import \{ QUANTITATIVE_ANSWER_POLICY \}/, path)
    assert.match(source, /\.\.\.QUANTITATIVE_ANSWER_POLICY,/, path)
  }
})

test('the figure that was wrong five times is stated outright', () => {
  const text = engineeringConstantsText()
  assert.match(text, /10\.2 kW at the wall/)
  assert.match(text, /512 H100s = 64 nodes = ~653 kW/)
  assert.match(text, /use the NODE figure/i)
})

test('the training-state constants cover the decomposition errors', () => {
  const text = engineeringConstantsText()
  assert.match(text, /Adam moments m and v are FP32/)
  assert.match(text, /~14 bytes\/parameter/)
  assert.match(text, /70B checkpoint is ~980 GB/)
})

test('the unit rules cover the conversion errors', () => {
  const text = engineeringConstantsText()
  assert.match(text, /DECIMAL units/)
  assert.match(text, /network is bits: multiply by 8/)
  assert.match(text, /730 hours/)
})

test('the physics floors that eliminate impossible answers are present', () => {
  const text = engineeringConstantsText()
  assert.match(text, /5 us per km/)
  assert.match(text, /35-45 ms round trip/)
  assert.match(text, /0\.0698/)
  assert.match(text, /80% of breaker rating/)
  assert.match(text, /1\/\(1 - utilisation\)/)
})

test('a request-stated figure still takes precedence', () => {
  assert.match(engineeringConstantsText(), /Prefer a figure stated in the request/)
})

test('the block stays small enough to sit in every prompt', () => {
  const text = engineeringConstantsText()
  assert.ok(text.length < 3200, `constants block is ${text.length} chars`)
  assert.ok(ENGINEERING_CONSTANTS.length < 45)
})

test('no situational or vendor-priced figures are pinned', () => {
  const text = engineeringConstantsText()
  assert.ok(!/\$0\.\d+\s*\/\s*GB/i.test(text), 'no egress price may be pinned')
  assert.ok(!/per GB for egress/i.test(text))
})
