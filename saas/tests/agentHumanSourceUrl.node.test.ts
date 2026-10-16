// saas/tests/agentHumanSourceUrl.node.test.ts
//
// Production 2026-10-16: the VNCE chart answer's "Sources" link opened Yahoo's raw chart JSON.
// Agent answers must cite the public page for the data, not the machine endpoint it was fetched from.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { humanSourceUrl, withHumanSourceLinks } from '../lib/ai/cos/agentLoop/humanSourceUrl.ts'

test('machine data endpoints map to the public page for the same data', () => {
  assert.equal(humanSourceUrl('https://query1.finance.yahoo.com/v8/finance/chart/VNCE?range=6mo&interval=1d'), 'https://finance.yahoo.com/quote/VNCE/history')
  assert.equal(humanSourceUrl('https://query2.finance.yahoo.com/v8/finance/chart/BRK-B?range=1y'), 'https://finance.yahoo.com/quote/BRK-B/history')
  assert.equal(humanSourceUrl('https://stooq.com/q/d/l/?s=vnce.us&i=d'), 'https://stooq.com/q/d/?s=vnce.us')
  assert.equal(humanSourceUrl('https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000?startyear=2021&endyear=2026'), 'https://data.bls.gov/timeseries/LNS14000000')
  assert.equal(humanSourceUrl('https://api.worldbank.org/v2/country/MEX/indicator/SL.UEM.TOTL.ZS?format=json&per_page=200'), 'https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS?locations=MEX')
  assert.equal(humanSourceUrl('https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json'), 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD')
})

test('ordinary pages and malformed input are left unchanged', () => {
  assert.equal(humanSourceUrl('https://www.reuters.com/markets/'), 'https://www.reuters.com/markets/')
  assert.equal(humanSourceUrl('https://finance.yahoo.com/quote/VNCE/'), 'https://finance.yahoo.com/quote/VNCE/')
  assert.equal(humanSourceUrl('not a url'), 'not a url')
})

test('the observed VNCE answer now cites the Yahoo history page', () => {
  const answer = 'Sources:\n- [Yahoo Finance — VNCE chart API](https://query1.finance.yahoo.com/v8/finance/chart/VNCE?range=6mo&interval=1d)'
  assert.equal(withHumanSourceLinks(answer), 'Sources:\n- [Yahoo Finance — VNCE chart API](https://finance.yahoo.com/quote/VNCE/history)')
  assert.equal(withHumanSourceLinks('See https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0.'), 'See https://data.bls.gov/timeseries/CUUR0000SA0.')
})

test('the agent loop verifies URLs first, then rewrites answer links and the sources list', () => {
  const loop = readFileSync(new URL('../lib/ai/cos/agentLoop/cosAgentLoop.ts', import.meta.url), 'utf8')
  assert.match(loop, /const \{ text, dropped \} = stripUnverifiedUrls\(answer, evidence\.sourceUrls\)[\s\S]*reply: withHumanSourceLinks\(text\)/)
  assert.match(loop, /sources: \[\.\.\.new Set\(\[\.\.\.evidence\.sourceUrls\]\.map\(humanSourceUrl\)\)\]/)
})
