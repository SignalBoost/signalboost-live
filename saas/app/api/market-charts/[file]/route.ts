import { NextRequest, NextResponse } from 'next/server'
import { historicalPricesSvg, loadHistoricalStockPrices, verifyHistoricalPriceCoverage } from '@/lib/ai/cos/historicalStockChart'
import type { StockChartRange } from '@/lib/ai/cos/historicalStockChartIntent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RANGES = new Set<StockChartRange>(['1mo','3mo','6mo','1y','5y'])

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  const symbol = /^([A-Z][A-Z0-9.-]{0,9})\.svg$/i.exec(file || '')?.[1]?.toUpperCase()
  const range = req.nextUrl.searchParams.get('range') || '6mo'
  if (!symbol || !RANGES.has(range as StockChartRange)) {
    return NextResponse.json({ error: 'invalid_stock_chart_request' }, { status: 400 })
  }
  const prices = await loadHistoricalStockPrices(symbol, range as StockChartRange)
  if (!prices || !verifyHistoricalPriceCoverage(prices).ok) {
    return NextResponse.json({
      error: 'historical_prices_unavailable',
      message: 'A stock chart requires independently retrieved dated historical closes. No points were fabricated.',
    }, { status: 503, headers: {'Cache-Control': 'no-store'} })
  }
  return new Response(historicalPricesSvg(prices), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
