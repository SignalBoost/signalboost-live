// saas/lib/ads/ads-declared-platform.ts
//
// BRING YOUR OWN AD NETWORK.
//
// Meta, Google Ads, LinkedIn Ads, TikTok Business, Reddit Ads, Microsoft Advertising,
// Amazon Ads, Criteo, regional networks nobody outside their market has heard of — no
// vendor maintains adapters for all of them, and a buyer should not be told which
// networks they may spend their own budget on. So an ad platform is a declaration.
//
// WHY THIS IS STRICTER THAN THE SOCIAL EQUIVALENT. Declaring a social platform risks a
// post that fails. Declaring an ad platform risks money. So the three functions the
// connector demands — create, read spend, pause — must ALL be describable, and a
// declaration that cannot describe how to read spend or how to stop a campaign is
// refused. Those are precisely the two things a buyer needs when a campaign misbehaves,
// and a network we cannot stop is a network we will not start.
//
// ── WHAT WRITING THE SOCIAL AD NETWORKS FORCED TO CHANGE HERE ────────────────
//
// Meta alone did not exercise this layer. Declaring LinkedIn, TikTok, X, Reddit, Pinterest
// and Snapchat surfaced four things the first version could not express, each of which was
// a silent wrong answer rather than an error:
//
// 1. MICRO UNITS. X Ads, Reddit Ads, Pinterest Ads and Snapchat Ads report spend in
//    millionths of a major unit. Reading micro as major understates spend a millionfold.
//    spendUnits now accepts 'micro', and conversion goes through lib/ads/ads-money.ts,
//    which also knows that a "minor unit" is not always a hundredth — JPY has none and
//    KWD has three, so the old fixed ×100 was wrong for any non-Western ad account.
//
// 2. IDS RETURNED IN A HEADER. LinkedIn returns the new campaign id in x-restli-id and
//    nothing useful in the body. campaignIdHeader reads it, exactly as the social layer's
//    idHeader already did.
//
// 3. AUTH THAT IS NOT BEARER. TikTok expects the token in an Access-Token header with no
//    scheme. authHeader and authScheme cover it without special-casing a vendor.
//
// 4. THE AD ACCOUNT IS NEEDED TO READ AND STOP, not just to create. Every one of these
//    networks except Meta addresses reporting or status by ad account. accountRef is now
//    available to the spend and pause calls too.
//
// DATES ARE NOT BAKED IN. Reporting endpoints want a window, and a window fixed at
// declaration time goes stale the day after it is written. {today} and {since} are filled
// at request time instead, with the lookback stated per declaration.

import {
  registerAdPlatform,
  type AdCampaignRequest,
  type AdSpendReport,
  type Money,
} from './ads-connector.ts'
import { assertMinorUnits, currencyExponent, type SpendUnits } from './ads-money.ts'

/** Where a value sits in a JSON response, as a dot path: 'data.spend.amount'. */
type Path = string

export type DeclaredAdPlatform = {
  id: string
  label: string

  // ── Create ─────────────────────────────────────────────────────────────────
  createUrl: string
  createMethod?: 'POST' | 'PUT'
  /** An object, or an array when the network takes a list of campaigns (Pinterest does). */
  createBody: Record<string, unknown> | unknown[]
  /** Where the new campaign's id appears in the create response body. */
  campaignIdPath?: Path
  /** Or the response HEADER carrying it — LinkedIn returns x-restli-id and no body id. */
  campaignIdHeader?: string
  campaignStatusPath?: Path

  // ── Read spend ─────────────────────────────────────────────────────────────
  spendUrl: string
  spendMethod?: 'GET' | 'POST'
  /** Reddit's reporting endpoint is a POST with a body rather than a query string. */
  spendBody?: Record<string, unknown> | unknown[]
  /**
   * Where the amount sits, and the units it arrives in. Declared explicitly and never
   * guessed from the number's size: minor against major is a hundredfold error, micro
   * against major is a millionfold one, and both mistakes read as "we have barely spent
   * anything" while the platform bills in full.
   */
  spendAmountPath: Path
  spendUnits: SpendUnits
  spendCurrencyPath?: Path
  /** Used when the platform does not return a currency with the amount. */
  spendCurrency?: string
  spendStatusPath?: Path
  /** How far back a reporting window should reach when the URL uses {since}. */
  spendLookbackDays?: number

  // ── Pause ──────────────────────────────────────────────────────────────────
  pauseUrl: string
  pauseMethod?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pauseBody?: Record<string, unknown> | unknown[]

  headers?: Record<string, string>
  /** Defaults to 'Authorization'. TikTok uses 'Access-Token'. */
  authHeader?: string
  /** Defaults to 'Bearer'. Empty string sends the raw token with no scheme. */
  authScheme?: string
  currencies?: string[]
}

