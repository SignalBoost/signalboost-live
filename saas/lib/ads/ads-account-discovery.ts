// saas/lib/ads/ads-account-discovery.ts
//
// SETUP IS PICKED FROM LIVE DATA, NEVER TYPED.
//
// Two fields in the ads setup are the silent-and-expensive kind. A wrong ad account
// reference spends against someone else's budget and reports someone else's numbers. A wrong
// currency is a hundredfold error in either direction. Both were text boxes, and both are
// values the network already knows — so asking a person to key them in was the defect.
//
// This file is the source behind those dropdowns. It asks each network for the ad accounts
// the connected credentials can actually reach, and returns what the network says about
// each: its own reference, its name, its currency, its timezone, its status, and — where the
// API exposes it — how that account already pays.
//
// WHY THAT LAST PART MATTERS COMMERCIALLY. A buyer who already advertises on a network
// already has an arrangement with it: a credit line, a card, a prepaid balance. They should
// not be asked to describe it. We read it, show it, and let them confirm — and where an API
// will not tell us, they pick from the arrangements that network genuinely offers rather
// than from a generic list that would let them choose something impossible.
//
// EVERY SIZE OF BUYER. The arrangements below are not the enterprise ones with the small
// ones bolted on; each network's real set is listed, from a card at the low end to an
// invoiced credit line at the high end.
//
// NO SIDE EFFECTS BEYOND THE FETCH, AND NO HOST IMPORTS, so this stays inside the portable
// boundary and a buyer gets the same discovery in their own deployment.
//
// READING ACCOUNT HEALTH LIVES HERE TOO, deliberately in the same file rather than in a
// second one with a near-identical name. Both ask a network for facts about an ad account —
// which accounts exist, and what state one of them is in — and a pair of files called
// ads-account-discovery and ads-account-health is exactly the kind of near-twin that has
// been cross-pasted twice in this repo.

/** What a network told us about one ad account the credentials can reach. */
import { assertMinorUnits, type SpendUnits } from './ads-money.ts'

export type DiscoveredAdAccount = {
  /** The network's own identifier — what every later call is addressed by. */
  accountRef: string
  name: string
  /** Read from the account, never chosen by a person. */
  currency: string | null
  timezone: string | null
  /** The network's word for the account's state — active, disabled, in review. */
  status: string | null
  /** How this account already pays, when the API says. Null means ask, do not guess. */
  billingMode: 'card' | 'prepaid' | 'invoiced' | null
  /** Anything else worth showing in the picker line. */
  detail: string | null
}

export type BillingArrangement = {
  id: 'card' | 'prepaid' | 'invoiced'
  label: string
  /** What it means for delivery, in the words a buyer would use. */
  description: string
  /** What the network requires before this arrangement is available. */
  eligibility: string
  /** Which health fields become watchable once this is chosen. */
  watches: string[]
}

/**
 * The arrangements each network actually offers.
 *
 * Deliberately per-network rather than one shared list: offering a buyer an option their
 * network does not have is the same class of error as a free-text box, just slower to
 * discover.
 */
