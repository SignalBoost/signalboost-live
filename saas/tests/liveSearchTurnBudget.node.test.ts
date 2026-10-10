// saas/tests/liveSearchTurnBudget.node.test.ts
//
// LIVE SEARCH WITHIN THE TURN BUDGET (2026-10-10). Production Concierge, "quem sera o proximo presidente do Brasil?":
// the background turn ran past the page's 180 s wait. Model calls were already clamped to the turn deadline; web
// searches and page reads were not (the governed research backend has no time limit of its own), and the single
// search retry could double a slow search. These tests run inside the real turn-deadline scope.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getExternalInfo, setWebSearchPort } from '../lib/ai/tools/getExternalInfo.ts'
import { runWithTurnDeadline } from '../lib/ai/cos/cosTurnBudget.ts'

const QUERY = 'quem sera o proximo presidente do Brasil? current official authoritative independent verification as of 2026-10-10'
const RESULT = { title: 'Eleições 2026', url: 'https://www.tse.jus.br/eleicoes/2026', snippet: 'Resultados' }

test('a hanging search is cut off inside the turn budget instead of consuming the turn', async () => {
  let calls = 0
  setWebSearchPort({ search: () => { calls += 1; return new Promise(() => {}) } })
  const startedAt = Date.now()
  // 6.5 s left: one attempt capped at 1.5 s (5 s margin), and no time for the optional retry or diversity lane.
  const out = await runWithTurnDeadline(Date.now() + 6_500, () => getExternalInfo(QUERY, 8, { bypassCache: true }))
  const elapsed = Date.now() - startedAt
  assert.equal(out.ok, false)
  assert.match(String(out.error), /^search_timeout_after_\d+ms$/)
  assert.equal(calls, 1, 'no optional search when the turn is short of time')
  assert.ok(elapsed < 3_000, `returned in ${elapsed} ms`)
})

test('no search starts when the turn deadline has effectively passed', async () => {
  let calls = 0
  setWebSearchPort({ async search() { calls += 1; return [RESULT] } })
  const out = await runWithTurnDeadline(Date.now() + 5_500, () => getExternalInfo(QUERY, 8, { bypassCache: true }))
  assert.equal(out.ok, false)
  assert.equal(out.error, 'turn_deadline_reached_before_search')
  assert.equal(calls, 0)
})

test('the retry is skipped when the turn lacks comfortable time, and runs when it has it', async () => {
  let calls = 0
  setWebSearchPort({ async search(query) { if (!query.includes('credible disagreement')) calls += 1; return [] } })
  await runWithTurnDeadline(Date.now() + 20_000, () => getExternalInfo(QUERY, 8, { bypassCache: true }))
  assert.equal(calls, 1, 'under 30 s left: no retry')
  calls = 0
  await runWithTurnDeadline(Date.now() + 120_000, () => getExternalInfo(QUERY, 8, { bypassCache: true }))
  assert.equal(calls, 2, 'with time left: one retry')
})

test('a normal search inside the budget is unaffected', async () => {
  setWebSearchPort({ async search() { return [RESULT] } })
  const out = await runWithTurnDeadline(Date.now() + 120_000, () => getExternalInfo(QUERY, 8, { bypassCache: true }))
  assert.equal(out.ok, true)
  assert.equal(out.results[0]?.url, RESULT.url)
})

test('the live-fact path bounds page reading, checks the budget before synthesis, and reports stage timings', () => {
  const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
  assert.match(core, /if \(remainingBeforePages !== null && remainingBeforePages < PAGE_READ_MIN_REMAINING_MS\) \{\s*pagesNote = ' \(skipped: turn budget\)'/)
  assert.match(core, /deepenClaimResearch\(input\.prompt, sources, readPublicPages\)\.catch\(\(\) => unread\)/)
  assert.match(core, /pagesNote = ' \(stopped: time cap\)'/)
  assert.match(core, /if \(remainingBeforeSynthesis !== null && remainingBeforeSynthesis < SYNTHESIS_MIN_REMAINING_MS\) \{/)
  assert.match(core, /escalationReasonCode: 'turn_budget_exhausted_before_synthesis'/)
  assert.match(core, /const freshTiming = \(extra = ''\) => `timing: search \$\{seconds\(searchMs\)\} · pages \$\{seconds\(pagesMs\)\}\$\{pagesNote\}\$\{extra\}`/)
  // The evidence-gate refusal and the budget refusal both carry the timings to the owner.
  assert.equal(core.match(/\\n\$\{freshTiming\(/g)?.length, 2)
})
