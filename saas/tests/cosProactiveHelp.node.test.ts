import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_REASONER_SYSTEM_PROMPT } from '../lib/ai/cos/cosFirstAnswerEnterprise.ts'

test('COS policy supports progressive proactive help without automatic extra work', () => {
  const prompt = COS_REASONER_SYSTEM_PROMPT('English')
  assert.match(prompt, /PROGRESSIVE PROACTIVE HELP/)
  assert.match(prompt, /no fixed lifetime cap/i)
  assert.match(prompt, /Do not perform the extra work, research, or consequential action until the user asks/i)
})
