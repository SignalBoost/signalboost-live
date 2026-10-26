// saas/tests/cosAnswerCompletionLoop.node.test.ts
// The COS answer loop: check the answer against the whole request, write only what is missing, repeat at most three
// rounds while time remains, and stop on no progress. Production 2026-10-25/26: an 8-part incident analysis came back
// with parts missing, and nothing went around again to finish it before release.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ANSWER_COMPLETION_MAX_ROUNDS,
  ANSWER_COMPLETION_ROUND_RESERVE_MS,
  parseAnswerCompletionCheck,
  runAnswerCompletionLoop,
} from '../lib/ai/cos/answerCompletionLoop.ts'

const plenty = () => 120_000

test('a complete answer is released as written, after one check', async () => {
  let checks = 0, completions = 0
  const result = await runAnswerCompletionLoop({
    request: 'Explain TCP slow start.', answer: 'Slow start doubles the window each RTT until ssthresh.',
    ports: { remainingMs: plenty, check: async () => { checks++; return [] }, complete: async () => { completions++; return 'x' } },
  })
  assert.deepEqual({ stopped: result.stopped, rounds: result.rounds, checks, completions }, { stopped: 'complete', rounds: 0, checks: 1, completions: 0 })
  assert.equal(result.answer, 'Slow start doubles the window each RTT until ssthresh.')
})

test('missing parts are written and appended until the check passes; nothing already written is lost', async () => {
  const missingByRound = [['ranked hypotheses', 'experiments'], ['experiments'], []]
  let round = 0
  const result = await runAnswerCompletionLoop({
    request: 'Analyze the outage: causes, ranked hypotheses, experiments.', answer: 'Causes: a, b, c.',
    ports: {
      remainingMs: plenty,
      check: async () => missingByRound[round],
      complete: async (_request, _answer, missing) => { round++; return `Section for: ${missing.join(', ')}` },
    },
  })
  assert.equal(result.stopped, 'complete')
  assert.equal(result.rounds, 2)
  assert.ok(result.answer.startsWith('Causes: a, b, c.'))
  assert.match(result.answer, /Section for: ranked hypotheses, experiments/)
  assert.match(result.answer, /Section for: experiments$/)
})

test('a round that makes no progress stops the loop instead of paying for another', async () => {
  let completions = 0
  const result = await runAnswerCompletionLoop({
    request: 'r', answer: 'a',
    ports: { remainingMs: plenty, check: async () => ['part 2', 'part 3'], complete: async () => { completions++; return 'more text' } },
  })
  assert.equal(result.stopped, 'no_progress')
  assert.equal(completions, 1)
  assert.deepEqual(result.missing, ['part 2', 'part 3'])
})

test('the loop never runs more than three completion rounds', async () => {
  let completions = 0, left = 10
  const result = await runAnswerCompletionLoop({
    request: 'r', answer: 'a',
    ports: { remainingMs: plenty, check: async () => Array.from({ length: left }, (_, i) => `item ${i}`), complete: async () => { completions++; left--; return 'part' } },
  })
  assert.equal(ANSWER_COMPLETION_MAX_ROUNDS, 3)
  assert.equal(completions, 3)
  assert.equal(result.stopped, 'max_rounds')
})

test('without time for a check and a completion the answer is released as it is', async () => {
  let calls = 0
  const result = await runAnswerCompletionLoop({
    request: 'r', answer: 'a',
    ports: { remainingMs: () => ANSWER_COMPLETION_ROUND_RESERVE_MS - 1, check: async () => { calls++; return ['x'] }, complete: async () => { calls++; return 'y' } },
  })
  assert.deepEqual({ stopped: result.stopped, calls, answer: result.answer }, { stopped: 'budget', calls: 0, answer: 'a' })
})

test('a checker that cannot answer is never read as "complete"; numbered deliverables are still checked', async () => {
  const unavailable = await runAnswerCompletionLoop({
    request: 'r', answer: 'a',
    ports: { remainingMs: plenty, check: async () => null, complete: async () => 'never' },
  })
  assert.equal(unavailable.stopped, 'checker_unavailable')
  let written = ''
  const floor = await runAnswerCompletionLoop({
    request: 'r', answer: 'a',
    deterministicMissing: answer => answer.includes('2.') ? [] : ['2. Rank hypotheses'],
    ports: { remainingMs: plenty, check: async () => null, complete: async () => { written = '2. Ranked: …'; return written } },
  })
  // The numbered deliverable was written; with no checker the loop still does not claim the answer complete.
  assert.equal(floor.rounds, 1)
  assert.equal(floor.stopped, 'checker_unavailable')
  assert.match(floor.answer, /2\. Ranked/)
})

test('the checker reply must be the agreed JSON', () => {
  assert.deepEqual(parseAnswerCompletionCheck('{"missing":["experiments"]}'), ['experiments'])
  assert.deepEqual(parseAnswerCompletionCheck('Sure! {"missing":[]}'), [])
  assert.equal(parseAnswerCompletionCheck('Looks complete to me.'), null)
  assert.equal(parseAnswerCompletionCheck('{"complete":true}'), null)
})

test('the reasoner runs the loop only for the answer the person reads, and never on a cut-off draft', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /const loopDraft = args\.writesUserAnswer === true \? parseLocalResult\(text\) : null\s*\n\s*if \(loopDraft && !loopDraft\.truncated\)/)
  assert.match(reasoner, /deterministicMissing: answer => missingAnalyticalTasks\(args\.prompt, answer\)/)
  // The loop runs before the release gates, so they judge the completed answer.
  assert.ok(reasoner.indexOf("recorder.time('answer_completion_loop'") < reasoner.indexOf('const finalParsedForPolicy = parseLocalResult(text)'))
  // The check itself is a helper call, not an answer: it never gets the answer window.
  assert.match(reasoner, /writesUserAnswer: false,\s*\n\s*temperature: 0,\s*\n\s*maxTokens: 400,/)
})
