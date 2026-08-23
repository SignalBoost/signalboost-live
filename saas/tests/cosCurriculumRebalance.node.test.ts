// saas/tests/cosCurriculumRebalance.node.test.ts
//
// Twelve hours of autonomous learning produced nothing but manually-fed material, and the corpus
// that HAD accumulated (155 of 225 items scientific journals) was being retrieved ~40 times per
// turn and cited essentially never. Two causes, both fixed here:
//
//   1. The recurring curriculum was eight infrastructure topics — SRE, Kubernetes, Postgres,
//      networking, security — with ZERO business or revenue coverage, despite 'business strategy
//      enterprise SaaS economics operations' and 'B2B enterprise sales marketing revenue
//      operations' both already being permitted study domains. Real questions asked of this system
//      are about campaigns, positioning, pricing and operations, so acquisition and demand were
//      pointed in different directions.
//   2. Acquisition budget is finite (maxCandidatesPerCycle), and the FIXED curriculum was ordered
//      ahead of `autonomousGaps` — the gaps built from questions COS measurably failed on real
//      work, ranked by repetition. The static syllabus consumed the budget first and real demand
//      trailed behind it.
//
// Note: none of this runs at all until COS_AUTONOMOUS_LEARNING_ENABLED=true is set in the
// deployment environment — a config value, not code. These fixes determine what gets studied
// once it is on.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// Source-text assertions rather than imports: dailyAutonomousLearning.ts uses '@/lib' path
// aliases that only resolve under tsc, not bare `node --test`. Pre-existing property of the file.
const MODULE = readFileSync(new URL('../lib/cos/dailyAutonomousLearning.ts', import.meta.url), 'utf8')
const FOUNDATIONAL = readFileSync(new URL('../lib/cos-core/layers/learning/foundational.ts', import.meta.url), 'utf8')
const CURRICULUM = MODULE.slice(MODULE.indexOf('export function recurringTechnologyCurriculum'), MODULE.indexOf('function miningAdapter'))

test('the curriculum covers business strategy and B2B revenue, not only infrastructure', () => {
  assert.match(CURRICULUM, /business strategy enterprise SaaS economics operations/)
  assert.match(CURRICULUM, /B2B enterprise sales marketing revenue operations/)
})

test('the two new subjects match foundational domain strings EXACTLY, so they cannot be dropped', () => {
  // isStudyableGapSubject does an exact set lookup against FOUNDATIONAL_KNOWLEDGE_DOMAINS
  // subjects. The seven pre-existing infra entries use display labels that do NOT match exactly
  // and rely on normalizeQueuedGapSubject's keyword re-anchoring fallback — pre-existing
  // behavior, deliberately left alone. The entries added here use the exact strings, which is
  // the stronger guarantee, and this test pins that they stay in sync with foundational.ts.
  assert.match(FOUNDATIONAL, /subject:'business strategy enterprise SaaS economics operations'/)
  assert.match(FOUNDATIONAL, /subject:'B2B enterprise sales marketing revenue operations'/)
  assert.match(CURRICULUM, /'business strategy enterprise SaaS economics operations'/)
  assert.match(CURRICULUM, /'B2B enterprise sales marketing revenue operations'/)
})

test('business and revenue topics outrank generic tech news in urgency', () => {
  const urgencyOf = (id: string) => {
    const match = CURRICULUM.match(new RegExp(`\\['${id}',[^\\]]*?,\\s*(\\d+)\\],`, 's'))
    assert.ok(match, `curriculum entry not found: ${id}`)
    return Number(match![1])
  }
  const news = urgencyOf('enterprise-tech-news')
  assert.ok(urgencyOf('saas-business-strategy') > news)
  assert.ok(urgencyOf('b2b-revenue-operations') > news)
})

test('real observed gaps are acquired before the fixed curriculum, not after', () => {
  // The ordering IS the prioritization — whatever comes first spends the bounded budget.
  assert.match(MODULE, /const gaps = \[miningGap\(input\.miningSummary\), \.\.\.autonomousGaps, \.\.\.curriculum\]/)
  assert.doesNotMatch(MODULE, /const gaps = \[miningGap\(input\.miningSummary\), \.\.\.curriculum, \.\.\.autonomousGaps\]/)
})

test('the curriculum still retains its engineering coverage', () => {
  // Rebalancing, not replacement — the infrastructure topics remain, they just no longer crowd
  // out demand-driven acquisition.
  assert.match(CURRICULUM, /SRE and observability/)
  assert.match(CURRICULUM, /Database and data-layer performance/)
  assert.match(CURRICULUM, /Enterprise cybersecurity/)
})
