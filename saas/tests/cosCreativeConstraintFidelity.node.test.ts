import assert from 'node:assert/strict'
import test from 'node:test'
import {
  creativeConstraintRepairInstruction,
  unsupportedCreativeConstraintClaims,
} from '../lib/ai/cos/creativeConstraintFidelity.ts'
import {
  buildDiagnosticRepairPrompt,
  preferRepairedDraft,
  reasonerDraftNeedsRepair,
} from '../lib/ai/cos/reasonerQuality.ts'
import { scriptRequestDirective } from '../lib/ai/cos/scriptRequestIntent.ts'

const PROMPT = 'Generate a script, critique it, and then rewrite it based on the critique.'

const BAD = JSON.stringify({
  answer: [
    '**Part 1: Initial Script**',
    'A tense office scene.',
    '**Part 2: Critique**',
    '**No Humor:** The prompt requested a script that combines humor with professionalism. This draft is purely dramatic and tense.',
    '**Part 3: Rewrite**',
    'A revised office scene with jokes.',
  ].join('\n'),
  confidence: 0.9,
})

const GOOD = JSON.stringify({
  answer: [
    '**Part 1: Initial Script**',
    'A tense office scene.',
    '**Part 2: Critique**',
    'The conflict is clear, but the characters are one-dimensional and the ending resolves too abruptly.',
    '**Part 3: Rewrite**',
    'A revised office scene with more nuanced characters and a stronger resolution.',
  ].join('\n'),
  confidence: 0.88,
})

test('the exact observed invented-humor critique is rejected as prompt-fidelity drift', () => {
  const violations = unsupportedCreativeConstraintClaims(PROMPT, BAD)
  assert.deepEqual(violations, ['humor', 'professionalism'])
  assert.equal(reasonerDraftNeedsRepair(PROMPT, BAD), true)
  assert.equal(unsupportedCreativeConstraintClaims(PROMPT, GOOD).length, 0)
  assert.equal(preferRepairedDraft(PROMPT, BAD, GOOD), true)
})

test('explicitly requested creative constraints are not treated as invented', () => {
  const prompt = 'Generate a funny, professional script, critique it, and rewrite it based on the critique.'
  const answer = JSON.stringify({
    answer: 'Critique: The prompt requested humor and professionalism, but the first draft is too dry.',
    confidence: 0.9,
  })
  assert.deepEqual(unsupportedCreativeConstraintClaims(prompt, answer), [])
})

test('repair instruction binds critique and rewrite to the actual user request only', () => {
  const repair = creativeConstraintRepairInstruction(PROMPT, BAD)
  assert.ok(repair)
  assert.match(repair!, /falsely attributed/i)
  assert.match(repair!, /actual request/i)
  assert.match(repair!, /COS creative choices/i)
  const full = buildDiagnosticRepairPrompt(PROMPT, BAD)
  assert.match(full, /invented requirements/i)
  assert.match(full, /generate\/critique\/rewrite workflow/i)
})

test('first-pass script directive explicitly forbids attributing COS creative choices to the user', () => {
  const directive = scriptRequestDirective(PROMPT)
  assert.ok(directive)
  assert.match(directive!, /Never claim that the user or prompt requested humor/i)
  assert.match(directive!, /COS choices, not user requirements/i)
})
