// saas/lib/ads/ads-social-networks.ts
//
// PAID ADS ON THE SOCIAL PLATFORMS.
//
// The organic side of Marketing + Sales publishes to eight social platforms. This file is
// the paid counterpart: the same platforms, bought rather than posted. Every one is a
// DECLARATION built on ads-declared-platform.ts, not hand-written client code — so a buyer
// gets them without us maintaining six SDKs, and a seventh network they use in their market
// is the same kind of thing rather than a feature request.
//
// EVERY CAMPAIGN IS CREATED PAUSED. Without exception, on every network here. The campaign
// exists, the cap is registered against it, and a human turns it on. A mistake in a create
// request therefore costs nothing until someone deliberately spends.
//
// WHAT THE BUYER BRINGS, AND IT IS NOT SMALL:
//   Meta        ads_management, business verification, app review
//   LinkedIn    Ads API access is partner-gated, plus a sponsored ad account
//   TikTok      a TikTok Business Center advertiser account, separate approval
//   Reddit      an ads account and API access
//   Pinterest   a business account with ads API access, standard access after review
//   Snapchat    an Ads account and an organisation-scoped app
//   X           an Ads API developer application, and see the note on declareXAds
// None of that can be done on their behalf, and none of it is the seller's cost.
//
// UNITS ARE THE DANGEROUS PART AND ARE STATED PER NETWORK BELOW. Meta, LinkedIn and TikTok
// report spend in MAJOR units; X, Reddit, Pinterest and Snapchat report in MICRO. Reading
// one as the other is not a rounding difference, it is a factor of a million, and it fails
// in the direction where a buyer believes nothing has been spent.
//
// REPORTING WINDOWS ARE FILLED AT REQUEST TIME via {since} and {today}. A window baked into
// a declaration is correct on the day it is written and wrong every day after.

import { declareAdPlatform, declareMetaAds } from './ads-declared-platform.ts'

export type SocialAdNetworkOptions = {
  /** The account currency. Determines the size of a minor unit, so it is required. */
  currency?: string
  /** How far back reporting windows reach. */
  lookbackDays?: number
}

/**
 * LinkedIn Ads.
 *
 * TWO THINGS THIS NETWORK DOES DIFFERENTLY. It returns the new campaign id in the
 * x-restli-id RESPONSE HEADER rather than the body — the create response body is empty on
 * success. And every campaign must belong to a campaign group, which is a buyer-specific
 * urn, so it is a required argument rather than something guessed.
 */
