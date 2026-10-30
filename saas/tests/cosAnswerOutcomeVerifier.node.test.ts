// saas/tests/cosAnswerOutcomeVerifier.node.test.ts
// The one outcome verifier for answers (answerOutcomeVerifier.ts): a separate judge call names each requested
// deliverable and quotes the passage that delivers it; the host accepts a deliverable only when that quote is really in
// the answer. COS releases answers with it and the verification campaign grades with it. Gap analysis Q10: an answer
// whose sections are short but complete is released; an answer missing one requested deliverable is not.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerOutcomeReleasable, parseAnswerOutcome, verifyAnswerOutcome, type AnswerOutcomeJudge } from '../lib/ai/cos/answerOutcomeVerifier.ts'
import { unavailableOutcomeJudge } from './helpers/answerOutcomeJudgeStub.ts'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const request = '1. Identify the root cause.\n2. Rank the alternative hypotheses.\n3. Design one decisive experiment.'
const judgeSays = (deliverables: unknown[]): AnswerOutcomeJudge => async () => JSON.stringify({ deliverables })

test('short but complete sections are verified and released; the old length rule would have withheld them', async () => {
  const answer = '1. Root cause: the new parser version materialises every file in memory.\n2. Ranking: parser first, noisy neighbour second, input shape third.\n3. Experiment: rerun one job with the old parser pinned and compare the timings.'
  const outcome = await verifyAnswerOutcome({ request, answer, judge: judgeSays([
    { item: 'root cause', delivered: true, quote: 'the new parser version materialises every file in memory' },
    { item: 'ranked hypotheses', delivered: true, quote: 'parser first, noisy neighbour second, input shape third' },
    { item: 'decisive experiment', delivered: true, quote: 'rerun one job with the old parser pinned' },
  ]) })
  assert.ok(answer.length < 3 * 250, 'shorter than the removed 250-characters-per-task floor')
  assert.equal(outcome.status, 'verified')
  assert.equal(outcome.verification.verified, true)
  assert.equal(outcome.verification.evidenceRefs.length, 3)
  assert.equal(answerOutcomeReleasable(outcome), true)
})

test('an answer missing one requested deliverable is incomplete, names it, and is not released', async () => {
  const answer = '1. Root cause: the new parser version materialises every file in memory.\n2. Ranking: parser first, noisy neighbour second, input shape third.'
  const outcome = await verifyAnswerOutcome({ request, answer, judge: judgeSays([
    { item: 'root cause', delivered: true, quote: 'the new parser version materialises every file in memory' },
    { item: 'ranked hypotheses', delivered: true, quote: 'parser first, noisy neighbour second, input shape third' },
    { item: 'decisive experiment', delivered: false, quote: '' },
  ]) })
  assert.equal(outcome.status, 'incomplete')
  assert.deepEqual(outcome.missing, ['decisive experiment'])
  assert.equal(answerOutcomeReleasable(outcome), false)
})

test('the host, not the judge, decides what counts as evidence', () => {
  const answer = 'The parser upgrade doubled CPU per row on the job host during every run this week.'
  const verdicts = parseAnswerOutcome(JSON.stringify({ deliverables: [
    { item: 'quote not in the answer', delivered: true, quote: 'the database primary ran out of connections' },
    { item: 'quote too short to point at a passage', delivered: true, quote: 'parser upgrade' },
    { item: 'quote copied from the request', delivered: true, quote: 'Identify the root cause of the slowdown' },
    { item: 'real passage', delivered: true, quote: 'The parser upgrade doubled CPU per row' },
  ] }), answer, 'Identify the root cause of the slowdown.')
  assert.deepEqual(verdicts?.map(item => item.delivered), [false, false, false, true])
})

test('a capability denial delivers nothing the request asked for', async () => {
  const campaignRequest = '1. Execute check PAC-01 against the live site.\n2. Report the deployed commit SHA.\n3. Produce the evidence package.'
  const denial = 'I cannot execute the Production Acceptance Campaign. I do not have direct access to browser automation tools.'
  // Even a judge that wrongly calls the denial a delivery cannot verify it: its quotes are not in the answer.
  const outcome = await verifyAnswerOutcome({ request: campaignRequest, answer: denial, judge: judgeSays([
    { item: 'execute PAC-01', delivered: true, quote: 'PAC-01 passed against the live site' },
    { item: 'deployed commit SHA', delivered: true, quote: 'the deployed commit is 3924fc5' },
    { item: 'evidence package', delivered: false, quote: '' },
  ]) })
  assert.equal(outcome.status, 'incomplete')
  assert.equal(outcome.missing.length, 3)
})

