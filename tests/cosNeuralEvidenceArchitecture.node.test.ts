/**
 * Architecture regressions. These tests lock the control plane.
 * They must not encode a topic-specific correct paragraph for earnings, wages,
 * inflation, GDP, or any other empirical question.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  constructEconomicFactsReply,
  freshEvidenceSearchQueries,
  prepareFreshEvidence,
} from '../saas/lib/ai/cos/cosFreshGrounding.ts'
import {
  augmentQueryForOfficialSources,
  classifyAuthoritativeSourceNeed,
  rankByAuthority,
} from '../saas/lib/ai/cos/officialSourceAuthority.ts'
import {
  acceptFreshEvidenceSemanticPlan,
  acceptFreshEvidenceSynthesis,
  freshEvidenceScopePlanSystemPrompt,
  freshEvidenceSynthesisSystemPrompt,
} from '../saas/lib/ai/cos/freshEvidenceSynthesisContract.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readRepo(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

test('economic formatter remains a null seam and never writes prose', () => {
  const hit = constructEconomicFactsReply('does a pay gap between men and women exist in the US?', [])
  assert.equal(hit, null)
  const source = readRepo('saas/lib/ai/cos/cosFreshGrounding.ts')
  assert.match(source, /export function constructEconomicFactsReply/)
  assert.match(source, /return null/)
  assert.doesNotMatch(source, /uncontrolled gender pay gap/i)
  assert.doesNotMatch(source, /controlled gender pay gap/i)
  assert.doesNotMatch(source, /\$0\.82/)
  assert.doesNotMatch(source, /\$0\.99/)
})

test('query generation does not farm named statistical series', () => {
  const queries = freshEvidenceSearchQueries('who is the best US president?', new Date('2026-08-31T00:00:00Z'))
  const joined = queries.join('\n')
  assert.doesNotMatch(joined, /\bBLS\b/)
  assert.doesNotMatch(joined, /\bBEA\b/)
  assert.doesNotMatch(joined, /unemployment rate by administration/i)
  assert.doesNotMatch(joined, /CPI inflation by administration/i)
  assert.doesNotMatch(joined, /real GDP growth by administration/i)
})

test('official published-series questions are authority-owned without naming a conclusion', () => {
  const earnings = classifyAuthoritativeSourceNeed('do median weekly earnings differ between men and women in the US?')
  assert.equal(earnings.required, true)
  assert.equal(earnings.officialStatistics, true)

  const unemployment = classifyAuthoritativeSourceNeed('what is the current US unemployment rate?')
  assert.equal(unemployment.required, true)
  assert.equal(unemployment.officialStatistics, true)

  const unrelated = classifyAuthoritativeSourceNeed('how do I write a recursive descent parser?')
  assert.equal(unrelated.required, false)
  assert.equal(unrelated.officialStatistics, false)
})

test('institutional statistical hosts outrank commentary for official-series questions', () => {
  const need = classifyAuthoritativeSourceNeed('do men and women have different median weekly earnings in the US?')
  const ranked = rankByAuthority([
    { url: 'https://www.payscale.com/featured-content/gender-pay-gap', sourceDate: '2026-08-28' },
    { url: 'https://www.bls.gov/news.release/wkyeng.nr0.htm', sourceDate: '2026-07-21' },
    { url: 'https://www.aauw.org/resources/research/simple-truth/' },
  ], need)
  assert.equal(ranked[0].authorityTier, 'institutional')
  assert.match(ranked[0].url, /bls\.gov/)
  assert.equal(ranked.at(-1)?.authorityTier, 'secondary')
})

test('query augmentation never injects a publisher domain or a canned ratio', () => {
  const need = classifyAuthoritativeSourceNeed('does a wage difference exist in the US?')
  const q = augmentQueryForOfficialSources('does a wage difference exist in the US?', need)
  assert.match(q, /official statistical agency series/i)
  assert.doesNotMatch(q, /bls\.gov/i)
  assert.doesNotMatch(q, /census\.gov/i)
  assert.doesNotMatch(q, /uncontrolled/i)
  assert.doesNotMatch(q, /controlled/i)
})

test('prepareFreshEvidence ranks institutional series first when the query is official statistics', () => {
  const prepared = prepareFreshEvidence([
    { title: 'HR blog', url: 'https://www.payscale.com/gap', snippet: 'women earn 82 cents' },
    { title: 'Usual weekly earnings', url: 'https://www.bls.gov/news.release/wkyeng.nr0.htm', snippet: 'median weekly earnings' },
  ], 8, 'do median weekly earnings differ by sex in the US?')
  assert.match(prepared[0].url, /bls\.gov/)
})

test('neural prompts contain no topic answer schema', () => {
  const plan = freshEvidenceScopePlanSystemPrompt('en')
  const synth = freshEvidenceSynthesisSystemPrompt('en')
  const reasoner = readRepo('cos-policy/prompts/constraint-first-reasoner.txt')
  for (const text of [plan, synth, reasoner]) {
    assert.doesNotMatch(text, /uncontrolled/i)
    assert.doesNotMatch(text, /controlled pay/i)
    assert.doesNotMatch(text, /gender pay gap/i)
    assert.match(text, /proposition/i)
  }
  assert.match(reasoner, /Do not use topic-specific answer schemas/)
})

test('synthesis validator rejects a yes-lead when the plan is a neutral evidence map', () => {
  const sources = [
    { id: 'LIVE1', title: 'Weekly earnings', url: 'https://www.bls.gov/wkyeng', snippet: 'median weekly earnings' },
    { id: 'LIVE2', title: 'Commentary', url: 'https://example.com/comment', snippet: 'adjusted residual' },
  ]
  const plan = acceptFreshEvidenceSemanticPlan({
    text: JSON.stringify({
      presentationMode: 'neutral_evidence_map',
      directBinaryAnswerSafe: false,
      scopes: [
        { scopeId: 'S1', label: 'Unadjusted full-time median weekly earnings', finding: 'Group medians differ.', evidenceIds: ['LIVE1'] },
        { scopeId: 'S2', label: 'Same-job residual after observables', finding: 'A narrower comparison is a different construct.', evidenceIds: ['LIVE2'] },
      ],
    }),
    sources,
  })
  assert.ok(plan)
  const rejected = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'Yes. A pay gap exists.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: 'does a pay difference exist?',
    sources,
    semanticPlan: plan!,
  })
  assert.equal(rejected, null)
})

test('unseen-domain questions use the same authority classifier rather than a new topic branch', () => {
  const a = classifyAuthoritativeSourceNeed('what is the current CPI in the US?')
  const b = classifyAuthoritativeSourceNeed('what is US real GDP this quarter?')
  const c = classifyAuthoritativeSourceNeed('what is the labor force participation rate?')
  assert.equal(a.officialStatistics && b.officialStatistics && c.officialStatistics, true)
})
