// saas/lib/market/priceHistoryChart.ts
//
// "Place in a graphic VNCE stock price for the past six months". Production 2026-10-15: COS answered
// with only the current quote ("the live evidence … does not contain the historical data"), and the
// follow-up "based on the info you provided you can draw a graphic" went to image generation, which
// cannot plot real data and spent the guest visual trial. A price chart is data, not an illustration:
// fetch the daily closes from a public market-data endpoint, plot them deterministically, and cite
// the source. No model is involved, so nothing is invented and no visual trial is spent.

import { renderLineChartPng, type ChartPoint } from './pngChart.ts'

export type PriceHistoryRequest = { ticker: string; months: number; periodLabel: string }
export type PriceHistory = { ticker: string; currency: string; points: ChartPoint[]; source: { name: string; url: string } }

const CHART_WORD = /\b(?:chart|charts|graph|graphs|graphic|graphics|plot|visuali[sz]e|draw|diagram)\b|\bgr[aá]fic[oa]s?\b|\bgr[aá]fico\b|\bwykres\b|\bgraphique\b|\bgrafik\b|\bграфик\b/iu
const PRICE_WORD = /\b(?:stock|stocks|shares?|share\s+price|stock\s+price|price|prices|ticker|quote|quotes)\b|\bacci(?:[oó]n|ones)\b|\bprecio\b|\bcotiza(?:ci[oó]n)?\b|\ba[cç][aã]o\b|\bpre[cç]o\b|\bkurs\b|\bcena\b|\bакци[яи]\b/iu
// Upper-case symbol next to a stock word, or a $SYMBOL cashtag. Upper case is required, so ordinary
// words ("the", "a") never become tickers.
const TICKER_BEFORE_WORD = /\b([A-Z]{1,5}(?:\.[A-Z])?)(?:['’]s)?\s+(?:stock|shares?|share\s+price|stock\s+price|price|prices|quote)\b/u
const TICKER_AFTER_WORD = /\b(?:stock|ticker|shares\s+of|price\s+of|symbol|acci[oó]n(?:es)?\s+de|precio\s+de)\s+\$?([A-Z]{1,5}(?:\.[A-Z])?)\b/u
const CASHTAG = /\$([A-Z]{1,5}(?:\.[A-Z])?)\b/u
const NOT_TICKERS = new Set(['I', 'A', 'AN', 'THE', 'USD', 'EUR', 'GBP', 'US', 'USA', 'OK', 'AI', 'COS', 'CEO', 'PDF', 'PNG', 'TA'])
const NUMBER_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20, a: 1 }
const PERIOD = /\b(?:past|last|previous|over\s+the\s+(?:past|last))\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|a)?\s*(day|days|week|weeks|month|months|year|years)\b/i
const MAX_MONTHS = 60

function ticker(text: string): string | null {
  for (const pattern of [CASHTAG, TICKER_BEFORE_WORD, TICKER_AFTER_WORD]) {
    const symbol = pattern.exec(text)?.[1]
    if (symbol && !NOT_TICKERS.has(symbol)) return symbol
  }
  return null
}

function period(text: string): { months: number; periodLabel: string } {
  const match = PERIOD.exec(text)
  if (!match) return { months: 6, periodLabel: 'past 6 months' }
  const count = match[1] ? (/^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1].toLowerCase()] ?? 1) : 1
  const unit = match[2].toLowerCase().replace(/s$/, '')
  const months = unit === 'year' ? count * 12 : unit === 'week' ? count / 4.345 : unit === 'day' ? count / 30.4 : count
  const bounded = Math.min(MAX_MONTHS, Math.max(0.25, months))
  return { months: bounded, periodLabel: `past ${count} ${unit}${count === 1 ? '' : 's'}` }
}

/**
 * The current user turn asks for a chart of a security's price. A follow-up such as "draw a
 * graphic" with no symbol inherits the symbol and period from the most recent earlier user turn
 * that named one with a price word.
 */
export function detectPriceHistoryChartRequest(prompt: string, earlierUserTurns: readonly string[] = []): PriceHistoryRequest | null {
  const current = String(prompt || '')
  if (!CHART_WORD.test(current)) return null
  const currentTicker = PRICE_WORD.test(current) ? ticker(current) : CASHTAG.exec(current)?.[1] ?? null
  if (currentTicker) return { ticker: currentTicker, ...period(current) }
  if (PRICE_WORD.test(current) && !/\b(?:it|that|this|those|these|same|info|information|data|above)\b|\binfo\b/i.test(current)) return null
  for (const earlier of [...earlierUserTurns].reverse().slice(0, 3)) {
    const text = String(earlier || '')
    const earlierTicker = PRICE_WORD.test(text) ? ticker(text) : null
    if (earlierTicker) return { ticker: earlierTicker, ...(PERIOD.test(current) ? period(current) : period(text)) }
  }
  return null
}

