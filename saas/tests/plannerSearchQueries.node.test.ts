// saas/tests/plannerSearchQueries.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decodePlannerSearchQueriesHeader,
  encodePlannerSearchQueriesHeader,
  liveSearchQueriesForTurn,
  plannerSearchQueriesFromToolArguments,
  sanitizePlannerSearchQueries,
} from '../lib/ai/cos/plannerSearchQueries.ts'
import { parseCosAgentDecision } from '../lib/ai/cos/cosAgentDecision.ts'

const decision = readFileSync(new URL('../lib/ai/cos/cosAgentDecision.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')

test('planner queries are bounded, de-duplicated, and stripped of control characters', () => {
  const long = 'x'.repeat(500)
  assert.deepEqual(
    sanitizePlannerSearchQueries(['  Brazil 2026 presidential election polls  ', 'brazil 2026 presidential election polls', 42, 'ok', 'a\u0000b\nc', long, 'fourth query here', 'fifth query here']),
    ['Brazil 2026 presidential election polls', 'a b c', 'x'.repeat(200)],
  )
  assert.deepEqual(sanitizePlannerSearchQueries('not an array'), [])
})

test('native tool arguments carry the queries; malformed arguments yield none', () => {
  assert.deepEqual(
    plannerSearchQueriesFromToolArguments('{"queries":["2026 US midterm elections House Senate control forecast","current party breakdown US House Senate"]}'),
    ['2026 US midterm elections House Senate control forecast', 'current party breakdown US House Senate'],
  )
  assert.deepEqual(plannerSearchQueriesFromToolArguments('{not json'), [])
  assert.deepEqual(plannerSearchQueriesFromToolArguments(''), [])
})

test('header round-trips unicode queries and rejects tampered values', () => {
  const queries = ['eleição presidencial Brasil 2026 pesquisas', 'выборы президента Бразилии 2026']
  assert.deepEqual(decodePlannerSearchQueriesHeader(encodePlannerSearchQueriesHeader(queries)), queries)
  assert.equal(encodePlannerSearchQueriesHeader([]), '')
  assert.deepEqual(decodePlannerSearchQueriesHeader('%E0%A4%A'), [])
  assert.deepEqual(decodePlannerSearchQueriesHeader(encodeURIComponent('{"queries":"x"}')), [])
  assert.deepEqual(decodePlannerSearchQueriesHeader(null), [])
})

test('planner queries lead the turn; the host template stays as one extra search; no planner queries = host unchanged', () => {
  const host = ['whose is more likely to be the next Brazilian president 2026-10-10']
  assert.deepEqual(
    liveSearchQueriesForTurn(['Brazil 2026 presidential election polls', 'Brazil 2026 presidential candidates'], host),
    ['Brazil 2026 presidential election polls', 'Brazil 2026 presidential candidates', host[0]],
  )
  assert.deepEqual(liveSearchQueriesForTurn([], host), host)
  assert.deepEqual(liveSearchQueriesForTurn(['same query'], ['Same Query']), ['same query'])
})

test('JSON-compat planner output keeps live_web queries and drops them for other capabilities', () => {
  const live = parseCosAgentDecision('{"mode":"orchestrate","confidence":0.9,"capabilities":["live_web"],"queries":["Brazil 2026 presidential election polls"],"reason":"current election"}', 'test')
  assert.equal(live?.mode, 'orchestrate')
  assert.deepEqual(live?.searchQueries, ['Brazil 2026 presidential election polls'])
  const repo = parseCosAgentDecision('{"mode":"orchestrate","confidence":0.9,"capabilities":["repository_read"],"queries":["ignored"],"reason":"code"}', 'test')
  assert.deepEqual(repo?.searchQueries, [])
  const answer = parseCosAgentDecision('{"mode":"answer","answer":"COS","confidence":1,"capabilities":[],"reason":"cos_answers"}', 'test')
  assert.deepEqual(answer?.searchQueries, [])
})

test('planner is told to request live_web for present/future world state and that a prior turn is not evidence', () => {
  assert.match(decision, /present or future state of the outside world/)
  assert.match(decision, /elections and their candidates, polls or likely outcomes/)
  assert.match(decision, /A preceding assistant turn is conversation context, not evidence/)
  assert.match(decision, /resolve pronouns and follow-ups from the conversation into the actual subject/)
  assert.match(decision, /parameters: name === 'live_web' \? LIVE_WEB_PARAMETERS/)
  // Both planner turns (native tools and JSON compatibility) apply the same rules.
  assert.equal(decision.match(/LIVE_WEB_PLANNING_RULES,/g)?.length, 2)
})

test('routing: cos-browser forwards only planner-written queries; cos-primary searches them', () => {
  assert.match(browser, /routedHeaders\.delete\(PLANNER_SEARCH_QUERIES_HEADER\)/)
  assert.match(browser, /routedHeaders\.set\(PLANNER_SEARCH_QUERIES_HEADER, encodePlannerSearchQueriesHeader\(agentDecision\.searchQueries\)\)/)
  assert.ok(browser.indexOf('routedHeaders.delete(PLANNER_SEARCH_QUERIES_HEADER)') < browser.indexOf('routedHeaders.set(PLANNER_SEARCH_QUERIES_HEADER'))
  assert.match(primary, /plannerSearchQueries=modelPlannedFreshEvidence\?decodePlannerSearchQueriesHeader\(req\.headers\.get\(PLANNER_SEARCH_QUERIES_HEADER\)\):\[\]/)
  assert.match(primary, /const queries=liveSearchQueriesForTurn\(plannerSearchQueries,freshEvidenceSearchQueries\(lookupInput\)\)/)
  assert.match(primary, /planner_search_queries:plannerSearchQueries\.length/)
})
