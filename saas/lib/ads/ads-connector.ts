// saas/lib/ads/ads-connector.ts
//
// PAID PLACEMENT — the connector that spends money.
//
// The social connector publishes organic posts: a failed post costs nothing, so the only
// gate it needs is "did a human approve this content". Paid advertising is a different
// class of thing. A mistake here spends the buyer's budget, at machine speed, and the
// money does not come back. So this connector is built around the spend, not around the
// creative.
//
// THREE RULES, and they are the product:
//
// 1. NO SPEND WITHOUT A CAP. Every campaign carries a maximum. A request with no cap, or
//    with a cap above the account ceiling, is refused before any provider is contacted.
//
// 2. THE SPEND APPROVAL IS SEPARATE FROM THE CONTENT APPROVAL. Approving an ad's wording
//    is not approving a budget. They are recorded as two decisions because they are two
//    decisions, and the person who signs off on copy is often not the person who signs
//    off on money.
//
// 3. RECONCILE AGAINST THE PROVIDER, NEVER AGAINST OUR OWN ARITHMETIC. Platforms charge
//    differently from what was requested — currency conversion, rounding, overdelivery,
//    auction dynamics. What was actually spent is whatever the provider reports, and the
//    ledger records that, not what we assumed.
//
// Like the social side, a platform is DATA: Meta, Google Ads, LinkedIn Ads, TikTok
// Business, Reddit Ads, Microsoft Advertising and anything else a buyer uses. Each is
// their own account, their own approval, their own money.
//
// WHY fetchSpend AND pauseCampaign TAKE AN OPTIONAL accountRef. The social ad networks do
// not address a campaign the way Meta does. LinkedIn reports spend per sponsored account,
// TikTok requires advertiser_id on every report and status call, and Reddit, Pinterest and
// Snapchat all put the ad account in the path. Without the account reference those three
// operations cannot be addressed at all — so it is threaded through here rather than
// smuggled inside the campaign id, which would corrupt the identifier the ledger stores.
// It stays OPTIONAL: Meta and any single-account network ignore it.

export type AdPlatformId = string

export type Money = {
  /** Minor units — cents, not dollars. Floating-point money is how budgets drift. */
  amount: number
  /** ISO 4217, upper case. */
  currency: string
}

export type AdSpendCap = {
  /** Hard ceiling for this campaign. Never exceeded, whatever the platform reports. */
  campaignMax: Money
  /** Optional daily ceiling the platform is asked to enforce as well. */
  dailyMax?: Money
}

export type AdCampaignRequest = {
  platform: AdPlatformId
  /** The buyer's own ad account on that platform. */
  accountRef: string
  name: string
  /** The creative — already through content approval before it reaches here. */
  creative: { headline?: string; body?: string; imageUrl?: string; videoUrl?: string; landingUrl: string }
  cap: AdSpendCap
  /** Who approved the SPEND, distinct from whoever approved the copy. */
  spendApprovedBy?: string
  spendApprovedAt?: string
}

export type AdCampaignResult =
  | { ok: true; platformCampaignId: string; status: string; cap: AdSpendCap }
  | { ok: false; reason: string; spent: false }

/** What the provider says was actually spent. Never computed locally. */
export type AdSpendReport = {
  platformCampaignId: string
  spent: Money
  reportedAt: string
  status: string
  /**
   * Exactly what the provider returned, before conversion, with the units it was declared
   * in. Carried so the ledger can store it beside the converted figure: if a network is
   * ever declared with the wrong units, this is the evidence that settles it afterwards
   * instead of an argument about whose arithmetic was right.
   */
  raw?: { amount: string; units: string }
}

