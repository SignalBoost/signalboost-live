import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildPriceHistoryChart,
  detectPriceHistoryChartRequest,
  fetchPriceHistory,
  parseStooqCsv,
  parseYahooChart,
  priceHistoryUnavailableReply,
} from '../lib/market/priceHistoryChart.ts'

// Production 2026-10-15: "place in a graphic VNCE stock price for the past six months" returned only
// the current quote, and "based on the info your provided you can draw a graphic" went to image
// generation and hit the guest visual trial. A price chart is plotted from real daily closes.
test('price-chart requests are recognised, including a follow-up that names no ticker', () => {
  assert.deepEqual(detectPriceHistoryChartRequest('place in a graphic VNCE stock price for the past six months'), { ticker: 'VNCE', months: 6, periodLabel: 'past 6 months' })
  assert.deepEqual(
    detectPriceHistoryChartRequest('based on the info your provided you can draw a graphic', ['place in a graphic VNCE stock price for the past six months']),
    { ticker: 'VNCE', months: 6, periodLabel: 'past 6 months' },
  )
  assert.equal(detectPriceHistoryChartRequest('chart $AAPL over the last 1 year')?.months, 12)
  assert.equal(detectPriceHistoryChartRequest('gráfico del precio de la acción de MSFT')?.ticker, 'MSFT')
  // Not a price chart: no chart word, no ticker, or an illustration request.
  assert.equal(detectPriceHistoryChartRequest('what is the VNCE stock price?'), null)
  assert.equal(detectPriceHistoryChartRequest('draw a cat playing football'), null)
  assert.equal(detectPriceHistoryChartRequest('draw a graphic of the price of coffee'), null)
  assert.equal(detectPriceHistoryChartRequest('draw a graphic', ['edit - Thank you Tim, shall I send the TA?']), null)
})

const DAY = 86_400
const yahooPayload = {
  chart: { result: [{
    meta: { currency: 'USD' },
    timestamp: [1_776_000_000, 1_776_000_000 + DAY, 1_776_000_000 + 2 * DAY, 1_776_000_000 + 40 * DAY],
    indicators: { quote: [{ close: [10, null, 12.5, 13.33] }], adjclose: [{ adjclose: [10, null, 12.5, 13.33] }] },
  }] },
}

test('market-data parsers keep only real chronological closes', () => {
  const yahoo = parseYahooChart(yahooPayload)
  assert.equal(yahoo?.currency, 'USD')
  assert.deepEqual(yahoo?.points.map(point => point.value), [10, 12.5, 13.33])
  assert.equal(parseYahooChart({ chart: { result: [] } }), null)
  const stooq = parseStooqCsv('Date,Open,High,Low,Close,Volume\n2026-05-02,1,1,1,11.5,10\n2026-05-01,1,1,1,11,10\n')
  assert.deepEqual(stooq, [{ date: '2026-05-01', value: 11 }, { date: '2026-05-02', value: 11.5 }])
  assert.equal(parseStooqCsv('No data'), null)
})

test('the chart falls back to a second source and never invents data', async () => {
  const request = { ticker: 'VNCE', months: 6, periodLabel: 'past 6 months' }
  const calls: string[] = []
  const history = await fetchPriceHistory(request, {
    now: new Date('2026-10-15T20:00:00Z'),
    fetcher: async url => {
      calls.push(url)
      if (url.includes('yahoo')) return new Response('blocked', { status: 429 })
      return new Response('Date,Open,High,Low,Close,Volume\n2026-04-15,1,1,1,9,1\n2026-10-15,1,1,1,13.33,1\n', { status: 200 })
    },
  })
  assert.equal(history?.source.name, 'Stooq')
  assert.match(calls[0], /query1\.finance\.yahoo\.com\/v8\/finance\/chart\/VNCE\?period1=\d+&period2=\d+&interval=1d/)
  assert.match(calls[1], /stooq\.com\/q\/d\/l\/\?s=vnce\.us&i=d&d1=2026041[56]&d2=20261015/)

  const none = await fetchPriceHistory(request, { fetcher: async () => new Response('', { status: 503 }) })
  assert.equal(none, null)
  assert.match(priceHistoryUnavailableReply(request), /did not draw a chart/)
  assert.match(priceHistoryUnavailableReply(request, 'es'), /no dibujé un gráfico/)
})

test('the chart is a real PNG with cited figures from the data', () => {
  const request = { ticker: 'VNCE', months: 6, periodLabel: 'past 6 months' }
  const history = { ticker: 'VNCE', currency: 'USD', points: parseYahooChart(yahooPayload)!.points, source: { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/VNCE/history' } }
  const chart = buildPriceHistoryChart(request, history)
  assert.deepEqual([...chart.png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(chart.png.readUInt32BE(16), 960)
  assert.match(chart.reply, /Latest close: \$13\.33/)
  assert.match(chart.reply, /\+33\.3% over the period/)
  assert.match(chart.reply, /Sources: \[Yahoo Finance - VNCE\]\(https:\/\/finance\.yahoo\.com\/quote\/VNCE\/history\)/)
  assert.match(buildPriceHistoryChart(request, history, 'ar').reply, /آخر إغلاق/)
})

test('a price chart the agent loop could not deliver falls back to the deterministic renderer', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const loop = primary.indexOf('const result=await runCosAgentLoop(')
  const fallback = primary.indexOf('const priceChart=detectPriceHistoryChartRequest(turn.input,earlierUserTurns)')
  assert.ok(loop > 0 && fallback > loop)
  assert.match(primary, /source:'cos-market-chart'/)
})