export const BILLING_ARRANGEMENTS: Record<string, BillingArrangement[]> = {
  meta_ads: [
    {
      id: 'card',
      label: 'Automatic — charged at a threshold',
      description: 'Spend accumulates and the payment method is charged each time it crosses a rolling threshold, or on the monthly bill date, whichever comes first.',
      eligibility: 'Available to any account. Meta has been moving higher-spend accounts off cards onto invoicing or direct debit.',
      watches: ['card expiry', 'declined charges'],
    },
    {
      id: 'prepaid',
      label: 'Available funds — paid in advance',
      description: 'Money is added to the account before delivery and drawn down as ads run. Delivery stops at zero.',
      eligibility: 'Available in some markets only.',
      watches: ['remaining balance'],
    },
    {
      id: 'invoiced',
      label: 'Monthly invoicing — credit line',
      description: 'Spend accumulates against a credit line and is consolidated into one invoice at the start of the following month, payable net 30.',
      eligibility: 'Granted on account history and standing. Reaching the credit limit pauses delivery until the invoice is paid.',
      watches: ['credit line headroom', 'invoice due date'],
    },
  ],
  google_ads: [
    {
      id: 'card',
      label: 'Automatic payments',
      description: 'Charged after accruing costs, at a threshold or after 30 days, whichever comes first.',
      eligibility: 'Available to any account.',
      watches: ['card expiry', 'declined charges'],
    },
    {
      id: 'prepaid',
      label: 'Manual payments — pay in advance',
      description: 'Funds are added first and ads run against them. Delivery stops when the balance runs out.',
      eligibility: 'Availability depends on country and currency.',
      watches: ['remaining balance'],
    },
    {
      id: 'invoiced',
      label: 'Monthly invoicing',
      description: 'A payments account is linked to the ad account and invoiced monthly, net 30.',
      eligibility: 'Approval required, based on spend history and a credit check. This is also the only arrangement Google will let an API configure.',
      watches: ['credit line headroom', 'invoice due date'],
    },
  ],
  tiktok_ads: [
    {
      id: 'prepaid',
      label: 'Manual payment — advance deposit',
      description: 'A deposit is made before delivery and drawn down. The most common TikTok arrangement.',
      eligibility: 'Available to any account.',
      watches: ['remaining balance'],
    },
    {
      id: 'card',
      label: 'Automatic payment',
      description: 'Delivery runs against a billing threshold assigned to the ad account, charged to the payment method on file.',
      eligibility: 'Available to any account with a valid primary payment method.',
      watches: ['card expiry', 'declined charges'],
    },
    {
      id: 'invoiced',
      label: 'Monthly invoicing — credit line',
      description: 'A spending cap extended by TikTok, invoiced monthly and restored when the invoice is paid.',
      eligibility: 'Roughly six months of account history in good standing, regional spend criteria and business verification. Billing disputes must be raised within seven days.',
      watches: ['credit line headroom', 'invoice due date'],
    },
  ],
  linkedin_ads: [
    {
      id: 'card',
      label: 'Charged per transaction',
      description: 'The payment method is charged as spend accrues, with a receipt per charge rather than a monthly invoice.',
      eligibility: 'Available to any account.',
      watches: ['card expiry', 'declined charges'],
    },
    {
      id: 'invoiced',
      label: 'Monthly invoicing',
      description: 'Consolidated into one invoice per month through Business Manager.',
      eligibility: 'Requires sustained spend across consecutive months; LinkedIn sets the threshold.',
      watches: ['invoice due date'],
    },
  ],
  amazon_ads: [
    {
      id: 'card',
      label: 'Charged to the payment method',
      description: 'Costs are billed to the card on the advertising account.',
      eligibility: 'Available to any account.',
      watches: ['card expiry', 'declined charges'],
    },
    {
      id: 'invoiced',
      label: 'Invoiced',
      description: 'Monthly invoicing for approved advertisers.',
      eligibility: 'Approval required.',
      watches: ['invoice due date'],
    },
  ],
}

/** Networks without a published arrangement set still get the honest generic three. */
const GENERIC_ARRANGEMENTS: BillingArrangement[] = [
  {
    id: 'card',
    label: 'Charged to a payment method',
    description: 'The network charges a card or bank account as spend accrues.',
    eligibility: 'Confirm with the network.',
    watches: ['card expiry', 'declined charges'],
  },
  {
    id: 'prepaid',
    label: 'Paid in advance',
    description: 'Funds are added before delivery and drawn down. Delivery stops at zero.',
    eligibility: 'Confirm with the network.',
    watches: ['remaining balance'],
  },
  {
    id: 'invoiced',
    label: 'Invoiced monthly',
    description: 'Spend accumulates and is invoiced, typically net 30.',
    eligibility: 'Usually granted on spend history. Confirm with the network.',
    watches: ['credit line headroom', 'invoice due date'],
  },
]

export function billingArrangementsFor(networkId: string): BillingArrangement[] {
  return BILLING_ARRANGEMENTS[String(networkId)] || GENERIC_ARRANGEMENTS
}

// ─────────────────────────────────────────────────────────────────────────────
// Live account listing
// ─────────────────────────────────────────────────────────────────────────────

type Declaration = {
  url: string
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  headers?: Record<string, string>
  authHeader?: string
  authScheme?: string
  /** Dot path to the array of accounts in the response. */
  listPath: string
  map: {
    accountRef: string
    name?: string
    currency?: string
    timezone?: string
    status?: string
    /** A field whose value maps onto a billing arrangement, when the API exposes one. */
    billing?: string
  }
  /** Translates the network's own vocabulary into ours. */
  billingValues?: Record<string, 'card' | 'prepaid' | 'invoiced'>
}

