import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveHistoricalStockChartIntent } from '../lib/ai/cos/historicalStockChartIntent.ts'
import { historicalPricesSvg, loadHistoricalStockPrices, parseYahooHistory, parseStooqHistory, verifyHistoricalPriceCoverage } from '../lib/ai/cos/historicalStockChart.ts'
import { orchestrateDataVisualization } from '../lib/ai/cos/dataVisualizationHarness.ts'

const user = (content: string) => ({role:'user',content})
const assistant = (content: string) => ({role:'assistant',content})

test('COS distinguishes historical financial charts from image generation for any ticker', () => {
  assert.deepEqual(resolveHistoricalStockChartIntent([
    user('place in a graphic VNCE stock price for the past six months'),
  ]), {symbol:'VNCE',range:'6mo'})
  assert.deepEqual(resolveHistoricalStockChartIntent([
    user('Show a price graph for AAPL stock over one year'),
  ]), {symbol:'AAPL',range:'1y'})
  assert.deepEqual(resolveHistoricalStockChartIntent([
    user('Draw a chart of tsla shares for 3 months'),
  ]), {symbol:'TSLA',range:'3mo'})
})

test('a contextually related visualization follow-up inherits exactly the previous user stock task', () => {
  const history = [
    user('VNCE stock closing price over the past six months'),
    assistant('Only a current quote is available; I cannot verify the full six-month history.'),
    user('based on the info your provided you can draw a graphic'),
  ]
  assert.deepEqual(resolveHistoricalStockChartIntent(history), {symbol:'VNCE',range:'6mo'})
  assert.equal(resolveHistoricalStockChartIntent([...history,user('Draw a picture of my dog')]),null)
  assert.equal(resolveHistoricalStockChartIntent([user('VNCE stock price for six months'),user('Tell me a joke'),user('draw a graphic based on that')]),null)
  assert.equal(resolveHistoricalStockChartIntent([user('Draw an ocean scene')]),null)
  assert.equal(resolveHistoricalStockChartIntent([user('What is the latest current VNCE quote?')]),null)
})

function yahoo() {
  return {
    chart: { result: [{
      meta:{ currency:'USD' },
      timestamp:[1704067200,1704153600,1704240000,1704326400],
      indicators:{ quote:[{close:[12.1,12.8,null,11.5]}]},
    }], error:null },
  }
}

test('finance history parser uses actual dated closes, skips missing bars and cannot fabricate points', () => {
  const data=parseYahooHistory(yahoo())
  assert.deepEqual(data?.points,[
    {date:'2024-01-01',close:12.1},
    {date:'2024-01-02',close:12.8},
    {date:'2024-01-04',close:11.5},
  ])
  assert.equal(parseYahooHistory({quote: {currentPrice:13.33}}),null)
  assert.equal(parseYahooHistory({chart:{result:[{timestamp:[1704067200],indicators:{quote:[{close:[13.33]}]}}]}}),null)
})

test('provider fallback accepts only CSV historical series, never search snippets or quotes', () => {
  assert.equal(parseStooqHistory('Current price: 13.33'),null)
  assert.deepEqual(parseStooqHistory([
    'Date,Open,High,Low,Close,Volume',
    '2024-01-01,10,11,9,10.50,1200',
    '2024-01-02,11,12,10,11.50,2100',
    '2024-01-03,12,13,10,11.75,2300',
  ].join('\n')),[
    {date:'2024-01-01',close:10.5},
    {date:'2024-01-02',close:11.5},
    {date:'2024-01-03',close:11.75},
  ])
})

