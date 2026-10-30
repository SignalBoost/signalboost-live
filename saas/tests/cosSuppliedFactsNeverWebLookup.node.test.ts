// saas/tests/cosSuppliedFactsNeverWebLookup.node.test.ts
// Production 2026-10-30 (owner, Assistant): an incident with its own facts and three numbered tasks was answered with a
// list of unrelated search results. A word rule flagged it as a live-fact lookup ("this week", "on Monday"), the browser
// guard forced live_web on that flag alone, COS skipped the turn's intent judge because live_web looked planned, the
// web returned unrelated pages, synthesis declined, and the search-results digest was released as the answer.
// Now the word rules only suggest a lookup, the turn's intent judge decides at both steps, and a list of search results
// is never an answer.
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { semanticIntentSuppressesFreshness, type CosSemanticTaskIntent } from '../lib/ai/cos/cosSemanticTaskIntent.ts'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const ownerQuestion = `Our nightly data export started finishing 40 minutes late this week. Row counts are unchanged, the database shows no slow queries, and the server CPU is at 95% for the whole run. A library upgrade was deployed on Monday.
1. Identify the most likely root causes.
2. Rank them with the reason for each.
3. Describe one test that would confirm the top cause.`

test('the word rule flags the owner question as a live lookup, so only the judge can keep it off the web', () => {
  assert.equal(requiresFreshExternalEvidence(ownerQuestion), true)
})

test("the judge's supplied-facts reading suppresses the lookup; an unavailable or live-fact reading does not", () => {
  const supplied: CosSemanticTaskIntent = { mode: 'general_reasoning', confidence: 0.9, suppliedContextPrimary: true, externalFactsRequired: false }
  const live: CosSemanticTaskIntent = { mode: 'external_fact_verification', confidence: 0.9, suppliedContextPrimary: false, externalFactsRequired: true }
  assert.equal(semanticIntentSuppressesFreshness(supplied), true)
  assert.equal(semanticIntentSuppressesFreshness(live), false)
  assert.equal(semanticIntentSuppressesFreshness(null), false, 'judge unavailable: the lookup stays, fail-safe for real current facts')
})

test('the browser guard forces live_web only when the judge does not read the request as supplied-facts reasoning', () => {
  const browser = read('app/api/cos-browser/route.ts')
  const guard = browser.indexOf("if (agentDecision?.mode === 'answer' && (requiresFreshExternalEvidence(prompt) || requiresLiveTravelPlanningEvidence(prompt))")
  assert.ok(guard > 0)
  const condition = browser.slice(guard, browser.indexOf('{', guard + 120) + 1)
  assert.match(condition, /&& !semanticIntentSuppressesFreshness\(await turnIntent\(\)\)\) \{$/)
})

test('COS asks the judge even when live_web arrived as a plan, and the judge can suppress it', () => {
  const primary = read('app/api/cos-primary/route.ts')
  assert.match(primary, /const semanticTaskIntentNeeded=!requestedAction\s*\n\s*&& \(modelPlannedFreshEvidence \|\| heuristicRequiresFreshEvidence/)
  assert.match(primary, /const requiresFreshEvidence=baselineRequiresFreshEvidence&&!semanticIntentSuppressesFreshness\(semanticTaskIntent\)/)
})

test('a list of search results is never released as the answer', () => {
  const primary = read('app/api/cos-primary/route.ts')
  assert.doesNotMatch(primary, /sourceDigestFallback|buildSourceSummaryFallback|cos-fresh-source-digest/)
  assert.equal(existsSync(join(process.cwd(), 'lib/ai/cos/sourceDigestFallback.ts')), false)
})