// Written from each network's documented account-listing endpoint. Where an account id has
// a prefix the rest of the API does not want, it is stripped here rather than left for a
// person to notice — Meta returns "act_123" and wants "123" everywhere else.
const ACCOUNT_SOURCES: Record<string, Declaration> = {
  meta_ads: {
    url: 'https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status,funding_source_details',
    listPath: 'data',
    map: {
      accountRef: 'account_id',
      name: 'name',
      currency: 'currency',
      timezone: 'timezone_name',
      status: 'account_status',
      billing: 'funding_source_details.type',
    },
  },
  google_ads: {
    url: 'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
    listPath: 'resourceNames',
    map: { accountRef: '' },
  },
  linkedin_ads: {
    url: 'https://api.linkedin.com/rest/adAccounts?q=search',
    headers: { 'LinkedIn-Version': '202406', 'X-Restli-Protocol-Version': '2.0.0' },
    listPath: 'elements',
    map: { accountRef: 'id', name: 'name', currency: 'currency', status: 'status' },
  },
  tiktok_ads: {
    url: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/',
    authHeader: 'Access-Token',
    authScheme: '',
    listPath: 'data.list',
    map: { accountRef: 'advertiser_id', name: 'advertiser_name' },
  },
  reddit_ads: {
    url: 'https://ads-api.reddit.com/api/v3/me/ad_accounts',
    listPath: 'data',
    map: { accountRef: 'id', name: 'name', currency: 'currency', timezone: 'time_zone_id' },
  },
  pinterest_ads: {
    url: 'https://api.pinterest.com/v5/ad_accounts',
    listPath: 'items',
    map: { accountRef: 'id', name: 'name', currency: 'currency', status: 'status' },
  },
  snapchat_ads: {
    url: 'https://adsapi.snapchat.com/v1/me/organizations?with_ad_accounts=true',
    listPath: 'organizations',
    map: { accountRef: 'organization.id', name: 'organization.name' },
  },
}