test('live-history adapter is bounded to fixed source hosts and labels actual source',async()=>{
  const urls:string[]=[]
  const fetchImpl = (async(input:RequestInfo|URL)=>{
    urls.push(String(input))
    if(String(input).includes('query1.finance.yahoo.com')) return new Response(JSON.stringify(yahoo()),{status:200})
    throw Error('Unexpected destination')
  }) as typeof fetch
  const r=await loadHistoricalStockPrices('VNCE','6mo',fetchImpl)
  assert.equal(r?.source,'Yahoo Finance')
  assert.equal(r?.currency,'USD')
  assert.equal(r?.points.length,3)
  assert.equal(urls.length,1)
  assert.match(urls[0],/range=6mo/)
  assert.equal(await loadHistoricalStockPrices('../../../bad','6mo',fetchImpl),null)
  assert.equal(urls.length,1)
  const svg=historicalPricesSvg(r!)
  assert.match(svg,/<svg /)
  assert.match(svg,/VNCE · Historical closing prices/)
  assert.match(svg,/2024-01-04/)
  assert.match(svg,/Source: Yahoo Finance/)
  assert.match(svg,/<path d="M/)
  assert.doesNotMatch(svg,/<script|<foreignObject/)
})

test('fallback to a second independent historical-price source when primary is unavailable', async()=>{
  const urls:string[]=[]
  const fetchImpl = (async(input:RequestInfo|URL)=>{
    urls.push(String(input))
    if(String(input).includes('yahoo')) return new Response('Too many requests',{status:429})
    return new Response([
      'Date,Open,High,Low,Close,Volume',
      '2024-01-01,12,13,11,12.25,999',
      '2024-01-02,12,13,11,12.70,999',
      '2024-01-03,12,13,11,12.50,999',
    ].join('\n'),{status:200})
  }) as typeof fetch
  const r=await loadHistoricalStockPrices('MSFT','1mo',fetchImpl)
  assert.equal(r?.source,'Stooq')
  assert.equal(r?.points.length,3)
  assert.equal(urls.length,2)
  assert.match(urls[1],/^https:\/\/stooq.com\/q\/d\/l\//)
})

test('COS browser routes both turns before the image-generation paywall',()=>{
  const browser=readFileSync(join(process.cwd(),'app/api/cos-browser/route.ts'),'utf8')
  assert.ok(browser.indexOf('resolveHistoricalStockChartIntent(messages)') < browser.indexOf('const directVisual'))
  assert.match(browser,/await orchestrateDataVisualization\(messages, req\.url\)/)
  assert.match(browser,/capability_receipt: chartResult\.receipt/)
  const harness=readFileSync(join(process.cwd(),'lib/ai/cos/dataVisualizationHarness.ts'),'utf8')
  assert.match(harness,/source:'cos-historical-stock-chart'/)
  assert.match(harness,/evidence_unavailable/)
  assert.match(harness,/verifyHistoricalPriceCoverage/)
  assert.match(harness,/\/api\/market-charts\//)
  const graphics=readFileSync(join(process.cwd(),'components/AssistantMessage.tsx'),'utf8')
  assert.match(graphics,/function isImageUrl\(/)
  assert.match(graphics,/svg/)
  assert.match(graphics,/function ImageEmbed\(/)
  const endpoint=readFileSync(join(process.cwd(),'app/api/market-charts/[file]/route.ts'),'utf8')
  assert.match(endpoint,/image\/svg\+xml/)
  assert.match(endpoint,/loadHistoricalStockPrices/)
  assert.doesNotMatch(endpoint,/GUEST_VISUAL_TRIAL|visualPost|image_gen/)
})


test('harness refuses historical chart if source observations do not span the requested period', async () => {
  const now = new Date('2024-01-05T00:00:00Z')
  const stock = {
    symbol: 'VNCE',
    range: '6mo' as const,
    currency:'USD',
    source: 'Yahoo Finance' as const,
    sourceUrl:'https://finance.yahoo.com/quote/VNCE/history/',
    fetchedAt:now.toISOString(),
    points:[
      {date:'2024-01-01',close:12},
      {date:'2024-01-02',close:13},
      {date:'2024-01-04',close:14},
    ],
  }
  assert.deepEqual(verifyHistoricalPriceCoverage(stock,now), {ok:false,reason:'insufficient_history'})
  const fakeFetch = (async ()=>new Response(JSON.stringify(yahoo()),{status:200})) as typeof fetch
  const out=await orchestrateDataVisualization(
    [user('Plot six months VNCE stock closing prices')],
    'https://itmounts.com',
    {fetchImpl:fakeFetch,now},
  )
  assert.equal(out?.status,'evidence_rejected')
  assert.equal(out?.receipt.status,'evidence_rejected')
  assert.doesNotMatch(out?.reply||'',/<svg|\/api\/market-charts\//)
})

test('harness renders its own chart backed by a sufficiently broad dated price series',async()=>{
  const now = new Date('2024-07-15T00:00:00Z')
  const start = new Date('2024-01-15T00:00:00Z')
  const timestamp=Array.from({length:185},(_,index)=>Math.round((start.getTime()+index*86400_000)/1000))
  const closes=timestamp.map((_,index)=>12+index/48)
  const valid={
    chart:{result:[{meta:{currency:'USD'},timestamp,indicators:{quote:[{close:closes}]}}]},
  }
  const fakeFetch = (async()=>new Response(JSON.stringify(valid),{status:200})) as typeof fetch
  const out=await orchestrateDataVisualization([
    user('Draw a chart of VNCE stock price for six months'),
  ], 'https://itmounts.com', {fetchImpl:fakeFetch,now})
  assert.equal(out?.status,'completed')
  assert.equal(out?.receipt.capability,'data_visualization.historical_financial_series')
  assert.ok((out?.receipt.observation_count||0)>100)
  assert.match(out?.reply||'',/https:\/\/itmounts.com\/api\/market-charts\/VNCE.svg\?range=6mo/)
  assert.match(out?.reply||'',/observed closing prices/)
  assert.doesNotMatch(out?.reply||'',/visual trial|upgrade/i)
  assert.equal(out?.receipt.checks.includes('range_coverage_verified'),true)
})