function fail(id: string, message: string): never {
  throw new Error(`Ad platform "${id}": ${message}`)
}

/**
 * Returned when an OPTIONAL placeholder has no value, so the thing containing it can be
 * left out of the request entirely.
 */
const OMIT_LEAF = Symbol('omit_leaf')
const OMIT_NODE = Symbol('omit_node')

/**
 * Fill {campaignId}, {accountRef}, the cap fields and the date fields into a URL or body.
 *
 * TWO PLACEHOLDER FORMS. {name} is required and fills with the value. {?name} is optional:
 * if it has no value, the key holding it — and the object that key sits in — is dropped from
 * the request. This exists because of a specific, expensive-looking failure: a campaign with
 * no daily cap would otherwise send LinkedIn `dailyBudget: { amount: "" }`, and a network
 * rejecting the whole create for a malformed budget is the good outcome. The bad one is a
 * network that reads an empty budget as unlimited.
 */
function fillValue(value: unknown, vars: Record<string, string>, isRoot = false): unknown {
  if (typeof value === 'string') {
    let omitted = false
    const filled = value.replace(/\{(\??)(\w+)\}/g, (whole, optional, key) => {
      const replacement = key in vars ? vars[key] : undefined
      if (optional === '?' && (replacement === undefined || replacement === '')) {
        omitted = true
        return ''
      }
      return replacement === undefined ? whole : replacement
    })
    return omitted ? OMIT_LEAF : filled
  }
  if (Array.isArray(value)) {
    return value
      .map(item => fillValue(item, vars))
      .filter(item => item !== OMIT_LEAF && item !== OMIT_NODE)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const filled = fillValue(inner, vars)
      // An unfilled optional placeholder removes the OBJECT it sits in — a missing daily
      // cap takes the whole dailyBudget with it rather than leaving {currencyCode} behind,
      // which is the shape a network is most likely to misread. At the top level of a body
      // there is no enclosing object to remove, so only that field goes.
      if (filled === OMIT_LEAF) {
        if (!isRoot) return OMIT_NODE
        continue
      }
      // A sub-object that removed itself just disappears from its parent.
      if (filled === OMIT_NODE) continue
      out[key] = filled
    }
    return out
  }
  return value
}

/** Top level: an omitted string becomes empty rather than leaking the sentinel into a URL. */
function fillString(value: string, vars: Record<string, string>): string {
  const filled = fillValue(value, vars)
  return filled === OMIT_LEAF || filled === OMIT_NODE ? '' : String(filled)
}

function fillBody(value: unknown, vars: Record<string, string>): unknown {
  const filled = fillValue(value, vars, true)
  return filled === OMIT_LEAF || filled === OMIT_NODE ? undefined : filled
}

