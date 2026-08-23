import assert from 'node:assert/strict'
import test from 'node:test'
import { MEMORY_LAYER_COMPARISON_GUARDRAIL } from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'

test('MAU discrepancy guidance avoids unsupported investor-story assumptions', () => {
  const prompt = "The Product analytics dashboard reports monthly Active Users (MAU) as 250,000 based on 'any authenticated session.' The Finance board deck defines MAU as 'users who completed at least one billable core event,' resulting in 82,000 MAU. You are preparing the quarterly investor update. How do you resolve this discrepancy and present the data without misleading stakeholders?"
  assert.match(prompt, /250,000/)
  assert.match(prompt, /82,000/)
  const rule = MEMORY_LAYER_COMPARISON_GUARDRAIL
  assert.match(rule, /preserve the literal definitions and values/i)
  assert.match(rule, /governance source has reporting authority/i)
  assert.match(rule, /conversion rate unless the numerator is established as a subset/i)
})
