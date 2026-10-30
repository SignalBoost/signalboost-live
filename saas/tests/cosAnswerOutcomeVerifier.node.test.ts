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

// Q16 (campaign run 2026-10-30 13:11 UTC): every graded answer came back "answer_outcome_judge_unavailable". The
// rescue/campaign judge ran as a whole COS writer turn, whose execution contract told the model to complete the
// request's deliverables, so it wrote an answer instead of a verdict, hit the token cap or the deadline, and returned null.
test('every judge is one direct verifier call, never a COS writer turn', () => {
  const reasoner = read('lib/ai/cos/cosReasoner.ts')
  const call = reasoner.slice(reasoner.indexOf('async function runAnswerOutcomeJudge('), reasoner.indexOf('export type CosReasonerKind'))
  assert.match(call, /callLocalModel\(\{/)
  assert.match(call, /systemPrompt: ANSWER_OUTCOME_VERIFIER_SYSTEM_PROMPT,/)
  assert.match(call, /jsonObject: true,/)
  assert.match(call, /disableThinking: true,/)
  assert.match(call, /writesUserAnswer: false,/)
  assert.doesNotMatch(call, /cosExecutionEnvelope|callCosReasoner|callRawCosReasoner|\.\.\.effectiveArgs|\.\.\.args/)

  const inTurn = reasoner.slice(reasoner.indexOf('const outcomeJudge: AnswerOutcomeJudge = async'), reasoner.indexOf('const outcomeOf = async'))
  assert.match(inTurn, /return await runAnswerOutcomeJudge\(request, answer,/)
  assert.doesNotMatch(inTurn, /\.\.\.effectiveArgs/)

  const external = reasoner.slice(reasoner.indexOf('export const cosAnswerOutcomeJudge'))
  assert.match(external, /return await runAnswerOutcomeJudge\(request, answer, localInferenceConfigFromEnv\(\)/)
  assert.doesNotMatch(external, /callCosReasoner|callRawCosReasoner|reasonThroughCosControlPlane/)
})

test('a full verdict on the maximum number of deliverables fits the judge token cap', () => {
  const reasoner = read('lib/ai/cos/cosReasoner.ts')
  const cap = Number(/const ANSWER_OUTCOME_JUDGE_MAX_TOKENS = (\d+)/.exec(reasoner)?.[1])
  // Longest entry the format allows: a 6-word item and an 8-word quote, of 7-letter words.
  const item = Array.from({ length: 6 }, () => 'request').join(' ')
  const quote = Array.from({ length: 8 }, () => 'evidence').join(' ')
  const answer = Array.from({ length: 20 }, () => quote).join('. ')
  const verdict = JSON.stringify({ deliverables: Array.from({ length: 20 }, () => ({ item, delivered: true, quote })) })
  // Estimate: one token per 3.5 characters of English JSON (an estimate; the live proof is the campaign run).
  const estimatedTokens = Math.ceil(verdict.length / 3.5)
  assert.ok(estimatedTokens <= cap, `verdict ~${estimatedTokens} tokens exceeds the ${cap}-token cap`)
  assert.equal(parseAnswerOutcome(verdict, answer, '')?.length, 20)
  const prompt = read('lib/ai/cos/answerOutcomeVerifier.ts')
  assert.match(prompt, /\(5 to 8 words\)/)
  assert.match(prompt, /at most 6 words/)
})

test('Q15 retirement letter must deliver both the legal basis and requested next steps', async () => {
  const request = 'Draft a letter to my CDO about possibly staying at the Department of State five years past age 65, and tell me what I should do.';
  const incompleteLetter = 'Dear CDO, I turn 65 next year and would like to ask whether I can stay five more years. Thank you.';
  const missing = await verifyAnswerOutcome({ request, answer: incompleteLetter, judge: judgeSays([
    { item: 'draft CDO letter', delivered: true, quote: 'I turn 65 next year and would like to ask whether I can stay five more years' },
    { item: 'legal basis for extension', delivered: false, quote: '' },
    { item: 'what to do next', delivered: false, quote: '' },
  ]) });
  assert.equal(missing.status, 'incomplete');
  assert.deepEqual(missing.missing, ['legal basis for extension', 'what to do next']);

  const complete = incompleteLetter + ' Under 22 U.S.C. § 4052(b), the Secretary may retain a Foreign Service member beyond 65 in the public interest for up to five years. Ask your CDO and HR about eligibility, the required request, and approval deadlines.';
  const verified = await verifyAnswerOutcome({ request, answer: complete, judge: judgeSays([
    { item: 'draft CDO letter', delivered: true, quote: 'I turn 65 next year and would like to ask whether I can stay five more years' },
    { item: 'legal basis for extension', delivered: true, quote: 'the Secretary may retain a Foreign Service member beyond 65 in the public interest' },
    { item: 'what to do next', delivered: true, quote: 'Ask your CDO and HR about eligibility, the required request, and approval deadlines' },
  ]) });
  assert.equal(verified.status, 'verified');
});

test('Q10 repair selection uses the independent verifier rather than word-count checks', () => {
  const source = read('lib/ai/cos/cosReasoner.ts')
  assert.match(source, /const firstOutcome = firstParsedForPolicy \? await outcomeOf/)
  assert.match(source, /const repairedOutcome = repairedParsedForPolicy/)
  assert.match(source, /taskContractRepairAccepted = firstOutcome\?\.status === 'incomplete' && repairedOutcome\?\.status === 'verified'/)
  assert.match(source, /repairedOutcome && repairedOutcome\.status !== 'incomplete'/)
  assert.doesNotMatch(source, /cosAnswerProgress|missingAnalyticalTasks|analyticalTaskRepairDirective/)
})

test('Q10 verifier-guided recovery preserves non-analytical writing and translation objectives', () => {
  const source = read('lib/ai/cos/cosReasoner.ts')
  assert.match(source, /\.\.\.\(analyticalTasks\.length > 0\s*\? \[/)
  assert.match(source, /ANALYTICAL RECOVERY/)
  assert.match(source, /DELIVERABLE RECOVERY — revise the requested output, preserving its original format, language requirements and constraints/)
  assert.match(source, /Do not convert writing, translation or other non-analytical requests into an investigation/)
  assert.match(source, /Independently verified missing deliverables:/)
})
