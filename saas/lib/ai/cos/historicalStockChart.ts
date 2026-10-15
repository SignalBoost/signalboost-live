import type { StockChartRange } from './historicalStockChartIntent.ts'

export type StockPricePoint = Readonly<{ date: string; close: number }>
export type HistoricalPrices = Readonly<{
  symbol: string
  currency: string
  range: StockChartRange
  points: readonly StockPricePoint[]
  source: 'Yahoo Finance' | 'Stooq'
  sourceUrl: string
  fetchedAt: string
}>
type Fetcher = typeof fetch

const ALLOWED_SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/
const ALLOWED_RANGES = new Set(['1mo', '3mo', '6mo', '1y', '5y'])
const MAX_BODY = 650_000
const DEADLINE_MS = 6500

async function boundedFetch(url: string, fetchImpl: Fetcher, type: 'json' | 'csv'): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; COSHistoricalChart/1.0)', Accept: type === 'json' ? 'application/json' : 'text/csv' },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = await response.text()
    if (!body || body.length > MAX_BODY) return null
    return type === 'json' ? JSON.parse(body) : body
  } catch { return null } finally { clearTimeout(timer) }
}

function validPoints(points: StockPricePoint[]): StockPricePoint[] {
  const dates = new Map<string, number>()
  const now = Date.now() + 36 * 3600_000
  for (const point of points) {
    const stamp = Date.parse(point.date + 'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(stamp) || stamp > now) continue
    if (!Number.isFinite(point.close) || point.close <= 0 || point.close > 1_000_000) continue
    dates.set(point.date, point.close)
  }
  return [...dates.entries()].sort(([a], [b]) => a.localeCompare(b))
    .slice(-1600).map(([date, close]) => ({date,close}))
}

export function parseYahooHistory(raw: unknown): { currency: string; points: StockPricePoint[] } | null {
  const result = (raw as any)?.chart?.result?.[0]
  const ts = result?.timestamp
  const close = result?.indicators?.quote?.[0]?.close
  if (!Array.isArray(ts) || !Array.isArray(close)) return null
  const rows: StockPricePoint[] = []
  for (let i = 0; i < Math.min(ts.length, close.length, 1600); i += 1) {
    if (!Number.isFinite(ts[i]) || !Number.isFinite(close[i])) continue
    rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: close[i] })
  }
  const points = validPoints(rows)
  if (points.length < 3) return null
  const currency = String(result?.meta?.currency || 'USD').toUpperCase()
  return { points, currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD' }
}

export function parseStooqHistory(raw: unknown): StockPricePoint[] | null {
  if (typeof raw !== 'string' || !/^date,open,high,low,close,volume/i.test(raw.trimStart())) return null
  const rows: StockPricePoint[] = []
  const lines = raw.trim().split(/\r?\n/)
  for (const line of lines.slice(1, 1800)) {
    const cells = line.split(',')
    if (cells.length < 5) continue
    rows.push({ date: String(cells[0]).trim(), close: Number(cells[4]) })
  }
  const points = validPoints(rows)
  return points.length >= 3 ? points : null
}

function stooqWindow(range: StockChartRange) {
  const today = new Date()
  const from = new Date(today)
  const months = range === '1mo' ? 1 : range === '3mo' ? 3 : range === '6mo' ? 6 : range === '1y' ? 12 : 60
  from.setUTCMonth(from.getUTCMonth() - months)
  const stamp = (date: Date) => date.toISOString().slice(0,10).replace(/-/g,'')
  return { from: stamp(from), to: stamp(today) }
}

/**
 * The market source, not the model, supplies every plotted data point.
 * Try two independent public historical feeds, never using a current quote
 * as a fabricated six-month series. No keys, account data or image credits.
 */