test('an unavailable or unreadable judge leaves the answer unverified, which is not a finding against it', async () => {
  const answer = '1. Root cause: the parser.'
  for (const judge of [unavailableOutcomeJudge, async () => 'Looks complete to me.', async () => '{"complete":true}', async () => { throw new Error('busy') }]) {
    const outcome = await verifyAnswerOutcome({ request, answer, judge })
    assert.equal(outcome.status, 'unverified')
    assert.equal(outcome.verification.verified, false)
    assert.equal(outcome.verification.failureAttribution, 'infrastructure')
    assert.equal(answerOutcomeReleasable(outcome), true)
  }
})

test('an empty answer is incomplete without asking the judge', async () => {
  let asked = false
  const outcome = await verifyAnswerOutcome({ request, answer: '  ', judge: async () => { asked = true; return null } })
  assert.equal(outcome.status, 'incomplete')
  assert.equal(asked, false)
})

test('COS release and campaign grading use the same verifier; the word rules decide nothing', () => {
  const reasoner = read('lib/ai/cos/cosReasoner.ts')
  const primary = read('app/api/cos-primary/route.ts')
  const runner = read('lib/builder/campaign/runner.ts')
  const host = read('lib/builder/campaign/hostPorts.ts')
  const faults = read('lib/builder/campaign/faults.ts')
  const contract = read('lib/ai/cos/answerTaskContract.ts')
  for (const source of [reasoner, primary, runner, host]) assert.match(source, /verifyAnswerOutcome/)
  assert.match(reasoner, /if \(finalOutcome && !answerOutcomeReleasable\(finalOutcome\)\)/)
  for (const source of [reasoner, primary, runner, faults, contract]) assert.doesNotMatch(source, /releasableAnalyticalAnswer|evaluateTaskOutcome/)
  for (const source of [primary, runner, faults]) assert.doesNotMatch(source, /missingAnalyticalTasks/)
  // #5104's extra gate is gone with the function it lived in.
  assert.doesNotMatch(contract, /if \(missing\.length\) return false/)
})

// Production 2026-10-30 (campaign 13:11 UTC): the judge's verdicts stopped at the token limit (finish_reason length) and
// were discarded whole, so successful judge calls ended as "unavailable" and every graded answer went unchecked.
test('a verdict cut off at the token limit is read up to the cut, never thrown away whole', async () => {
  const answer = '1. Root cause: the new parser version materialises every file in memory.\n2. Ranking: parser first, noisy neighbour second, input shape third.'
  const delivered = '{"item":"root cause","delivered":true,"quote":"the new parser version materialises every file in memory"}'
  const missing = '{"item":"decisive experiment","delivered":false,"quote":""}'
  const cut = (objects: string[]) => async () => `{"deliverables":[${objects.join(',')},{"item":"ranked hyp`
  // A finding made before the cut stands.
  const found = await verifyAnswerOutcome({ request, answer, judge: cut([delivered, missing]) })
  assert.equal(found.status, 'incomplete')
  assert.deepEqual(found.missing, ['decisive experiment'])
  // No finding before the cut: only part of the request was judged, so nothing is verified.
  const partial = await verifyAnswerOutcome({ request, answer, judge: cut([delivered]) })
  assert.equal(partial.status, 'unverified')
  assert.equal(partial.verification.reason, 'answer_outcome_judge_cut_off')
  // A string containing brackets and braces does not end the list early.
  const tricky = '{"item":"ranked [a] {b} \\"c\\"","delivered":true,"quote":"parser first, noisy neighbour second, input shape third"}'
  const whole = await verifyAnswerOutcome({ request, answer, judge: async () => `{"deliverables":[${delivered},${tricky}]}` })
  assert.equal(whole.status, 'verified')
  assert.equal(whole.deliverables.length, 2)
})

test('the judge is asked for a compact verdict and its cut-off reply reaches the reader', () => {
  const verifier = read('lib/ai/cos/answerOutcomeVerifier.ts')
  assert.match(verifier, /Name each deliverable in at most 8 words/)
  assert.match(verifier, /5 to 12 consecutive words of the answer/)
  const reasoner = read('lib/ai/cos/cosReasoner.ts')
  assert.equal((reasoner.match(/purpose: 'answer_outcome_verification'/g) || []).length, 2)
  const loopJudge = reasoner.slice(reasoner.indexOf('const outcomeJudge: AnswerOutcomeJudge'), reasoner.indexOf('const outcomeOf = async'))
  const sharedJudge = reasoner.slice(reasoner.indexOf('export const cosAnswerOutcomeJudge'))
  for (const judge of [loopJudge, sharedJudge]) assert.match(judge, /allowTruncatedText: true/)
})
