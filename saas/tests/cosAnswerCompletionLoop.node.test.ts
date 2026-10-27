// saas/tests/cosAnswerCompletionLoop.node.test.ts
// The COS answer loop: check the answer against the whole request, write only what is missing, repeat at most three
// rounds while time remains, and stop on no progress. Production 2026-10-25/26: an 8-part incident analysis came back
// with parts missing, and nothing went around again to finish it before release.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

test('without enough repair time the checker still runs but completion is withheld', async () => {
  let calls = 0
  const result = await runAnswerCompletionLoop({
    request: 'r', answer: 'a',
    ports: { remainingMs: () => ANSWER_COMPLETION_ROUND_RESERVE_MS - 1, check: async () => { calls++; return ['x'] }, complete: async () => { calls++; return 'y' } },
  })
  assert.deepEqual({ stopped: result.stopped, calls, answer: result.answer }, { stopped: 'budget', calls: 1, answer: 'a' })
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

test('trusted host verifier must pass before the COS loop declares completion', async () => {
  let validations = 0
  let repairs = 0
  const receipts: Array<{ round: number; passed: boolean; failures: readonly string[] }> = []
  const result = await runAnswerCompletionLoop({
    request: 'Repair and validate the existing module',
    answer: 'initial implementation',
    ports: {
      remainingMs: plenty,
      check: async () => [],
      verify: async (_request, answer) => {
        validations++
        return answer.includes('verified correction')
          ? { passed: true, failures: [] }
          : { passed: false, failures: ['targeted_test_failed'] }
      },
      persistVerification: async receipt => { receipts.push(receipt) },
      complete: async () => { repairs++; return 'verified correction' },
    },
  })
  assert.equal(result.stopped, 'complete')
  assert.equal(result.rounds, 1)
  assert.equal(validations, 2)
  assert.equal(repairs, 1)
  assert.deepEqual(receipts.map(receipt => receipt.passed), [false, true])
})

test('unavailable trusted verifier fails closed without claiming completion', async () => {
  const result = await runAnswerCompletionLoop({
    request: 'Validate the schema',
    answer: 'draft',
    ports: {
      remainingMs: plenty,
      check: async () => [],
      verify: async () => null,
      complete: async () => null,
    },
  })
  assert.notEqual(result.stopped, 'complete')
  assert.deepEqual(result.missing, ['trusted_verifier_unavailable'])
})

test('verification receipt persistence failure cannot be reported as a pass', async () => {
  const result = await runAnswerCompletionLoop({
    request: 'Verify deployment',
    answer: 'draft',
    ports: {
      remainingMs: plenty,
      check: async () => [],
      verify: async () => ({ passed: true, failures: [] }),
      persistVerification: async () => { throw new Error('durable store unavailable') },
      complete: async () => 'unused',
    },
  })
  assert.equal(result.stopped, 'checker_unavailable')
  assert.deepEqual(result.missing, ['verification_receipt_persistence_failed'])
})

test('host validation cannot exceed the built-in three correction rounds', async () => {
  let writes = 0
  const result = await runAnswerCompletionLoop({
    request: 'Fix failing tests',
    answer: 'initial code',
    ports: {
      remainingMs: plenty,
      check: async () => [],
      verify: async () => ({ passed: false, failures: ['tests_still_fail'] }),
      complete: async () => { writes++; return 'attempt' + writes },
    },
    maxRounds: 100,
  })
  assert.equal(writes, 1)
  assert.equal(result.stopped, 'no_progress')
  assert.ok(result.rounds <= ANSWER_COMPLETION_MAX_ROUNDS)
})

test('COS reasoner blocks release when completion verification is incomplete', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(!completion \|\| completion\.stopped !== 'complete'\)/)
  const guard = source.indexOf("if (!completion || completion.stopped !== 'complete')")
  assert.ok(guard > 0 && guard < source.indexOf('const finalParsedForPolicy = parseLocalResult(text)'))
})


test('verification can pass when time remains for a check but not a repair round', async () => {
  const receipts: boolean[] = []
  let repaired = false
  const result = await runAnswerCompletionLoop({request:'Explain a verified fact',answer:'Grounded explanation',ports:{remainingMs:()=>10_000,check:async()=>[],verify:async()=>({passed:true,failures:[]}),persistVerification:async receipt=>{receipts.push(receipt.passed)},complete:async()=>{repaired=true;return null}}})
  assert.equal(result.stopped,'complete')
  assert.deepEqual(receipts,[true])
  assert.equal(repaired,false)
})

test('insufficient repair time still reports missing work', async () => {
  let checked=false
  const result=await runAnswerCompletionLoop({request:'Supply three findings',answer:'One finding',ports:{remainingMs:()=>10_000,check:async()=>{checked=true;return ['two missing']},complete:async()=>{throw Error('repair must not run')}}})
  assert.equal(checked,true)
  assert.equal(result.stopped,'budget')
  assert.deepEqual(result.missing,['two missing'])
})

test('COS reasoner retains complete draft only on optional budget exhaustion, never on audit failure', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/cosReasoner.ts'), 'utf8')
  assert.match(source, /completion\?\.stopped === 'budget'/)
  assert.match(source, /remaining\.length === 0 && qualityDefects\.length === 0/)
  assert.match(source, /releasableAnalyticalAnswer\(effectiveArgs\.prompt, candidate\)/)
  assert.match(source, /if \(!safeToRelease\) return null/)
})

test('unavailable model checker releases only after independently passed and persisted host verification', async () => {
  const receipts: {passed:boolean;failures:readonly string[]}[] = []
  const result = await runAnswerCompletionLoop({
    request: 'forensic analysis', answer: 'complete forensic answer',
    ports: {
      remainingMs: () => 10000,
      check: async () => null,
      complete: async () => { throw new Error('no model repair allowed') },
      verify: async () => ({ passed: true, failures: [] }),
      persistVerification: async receipt => { receipts.push(receipt) },
    },
  })
  assert.equal(result.stopped, 'complete')
  assert.equal(result.answer, 'complete forensic answer')
  assert.equal(receipts.length, 1)
  assert.equal(receipts[0]?.passed, true)
})

test('unavailable checker never bypasses failed host verdict or failed audit persistence', async () => {
  const base = { remainingMs: () => 10000, check: async () => null, complete: async () => 'ignored' }
  const rejected = await runAnswerCompletionLoop({
    request: 'incident', answer: 'incomplete',
    ports: { ...base, verify: async () => ({ passed: false, failures: ['missing experiments'] }),
      persistVerification: async () => {} },
  })
  assert.equal(rejected.stopped, 'checker_unavailable')
  assert.deepEqual(rejected.missing, ['missing experiments'])
  const failedAudit = await runAnswerCompletionLoop({
    request: 'incident', answer: 'complete',
    ports: { ...base, verify: async () => ({ passed: true, failures: [] }),
      persistVerification: async () => { throw new Error('db failed') } },
  })
  assert.equal(failedAudit.stopped, 'checker_unavailable')
  assert.deepEqual(failedAudit.missing, ['verification_receipt_persistence_failed'])
})
