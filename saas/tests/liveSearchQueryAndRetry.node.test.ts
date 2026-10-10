// saas/tests/liveSearchQueryAndRetry.node.test.ts
//
// LIVE SEARCH QUERY AND RETRY (2026-10-09). Production Concierge, "quem sera o proximo presidente do Brasil?":
// COS routed to live verification and then refused because live search produced nothing usable. Two code-proven
// weaknesses on that path: the search engine received the question with six English bookkeeping words appended
// ("current official authoritative independent verification as of <date>"), and a single failed or empty search
// ended the turn with no retry. The refusal reason was also not visible to the owner afterwards.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getExternalInfo, setWebSearchPort } from '../lib/ai/tools/getExternalInfo.ts'

const MARKER = ' current official authoritative independent verification as of 2026-10-10'
const QUESTION = 'quem sera o proximo presidente do Brasil?'
const RESULT = { title: 'Eleições 2026', url: 'https://www.tse.jus.br/eleicoes/2026', snippet: 'Resultados do primeiro turno' }
// The pre-existing evidence-diversity lane issues its own second search ("credible disagreement …"); these tests
// count only the primary lane, which is what this change touches.
const isDiversityLane = (query: string) => query.includes('credible disagreement')

test('the search engine receives the question without COS bookkeeping words', async () => {
  const seen: string[] = []
  setWebSearchPort({ async search(query) { if (!isDiversityLane(query)) seen.push(query); return [RESULT] } })
  const out = await getExternalInfo(`${QUESTION}${MARKER}`, 8, { bypassCache: true })
  assert.equal(out.ok, true)
  assert.deepEqual(seen, [QUESTION])
})

test('an empty first search is retried once before failure is reported', async () => {
  const seen: string[] = []
  setWebSearchPort({ async search(query) { if (isDiversityLane(query)) return []; seen.push(query); return seen.length === 1 ? [] : [RESULT] } })
  const out = await getExternalInfo(`${QUESTION}${MARKER}`, 8, { bypassCache: true })
  assert.equal(out.ok, true)
  assert.equal(out.results.length, 1)
  assert.equal(seen.length, 2)
})

test('a transient provider error is retried once', async () => {
  let calls = 0
  setWebSearchPort({ async search(query) { if (isDiversityLane(query)) return []; calls += 1; if (calls === 1) throw new Error('provider timeout'); return [RESULT] } })
  const out = await getExternalInfo(`${QUESTION}${MARKER}`, 8, { bypassCache: true })
  assert.equal(out.ok, true)
  assert.equal(calls, 2)
})

test('two failures report the provider error instead of an empty success', async () => {
  let calls = 0
  setWebSearchPort({ async search(query) { if (isDiversityLane(query)) return []; calls += 1; throw new Error('provider unavailable') } })
  const out = await getExternalInfo(`${QUESTION}${MARKER}`, 8, { bypassCache: true })
  assert.equal(out.ok, false)
  assert.equal(out.error, 'provider unavailable')
  assert.equal(calls, 2, 'exactly one retry')
})

test('two empty searches report "No results found."', async () => {
  let calls = 0
  setWebSearchPort({ async search(query) { if (!isDiversityLane(query)) calls += 1; return [] } })
  const out = await getExternalInfo(`${QUESTION}${MARKER}`, 8, { bypassCache: true })
  assert.equal(out.ok, false)
  assert.equal(out.error, 'No results found.')
  assert.equal(calls, 2)
})

test('the live-fact refusal shows the owner why, and never shows visitors', () => {
  const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
  assert.match(core, /const ownerDiagnostic = input\.privileged\s*\n\s*\? `\\n\\n— Owner diagnostic \(not shown to visitors\) —/)
  assert.match(core, /live search: \$\{queries\.length\} quer/)
  assert.match(core, /reason: \$\{reason\}`/)
  assert.match(core, /reply: freshVerificationUnavailable\(input\.language\) \+ ownerDiagnostic,/)
})