function readPath(source: unknown, path: string): unknown {
  if (!path) return source
  let cursor: any = source
  for (const segment of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

/** Meta hands back "act_123" in some fields and wants the bare id in others. */
function bareRef(value: string): string {
  return value.replace(/^act_/, '').replace(/^customers\//, '')
}

export type DiscoveryResult =
  | { ok: true; accounts: DiscoveredAdAccount[] }
  | { ok: false; reason: string }

/**
 * Ask a network which ad accounts these credentials can reach.
 *
 * Returns a refusal rather than an empty list when the call fails, because "no accounts" and
 * "we could not ask" look identical in a dropdown and mean completely different things — one
 * invites the buyer to check their permissions, the other invites them to give up.
 */
export async function discoverAdAccounts(networkId: string, accessToken: string): Promise<DiscoveryResult> {
  const declaration = ACCOUNT_SOURCES[String(networkId)]
  if (!declaration) {
    return { ok: false, reason: `${networkId} does not publish an account list we can read. Enter the account reference from the network's own dashboard for this one.` }
  }
  if (!String(accessToken || '').trim()) {
    return { ok: false, reason: 'Connect this network first — an account list needs a working access token.' }
  }

  const headers: Record<string, string> = { ...(declaration.headers || {}) }
  const scheme = declaration.authScheme === undefined ? 'Bearer' : declaration.authScheme
  headers[declaration.authHeader || 'Authorization'] = scheme ? `${scheme} ${accessToken}` : accessToken

  let payload: unknown
  try {
    const init: RequestInit = { method: declaration.method || 'GET', headers }
    if (declaration.body && (declaration.method || 'GET') !== 'GET') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      init.body = JSON.stringify(declaration.body)
    }
    const res = await fetch(declaration.url, init)
    const raw = await res.text()
    if (!res.ok) return { ok: false, reason: `${networkId} refused the account list (${res.status}): ${raw.slice(0, 160)}` }
    try { payload = JSON.parse(raw) } catch { return { ok: false, reason: `${networkId} returned something that is not JSON.` } }
  } catch (error: any) {
    return { ok: false, reason: String(error?.message || error) }
  }

  const list = readPath(payload, declaration.listPath)
  if (!Array.isArray(list)) {
    return { ok: false, reason: `${networkId} answered, but not with a list of accounts at "${declaration.listPath}".` }
  }

  const accounts: DiscoveredAdAccount[] = []
  for (const entry of list) {
    // Google returns bare resource-name strings rather than objects.
    const refRaw = typeof entry === 'string' ? entry : text(readPath(entry, declaration.map.accountRef))
    if (!refRaw) continue
    const accountRef = bareRef(String(refRaw))

    const billingRaw = declaration.map.billing && typeof entry !== 'string'
      ? text(readPath(entry, declaration.map.billing))
      : null
    const billingMode = billingRaw && declaration.billingValues
      ? declaration.billingValues[billingRaw] || null
      : null

    accounts.push({
      accountRef,
      name: typeof entry === 'string'
        ? accountRef
        : text(readPath(entry, declaration.map.name || '')) || accountRef,
      currency: typeof entry === 'string' ? null : text(readPath(entry, declaration.map.currency || '')),
      timezone: typeof entry === 'string' ? null : text(readPath(entry, declaration.map.timezone || '')),
      status: typeof entry === 'string' ? null : text(readPath(entry, declaration.map.status || '')),
      billingMode,
      detail: billingRaw,
    })
  }

  return { ok: true, accounts }
}

/**
 * One line per account for the searchable dropdown.
 *
 * The currency is in the label on purpose: it is the field a person would otherwise type
 * wrongly, and seeing it beside the account name is what makes the mistake visible before
 * the selection rather than after the spend.
 */
export function accountPickerLabel(account: DiscoveredAdAccount): string {
  const parts = [account.name]
  if (account.accountRef && account.name !== account.accountRef) parts.push(account.accountRef)
  if (account.currency) parts.push(account.currency)
  if (account.status) parts.push(account.status)
  return parts.join(' · ')
}


// ─────────────────────────────────────────────────────────────────────────────
// Reading account health from the network
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY ONLY THREE NETWORKS. Meta, Google and TikTok publish the account's financial state:
// what it has spent, what it is allowed to spend, what is left. The others do not, and
// guessing at an endpoint would produce a figure that looks authoritative and is not — which
// is worse than the honest alternative of a person typing what they know and it being
// marked as declared rather than read.


export type AccountHealthRead = {
  ok: boolean
  /** False when the network publishes nothing to read. Not an error — just not available. */
  supported: boolean
  reason: string
  health: {
    billingMode: 'card' | 'prepaid' | 'invoiced' | null
    currency: string | null
    creditLimitMinor: number | null
    creditUsedMinor: number | null
    balanceMinor: number | null
    paymentState: 'ok' | 'limit_reached' | 'past_due' | 'declined' | 'suspended' | 'unknown'
  } | null
}

function unsupported(networkId: string): AccountHealthRead {
  return {
    ok: false,
    supported: false,
    reason: `${networkId} does not publish an account balance or credit endpoint. Record the arrangement by hand — it will be marked as declared rather than read.`,
    health: null,
  }
}

function healthFailure(reason: string): AccountHealthRead {
  return { ok: false, supported: true, reason, health: null }
}

function money(raw: unknown, units: SpendUnits, currency: string | null): number | null {
  if (raw === null || raw === undefined || raw === '' || !currency) return null
  try {
    return assertMinorUnits(raw as any, units, currency)
  } catch {
    // A figure we cannot convert exactly is not written at all. A wrong number here would be
    // compared against a cap.
    return null
  }
}

// Meta's own vocabulary for how an account pays, translated once.
const META_FUNDING: Record<string, 'card' | 'prepaid' | 'invoiced'> = {
  CREDIT_CARD: 'card',
  PAYPAL: 'card',
  DIRECT_DEBIT: 'card',
  EXTENDED_CREDIT: 'invoiced',
  INVOICE: 'invoiced',
  PREPAID: 'prepaid',
  AVAILABLE_FUNDS: 'prepaid',
  FACEBOOK_WALLET: 'prepaid',
}

// account_status, as Meta numbers it. 3 is unsettled — the account owes money and delivery
// is at risk while every campaign still reports normally.
const META_STATUS: Record<string, 'ok' | 'past_due' | 'suspended' | 'unknown'> = {
  '1': 'ok',
  '2': 'suspended',
  '3': 'past_due',
  '9': 'past_due',
  '100': 'suspended',
  '101': 'suspended',
}

/**
 * Ask a network what state an ad account is in.
 *
 * `currencyHint` comes from the account the operator already picked, because two of these
 * endpoints report amounts without saying which currency they are in — and a minor unit is
 * not always a hundredth.
 */
export async function readAdAccountHealth(
  networkId: string,
  accessToken: string,
  accountRef: string,
  currencyHint?: string | null,
): Promise<AccountHealthRead> {
  const id = String(networkId)
  if (!String(accessToken || '').trim()) return healthFailure('No working connection for this network.')
  if (!String(accountRef || '').trim()) return healthFailure('An ad account is required.')

  if (id === 'meta_ads') {
    const url = `https://graph.facebook.com/v21.0/act_${encodeURIComponent(accountRef)}` +
      '?fields=currency,balance,spend_cap,amount_spent,account_status,funding_source_details'
    const res = await fetchJson(url, { Authorization: `Bearer ${accessToken}` })
    if (!res.ok) return healthFailure(res.reason)

    const payload: any = res.payload
    const currency = payload?.currency ? String(payload.currency).toUpperCase() : (currencyHint || null)
    const fundingType = payload?.funding_source_details?.type ? String(payload.funding_source_details.type).toUpperCase() : ''
    const limit = money(payload?.spend_cap, 'minor', currency)
    const used = money(payload?.amount_spent, 'minor', currency)

    return {
      ok: true,
      supported: true,
      reason: '',
      health: {
        billingMode: META_FUNDING[fundingType] || null,
        currency,
        // Meta's spend cap is an account-level limit rather than a credit line, but it fails
        // the same way — delivery stops at it — so it is watched in the same place.
        creditLimitMinor: limit && limit > 0 ? limit : null,
        creditUsedMinor: limit && limit > 0 ? used : null,
        balanceMinor: money(payload?.balance, 'minor', currency),
        paymentState: META_STATUS[String(payload?.account_status ?? '')] || 'unknown',
      },
    }
  }

  if (id === 'tiktok_ads') {
    const url = 'https://business-api.tiktok.com/open_api/v1.3/advertiser/info/' +
      `?advertiser_ids=%5B%22${encodeURIComponent(accountRef)}%22%5D`
    const res = await fetchJson(url, { 'Access-Token': accessToken })
    if (!res.ok) return healthFailure(res.reason)

    const entry: any = (res.payload as any)?.data?.list?.[0]
    if (!entry) return healthFailure('TikTok answered without that advertiser.')
    const currency = entry?.currency ? String(entry.currency).toUpperCase() : (currencyHint || null)

    return {
      ok: true,
      supported: true,
      reason: '',
      health: {
        // TikTok's common arrangement is a deposit drawn down, and the balance is what it
        // reports. A credit line shows as a balance too, so the mode is left alone unless
        // the operator has set it.
        billingMode: null,
        currency,
        creditLimitMinor: null,
        creditUsedMinor: null,
        balanceMinor: money(entry?.balance, 'major', currency),
        paymentState: String(entry?.status || '').toUpperCase() === 'STATUS_DISABLE' ? 'suspended' : 'ok',
      },
    }
  }

  if (id === 'google_ads') {
    // Google reports the account budget rather than a balance, in micros, and it is the
    // closest thing it has to "how much of what was approved is gone".
    const url = `https://googleads.googleapis.com/v17/customers/${encodeURIComponent(accountRef)}/googleAds:search`
    const res = await fetchJson(
      url,
      { Authorization: `Bearer ${accessToken}` },
      {
        method: 'POST',
        body: {
          query:
            'SELECT account_budget.amount_served_micros, account_budget.approved_spending_limit_micros, ' +
            'account_budget.status, customer.currency_code FROM account_budget LIMIT 1',
        },
      },
    )
    if (!res.ok) return healthFailure(res.reason)

    const row: any = (res.payload as any)?.results?.[0]
    if (!row) return healthFailure('Google returned no account budget for that customer.')
    const currency = row?.customer?.currencyCode ? String(row.customer.currencyCode).toUpperCase() : (currencyHint || null)
    const limit = money(row?.accountBudget?.approvedSpendingLimitMicros, 'micro', currency)

    return {
      ok: true,
      supported: true,
      reason: '',
      health: {
        billingMode: 'invoiced',
        currency,
        creditLimitMinor: limit,
        creditUsedMinor: money(row?.accountBudget?.amountServedMicros, 'micro', currency),
        balanceMinor: null,
        paymentState: String(row?.accountBudget?.status || '').toUpperCase() === 'APPROVED' ? 'ok' : 'unknown',
      },
    }
  }

  return unsupported(id)
}

export function supportsHealthRead(networkId: string): boolean {
  return ['meta_ads', 'tiktok_ads', 'google_ads'].indexOf(String(networkId)) !== -1
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<{ ok: boolean; payload: unknown; reason: string }> {
  try {
    const sent: Record<string, string> = { ...headers }
    const init: RequestInit = { method: options.method || 'GET', headers: sent }
    if (options.body !== undefined && (options.method || 'GET') !== 'GET') {
      sent['Content-Type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }
    const res = await fetch(url, init)
    const raw = await res.text()
    if (!res.ok) return { ok: false, payload: null, reason: `${res.status}: ${raw.slice(0, 160)}` }
    try {
      return { ok: true, payload: JSON.parse(raw), reason: '' }
    } catch {
      return { ok: false, payload: null, reason: 'the response was not JSON.' }
    }
  } catch (error: any) {
    return { ok: false, payload: null, reason: String(error?.message || error) }
  }
}
