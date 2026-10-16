// saas/lib/ai/cos/agentLoop/humanSourceUrl.ts
//
// The agent loop downloads data from machine endpoints (JSON APIs, CSV files). Those are the right
// URLs to fetch from and the wrong ones to show a person: production 2026-10-16, the VNCE chart's
// "Sources" link opened Yahoo's raw chart JSON. Answers cite the public page for the same data.
// Unknown URLs are returned unchanged — they are already what the agent read.

type Rule = (url: URL) => string | null

const enc = encodeURIComponent

const RULES: readonly Rule[] = [
  // Yahoo Finance chart API → the ticker's price history page.
  url => {
    if (!/^query[12]\.finance\.yahoo\.com$/i.test(url.hostname)) return null
    const ticker = url.pathname.match(/^\/v8\/finance\/chart\/([^/]+)\/?$/i)?.[1]
    return ticker ? `https://finance.yahoo.com/quote/${enc(decodeURIComponent(ticker))}/history` : null
  },
  // Stooq CSV download → the symbol's daily history page.
  url => {
    if (!/^(?:www\.)?stooq\.(?:com|pl)$/i.test(url.hostname) || !/^\/q\/d\/l\/?$/i.test(url.pathname)) return null
    const symbol = url.searchParams.get('s')
    return symbol ? `https://stooq.com/q/d/?s=${enc(symbol)}` : null
  },
  // BLS public API → the series page on data.bls.gov.
  url => {
    if (!/^api\.bls\.gov$/i.test(url.hostname)) return null
    const series = url.pathname.match(/^\/publicAPI\/v[12]\/timeseries\/data\/([A-Za-z0-9]+)\/?$/i)?.[1]
    return series ? `https://data.bls.gov/timeseries/${enc(series)}` : null
  },
  // World Bank API → the indicator page for that country.
  url => {
    if (!/^api\.worldbank\.org$/i.test(url.hostname)) return null
    const match = url.pathname.match(/^\/v2\/country\/([A-Za-z0-9;]+)\/indicator\/([A-Za-z0-9._]+)\/?$/i)
    if (!match) return null
    const [, country, indicator] = match
    return `https://data.worldbank.org/indicator/${enc(indicator)}${/^all$/i.test(country) ? '' : `?locations=${enc(country)}`}`
  },
]

export function humanSourceUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { return raw }
  for (const rule of RULES) {
    const mapped = rule(url)
    if (mapped) return mapped
  }
  return raw
}

/** Rewrites every machine-endpoint URL in an answer (markdown links or bare) to its public page. */
export function withHumanSourceLinks(text: string): string {
  return text.replace(/https?:\/\/[^\s<>()\]]+/gi, match => {
    const trailing = match.match(/[.,;:!?'"]+$/)?.[0] ?? ''
    const url = trailing ? match.slice(0, -trailing.length) : match
    return humanSourceUrl(url) + trailing
  })
}