export type AdPlatformAdapter = {
  id: AdPlatformId
  label: string
  /** Currencies the platform will accept for this account. */
  currencies?: string[]
  createCampaign(request: AdCampaignRequest, accessToken: string): Promise<{ platformCampaignId: string; status: string }>
  /** Read real spend back. Required — a platform we cannot reconcile is one we cannot use. */
  fetchSpend(platformCampaignId: string, accessToken: string, accountRef?: string): Promise<AdSpendReport>
  /** Stop a campaign immediately. Required, for the same reason. */
  pauseCampaign(platformCampaignId: string, accessToken: string, accountRef?: string): Promise<{ ok: boolean; status: string }>
}

const adapters = new Map<AdPlatformId, AdPlatformAdapter>()

/**
 * Register an ad platform.
 *
 * The three required functions are not negotiable. A platform that can start spending
 * but cannot report spend, or cannot be stopped, must never be registered — those are
 * the two things a buyer needs when something goes wrong at 2am.
 */
export function registerAdPlatform(adapter: AdPlatformAdapter): void {
  if (!adapter?.id || !adapter?.label) throw new Error('An ad platform needs an id and a label.')
  if (typeof adapter.createCampaign !== 'function') throw new Error(`Ad platform "${adapter.id}" has no createCampaign.`)
  if (typeof adapter.fetchSpend !== 'function') throw new Error(`Ad platform "${adapter.id}" cannot report spend — refusing to register it. A platform we cannot reconcile is one we cannot use.`)
  if (typeof adapter.pauseCampaign !== 'function') throw new Error(`Ad platform "${adapter.id}" cannot be paused — refusing to register it. Every spending campaign must be stoppable.`)
  adapters.set(adapter.id, adapter)
}

export function listAdPlatforms(): AdPlatformAdapter[] { return [...adapters.values()] }
export function getAdPlatform(id: AdPlatformId): AdPlatformAdapter | null { return adapters.get(id) || null }
export function unregisterAdPlatform(id: AdPlatformId): void { adapters.delete(id) }

// ── The gate ─────────────────────────────────────────────────────────────────

export function isValidMoney(money: Money | undefined): money is Money {
  if (!money) return false
  // Integer minor units only. A fractional cent means someone did floating-point maths
  // on money upstream, and the right response is to refuse rather than round.
  if (!Number.isInteger(money.amount) || money.amount <= 0) return false
  return /^[A-Z]{3}$/.test(String(money.currency || ''))
}

export type SpendGateContext = {
  /** The buyer's ceiling for this ad account, from their own configuration. */
  accountCeiling?: Money
  /** Already spent against that ceiling in the current period, as reported by the provider. */
  alreadySpent?: Money
}

/**
 * Decide whether a campaign may start. Returns null when it may, or the reason it may not.
 *
 * Deliberately refuses on anything ambiguous. A campaign that does not start costs a
 * delay; a campaign that starts wrongly costs money that cannot be recovered.
 */
export function checkSpendGate(request: AdCampaignRequest, context: SpendGateContext = {}): string | null {
  if (!request?.platform || !getAdPlatform(request.platform)) return `Unknown ad platform "${request?.platform}".`
  if (!String(request?.accountRef || '').trim()) return 'An ad account must be selected before a campaign can start.'
  if (!String(request?.creative?.landingUrl || '').trim()) return 'A landing URL is required — an ad that leads nowhere still costs money.'

  if (!isValidMoney(request?.cap?.campaignMax)) return 'A campaign spend cap is required, as a positive whole number of minor units with an ISO currency.'
  if (request.cap.dailyMax && !isValidMoney(request.cap.dailyMax)) return 'The daily cap is not a valid amount.'
  if (request.cap.dailyMax && request.cap.dailyMax.currency !== request.cap.campaignMax.currency) {
    return 'The daily cap and the campaign cap must be in the same currency.'
  }
  if (request.cap.dailyMax && request.cap.dailyMax.amount > request.cap.campaignMax.amount) {
    return 'The daily cap cannot exceed the campaign cap.'
  }

  // The spend decision is its own approval, recorded separately from content approval.
  if (!String(request?.spendApprovedBy || '').trim()) return 'This campaign has no recorded spend approver. Approving the creative is not approving the budget.'

  const ceiling = context.accountCeiling
  if (ceiling) {
    if (ceiling.currency !== request.cap.campaignMax.currency) {
      // Refusing rather than converting: an exchange rate applied here would be our
      // guess, and a wrong guess on a ceiling is a wrong guess about real money.
      return `The campaign cap is in ${request.cap.campaignMax.currency} but the account ceiling is in ${ceiling.currency}. Set both in the same currency.`
    }
    const spent = context.alreadySpent && isValidMoney(context.alreadySpent) ? context.alreadySpent.amount : 0
    if (request.cap.campaignMax.amount + spent > ceiling.amount) {
      return `This campaign would take committed spend past the account ceiling (${ceiling.amount} ${ceiling.currency}).`
    }
  }

  return null
}

