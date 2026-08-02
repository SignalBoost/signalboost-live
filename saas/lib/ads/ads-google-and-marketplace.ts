// saas/lib/ads/ads-google-and-marketplace.ts
//
// THE NETWORKS OUTSIDE SOCIAL: Google Ads, Microsoft Advertising, Amazon Ads.
//
// NAMED THIS WAY ON PURPOSE. "ads-non-social-networks" beside "ads-social-networks" is
// exactly the kind of near-identical pair that has been cross-pasted twice in this repo,
// with the real content of one going missing from both. A name that cannot be confused is
// worth more than a tidy one.
//
// WHAT THIS FILE IS HONEST ABOUT. Only Google Ads fits the declarative path, and only with
// a prerequisite the buyer supplies. The other two do not fit it at all, for reasons that
// are theirs rather than ours:
//
//   Microsoft Advertising — the Campaign Management API is SOAP. A declaration describes a
//   JSON request; it cannot construct a SOAP envelope, and pretending otherwise would ship
//   a network that fails on its first call.
//
//   Amazon Ads — campaigns can be created over REST, but spend cannot be READ
//   synchronously: reporting is an asynchronous job you request, poll, then download. The
//   connector refuses to register any platform whose spend cannot be read, and that rule is
//   not one to bend for a large network. A campaign whose spend we cannot see is exactly
//   what a cap is supposed to protect against.
//
// Both are therefore declared ONLY against an endpoint the buyer runs, in the same shape as
// X Ads: their service does the protocol work and answers in the JSON shape below. Without
// one, the function throws and says why. That is a deliberate refusal to fake coverage —
// listing a network that cannot report spend would make the product a liar at exactly the
// moment it matters.

import { declareAdPlatform } from './ads-declared-platform.ts'

export type NetworkOptions = {
  /** The account currency. Determines the size of a minor unit, so it matters. */
  currency?: string
  lookbackDays?: number
}

/**
 * Google Ads.
 *
 * THE PREREQUISITE: a campaign in Google Ads cannot carry a budget inline — the budget is
 * its own resource, created first and referenced by name. Creating it would be a second
 * write, and a declaration performs one. So the buyer creates the budget (which is where
 * their real spending limit lives anyway) and passes its resource name here, exactly as
 * LinkedIn requires a campaign group.
 *
 * Google reports cost in MICRO units, which is why the units field had to grow beyond
 * minor and major to describe this network at all.
 */
export function declareGoogleAds(options: NetworkOptions & {
  /** From the Google Ads API centre. Every request is rejected without it. */
  developerToken: string
  /** e.g. 'customers/1234567890/campaignBudgets/9876543210' */
  campaignBudgetResourceName: string
  /** The manager account, when the ad account sits under one. */
  loginCustomerId?: string
  apiVersion?: string
}): void {
  const currency = (options.currency || 'USD').toUpperCase()
  const version = options.apiVersion || 'v17'

  if (!String(options.developerToken || '').trim()) {
    throw new Error('Google Ads: a developerToken is required. Google rejects every Ads API request without one, so a campaign would fail at creation rather than at spend.')
  }
  if (!String(options.campaignBudgetResourceName || '').trim()) {
    throw new Error("Google Ads: a campaignBudgetResourceName is required. A Google campaign references a budget resource that must already exist — create it in the ad account and pass its name, for example 'customers/1234567890/campaignBudgets/9876543210'.")
  }

  const headers: Record<string, string> = { 'developer-token': String(options.developerToken).trim() }
  if (options.loginCustomerId) headers['login-customer-id'] = String(options.loginCustomerId).trim()

  declareAdPlatform({
    id: 'google_ads',
    label: 'Google Ads',
    headers,
    createUrl: `https://googleads.googleapis.com/${version}/customers/{accountRef}/campaigns:mutate`,
    createBody: {
      operations: [
        {
          create: {
            name: '{name}',
            // PAUSED, like every network in this portable. The campaign exists and the cap
            // is registered; a person turns it on.
            status: 'PAUSED',
            advertisingChannelType: 'SEARCH',
            campaignBudget: String(options.campaignBudgetResourceName).trim(),
          },
        },
      ],
    },
    // Google returns the full resource name, which is what every later call wants.
    campaignIdPath: 'results.0.resourceName',
    spendUrl: `https://googleads.googleapis.com/${version}/customers/{accountRef}/googleAds:search`,
    spendMethod: 'POST',
    spendBody: {
      query:
        'SELECT metrics.cost_micros FROM campaign ' +
        "WHERE campaign.resource_name = '{campaignId}' " +
        "AND segments.date BETWEEN '{since}' AND '{today}'",
    },
    spendAmountPath: 'results.0.metrics.costMicros',
    // Google reports cost in micros. Read as major it would understate spend a millionfold.
    spendUnits: 'micro',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: `https://googleads.googleapis.com/${version}/customers/{accountRef}/campaigns:mutate`,
    pauseMethod: 'POST',
    pauseBody: {
      operations: [{ update: { resourceName: '{campaignId}', status: 'PAUSED' }, updateMask: 'status' }],
    },
    currencies: [currency],
  })
}

/**
 * Microsoft Advertising, via a buyer-run endpoint.
 *
 * The Campaign Management API speaks SOAP. The buyer's service accepts the JSON below,
 * translates it, and answers in the shape the paths expect. Without that endpoint this
 * network is not declared at all.
 */
