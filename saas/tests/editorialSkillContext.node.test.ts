// saas/tests/editorialSkillContext.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_EDITORIAL_SKILL_CONTEXT,
  editorialSkillBlock,
  editorialSkillQuery,
  stripEditorialSkillLabels,
} from '../lib/ai/cos/editorialSkillContext.ts'

test('the retrieval query carries the draft, not just the boilerplate instruction', () => {
  const instruction = 'Edit this pasted draft for grammar, spelling, clarity, flow, and professional tone.'
  const draft = 'Hi JC, It was nice to talk to you after all these years.'
  const query = editorialSkillQuery(instruction, draft)
  assert.ok(query.includes('JC'))
  assert.ok(query.includes('clarity'))
  assert.ok(query.length <= 4000)
})

test('the query is bounded and tolerates empty input', () => {
  assert.equal(editorialSkillQuery('', ''), '')
  assert.ok(editorialSkillQuery('edit', 'x'.repeat(9000)).length <= 4000)
})

test('an empty skill set produces no block, so the prompt is unchanged', () => {
  assert.equal(editorialSkillBlock([]), '')
  assert.equal(EMPTY_EDITORIAL_SKILL_CONTEXT.block, '')
  assert.equal(EMPTY_EDITORIAL_SKILL_CONTEXT.selected, 0)
})

test('the block forbids citing skills in the deliverable', () => {
  const block = editorialSkillBlock(['[SK1] [skill_key=email_warmth] Keep the sender voice — ...'])
  assert.match(block, /HOW TO DO THIS EDIT/i)
  assert.match(block, /NEVER write \[SK1\]/i)
  assert.match(block, /skill_key/)
})

test('leaked skill labels are stripped from the finished draft', () => {
  const leaked = 'Hi JC, [SK2] thanks for your time. [skill_key=email_warmth]'
  const cleaned = stripEditorialSkillLabels(leaked)
  assert.ok(!cleaned.includes('[SK2]'))
  assert.ok(!cleaned.includes('skill_key'))
  assert.ok(cleaned.startsWith('Hi JC,'))
  assert.ok(cleaned.includes('thanks for your time.'))
})

test('a clean draft is returned byte-identical — no incidental reflow', () => {
  const clean = 'Hi JC,\n\nThanks for your time.\n\nThank you'
  assert.equal(stripEditorialSkillLabels(clean), clean)
})

test('ordinary bracketed text the writer wrote is preserved', () => {
  const draft = 'Hi JC, see [the attached form] and [www.example.com](https://www.example.com).'
  assert.equal(stripEditorialSkillLabels(draft), draft)
})
