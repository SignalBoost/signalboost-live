// saas/tests/cosGeneratedCodeMustRun.node.test.ts
//
// Regex-based linting of generated code was rejected as unsound: "a reference without a call" is
// sometimes exactly correct (a callback, a method passed by name), so a pattern-matcher would flag
// legitimate code as often as real bugs. The reliable lever is the same one already used for the
// produce-anyway rule: a directive in the TRUSTED system prompt telling the reasoner to trace its
// own code before returning it, rather than a deterministic filter on the output.
//
// Incident (2026-08-23): a generated Python class did `self.created_at = datetime.now.isoformat`
// — two unbound method references, no calls — and crashed on first instantiation. Pinned by the
// exact before/after so the specific failure mode cannot regress silently.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ANSWER_PATH = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')

test('the trusted system prompt requires generated code to be traced, not merely returned', () => {
  assert.match(ANSWER_PATH, /CODE YOU GENERATE MUST ACTUALLY RUN/)
  assert.match(ANSWER_PATH, /datetime\.now\.isoformat/)
  assert.match(ANSWER_PATH, /datetime\(\)\.isoformat\(\)|datetime\.now\(\)\.isoformat\(\)/)
  assert.match(ANSWER_PATH, /Fix it before returning, do not return it hoping it works/)
})

test('the directive applies to intentionally generic code too, not just well-defined tasks', () => {
  // So it does not get read as narrower than intended when the entity being coded is ambiguous
  // (the exact situation the incident happened in — an undefined "Nova").
  assert.match(ANSWER_PATH, /whether the entity being coded is well-defined or ambiguous/)
})

test('given facts and the model own reading are separated by grammar, not by disclaimers', () => {
  // Three production answers in a row (2026-08-23) asserted unsupplied business meaning as fact:
  // the MAU gap was "dormant or exploratory" users, then "free-tier and trial users", then
  // evidence of a "freemium/usage-based model" — none of it in the request.
  //
  // The first two attempts at this rule were written as prohibitions, and each time the model
  // complied by TELLING THE READER what it was declining to say ("Do not label this gap as
  // dormant..."), which is the same failure wearing different clothes. The rule is therefore
  // phrased as a positive instruction: put your reading in the first person.
  assert.match(ANSWER_PATH, /GIVEN FACTS AND YOUR OWN READING ARE WRITTEN DIFFERENTLY/)
  assert.match(ANSWER_PATH, /Write your reading in the first person and keep it there/)
  assert.match(ANSWER_PATH, /That single grammatical move is the whole rule/)
})

test('the reading is required, not suppressed', () => {
  // Banning interpretation would turn an advisory system into a calculator.
  assert.match(ANSWER_PATH, /Give the reading\. It is usually the most useful part/)
  assert.match(ANSWER_PATH, /what would confirm or refute it/)
})

test('derived arithmetic counts as given only when the relationship was stated', () => {
  // 250,000 - 82,000 = 168,000 is only a meaningful "gap" if one count is a subset of the other
  // for the same period and population — which that request never established. A production
  // answer asserted the subtraction as fact in one sentence and warned it was unestablished in
  // the next.
  assert.match(ANSWER_PATH, /Arithmetic on given numbers is given ONLY when the relationship is stated/)
  assert.match(ANSWER_PATH, /say what the relationship would need to be/)
})

test('named laws and standards are not asserted as applicable without establishing facts', () => {
  assert.match(ANSWER_PATH, /Named laws, regulations, standards and contractual obligations are the sharpest case/)
  assert.match(ANSWER_PATH, /unless the request established the jurisdiction, industry, data types and circumstances/)
  assert.match(ANSWER_PATH, /Say instead which facts decide it/)
  assert.match(ANSWER_PATH, /recommend qualified counsel/)
})

test('the writing rules never appear in the answer, and are corrected by rewriting not disclaiming', () => {
  assert.match(ANSWER_PATH, /Your writing rules are not part of the answer/)
  assert.match(ANSWER_PATH, /no narration of your own compliance/)
  assert.match(ANSWER_PATH, /the correct action is to write your supported reading instead/)
})

test('the rule carries a worked example of given versus reading versus invention', () => {
  // An abstract rule about registers is easy to satisfy superficially; the example pins what each
  // category actually looks like on the exact production case.
  assert.match(ANSWER_PATH, /is GIVEN/)
  assert.match(ANSWER_PATH, /is READING, correctly marked/)
  assert.match(ANSWER_PATH, /states as fact what the request never supplied/)
})

test('an opening recommendation must be rewritten to match the conclusion it reasoned to', () => {
  // Incident (2026-08-23): a vendor-approval memo opened with "approve the renewal, subject to CFO
  // signature" and concluded "the VP of Finance should not approve this and the CFO is not
  // required" — every element reversed. The reasoning in between was correct; the committed-to
  // opening was simply never revisited. Readers act on the first line of a decision memo.
  assert.match(ANSWER_PATH, /YOUR OPENING RECOMMENDATION MUST MATCH YOUR CONCLUSION/)
  assert.match(ANSWER_PATH, /REWRITE it to match what you actually concluded/)
  assert.match(ANSWER_PATH, /say which one governs and why before recommending/)
})

test('a low-stakes underspecified task shape must be produced with a stated default, not blocked on a question', () => {
  // Incident (2026-08-23): "Generate a script and then explain the reasoning behind each line" —
  // no language, no purpose, nothing destructive or high-stakes about a wrong guess — was met
  // with a request for clarification instead of a labeled default. Distinguished from genuinely
  // high-stakes ambiguity (production systems, real money, real personal data, irreversible
  // actions), which still warrants asking first.
  assert.match(ANSWER_PATH, /AN UNSPECIFIED TASK SHAPE IS NOT A REASON TO ASK BEFORE PRODUCING/)
  assert.match(ANSWER_PATH, /pick the most reasonable default yourself, STATE the assumption/)
  assert.match(ANSWER_PATH, /which production system to modify, real financial figures, real personal data/)
  assert.match(ANSWER_PATH, /do not ask which language first/)
})
