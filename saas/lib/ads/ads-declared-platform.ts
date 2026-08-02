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

import {
  registerAdPlatform,
  type AdCampaignRequest,
  type AdSpendReport,
  type Money,
} from './ads-connector.ts'

/** Where a value sits in a JSON response, as a dot path: 'data.spend.amount'. */
type Path = string

export type DeclaredAdPlatform = {
  id: string
  label: string

  // ── Create ─────────────────────────────────────────────────────────────────
  createUrl: string
  createMethod?: 'POST' | 'PUT'
  createBody: Record<string, unknown>
  /** Where the new campaign's id appears in the create response. Required. */
  campaignIdPath: Path
  campaignStatusPath?: Path

  // ── Read spend ─────────────────────────────────────────────────────────────
  spendUrl: string
  /**
   * Where the amount sits, and whether it arrives in MINOR units (cents) or MAJOR
   * (dollars). Getting this wrong is a hundredfold error in either direction, so it is
   * declared explicitly rather than guessed from the number's size.
   */
  spendAmountPath: Path
  spendUnits: 'minor' | 'major'
  spendCurrencyPath?: Path
  /** Used when the platform does not return a currency with the amount. */
  spendCurrency?: string
  spendStatusPath?: Path

  // ── Pause ──────────────────────────────────────────────────────────────────
  pauseUrl: string
  pauseMethod?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pauseBody?: Record<string, unknown>

  headers?: Record<string, string>
  currencies?: string[]
}

function fail(id: string, message: string): never {
  throw new Error(`Ad platform "${id}": ${message}`)
}

/** Fill {campaignId}, {accountRef} and the cap fields into a URL or body value. */
function fillValue(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') return value.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? vars[key] : whole))
  if (Array.isArray(value)) return value.map(item => fillValue(item, vars))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) out[key] = fillValue(inner, vars)
    return out
  }
  return value
}

function readPath(source: unknown, path: Path): unknown {
  let cursor: any = source
  for (const segment of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

function toMinorUnits(raw: unknown, units: 'minor' | 'major'): number | null {
  const value = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(value)) return null
  // Rounding happens once, here, at the boundary where the provider's number becomes
  // our integer. Rounding later — after arithmetic — is how ledgers drift.
  return units === 'major' ? Math.round(value * 100) : Math.round(value)
}

async function call(url: string, method: string, headers: Record<string, string>, body?: unknown) {
  const init: RequestInit = { method, headers }
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
    init.body = JSON.stringify(body)
    ;(headers as any)['Content-Type'] = (headers as any)['Content-Type'] || 'application/json'
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = null }
  return { ok: res.ok, status: res.status, json, text }
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
  if (!String(config?.campaignIdPath || '').trim()) fail(id, 'campaignIdPath is required — without it a started campaign could never be tracked, read or stopped.')
  if (!String(config?.spendUrl || '').trim()) fail(id, 'a spend URL is required. A network whose spend cannot be read must not be used.')
  if (!String(config?.spendAmountPath || '').trim()) fail(id, 'spendAmountPath is required.')
  if (config?.spendUnits !== 'minor' && config?.spendUnits !== 'major') fail(id, "spendUnits must be 'minor' or 'major'. Guessing this is a hundredfold error.")
  if (!config?.spendCurrencyPath && !config?.spendCurrency) fail(id, 'declare spendCurrencyPath or a fixed spendCurrency — an amount without a currency cannot be checked against a cap.')
  if (!String(config?.pauseUrl || '').trim()) fail(id, 'a pause URL is required. A campaign that cannot be stopped must not be started.')

  const headers = () => ({ ...(config.headers || {}) })

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
        campaignMax: String(request.cap.campaignMax.amount),
        dailyMax: String(request.cap.dailyMax?.amount ?? ''),
        currency: request.cap.campaignMax.currency,
      }
      const url = String(fillValue(config.createUrl, vars))
      const body = fillValue(config.createBody, vars)
      const res = await call(url, config.createMethod || 'POST', { ...headers(), Authorization: `Bearer ${accessToken}` }, body)
      if (!res.ok) throw new Error(`${id}_create_failed_${res.status}: ${String(res.text).slice(0, 180)}`)

      const campaignId = readPath(res.json, config.campaignIdPath)
      if (campaignId === undefined || campaignId === null || campaignId === '') {
        throw new Error(`${id}_create_unconfirmed: no campaign id in the response. If a campaign was created it cannot be tracked — check the ad account directly.`)
      }
      const status = config.campaignStatusPath ? readPath(res.json, config.campaignStatusPath) : 'created'
      return { platformCampaignId: String(campaignId), status: String(status ?? 'created') }
    },

    async fetchSpend(platformCampaignId: string, accessToken: string): Promise<AdSpendReport> {
      const url = String(fillValue(config.spendUrl, { campaignId: platformCampaignId }))
      const res = await call(url, 'GET', { ...headers(), Authorization: `Bearer ${accessToken}` })
      if (!res.ok) throw new Error(`${id}_spend_failed_${res.status}: ${String(res.text).slice(0, 180)}`)

      const amount = toMinorUnits(readPath(res.json, config.spendAmountPath), config.spendUnits)
      if (amount === null) throw new Error(`${id}_spend_unreadable: no usable amount at "${config.spendAmountPath}".`)

      const currency = config.spendCurrencyPath
        ? String(readPath(res.json, config.spendCurrencyPath) ?? config.spendCurrency ?? '')
        : String(config.spendCurrency || '')
      if (!/^[A-Z]{3}$/.test(currency.toUpperCase())) throw new Error(`${id}_spend_unreadable: no currency for the reported amount.`)

      const spent: Money = { amount, currency: currency.toUpperCase() }
      const status = config.spendStatusPath ? String(readPath(res.json, config.spendStatusPath) ?? 'unknown') : 'unknown'
      return { platformCampaignId, spent, reportedAt: new Date().toISOString(), status }
    },

    async pauseCampaign(platformCampaignId: string, accessToken: string) {
      const url = String(fillValue(config.pauseUrl, { campaignId: platformCampaignId }))
      const body = config.pauseBody ? fillValue(config.pauseBody, { campaignId: platformCampaignId }) : undefined
      const res = await call(url, config.pauseMethod || 'POST', { ...headers(), Authorization: `Bearer ${accessToken}` }, body)
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
export function declareMetaAds(apiVersion = 'v21.0'): void {
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
      lifetime_budget: '{campaignMax}',
    },
    campaignIdPath: 'id',
    spendUrl: `https://graph.facebook.com/${apiVersion}/{campaignId}/insights?fields=spend`,
    spendAmountPath: 'data.0.spend',
    // Meta reports spend in MAJOR units as a decimal string ("12.34"), not cents.
    spendUnits: 'major',
    spendCurrency: 'USD',
    pauseUrl: `https://graph.facebook.com/${apiVersion}/{campaignId}`,
    pauseMethod: 'POST',
    pauseBody: { status: 'PAUSED' },
  })
}