function isoDay(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

/** Parse a Yahoo Finance v8 chart payload into chronological daily closes. */
export function parseYahooChart(payload: unknown): { currency: string; points: ChartPoint[] } | null {
  const result = (payload as any)?.chart?.result?.[0]
  const timestamps: unknown[] = Array.isArray(result?.timestamp) ? result.timestamp : []
  const closes: unknown[] = result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close ?? []
  const points: ChartPoint[] = []
  timestamps.forEach((timestamp, index) => {
    const value = Number(closes[index])
    if (typeof timestamp === 'number' && closes[index] !== null && Number.isFinite(value) && value > 0) points.push({ date: isoDay(timestamp), value })
  })
  if (points.length < 2) return null
  return { currency: String(result?.meta?.currency || 'USD'), points }
}

/** Parse a Stooq daily CSV (Date,Open,High,Low,Close,Volume) into chronological daily closes. */
export function parseStooqCsv(csv: string): ChartPoint[] | null {
  const lines = String(csv || '').trim().split(/\r?\n/)
  const header = (lines.shift() || '').toLowerCase().split(',')
  const dateIndex = header.indexOf('date')
  const closeIndex = header.indexOf('close')
  if (dateIndex < 0 || closeIndex < 0) return null
  const points = lines
    .map(line => line.split(','))
    .map(cells => ({ date: cells[dateIndex], value: Number(cells[closeIndex]) }))
    .filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  return points.length >= 2 ? points : null
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

async function fetchWithTimeout(fetcher: Fetcher, url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; SignalBoostCOS/1.0)', accept: 'application/json,text/csv,*/*' }, cache: 'no-store' })
    return response.ok ? response : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchPriceHistory(request: PriceHistoryRequest, options: { fetcher?: Fetcher; now?: Date; timeoutMs?: number } = {}): Promise<PriceHistory | null> {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? new Date()
  const timeoutMs = options.timeoutMs ?? 6_000
  const end = Math.floor(now.getTime() / 1000)
  const start = end - Math.round(request.months * 30.4375 * 86_400)
  const symbol = request.ticker

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${start}&period2=${end}&interval=1d&includeAdjustedClose=true`
  const yahoo = await fetchWithTimeout(fetcher, yahooUrl, timeoutMs)
  const parsedYahoo = yahoo ? parseYahooChart(await yahoo.json().catch(() => null)) : null
  if (parsedYahoo) {
    return { ticker: symbol, currency: parsedYahoo.currency, points: parsedYahoo.points, source: { name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history` } }
  }

  const day = (seconds: number) => isoDay(seconds).replace(/-/g, '')
  const stooqSymbol = symbol.includes('.') ? symbol.toLowerCase() : `${symbol.toLowerCase()}.us`
  const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d&d1=${day(start)}&d2=${day(end)}`
  const stooq = await fetchWithTimeout(fetcher, stooqUrl, timeoutMs)
  const parsedStooq = stooq ? parseStooqCsv(await stooq.text().catch(() => '')) : null
  if (parsedStooq) {
    return { ticker: symbol, currency: 'USD', points: parsedStooq, source: { name: 'Stooq', url: `https://stooq.com/q/d/?s=${encodeURIComponent(stooqSymbol)}` } }
  }
  return null
}

function money(value: number, currency: string): string {
  const prefix = currency === 'USD' ? '$' : ''
  const suffix = currency === 'USD' ? '' : ` ${currency}`
  return `${prefix}${value.toFixed(2)}${suffix}`
}

export type PriceHistoryChart = { reply: string; png: Buffer; filename: string; alt: string }
export type ChartLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

type ReplyCopy = {
  intro: (ticker: string, from: string, to: string, days: number) => string
  start: string; latest: string; high: string; low: string; on: string; overPeriod: string; note: string
  unavailable: (ticker: string) => string
}

const COPY: Readonly<Record<ChartLanguage, ReplyCopy>> = {
  en: { intro: (t, f, to, d) => `Here is ${t}'s daily closing price from ${f} to ${to} (${d} trading days).`, start: 'Start', latest: 'Latest close', high: 'High', low: 'Low', on: 'on', overPeriod: 'over the period', note: 'Prices are adjusted closes where the source provides them. This is market data, not investment advice.', unavailable: t => `I could not retrieve ${t}'s daily price history from the market-data sources right now, so I did not draw a chart. I will not plot invented prices. Please try again in a minute, or check that ${t} is the right ticker symbol.` },
  es: { intro: (t, f, to, d) => `Este es el precio de cierre diario de ${t} del ${f} al ${to} (${d} sesiones).`, start: 'Inicio', latest: 'Último cierre', high: 'Máximo', low: 'Mínimo', on: 'el', overPeriod: 'en el período', note: 'Los precios son cierres ajustados cuando la fuente los ofrece. Son datos de mercado, no asesoramiento de inversión.', unavailable: t => `No pude obtener ahora el historial de precios diarios de ${t} de las fuentes de datos de mercado, así que no dibujé un gráfico. No voy a graficar precios inventados. Inténtalo de nuevo en un minuto o verifica que ${t} sea el símbolo correcto.` },
  pt: { intro: (t, f, to, d) => `Este é o preço de fechamento diário de ${t} de ${f} a ${to} (${d} pregões).`, start: 'Início', latest: 'Último fechamento', high: 'Máxima', low: 'Mínima', on: 'em', overPeriod: 'no período', note: 'Os preços são fechamentos ajustados quando a fonte os fornece. São dados de mercado, não recomendação de investimento.', unavailable: t => `Não consegui obter agora o histórico de preços diários de ${t} nas fontes de dados de mercado, então não desenhei um gráfico. Não vou plotar preços inventados. Tente novamente em um minuto ou confira se ${t} é o código correto.` },
  pl: { intro: (t, f, to, d) => `Oto dzienna cena zamknięcia ${t} od ${f} do ${to} (${d} sesji).`, start: 'Początek', latest: 'Ostatnie zamknięcie', high: 'Maksimum', low: 'Minimum', on: 'dnia', overPeriod: 'w tym okresie', note: 'Ceny są skorygowanymi zamknięciami, jeśli źródło je podaje. To dane rynkowe, nie porada inwestycyjna.', unavailable: t => `Nie udało mi się teraz pobrać dziennej historii cen ${t} ze źródeł danych rynkowych, więc nie narysowałem wykresu. Nie będę rysować wymyślonych cen. Spróbuj ponownie za minutę lub sprawdź, czy ${t} to właściwy symbol.` },
  ru: { intro: (t, f, to, d) => `Дневная цена закрытия ${t} с ${f} по ${to} (${d} торговых дней).`, start: 'Начало', latest: 'Последнее закрытие', high: 'Максимум', low: 'Минимум', on: '', overPeriod: 'за период', note: 'Цены — скорректированные закрытия, если источник их предоставляет. Это рыночные данные, а не инвестиционный совет.', unavailable: t => `Сейчас не удалось получить историю дневных цен ${t} из источников рыночных данных, поэтому график не построен. Я не буду рисовать выдуманные цены. Повторите попытку через минуту или проверьте тикер ${t}.` },
  de: { intro: (t, f, to, d) => `Hier ist der tägliche Schlusskurs von ${t} vom ${f} bis ${to} (${d} Handelstage).`, start: 'Beginn', latest: 'Letzter Schluss', high: 'Hoch', low: 'Tief', on: 'am', overPeriod: 'im Zeitraum', note: 'Die Kurse sind bereinigte Schlusskurse, sofern die Quelle sie liefert. Dies sind Marktdaten, keine Anlageberatung.', unavailable: t => `Ich konnte die tägliche Kurshistorie von ${t} gerade nicht aus den Marktdatenquellen abrufen und habe daher kein Diagramm erstellt. Erfundene Kurse zeichne ich nicht. Bitte versuchen Sie es in einer Minute erneut oder prüfen Sie, ob ${t} das richtige Tickersymbol ist.` },
  fr: { intro: (t, f, to, d) => `Voici le cours de clôture quotidien de ${t} du ${f} au ${to} (${d} séances).`, start: 'Début', latest: 'Dernière clôture', high: 'Plus haut', low: 'Plus bas', on: 'le', overPeriod: 'sur la période', note: 'Les cours sont des clôtures ajustées lorsque la source les fournit. Ce sont des données de marché, pas un conseil en investissement.', unavailable: t => `Je n’ai pas pu récupérer l’historique des cours quotidiens de ${t} auprès des sources de données de marché, je n’ai donc pas tracé de graphique. Je ne tracerai pas de cours inventés. Réessayez dans une minute ou vérifiez que ${t} est le bon symbole.` },
  it: { intro: (t, f, to, d) => `Ecco il prezzo di chiusura giornaliero di ${t} dal ${f} al ${to} (${d} sedute).`, start: 'Inizio', latest: 'Ultima chiusura', high: 'Massimo', low: 'Minimo', on: 'il', overPeriod: 'nel periodo', note: 'I prezzi sono chiusure rettificate quando la fonte le fornisce. Sono dati di mercato, non consulenza sugli investimenti.', unavailable: t => `Non sono riuscito a recuperare ora lo storico dei prezzi giornalieri di ${t} dalle fonti di dati di mercato, quindi non ho disegnato un grafico. Non traccerò prezzi inventati. Riprova tra un minuto o verifica che ${t} sia il simbolo corretto.` },
  ja: { intro: (t, f, to, d) => `${t} の日次終値（${f}〜${to}、${d} 営業日）です。`, start: '開始', latest: '最新終値', high: '高値', low: '安値', on: '', overPeriod: '期間中', note: '価格は、ソースが提供する場合は調整後終値です。これは市場データであり、投資助言ではありません。', unavailable: t => `現在、市場データソースから ${t} の日次価格履歴を取得できなかったため、チャートは作成していません。架空の価格は描画しません。1分後に再試行するか、${t} が正しいティッカーか確認してください。` },
  ko: { intro: (t, f, to, d) => `${t}의 일별 종가입니다 (${f}~${to}, ${d} 거래일).`, start: '시작', latest: '최근 종가', high: '최고', low: '최저', on: '', overPeriod: '기간 중', note: '가격은 출처가 제공하는 경우 수정 종가입니다. 이는 시장 데이터이며 투자 조언이 아닙니다.', unavailable: t => `지금 시장 데이터 출처에서 ${t}의 일별 가격 기록을 가져오지 못해 차트를 그리지 않았습니다. 지어낸 가격은 그리지 않습니다. 잠시 후 다시 시도하거나 ${t}가 올바른 티커인지 확인해 주세요.` },
  ar: { intro: (t, f, to, d) => `هذا سعر الإغلاق اليومي لسهم ${t} من ${f} إلى ${to} (${d} يوم تداول).`, start: 'البداية', latest: 'آخر إغلاق', high: 'الأعلى', low: 'الأدنى', on: 'في', overPeriod: 'خلال الفترة', note: 'الأسعار إغلاقات معدلة عندما يوفرها المصدر. هذه بيانات سوق وليست نصيحة استثمارية.', unavailable: t => `تعذر عليّ الآن جلب سجل الأسعار اليومية لسهم ${t} من مصادر بيانات السوق، لذلك لم أرسم مخططًا. لن أرسم أسعارًا مختلقة. حاول مرة أخرى بعد دقيقة أو تحقق من أن ${t} هو الرمز الصحيح.` },
}

function copyFor(language: string | undefined): ReplyCopy {
  return COPY[(language as ChartLanguage)] ?? COPY.en
}

export function buildPriceHistoryChart(request: PriceHistoryRequest, history: PriceHistory, language: string = 'en'): PriceHistoryChart {
  const copy = copyFor(language)
  const points = history.points
  const first = points[0]
  const last = points[points.length - 1]
  const high = points.reduce((best, point) => (point.value > best.value ? point : best), first)
  const low = points.reduce((best, point) => (point.value < best.value ? point : best), first)
  const change = ((last.value - first.value) / first.value) * 100
  const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
  const at = (value: number, date: string) => `${money(value, history.currency)} ${copy.on ? `${copy.on} ` : ''}${date}`.trim()
  const png = renderLineChartPng({
    title: `${history.ticker} daily close - ${request.periodLabel}`,
    subtitle: `${first.date} to ${last.date}  ${money(first.value, history.currency)} to ${money(last.value, history.currency)} (${changeText})  source: ${history.source.name}`,
    points,
    valuePrefix: history.currency === 'USD' ? '$' : '',
  })
  const reply = [
    copy.intro(history.ticker, first.date, last.date, points.length),
    '',
    `- ${copy.start}: ${at(first.value, first.date)}`,
    `- ${copy.latest}: ${at(last.value, last.date)} (${changeText} ${copy.overPeriod})`,
    `- ${copy.high}: ${at(high.value, high.date)}`,
    `- ${copy.low}: ${at(low.value, low.date)}`,
    '',
    copy.note,
    '',
    `Sources: [${history.source.name} - ${history.ticker}](${history.source.url})`,
  ].join('\n')
  return { reply, png, filename: `${history.ticker.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-price-${points.length}d.png`, alt: `${history.ticker} ${request.periodLabel}` }
}

export function priceHistoryUnavailableReply(request: PriceHistoryRequest, language: string = 'en'): string {
  return copyFor(language).unavailable(request.ticker)
}
