import assert from 'node:assert/strict'
import test from 'node:test'
import { compactStructuredLiveEvidence } from '../lib/ai/tools/getStructuredLiveInfo.ts'

test('structured stock evidence surfaces a current quote even after bulky chart metadata', () => {
  const chart = Object.fromEntries(Array.from({ length: 350 }, (_, index) => [`point_${index}`, index]))
  const raw = [{
    chart,
    profile: { companyName: 'Tesla Inc.', exchange: 'NASDAQ' },
    quote: {
      symbol: 'TSLA',
      regularMarketPrice: 321.45,
      previousClose: 317.2,
      dayHigh: 324.1,
      dayLow: 315.8,
      changePercent: 1.34,
    },
  }]

  const evidence = compactStructuredLiveEvidence('stocks', '2026-08-16T02:45:00.000Z', raw)
  assert.match(evidence, /STRUCTURED_REALTIME vertical=stocks/)
  assert.match(evidence, /regularMarketPrice=321\.45/i)
  assert.match(evidence, /symbol=TSLA/i)
  assert.ok(evidence.indexOf('regularMarketPrice=321.45') < evidence.indexOf('previousClose=317.2'))
  assert.ok(evidence.length <= 480)
})

test('camelCase, snake_case, and dotted current-value fields outrank historical values', () => {
  const raw = [{
    history: Array.from({ length: 12 }, (_, index) => ({ close: 100 + index, timestamp: index })),
    last_trade_price: 222.75,
    exchangeRate: 0.8645,
    currentPrice: 223.01,
    ticker: 'TEST',
  }]
  const evidence = compactStructuredLiveEvidence('stocks', '2026-08-16T02:45:00.000Z', raw)

  assert.match(evidence, /last_trade_price=222\.75/i)
  assert.match(evidence, /exchangeRate=0\.8645/i)
  assert.match(evidence, /currentPrice=223\.01/i)
  assert.match(evidence, /ticker=TEST/i)
  assert.ok(evidence.indexOf('currentPrice=223.01') < evidence.indexOf('history[0].close=100'))
})