function readPath(source: unknown, path: Path): unknown {
  let cursor: any = source
  for (const segment of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

/**
 * Minor units as a plain decimal string in the currency's own scale — "50.00" for USD,
 * "50" for JPY, "50.000" for KWD. LinkedIn and TikTok want budgets in this form.
 */
function majorString(minorAmount: number, currency: string): string {
  const exponent = currencyExponent(currency)
  const whole = Math.abs(Math.trunc(minorAmount))
  const sign = minorAmount < 0 ? '-' : ''
  if (exponent === 0) return `${sign}${whole}`
  const digits = String(whole).padStart(exponent + 1, '0')
  return `${sign}${digits.slice(0, digits.length - exponent)}.${digits.slice(digits.length - exponent)}`
}

/**
 * Minor units expressed as micro units — X, Reddit, Pinterest and Snapchat all take budgets
 * this way. Integer arithmetic on values that are already integers; a budget large enough
 * to leave the exact range is refused rather than approximated.
 */
function microString(minorAmount: number, currency: string): string {
  const exponent = currencyExponent(currency)
  const factor = Math.pow(10, 6 - exponent)
  const micro = Math.trunc(minorAmount) * factor
  if (!Number.isSafeInteger(micro)) {
    throw new Error(`A budget of ${minorAmount} ${currency} is too large to express exactly in micro units. Refusing rather than reporting an approximate amount of money.`)
  }
  return String(micro)
}

function dateVars(lookbackDays: number): Record<string, string> {
  const now = new Date()
  const since = new Date(now.getTime() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000)
  return {
    today: now.toISOString().slice(0, 10),
    since: since.toISOString().slice(0, 10),
    todayIso: now.toISOString(),
    sinceIso: since.toISOString(),
    todayMs: String(now.getTime()),
    sinceMs: String(since.getTime()),
  }
}

function moneyVars(request: AdCampaignRequest): Record<string, string> {
  const currency = request.cap.campaignMax.currency
  const daily = request.cap.dailyMax
  return {
    campaignMax: String(request.cap.campaignMax.amount),
    campaignMaxMajor: majorString(request.cap.campaignMax.amount, currency),
    campaignMaxMicro: microString(request.cap.campaignMax.amount, currency),
    dailyMax: daily ? String(daily.amount) : '',
    dailyMaxMajor: daily ? majorString(daily.amount, currency) : '',
    dailyMaxMicro: daily ? microString(daily.amount, currency) : '',
    currency,
  }
}

async function call(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown; text: string; header: (name: string) => string }> {
  const sent: Record<string, string> = { ...headers }
  const init: RequestInit = { method, headers: sent }
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
    init.body = JSON.stringify(body)
    sent['Content-Type'] = sent['Content-Type'] || 'application/json'
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = null }
  const header = (name: string) => {
    try { return String(res.headers.get(name) || '') } catch { return '' }
  }
  return { ok: res.ok, status: res.status, json, text, header }
}

/**
 * Declare an ad platform. Validation is strict and throws, so a bad declaration
 * surfaces at startup rather than when a campaign is trying to spend.
 */
export function declareAdPlatform(config: DeclaredAdPlatform): void {
  const id = String(config?.id || '').trim()
  if (!id) throw new Error('An ad platform declaration needs an id.')
  if (!String(config?.label || '').trim()) fail(id, 'a display name is required.')
  if (!String(config?.createUrl || '').trim()) fail(id, 'a create URL is required.')
  if (!config?.createBody || typeof config.createBody !== 'object') fail(id, 'a create body is required.')
  if (!String(config?.campaignIdPath || '').trim() && !String(config?.campaignIdHeader || '').trim()) {
    fail(id, 'campaignIdPath or campaignIdHeader is required — without one, a started campaign could never be tracked, read or stopped.')
  }
  if (!String(config?.spendUrl || '').trim()) fail(id, 'a spend URL is required. A network whose spend cannot be read must not be used.')
  if (!String(config?.spendAmountPath || '').trim()) fail(id, 'spendAmountPath is required.')
  if (config?.spendUnits !== 'minor' && config?.spendUnits !== 'major' && config?.spendUnits !== 'micro') {
    fail(id, "spendUnits must be 'minor', 'major' or 'micro'. Guessing is a hundredfold error between minor and major and a millionfold one between micro and major — X, Reddit, Pinterest and Snapchat all report micro.")
  }
  if (!config?.spendCurrencyPath && !config?.spendCurrency) fail(id, 'declare spendCurrencyPath or a fixed spendCurrency — an amount without a currency cannot be checked against a cap, and the size of a minor unit depends on it.')
  if (!String(config?.pauseUrl || '').trim()) fail(id, 'a pause URL is required. A campaign that cannot be stopped must not be started.')

  const authHeaderName = config.authHeader || 'Authorization'
  const authScheme = config.authScheme === undefined ? 'Bearer' : config.authScheme
  const lookback = config.spendLookbackDays && config.spendLookbackDays > 0 ? config.spendLookbackDays : 90

  const authHeaders = (accessToken: string): Record<string, string> => {
    const out: Record<string, string> = { ...(config.headers || {}) }
    out[authHeaderName] = authScheme ? `${authScheme} ${accessToken}` : accessToken
    return out
  }

  registerAdPlatform({
    id,
    label: config.label,
    currencies: config.currencies,

    async createCampaign(request: AdCampaignRequest, accessToken: string) {
      const vars = {
        accountRef: request.accountRef,
        name: request.name,
        landingUrl: request.creative.landingUrl,
        headline: request.creative.headline || '',
        body: request.creative.body || '',
        imageUrl: request.creative.imageUrl || '',
        videoUrl: request.creative.videoUrl || '',
        ...moneyVars(request),
        ...dateVars(lookback),
      }
      const url = fillString(config.createUrl, vars)
      const body = fillBody(config.createBody, vars)
      const res = await call(url, config.createMethod || 'POST', authHeaders(accessToken), body)
      if (!res.ok) throw new Error(`${id}_create_failed_${res.status}: ${String(res.text).slice(0, 180)}`)

      let campaignId: unknown = config.campaignIdPath ? readPath(res.json, config.campaignIdPath) : undefined
      if ((campaignId === undefined || campaignId === null || campaignId === '') && config.campaignIdHeader) {
        campaignId = res.header(config.campaignIdHeader)
      }
      if (campaignId === undefined || campaignId === null || campaignId === '') {
        throw new Error(`${id}_create_unconfirmed: no campaign id in the response. If a campaign was created it cannot be tracked — check the ad account directly.`)
      }
      const status = config.campaignStatusPath ? readPath(res.json, config.campaignStatusPath) : 'created'
      return { platformCampaignId: String(campaignId), status: String(status ?? 'created') }
    },

    async fetchSpend(platformCampaignId: string, accessToken: string, accountRef?: string): Promise<AdSpendReport> {
      const vars = { campaignId: platformCampaignId, accountRef: accountRef || '', ...dateVars(lookback) }
      const url = fillString(config.spendUrl, vars)
      const method = config.spendMethod || 'GET'
      const body = config.spendBody ? fillBody(config.spendBody, vars) : undefined
      const res = await call(url, method, authHeaders(accessToken), body)
      if (!res.ok) throw new Error(`${id}_spend_failed_${res.status}: ${String(res.text).slice(0, 180)}`)

      // Currency first: the size of a minor unit depends on it, so the amount cannot be
      // converted until we know which currency it is in.
      const currencyRaw = config.spendCurrencyPath
        ? String(readPath(res.json, config.spendCurrencyPath) ?? config.spendCurrency ?? '')
        : String(config.spendCurrency || '')
      const currency = currencyRaw.toUpperCase()
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${id}_spend_unreadable: no currency for the reported amount.`)

      const rawAmount = readPath(res.json, config.spendAmountPath)
      if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        throw new Error(`${id}_spend_unreadable: no amount at "${config.spendAmountPath}".`)
      }
      let amount: number
      try {
        amount = assertMinorUnits(rawAmount as any, config.spendUnits, currency)
      } catch (reason: any) {
        throw new Error(`${id}_spend_unreadable: ${String(reason?.message || reason)}`)
      }

      const spent: Money = { amount, currency }
      const status = config.spendStatusPath ? String(readPath(res.json, config.spendStatusPath) ?? 'unknown') : 'unknown'
      return {
        platformCampaignId,
        spent,
        reportedAt: new Date().toISOString(),
        status,
        // Kept verbatim. If this network is ever found to have been declared with the wrong
        // units, the stored raw value is what proves it.
        raw: { amount: String(rawAmount), units: config.spendUnits },
      }
    },

    async pauseCampaign(platformCampaignId: string, accessToken: string, accountRef?: string) {
      const vars = { campaignId: platformCampaignId, accountRef: accountRef || '', ...dateVars(lookback) }
      const url = fillString(config.pauseUrl, vars)
      const body = config.pauseBody ? fillBody(config.pauseBody, vars) : undefined
      const res = await call(url, config.pauseMethod || 'POST', authHeaders(accessToken), body)
      // A failed pause is reported as a failure, never swallowed: the operator must know
      // the campaign may still be spending so they can stop it in the ad account.
      if (!res.ok) return { ok: false, status: `pause_failed_${res.status}` }
      return { ok: true, status: 'paused' }
    },
  })
}

/**
 * Meta (Facebook and Instagram) — the reference declaration.
 *
 * Written from Meta's documented Marketing API shape, and included because it is the
 * largest ad network and the one a buyer most likely already has an account on. It is a
 * DECLARATION rather than hand-written code precisely to show that the declarative path
 * is sufficient for a real network, not just for simple ones.
 *
 * The buyer still brings the account, the ads_management permission, business
 * verification and app review. None of that is something this code can do for them.
 */
export function declareMetaAds(apiVersion = 'v21.0', currency = 'USD'): void {
  declareAdPlatform({
    id: 'meta_ads',
    label: 'Meta Ads',
    createUrl: `https://graph.facebook.com/${apiVersion}/act_{accountRef}/campaigns`,
    createBody: {
      name: '{name}',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      // Created PAUSED on purpose. The campaign exists, the cap is registered, and a
      // human starts it — so a mistake in this request costs nothing until someone
      // deliberately turns it on.
      // Meta takes lifetime_budget in the account currency's minor unit, which is what
      // our cap already is.
      lifetime_budget: '{campaignMax}',
    },
    campaignIdPath: 'id',
    spendUrl: `https://graph.facebook.com/${apiVersion}/{campaignId}/insights?fields=spend`,
    spendAmountPath: 'data.0.spend',
    // Meta reports spend in MAJOR units as a decimal string ("12.34"), not cents.
    spendUnits: 'major',
    spendCurrency: currency,
    pauseUrl: `https://graph.facebook.com/${apiVersion}/{campaignId}`,
    pauseMethod: 'POST',
    pauseBody: { status: 'PAUSED' },
  })
}