export function declareMicrosoftAds(options: NetworkOptions & {
  /** Base URL of the buyer's own service that speaks SOAP to Microsoft on their behalf. */
  bridgeBaseUrl: string
}): void {
  const currency = (options.currency || 'USD').toUpperCase()
  const base = String(options.bridgeBaseUrl || '').trim().replace(/\/+$/, '')

  if (!base) {
    throw new Error('Microsoft Advertising: the Campaign Management API is SOAP, which a JSON declaration cannot speak. Supply bridgeBaseUrl — your own service that translates these requests — or do not declare this network.')
  }

  declareAdPlatform({
    id: 'microsoft_ads',
    label: 'Microsoft Advertising',
    createUrl: `${base}/campaigns`,
    createBody: {
      accountId: '{accountRef}',
      name: '{name}',
      status: 'Paused',
      budgetType: 'DailyBudgetStandard',
      // Microsoft budgets are stated in the account currency, not in cents.
      budget: '{campaignMaxMajor}',
      dailyBudget: '{?dailyMaxMajor}',
    },
    campaignIdPath: 'campaignId',
    spendUrl: `${base}/campaigns/{campaignId}/spend?accountId={accountRef}&start={since}&end={today}`,
    spendAmountPath: 'spend',
    spendUnits: 'major',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: `${base}/campaigns/{campaignId}/pause`,
    pauseMethod: 'POST',
    pauseBody: { accountId: '{accountRef}' },
    currencies: [currency],
  })
}

/**
 * Amazon Ads, via a buyer-run endpoint.
 *
 * Creating a Sponsored Products campaign is a normal REST call. Reading what it spent is
 * not: Amazon's reporting is asynchronous — request a report, poll until it is ready, then
 * download it. The connector will not register a platform whose spend cannot be read, so
 * the buyer's endpoint is what turns that job into an answer.
 */
export function declareAmazonAds(options: NetworkOptions & {
  /** Base URL of the buyer's service that runs Amazon's async reporting and answers directly. */
  reportingBaseUrl: string
  clientId: string
  profileId: string
}): void {
  const currency = (options.currency || 'USD').toUpperCase()
  const base = String(options.reportingBaseUrl || '').trim().replace(/\/+$/, '')

  if (!base) {
    throw new Error('Amazon Ads: spend cannot be read synchronously — Amazon reporting is an asynchronous job you request, poll and download. Supply reportingBaseUrl, your own service that resolves that job into a spend figure, or do not declare this network. A campaign whose spend we cannot read is the thing a cap exists to prevent.')
  }
  if (!String(options.clientId || '').trim() || !String(options.profileId || '').trim()) {
    throw new Error('Amazon Ads: clientId and profileId are both required — Amazon scopes every call to a profile, and a request without one reaches the wrong advertiser or none.')
  }

  declareAdPlatform({
    id: 'amazon_ads',
    label: 'Amazon Ads',
    headers: {
      'Amazon-Advertising-API-ClientId': String(options.clientId).trim(),
      'Amazon-Advertising-API-Scope': String(options.profileId).trim(),
    },
    createUrl: `${base}/sp/campaigns`,
    createBody: {
      campaigns: [
        {
          name: '{name}',
          targetingType: 'MANUAL',
          state: 'PAUSED',
          budget: { budgetType: 'DAILY', budget: '{?dailyMaxMajor}' },
          lifetimeBudget: '{campaignMaxMajor}',
        },
      ],
    },
    campaignIdPath: 'campaigns.success.0.campaignId',
    spendUrl: `${base}/sp/campaigns/{campaignId}/spend?start={since}&end={today}`,
    spendAmountPath: 'cost',
    spendUnits: 'major',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: `${base}/sp/campaigns/{campaignId}`,
    pauseMethod: 'PUT',
    pauseBody: { campaigns: [{ campaignId: '{campaignId}', state: 'PAUSED' }] },
    currencies: [currency],
  })
}

/**
 * Declare whichever of these three the deployment is configured for.
 *
 * Returns what was declared and what was skipped WITH THE REASON, so the cockpit can tell
 * an operator why a network is absent instead of leaving them to wonder. A network is never
 * half-declared: it can create, read spend and pause, or it is not registered.
 */
export function declareGoogleAndMarketplaceNetworks(options: NetworkOptions & {
  google?: { developerToken: string; campaignBudgetResourceName: string; loginCustomerId?: string; apiVersion?: string }
  microsoft?: { bridgeBaseUrl: string }
  amazon?: { reportingBaseUrl: string; clientId: string; profileId: string }
} = {}): { declared: string[]; skipped: Array<{ id: string; reason: string }> } {
  const declared: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  const base: NetworkOptions = { currency: options.currency, lookbackDays: options.lookbackDays }

  const attempt = (id: string, run: () => void) => {
    try {
      run()
      declared.push(id)
    } catch (reason: any) {
      skipped.push({ id, reason: String(reason?.message || reason) })
    }
  }

  if (options.google) attempt('google_ads', () => declareGoogleAds({ ...base, ...options.google! }))
  if (options.microsoft) attempt('microsoft_ads', () => declareMicrosoftAds({ ...base, ...options.microsoft! }))
  if (options.amazon) attempt('amazon_ads', () => declareAmazonAds({ ...base, ...options.amazon! }))

  return { declared, skipped }
}
