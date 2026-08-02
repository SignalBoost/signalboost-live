// saas/lib/ads/ads-network-setup.ts
//
// WHAT EACH AD NETWORK NEEDS BEFORE IT CAN SPEND, in one place.
//
// This exists because the ads surface was built reading ten access tokens straight from
// process.env and telling the operator the variable name — which is the MANUAL path and
// only the manual path. The onboarding doctrine (ONBOARD §12C) says provider setup is
// self-serve through three interchangeable routes: an AI-staged infrastructure PR, the
// operator doing it themselves, or the browser agent. A surface that can only be configured
// by hand-typing environment variables into Vercel fails that, and it fails it worst for the
// buyer, who has no Vercel project at all.
//
// So the variable names live HERE rather than being spelled inline in a route, and every
// path reads the same list: the cockpit to show what is missing, the connect-via-PR route to
// stage exactly those keys, and the ads route to decide whether a network is usable.
//
// WHY A KEY NAME IS WORTH THIS MUCH CARE. A mistyped environment variable does not fail —
// it creates a second, useless variable while the one the code reads stays empty, and
// nothing complains until a campaign silently cannot start. Picking from a declared list is
// the error control, not a convenience.
//
// SECRETS ARE MARKED. A variable flagged `secret` is never returned in a GET response, never
// logged, and never rendered back into a form. The console shows whether it is set, not what
// it is.

export type AdNetworkVar = {
  key: string
  label: string
  required: boolean
  /** True for anything that would grant spending power if it leaked. */
  secret: boolean
  hint?: string
}

export type AdNetworkSetup = {
  id: string
  label: string
  vars: AdNetworkVar[]
  /** What the buyer has to obtain from the network itself. No path here can do it for them. */
  prerequisite: string
}

/** Applies to every network. Currency decides the size of a minor unit, so it is not cosmetic. */
export const GLOBAL_ADS_VARS: AdNetworkVar[] = [
  { key: 'ADS_CURRENCY', label: 'Account currency', required: true, secret: false, hint: 'ISO code, e.g. USD. Decides the size of a minor unit.' },
  { key: 'ADS_REPORT_LOOKBACK_DAYS', label: 'Reporting lookback (days)', required: false, secret: false, hint: 'Defaults to 90.' },
]

const token = (id: string, label: string): AdNetworkVar => ({
  key: adsTokenName(id),
  label: `${label} access token`,
  required: true,
  secret: true,
})