export function declareLinkedInAds(options: SocialAdNetworkOptions & {
  campaignGroupUrn: string
  apiVersion?: string
}): void {
  const currency = (options.currency || 'USD').toUpperCase()
  const version = options.apiVersion || '202406'
  if (!String(options.campaignGroupUrn || '').trim()) {
    throw new Error('LinkedIn Ads: a campaignGroupUrn is required. Every LinkedIn campaign belongs to a campaign group, and the group is specific to the buyer\'s ad account.')
  }

  declareAdPlatform({
    id: 'linkedin_ads',
    label: 'LinkedIn Ads',
    headers: {
      'LinkedIn-Version': version,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    createUrl: 'https://api.linkedin.com/rest/adCampaigns',
    createBody: {
      account: 'urn:li:sponsoredAccount:{accountRef}',
      campaignGroup: options.campaignGroupUrn,
      name: '{name}',
      type: 'TEXT_AD',
      costType: 'CPC',
      // PAUSED, like every other network here.
      status: 'PAUSED',
      // LinkedIn takes budgets as a decimal string in the account currency.
      totalBudget: { amount: '{campaignMaxMajor}', currencyCode: '{currency}' },
      dailyBudget: { amount: '{?dailyMaxMajor}', currencyCode: '{currency}' },
      locale: { country: 'US', language: 'en' },
      offsiteDeliveryEnabled: false,
    },
    // The body carries nothing useful; the id is in the header.
    campaignIdHeader: 'x-restli-id',
    spendUrl:
      'https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL' +
      '&campaigns=List(urn%3Ali%3AsponsoredCampaign%3A{campaignId})&fields=costInLocalCurrency',
    spendAmountPath: 'elements.0.costInLocalCurrency',
    spendUnits: 'major',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: 'https://api.linkedin.com/rest/adCampaigns/{campaignId}',
    pauseMethod: 'POST',
    pauseBody: { patch: { $set: { status: 'PAUSED' } } },
    currencies: [currency],
  })
}

/**
 * TikTok Business (TikTok Ads).
 *
 * Authenticates with the token in an Access-Token header and NO scheme — a Bearer prefix is
 * rejected. Every reporting and status call needs the advertiser id as well as the campaign
 * id, which is why the ad account reference reaches those calls.
 */
export function declareTikTokAds(options: SocialAdNetworkOptions = {}): void {
  const currency = (options.currency || 'USD').toUpperCase()

  declareAdPlatform({
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    authHeader: 'Access-Token',
    authScheme: '',
    createUrl: 'https://business-api.tiktok.com/open_api/v1.3/campaign/create/',
    createBody: {
      advertiser_id: '{accountRef}',
      campaign_name: '{name}',
      objective_type: 'TRAFFIC',
      budget_mode: 'BUDGET_MODE_TOTAL',
      // TikTok takes the budget as a decimal in the account currency.
      budget: '{campaignMaxMajor}',
      // DISABLE is TikTok's paused state at creation.
      operation_status: 'DISABLE',
    },
    campaignIdPath: 'data.campaign_id',
    spendUrl:
      'https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/' +
      '?advertiser_id={accountRef}&report_type=BASIC&data_level=AUCTION_CAMPAIGN' +
      '&dimensions=%5B%22campaign_id%22%5D&metrics=%5B%22spend%22%5D' +
      '&filtering=%5B%7B%22field_name%22%3A%22campaign_ids%22%2C%22filter_type%22%3A%22IN%22%2C%22filter_value%22%3A%22%5B%5C%22{campaignId}%5C%22%5D%22%7D%5D' +
      '&start_date={since}&end_date={today}',
    spendAmountPath: 'data.list.0.metrics.spend',
    spendUnits: 'major',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: 'https://business-api.tiktok.com/open_api/v1.3/campaign/status/update/',
    pauseMethod: 'POST',
    pauseBody: {
      advertiser_id: '{accountRef}',
      campaign_ids: ['{campaignId}'],
      operation_status: 'DISABLE',
    },
    currencies: [currency],
  })
}

/**
 * Reddit Ads.
 *
 * Budgets and reported spend are both in MICRO units. Reporting is a POST with a body
 * rather than a query string, which is why the declaration layer carries spendBody.
 */
export function declareRedditAds(options: SocialAdNetworkOptions = {}): void {
  const currency = (options.currency || 'USD').toUpperCase()

  declareAdPlatform({
    id: 'reddit_ads',
    label: 'Reddit Ads',
    createUrl: 'https://ads-api.reddit.com/api/v3/ad_accounts/{accountRef}/campaigns',
    createBody: {
      data: {
        name: '{name}',
        objective: 'CLICKS',
        configured_status: 'PAUSED',
        spend_cap: '{campaignMaxMicro}',
      },
    },
    campaignIdPath: 'data.id',
    spendUrl: 'https://ads-api.reddit.com/api/v3/ad_accounts/{accountRef}/reports',
    spendMethod: 'POST',
    spendBody: {
      data: {
        breakdowns: ['CAMPAIGN_ID'],
        fields: ['SPEND'],
        starts_at: '{sinceIso}',
        ends_at: '{todayIso}',
        time_zone_id: 'UTC',
      },
    },
    spendAmountPath: 'data.metrics.0.spend',
    spendUnits: 'micro',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: 'https://ads-api.reddit.com/api/v3/ad_accounts/{accountRef}/campaigns/{campaignId}',
    pauseMethod: 'PATCH',
    pauseBody: { data: { configured_status: 'PAUSED' } },
    currencies: [currency],
  })
}

/**
 * Pinterest Ads.
 *
 * Creates campaigns as a LIST — the request body is an array, and the id comes back nested
 * inside the first item. Spend is reported in micro dollars, named as such in the column.
 */
export function declarePinterestAds(options: SocialAdNetworkOptions = {}): void {
  const currency = (options.currency || 'USD').toUpperCase()

  declareAdPlatform({
    id: 'pinterest_ads',
    label: 'Pinterest Ads',
    createUrl: 'https://api.pinterest.com/v5/ad_accounts/{accountRef}/campaigns',
    createBody: [
      {
        ad_account_id: '{accountRef}',
        name: '{name}',
        objective_type: 'AWARENESS',
        status: 'PAUSED',
        lifetime_spend_cap: '{campaignMaxMicro}',
      },
    ],
    campaignIdPath: 'items.0.data.id',
    spendUrl:
      'https://api.pinterest.com/v5/ad_accounts/{accountRef}/campaigns/analytics' +
      '?campaign_ids={campaignId}&start_date={since}&end_date={today}' +
      '&columns=SPEND_IN_MICRO_DOLLAR&granularity=TOTAL',
    spendAmountPath: '0.SPEND_IN_MICRO_DOLLAR',
    spendUnits: 'micro',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: 'https://api.pinterest.com/v5/ad_accounts/{accountRef}/campaigns',
    pauseMethod: 'PATCH',
    pauseBody: [{ id: '{campaignId}', status: 'PAUSED' }],
    currencies: [currency],
  })
}

/**
 * Snapchat Ads.
 *
 * Wraps everything in a list under a named key and returns the created object nested two
 * levels down. Spend is micro currency.
 */
export function declareSnapchatAds(options: SocialAdNetworkOptions = {}): void {
  const currency = (options.currency || 'USD').toUpperCase()

  declareAdPlatform({
    id: 'snapchat_ads',
    label: 'Snapchat Ads',
    createUrl: 'https://adsapi.snapchat.com/v1/adaccounts/{accountRef}/campaigns',
    createBody: {
      campaigns: [
        {
          name: '{name}',
          ad_account_id: '{accountRef}',
          status: 'PAUSED',
          start_time: '{todayIso}',
          lifetime_spend_cap_micro: '{campaignMaxMicro}',
        },
      ],
    },
    campaignIdPath: 'campaigns.0.campaign.id',
    spendUrl: 'https://adsapi.snapchat.com/v1/campaigns/{campaignId}/stats?granularity=TOTAL&fields=spend',
    spendAmountPath: 'total_stats.0.total_stat.stats.spend',
    spendUnits: 'micro',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: 'https://adsapi.snapchat.com/v1/campaigns/{campaignId}',
    pauseMethod: 'PUT',
    pauseBody: { campaigns: [{ id: '{campaignId}', status: 'PAUSED' }] },
    currencies: [currency],
  })
}

/**
 * X Ads (formerly Twitter Ads).
 *
 * READ THIS BEFORE USING IT. The X Ads API does not accept a bearer token: every request
 * must be signed with OAuth 1.0a using the app's consumer key and the user's access token.
 * Request signing is not something a declaration can describe, and pretending otherwise
 * would ship a network that authenticates in nobody's account.
 *
 * So this declaration is only made when the buyer supplies a signing endpoint of their own
 * — a small service that holds their X credentials, signs the request and forwards it. That
 * is a deliberate refusal to fake support: the shape below is correct, the signing is the
 * buyer's, and without it the network is not declared at all.
 *
 * Budgets and reported spend are both in MICRO units.
 */
export function declareXAds(options: SocialAdNetworkOptions & {
  /** Base URL of the buyer's OAuth 1.0a signing proxy, standing in for https://ads-api.x.com */
  signingProxyBaseUrl: string
  fundingInstrumentId: string
  apiVersion?: string
}): void {
  const currency = (options.currency || 'USD').toUpperCase()
  const version = options.apiVersion || '12'
  const base = String(options.signingProxyBaseUrl || '').trim().replace(/\/+$/, '')

  if (!base) {
    throw new Error('X Ads: the X Ads API requires OAuth 1.0a request signing, which a declaration cannot perform. Supply signingProxyBaseUrl — an endpoint holding your X credentials that signs and forwards these requests — or do not declare this network.')
  }
  if (!String(options.fundingInstrumentId || '').trim()) {
    throw new Error('X Ads: a fundingInstrumentId is required. X will not create a campaign without naming the funding source it will bill.')
  }

  declareAdPlatform({
    id: 'x_ads',
    label: 'X Ads',
    createUrl:
      `${base}/${version}/accounts/{accountRef}/campaigns` +
      `?name={name}&funding_instrument_id=${encodeURIComponent(options.fundingInstrumentId)}` +
      '&total_budget_amount_local_micro={campaignMaxMicro}&entity_status=PAUSED',
    createBody: {},
    campaignIdPath: 'data.id',
    spendUrl:
      `${base}/${version}/stats/accounts/{accountRef}` +
      '?entity=CAMPAIGN&entity_ids={campaignId}&metric_groups=BILLING' +
      '&granularity=TOTAL&placement=ALL_ON_TWITTER&start_time={sinceIso}&end_time={todayIso}',
    spendAmountPath: 'data.0.id_data.0.metrics.billed_charge_local_micro.0',
    spendUnits: 'micro',
    spendCurrency: currency,
    spendLookbackDays: options.lookbackDays,
    pauseUrl: `${base}/${version}/accounts/{accountRef}/campaigns/{campaignId}?entity_status=PAUSED`,
    pauseMethod: 'PUT',
    currencies: [currency],
  })
}

/**
 * Declare every social ad network the buyer has configured.
 *
 * Networks with buyer-specific prerequisites are declared only when those are supplied —
 * LinkedIn needs a campaign group, X needs a signing endpoint and a funding instrument.
 * A network is never half-declared: either it can create, read spend and pause, or it is
 * not registered.
 *
 * Returns the ids that were declared, so a route or a cockpit can say plainly which
 * networks are actually available rather than listing aspirations.
 */
export function declareSocialAdNetworks(options: SocialAdNetworkOptions & {
  meta?: boolean | { apiVersion?: string }
  linkedIn?: { campaignGroupUrn: string; apiVersion?: string }
  tikTok?: boolean
  reddit?: boolean
  pinterest?: boolean
  snapchat?: boolean
  x?: { signingProxyBaseUrl: string; fundingInstrumentId: string; apiVersion?: string }
} = {}): { declared: string[]; skipped: Array<{ id: string; reason: string }> } {
  const declared: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  const base: SocialAdNetworkOptions = { currency: options.currency, lookbackDays: options.lookbackDays }

  const attempt = (id: string, run: () => void) => {
    try {
      run()
      declared.push(id)
    } catch (reason: any) {
      skipped.push({ id, reason: String(reason?.message || reason) })
    }
  }

  if (options.meta !== false) {
    const meta = typeof options.meta === 'object' ? options.meta : {}
    attempt('meta_ads', () => declareMetaAds(meta.apiVersion, (options.currency || 'USD').toUpperCase()))
  }
  if (options.linkedIn) attempt('linkedin_ads', () => declareLinkedInAds({ ...base, ...options.linkedIn! }))
  if (options.tikTok !== false) attempt('tiktok_ads', () => declareTikTokAds(base))
  if (options.reddit !== false) attempt('reddit_ads', () => declareRedditAds(base))
  if (options.pinterest !== false) attempt('pinterest_ads', () => declarePinterestAds(base))
  if (options.snapchat !== false) attempt('snapchat_ads', () => declareSnapchatAds(base))
  if (options.x) attempt('x_ads', () => declareXAds({ ...base, ...options.x! }))

  return { declared, skipped }
}
