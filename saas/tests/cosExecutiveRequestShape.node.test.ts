import assert from 'node:assert/strict'
import test from 'node:test'
import { executiveDecisionDirective } from '../lib/ai/cos/scriptRequestIntent.ts'

const ARCHITECT_PROMPT = `Your Principal Architect is the single point of failure for the entire core legacy routing engine—no other engineer understands the codebase. However, two senior engineers and an engineering manager have credibly reported this architect for persistent harassment, retaliatory code reviews, and creating a hostile work environment. The VP of Engineering suggests 'managing around them' because a major system migration is scheduled in 60 days. Outline the operational and governance roadmap you present to the CEO.`

test('an executive roadmap request without a listed verb receives the directive', () => {
  const directive = executiveDecisionDirective(ARCHITECT_PROMPT)
  assert.ok(directive)
  assert.match(directive, /EXECUTIVE DECISION MODE/)
  assert.match(directive, /Separate known facts from hypotheses/i)
})

test('named executive deliverables work with unlisted verbs', () => {
  for (const verb of ['Outline', 'Sketch', 'Walk me through', 'Give me']) {
    const prompt = `${verb} the roadmap the CEO should take to the board after the acquisition closes, given that two of the three department leads have already threatened to leave and the migration deadline cannot move without breaching a customer commitment.`
    assert.ok(executiveDecisionDirective(prompt), verb)
  }
})

test('ordinary questions and narration remain outside executive mode', () => {
  assert.equal(executiveDecisionDirective('Explain how DNS recursion works.'), null)
  assert.equal(executiveDecisionDirective('What time is the CEO meeting?'), null)
  assert.equal(executiveDecisionDirective('The board was informed that we plan to keep operating expenses flat through the next two quarters.'), null)
})