export const AD_NETWORK_SETUP: Record<string, AdNetworkSetup> = {
  meta_ads: {
    id: 'meta_ads',
    label: 'Meta Ads',
    vars: [token('meta_ads', 'Meta')],
    prerequisite: 'ads_management permission, business verification and app review.',
  },
  linkedin_ads: {
    id: 'linkedin_ads',
    label: 'LinkedIn Ads',
    vars: [
      token('linkedin_ads', 'LinkedIn'),
      {
        key: 'ADS_LINKEDIN_CAMPAIGN_GROUP_URN',
        label: 'Campaign group urn',
        required: true,
        secret: false,
        hint: 'urn:li:sponsoredCampaignGroup:… — every LinkedIn campaign belongs to a group.',
      },
    ],
    prerequisite: 'Partner-gated Ads API access and a sponsored ad account.',
  },
  tiktok_ads: {
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    vars: [token('tiktok_ads', 'TikTok')],
    prerequisite: 'A TikTok Business Center advertiser account.',
  },
  reddit_ads: {
    id: 'reddit_ads',
    label: 'Reddit Ads',
    vars: [token('reddit_ads', 'Reddit')],
    prerequisite: 'A Reddit ads account with API access.',
  },
  pinterest_ads: {
    id: 'pinterest_ads',
    label: 'Pinterest Ads',
    vars: [token('pinterest_ads', 'Pinterest')],
    prerequisite: 'A business account with standard ads API access, granted after review.',
  },
  snapchat_ads: {
    id: 'snapchat_ads',
    label: 'Snapchat Ads',
    vars: [token('snapchat_ads', 'Snapchat')],
    prerequisite: 'An Ads account and an organisation-scoped app.',
  },
  x_ads: {
    id: 'x_ads',
    label: 'X Ads',
    vars: [
      token('x_ads', 'X'),
      {
        key: 'ADS_X_SIGNING_PROXY_URL',
        label: 'OAuth 1.0a signing endpoint',
        required: true,
        secret: false,
        hint: 'X requires request signing, which a declaration cannot perform. This is your own endpoint.',
      },
      { key: 'ADS_X_FUNDING_INSTRUMENT_ID', label: 'Funding instrument id', required: true, secret: false },
    ],
    prerequisite: 'An Ads API developer application, plus the signing endpoint above.',
  },
  google_ads: {
    id: 'google_ads',
    label: 'Google Ads',
    vars: [
      token('google_ads', 'Google'),
      { key: 'ADS_GOOGLE_DEVELOPER_TOKEN', label: 'Developer token', required: true, secret: true },
      {
        key: 'ADS_GOOGLE_CAMPAIGN_BUDGET',
        label: 'Campaign budget resource',
        required: true,
        secret: false,
        hint: 'customers/…/campaignBudgets/… — a Google campaign references a budget that must already exist.',
      },
      { key: 'ADS_GOOGLE_LOGIN_CUSTOMER_ID', label: 'Manager account id', required: false, secret: false },
    ],
    prerequisite: 'A developer token from the API centre and a campaign budget created in the ad account.',
  },
  microsoft_ads: {
    id: 'microsoft_ads',
    label: 'Microsoft Advertising',
    vars: [
      token('microsoft_ads', 'Microsoft'),
      {
        key: 'ADS_MICROSOFT_BRIDGE_URL',
        label: 'SOAP bridge endpoint',
        required: true,
        secret: false,
        hint: 'The Campaign Management API is SOAP; this is your own service that translates.',
      },
    ],
    prerequisite: 'A Microsoft Advertising account, plus the bridge above.',
  },
  amazon_ads: {
    id: 'amazon_ads',
    label: 'Amazon Ads',
    vars: [
      token('amazon_ads', 'Amazon'),
      {
        key: 'ADS_AMAZON_REPORTING_URL',
        label: 'Reporting endpoint',
        required: true,
        secret: false,
        hint: 'Amazon spend is only readable from an asynchronous report job; this endpoint resolves it.',
      },
      { key: 'ADS_AMAZON_CLIENT_ID', label: 'Client id', required: true, secret: false },
      { key: 'ADS_AMAZON_PROFILE_ID', label: 'Profile id', required: true, secret: false },
    ],
    prerequisite: 'An advertising account and a profile, plus the reporting endpoint above.',
  },
}

/** meta_ads → ADS_META_ACCESS_TOKEN. One convention, derived rather than written out twice. */
export function adsTokenName(networkId: string): string {
  return `ADS_${String(networkId).replace(/_ads$/, '').toUpperCase()}_ACCESS_TOKEN`
}

export function adNetworkSetup(networkId: string): AdNetworkSetup | null {
  return AD_NETWORK_SETUP[String(networkId)] || null
}

export function listAdNetworkSetups(): AdNetworkSetup[] {
  return Object.values(AD_NETWORK_SETUP)
}

/**
 * Which declared variables are still absent, by name.
 *
 * Returned to the console so an operator is told exactly what is missing rather than being
 * left to compare a list of names against a Vercel dashboard by eye.
 */
export function missingAdNetworkVars(networkId: string, env: Record<string, string | undefined> = process.env): string[] {
  const setup = adNetworkSetup(networkId)
  if (!setup) return []
  const missing: string[] = []
  for (const item of [...GLOBAL_ADS_VARS, ...setup.vars]) {
    if (!item.required) continue
    if (!String(env[item.key] || '').trim()) missing.push(item.key)
  }
  return missing
}

/** Every variable name this network could use, for the PR-staging path to validate against. */
export function adNetworkVarKeys(networkId: string): string[] {
  const setup = adNetworkSetup(networkId)
  if (!setup) return []
  return [...GLOBAL_ADS_VARS, ...setup.vars].map(item => item.key)
}

/**
 * The console's view of a network's setup — labels, hints and whether each value is present.
 * NEVER the values themselves: a secret that can be read back from an API is a secret that
 * leaks through a screenshot, a log, or a browser cache.
 */
export function adNetworkSetupView(networkId: string, env: Record<string, string | undefined> = process.env) {
  const setup = adNetworkSetup(networkId)
  if (!setup) return null
  return {
    id: setup.id,
    label: setup.label,
    prerequisite: setup.prerequisite,
    vars: [...GLOBAL_ADS_VARS, ...setup.vars].map(item => ({
      key: item.key,
      label: item.label,
      required: item.required,
      secret: item.secret,
      hint: item.hint || null,
      present: Boolean(String(env[item.key] || '').trim()),
    })),
  }
}
