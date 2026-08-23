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
