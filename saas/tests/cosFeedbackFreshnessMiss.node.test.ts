import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { assessFreshnessMiss } from '../lib/ai/cos/feedbackFreshnessMiss.ts'

const feedbackRoute = readFileSync(new URL('../app/api/assistant/feedback/route.ts', import.meta.url), 'utf8')
const externalInfo = readFileSync(new URL('../lib/ai/tools/getExternalInfo.ts', import.meta.url), 'utf8')

test('explicit staleness wording is detected in all supported languages', () => {
  for (const correction of [
    'This information is outdated — the procedure changed.',
    'Te informacje są nieaktualne.',
    'Esta información está desactualizada.',
    'Essa informação está desatualizada.',
    'Эта информация устарела.',
  ]) {
    const verdict = assessFreshnessMiss('changed surname documents institutions', correction)
    assert.equal(verdict.detected, true, correction)
    assert.match(String(verdict.gapQuestion), /CURRENT, officially sourced state/)
  }
})

test('ordinary disagreement is not a freshness miss', () => {
  assert.equal(assessFreshnessMiss('some prompt about documents', 'This is wrong.').detected, false)
})

test('feedback correlation normalizes both server-owned resolution paths', () => {
  assert.match(feedbackRoute, /const wantedContent = normalizeAssistantContent\(assistantContent\)/)
  assert.match(feedbackRoute, /normalizeAssistantContent\(messages\[index\]\?\.content\) === wantedContent/)
  assert.match(feedbackRoute, /\.eq\('assistant_content', normalizeAssistantContent\(assistantContent\)\)/)
})

test('freshness misses are filed only in the background correction path', () => {
  assert.match(feedbackRoute, /assessFreshnessMiss\(target\.prompt, correctionText\)/)
  assert.match(feedbackRoute, /recordFreshnessMissGap\(db, staleness\)/)
})

test('authority-owned evidence gets a source-grounded proactive contract', () => {
  assert.match(externalInfo, /PROACTIVE: after answering the question itself/)
  assert.match(externalInfo, /never invent related obligations from model memory/)
  assert.match(externalInfo, /need\.required && results\.some\(r => r\.authorityTier && r\.authorityTier !== 'secondary'\)/)
})
