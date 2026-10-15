/**
 * Selects the historical-financial-data capability instead of sending a chart
 * request to image generation. This is routing only: real prices must come from
 * a verifiable market-data source, never be invented by the language model.
 */
export type StockChartRange = '1mo' | '3mo' | '6mo' | '1y' | '5y'
export type HistoricalStockChartIntent = Readonly<{ symbol: string; range: StockChartRange }>
type Turn = Readonly<{ role?: unknown; content?: unknown }>

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/
const TICKER_STOP = new Set(['PRICE','STOCK','GRAPH','CHART','PAST','LAST','MONTH','MONTHS','YEAR','YEARS','DRAW','MAKE','SHOW','WITH','FROM','PLOT','USD','THE','DATA','INFO','HISTORICAL','SHARE','SHARES','GRAPHIC','SIX','THREE','ONE','FIVE','THIS','THAT','BASED'])
const CHART_REQUEST = /\b(?:chart|graph|graphic|plot|visuali[sz]e|draw|diagram|visual\s+representation)\b/i
const MARKET_TOPIC = /\b(?:stock|share[s]?|equity|ticker|market\s+price|closing\s+price|historical\s+price|price\s+history|share\s+price)\b/i
const PRICE_HISTORY = /\b(?:price|closing|close|history|historical|performance|movement|returns?)\b/i
const FOLLOWUP = /\b(?:draw|graph|chart|plot|graphic|visuali[sz]e)\b/i
const REFERENCE = /\b(?:based\s+on|previous|earlier|above|that|those|information|info|provided|you\s+gave|you\s+provided|the\s+data|what\s+you|using)\b/i

function rangeOf(text: string): StockChartRange {
  const value = text.toLowerCase()
  if (/\b(?:5\s*(?:years?|yrs?)|five\s+years?)\b/.test(value)) return '5y'
  if (/\b(?:1\s*(?:year|yr)|one\s+year|12\s*months?|twelve\s+months?)\b/.test(value)) return '1y'
  if (/\b(?:1\s*(?:month|mo)|one\s+month)\b/.test(value)) return '1mo'
  if (/\b(?:3\s*(?:months?|mos?)|three\s+months?)\b/.test(value)) return '3mo'
  if (/\b(?:6\s*(?:months?|mos?)|six\s+months?|half\s+a\s+year)\b/.test(value)) return '6mo'
  return '6mo'
}

function tickerOf(text: string): string | null {
  const named = text.match(/\b(?:ticker|symbol)\s*[:#]?\s*([A-Z][A-Z0-9.-]{0,9})\b/i)
  if (named && SYMBOL.test(named[1].toUpperCase())) return named[1].toUpperCase()
  // Accept natural lower-case ticker mentions next to a financial noun, but
  // never turn an arbitrary word in a narrative into an unverified symbol.
  const adjacent = text.match(/\b([A-Za-z][A-Za-z0-9.-]{0,9})\s+(?:stock|shares?|ticker)\b/i)
  if (adjacent) {
    const value = adjacent[1].toUpperCase()
    if (SYMBOL.test(value) && !TICKER_STOP.has(value)) return value
  }
    const upper = text.match(/\b[A-Z][A-Z0-9.-]{1,9}\b/g) || []
  return upper.find(value => SYMBOL.test(value) && !TICKER_STOP.has(value)) || null
}

function candidate(text: string, chartRequired: boolean): HistoricalStockChartIntent | null {
  if (!MARKET_TOPIC.test(text) || !PRICE_HISTORY.test(text)) return null
  if (chartRequired && !CHART_REQUEST.test(text)) return null
  const symbol = tickerOf(text)
  return symbol ? { symbol, range: rangeOf(text) } : null
}

/** The current request owns the topic; an elliptical follow-up may inherit only
 * the immediately relevant prior user market-data request. It never inherits an
 * unrelated earlier chart from a conversation that changed subjects.
 */
export function resolveHistoricalStockChartIntent(messages: readonly Turn[]): HistoricalStockChartIntent | null {
  const turns = messages.filter(m => m.role === 'user' && typeof m.content === 'string')
    .map(m => String(m.content || '').trim()).filter(Boolean)
  const current = turns.at(-1) || ''
  if (!current || current.length > 1300) return null
  const explicit = candidate(current, true)
  if (explicit) return explicit
  if (!FOLLOWUP.test(current) || !REFERENCE.test(current) || turns.length < 2) return null
  const previous = turns.at(-2) || ''
  if (previous.length > 1300) return null
  return candidate(previous, false)
}