/**
 * Start a campaign, but only through the gate.
 *
 * There is deliberately NO parameter that skips the gate. A supported way to spend
 * without a cap or an approver would be a supported way to defeat the product.
 */
export async function startAdCampaign(
  request: AdCampaignRequest,
  accessToken: string,
  context: SpendGateContext = {},
): Promise<AdCampaignResult> {
  const refusal = checkSpendGate(request, context)
  if (refusal) return { ok: false, reason: refusal, spent: false }

  const adapter = getAdPlatform(request.platform)
  if (!adapter) return { ok: false, reason: `Unknown ad platform "${request.platform}".`, spent: false }

  try {
    const created = await adapter.createCampaign(request, accessToken)
    if (!created?.platformCampaignId) {
      // No id means we cannot later read spend or pause it — a campaign we cannot
      // control may be running and must be reported as a failure, loudly.
      return { ok: false, reason: `${request.platform} did not return a campaign id. If a campaign was created it cannot be tracked — check the ad account directly.`, spent: false }
    }
    return { ok: true, platformCampaignId: created.platformCampaignId, status: created.status || 'created', cap: request.cap }
  } catch (error: any) {
    return { ok: false, reason: String(error?.message || error || 'campaign_create_failed'), spent: false }
  }
}

/**
 * Reconcile: ask the provider what was really spent, and say whether the cap was breached.
 *
 * Platforms overdeliver. Discovering it from our own arithmetic is not possible; the
 * only source of truth is the provider, and the honest outcome of a breach is to report
 * it rather than to hide it behind an average.
 */
export async function reconcileAdSpend(
  platform: AdPlatformId,
  platformCampaignId: string,
  cap: AdSpendCap,
  accessToken: string,
  accountRef?: string,
): Promise<{ ok: boolean; report?: AdSpendReport; overCap?: boolean; error?: string }> {
  const adapter = getAdPlatform(platform)
  if (!adapter) return { ok: false, error: `Unknown ad platform "${platform}".` }
  try {
    const report = await adapter.fetchSpend(platformCampaignId, accessToken, accountRef)
    const sameCurrency = report?.spent?.currency === cap.campaignMax.currency
    const overCap = sameCurrency && report.spent.amount > cap.campaignMax.amount
    return { ok: true, report, overCap }
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error || 'spend_fetch_failed') }
  }
}

/**
 * Stop a campaign.
 *
 * A failure here is returned, never swallowed. The operator has to know that the campaign
 * may still be spending so they can stop it in the ad account by hand — silence would be
 * read as success, and this is the one call where being wrong costs money per minute.
 */
export async function pauseAdCampaign(
  platform: AdPlatformId,
  platformCampaignId: string,
  accessToken: string,
  accountRef?: string,
): Promise<{ ok: boolean; status: string }> {
  const adapter = getAdPlatform(platform)
  if (!adapter) return { ok: false, status: `unknown_platform_${platform}` }
  try {
    const result = await adapter.pauseCampaign(platformCampaignId, accessToken, accountRef)
    return { ok: result?.ok === true, status: String(result?.status || (result?.ok ? 'paused' : 'pause_failed')) }
  } catch (error: any) {
    return { ok: false, status: String(error?.message || error || 'pause_failed') }
  }
}
