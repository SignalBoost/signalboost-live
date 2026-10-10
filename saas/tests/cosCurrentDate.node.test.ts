// saas/tests/cosCurrentDate.node.test.ts
//
// COS HAS A CLOCK (2026-10-09). Production: "que anos nos estamos?" -> "Estamos em 2024" because the primary
// reasoner prompt never carried today's date. These tests freeze the clock and prove the date line is right in
// every supported language, and that it survives question-scoped prompt reduction for the reported questions.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cosCurrentDateLine } from '../lib/ai/cos/cosCurrentDate.ts'
import { scopeReasonerPromptToQuestion } from '../lib/ai/cos/cosReasonerPromptScope.ts'

const FROZEN = new Date('2026-10-09T23:30:00Z')
const LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'] as const

test('the date line states the real UTC date and year, not a training-era year', () => {
  const line = cosCurrentDateLine('en', FROZEN)
  assert.match(line, /^CURRENT DATE \(authoritative, from the server clock\): today is Friday, October 9, 2026 — 2026-10-09 \(UTC\)\./)
  assert.match(line, /never state that the current year is anything other than 2026\./)
  assert.match(line, /never describe it as upcoming or far away/)
  assert.match(line, /give this UTC date and say it is UTC\./)
  assert.doesNotMatch(line, /2024|2025/)
})

test('every supported language carries the ISO date and a localized full date', () => {
  for (const lang of LANGUAGES) {
    const line = cosCurrentDateLine(lang, FROZEN)
    assert.match(line, /2026-10-09 \(UTC\)/, lang)
    assert.match(line, /than 2026\./, lang)
    assert.doesNotMatch(line, /\.\./, lang)
    if (lang === 'en') assert.doesNotMatch(line, /In the reply language/, lang)
    else assert.match(line, /In the reply language: .*(?:2026|٢٠٢٦)[^.]*\. The user may be in another time zone/, lang)
  }
  assert.match(cosCurrentDateLine('pt', FROZEN), /In the reply language: sexta-feira, 9 de outubro de 2026\./)
  assert.match(cosCurrentDateLine('es', FROZEN), /In the reply language: viernes, 9 de octubre de 2026\./)
})

test('the line follows the clock across a year boundary', () => {
  assert.match(cosCurrentDateLine('en', new Date('2027-01-01T00:00:01Z')), /2027-01-01 \(UTC\).*other than 2027\./)
  assert.match(cosCurrentDateLine('en', new Date('2026-12-31T23:59:59Z')), /2026-12-31 \(UTC\).*other than 2026\./)
})

test('unknown or missing language falls back to English only', () => {
  assert.equal(cosCurrentDateLine(undefined, FROZEN), cosCurrentDateLine('en', FROZEN))
  assert.equal(cosCurrentDateLine('xx', FROZEN), cosCurrentDateLine('en', FROZEN))
})

test('question-scoped prompt reduction keeps the date line for the reported and explanatory questions', () => {
  const dateLine = cosCurrentDateLine('pt', FROZEN)
  const prompt = [
    'You are COS.',
    'RE-READ YOUR OWN ANSWER BEFORE RETURNING IT — RECOMMENDATION, NUMBERS, DATES AND MARKING MUST ALL AGREE:',
    '- Rewrite the opening recommendation.',
    'AN UNSPECIFIED TASK SHAPE IS NOT A REASON TO ASK BEFORE PRODUCING:',
    '- Pick a reasonable default.',
    'MISSING EVIDENCE IS NOT A REASON TO PRODUCE NOTHING:',
    '- Still produce the artifact.',
    'Reply in Portuguese.',
    dateLine,
    'Return ONLY strict JSON, nothing before the opening brace and nothing after the closing brace: {"answer":"complete answer","confidence":0.0}.',
  ].join('\n')
  for (const [question, language] of [
    ['que anos nos estamos?', 'Portuguese'],
    ['quem sera o proximo presidente do Brasil?', 'Portuguese'],
    ['What is a Kubernetes ClusterIP Service?', 'English'],
    ['What year is it?', 'English'],
  ] as const) {
    const scoped = scopeReasonerPromptToQuestion(prompt, question, language)
    assert.ok(scoped.includes(dateLine), question)
  }
})

test('the primary COS reasoner prompt wires the date line after "Reply in" and before the JSON contract', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  const reply = source.indexOf('`Reply in ${reportLanguageName(language)}.`,')
  const date = source.indexOf('cosCurrentDateLine(language),')
  const json = source.indexOf("'Return ONLY strict JSON, nothing before the opening brace")
  assert.ok(reply > 0 && date > reply && json > date, 'date line must sit between "Reply in" and the JSON contract')
  assert.match(source, /import \{ cosCurrentDateLine \} from '@\/lib\/ai\/cos\/cosCurrentDate'/)
})
