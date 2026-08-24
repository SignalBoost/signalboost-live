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

test('hedging a named regulation does not license naming it', () => {
  // The first version of the regulation guard cut outright assertions, and the model moved to
  // hedged ones instead: "under frameworks such as GDPR and CCPA", "may trigger", "likely contain
  // PII" — still naming the governing law and its clock on facts never supplied (2026-08-23).
  assert.match(ANSWER_PATH, /Hedging a named regulation is not the same as not naming it/)
  assert.match(ANSWER_PATH, /still tell the reader which law governs and which clock is running/)
  assert.match(ANSWER_PATH, /state the question, not the answer/)
  assert.match(ANSWER_PATH, /what data fields the records actually contain/)
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

test('the answer must be re-read for self-consistency: recommendation, numbers, dates and marking', () => {
  // Two production failures merged into one rule rather than two, to stop the prompt growing a
  // directive per observation:
  //   - a vendor memo opened "approve, subject to CFO signature" and concluded the opposite (2026-08-23)
  //   - a reallocation plan specified a 4-week sprint and then a closing script saying 8 weeks (2026-08-24)
  assert.match(ANSWER_PATH, /RE-READ YOUR OWN ANSWER BEFORE RETURNING IT/)
  assert.match(ANSWER_PATH, /REWRITE it once the reasoning is done to match what you actually concluded/)
  assert.match(ANSWER_PATH, /Figures, durations and deadlines must be the same everywhere they appear/)
  // The superseded narrower heading must be gone, not sitting alongside its replacement.
  assert.equal(ANSWER_PATH.includes('YOUR OPENING RECOMMENDATION MUST MATCH YOUR CONCLUSION'), false)
})

test('summaries and closing scripts may not promote marked reading into flat fact', () => {
  // The precise mechanism (2026-08-24): the body hedged "even if they only reduce churn by half",
  // and the summary asserted "Risk: 28% user base loss, likely leading to insolvency". Competitors,
  // a product-market-fit deadline, and a completed discovery phase appeared the same way — framing
  // in the body, fact in the recap. None was supplied by the request.
  assert.match(ANSWER_PATH, /A SUMMARY, RECAP OR CLOSING SCRIPT MUST NOT PROMOTE YOUR READING INTO FACT/)
  assert.match(ANSWER_PATH, /This is where marked reasoning silently hardens/)
  assert.match(ANSWER_PATH, /Carry the first-person marking into every restatement/)
})

test('projections from a given figure are the model estimate, marked in the same sentence', () => {
  // 4% monthly compounded over 8 months is 27.9%, so the arithmetic was right — but it assumes the
  // rate holds and the base is what the model thinks it is, neither of which was given.
  assert.match(ANSWER_PATH, /Compounding, extrapolating or projecting a given figure produces YOUR estimate/)
  assert.match(ANSWER_PATH, /if the rate holds/)
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