export async function loadHistoricalStockPrices(
  symbol: string,
  range: StockChartRange,
  fetchImpl: Fetcher = fetch,
): Promise<HistoricalPrices | null> {
  const ticker = String(symbol || '').toUpperCase()
  if (!ALLOWED_SYMBOL.test(ticker) || !ALLOWED_RANGES.has(range)) return null
  const yahoo = new URL('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker))
  yahoo.searchParams.set('range', range)
  yahoo.searchParams.set('interval', range === '5y' ? '1wk' : '1d')
  const result = parseYahooHistory(await boundedFetch(yahoo.toString(), fetchImpl, 'json'))
  if (result) {
    return {
      symbol: ticker, range, currency: result.currency, points: result.points,
      source: 'Yahoo Finance', sourceUrl: 'https://finance.yahoo.com/quote/' + ticker + '/history/',
      fetchedAt: new Date().toISOString(),
    }
  }
  const bounds = stooqWindow(range)
  const stooq = new URL('https://stooq.com/q/d/l/')
  stooq.searchParams.set('s', ticker.toLowerCase() + '.us')
  stooq.searchParams.set('i', 'd')
  stooq.searchParams.set('d1', bounds.from)
  stooq.searchParams.set('d2', bounds.to)
  const rows = parseStooqHistory(await boundedFetch(stooq.toString(), fetchImpl, 'csv'))
  if (!rows) return null
  return {
    symbol: ticker, range, currency: 'USD', points: rows,
    source: 'Stooq', sourceUrl: 'https://stooq.com/q/d/?s=' + ticker.toLowerCase() + '.us',
    fetchedAt: new Date().toISOString(),
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] || c))
}

export function historicalPricesSvg(series: HistoricalPrices): string {
  const rows = series.points
  if (rows.length < 3) throw new Error('historical_prices_insufficient')
  const w = 920, h = 470, left = 80, right = 34, top = 85, bottom = 87
  const pw = w-left-right, ph = h-top-bottom
  const lows = Math.min(...rows.map(p=>p.close)), highs = Math.max(...rows.map(p=>p.close))
  const padding = Math.max(0.01,(highs-lows)*0.10)
  const min = Math.max(0,lows-padding), max = highs+padding
  const x = (i: number) => left+(i/(rows.length-1))*pw
  const y = (v: number) => top+ph-(v-min)/(max-min)*ph
  const path = rows.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(p.close).toFixed(1)).join(' ')
  const first=rows[0],last=rows[rows.length-1], pct=(last.close/first.close-1)*100
  const up=pct>=0
  const lineColor=up?'#21d2b3':'#ff777a'
  const ticks=Array.from({length:5},(_,i)=>min+(max-min)*i/4)
  const grid=ticks.map(v=>'<line x1="'+left+'" x2="'+(w-right)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="#273651" stroke-width="1"/><text x="'+(left-10)+'" y="'+(y(v)+4).toFixed(1)+'" fill="#adc2da" font-size="13" text-anchor="end">'+v.toFixed(2)+'</text>').join('')
  const dates=Array.from({length:5},(_,i)=>Math.min(rows.length-1,Math.round(i*(rows.length-1)/4)))
    .map(i=>'<text x="'+x(i).toFixed(1)+'" y="'+(h-bottom+27)+'" fill="#adc2da" font-size="13" text-anchor="middle">'+esc(rows[i].date)+'</text>').join('')
  const change=(up?'+':'')+pct.toFixed(2)+'%'
  return '<?xml version="1.0" encoding="UTF-8"?>'+
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(series.symbol)+' verified historical closing prices">'+
    '<rect width="'+w+'" height="'+h+'" fill="#091324" rx="18"/>'+
    '<text x="'+left+'" y="35" fill="#ffffff" font-family="system-ui,Arial" font-weight="700" font-size="25">'+esc(series.symbol)+' · Historical closing prices</text>'+
    '<text x="'+left+'" y="64" fill="#cad9ea" font-family="system-ui,Arial" font-size="15">'+esc(series.range)+' · '+esc(series.currency)+' · '+esc(first.date)+' to '+esc(last.date)+'</text>'+
    '<text x="'+(w-right)+'" y="64" text-anchor="end" font-family="system-ui,Arial" fill="'+lineColor+'" font-size="17" font-weight="700">'+esc(change)+'</text>'+
    '<g font-family="system-ui,Arial">'+grid+dates+'<path d="'+path+'" fill="none" stroke="'+lineColor+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<circle cx="'+x(rows.length-1).toFixed(1)+'" cy="'+y(last.close).toFixed(1)+'" r="4.5" fill="'+lineColor+'"/>'+
    '<text x="'+left+'" y="'+(h-18)+'" fill="#899fb8" font-size="12">Source: '+esc(series.source)+' · Daily/weekly close · Retrieved '+esc(series.fetchedAt.slice(0,16).replace('T',' '))+' UTC</text></g>'+
    '</svg>'
}
