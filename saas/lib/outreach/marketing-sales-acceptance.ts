// saas/lib/outreach/marketing-sales-acceptance.ts
//
// PROVES THE PORTABLE WORKS AGAINST THE BUYER'S OWN AD ACCOUNT, NOT OURS.
//
// This portable was packaged and documented before it had a harness, which meant a buyer could
// install it and had no way to demonstrate it worked in their environment beyond running a
// campaign and watching. Every other finished portable here ships one; this closes that gap.
//
// WHAT THIS PORTABLE'S UNRECOVERABLE FAILURE IS, because the checks are written against it.
// A publishing mistake costs a post. A spending mistake costs money at machine speed and the
// money does not come back. So the harness spends most of its effort on the two things that
// stand between a buyer and an unrecoverable loss:
//
//   THE GATE — a campaign cannot exist without a cap and a spend approver distinct from
//   whoever approved the copy. Six checks hand the gate a request it must refuse.
//
//   THE ARITHMETIC — four of the ad networks report spend in millionths. Reading micros as
//   major units understates spend a millionfold, and a minor unit is not always a hundredth:
//   yen has none, Kuwaiti dinar has three. Three checks prove the conversion in both
//   directions before any money moves.
//
// ONE REAL CAMPAIGN, ON AN ACCOUNT THE BUYER NOMINATES. Created through their adapter with a
// minimal cap, its spend read back from the provider, then paused — and the harness reports
// the campaign id so they can delete it. It is real for the same reason the press harness
// sends a real email: a stubbed adapter proves nothing about whether the buyer's credentials,
// account and network actually reach the platform.
//
// THE CAMPAIGN IS PAUSED AND THEN PAUSED AGAIN, DELIBERATELY. Every declared network creates
// paused, so acceptance costs nothing — and the explicit pause afterwards is what proves the
// buyer can stop a campaign at 2am, which is the capability nobody tests until they need it.
//
// NEVER THROWS. The result is a frozen, JSON-serialisable record.

import {
  checkSpendGate,
  getAdPlatform,
  registerAdPlatform,
  startAdCampaign,
  reconcileAdSpend,
  pauseAdCampaign,
  type AdCampaignRequest,
  type AdPlatformAdapter,
} from '../ads/ads-connector.ts'
import { currencyExponent, toMinorUnits, isOverCap } from '../ads/ads-money.ts'
import { normalizeAddress, productKeyOf } from './recipientHistory.ts'
import { pickOutreachLanguage } from './regionLanguage.ts'

export const MARKETING_SALES_ACCEPTANCE_SCHEMA = 'marketing-sales-acceptance/1' as const

export type MarketingSalesCheckId =
  | 'gate_requires_cap'
  | 'gate_requires_spend_approver'
  | 'gate_requires_account'
  | 'gate_requires_landing_url'
  | 'gate_refuses_currency_mismatch'
  | 'gate_enforces_account_ceiling'
  | 'micro_units_converted_correctly'
  | 'currency_exponent_respected'
  | 'spend_rounds_up'
  | 'over_cap_detected'
  | 'registration_requires_reconcile_and_pause'
  | 'buyer_adapter_created_campaign'
  | 'spend_read_from_provider'
  | 'campaign_stopped'
  | 'duplicate_scoped_to_product'
  | 'language_from_target'

export type MarketingSalesCheck = {
  id: MarketingSalesCheckId
  passed: boolean
  statement: string
  detail: string
}

export type MarketingSalesAcceptanceResult = {
  schema: typeof MARKETING_SALES_ACCEPTANCE_SCHEMA
  passed: boolean
  ranAt: string
  platform: string
  accountRef: string
  /** The campaign this run created, so the buyer can delete it. Null when none was created. */
  campaignCreated: string | null
  checks: MarketingSalesCheck[]
  refusal: string | null
}

export type MarketingSalesAcceptanceOptions = {
  /** The buyer's own adapter for the network they want to accept. */
  adapter: AdPlatformAdapter
  /** The buyer's ad account on that network. */
  accountRef: string
  /** A token the buyer supplies. Never read from anywhere else. */
  accessToken: string
  /** A landing URL the buyer owns. Required — an ad that leads nowhere still costs money. */
  landingUrl: string
  /** Currency for the acceptance cap, ISO 4217. Defaults to USD. */
  currency?: string
  /** Cap in MINOR units for the acceptance campaign. Defaults to the smallest sane figure. */
  capMinor?: number
  /** Named spend approver for the acceptance campaign. Required. */
  spendApprovedBy: string
}

/**
 * Flatten a discriminated-union result into a plain shape.
 *
 * Deliberately does NOT rely on control-flow narrowing. Narrowing a union by its discriminant
 * is correct TypeScript and it typechecked locally, but it failed in the repo build — so every
 * union field here is read through a structural cast instead. A harness that cannot compile in
 * the buyer's toolchain is worth nothing, and the compile that matters is theirs, not mine.
 */
function flatten(result: unknown): { ok: boolean; minor: number; roundedUp: boolean; reason: string } {
  const value = (result || {}) as { ok?: unknown; minor?: unknown; roundedUp?: unknown; reason?: unknown }
  return {
    ok: value.ok === true,
    minor: typeof value.minor === 'number' ? value.minor : Number.NaN,
    roundedUp: value.roundedUp === true,
    reason: typeof value.reason === 'string' ? value.reason : '',
  }
}

function check(id: MarketingSalesCheckId, passed: boolean, statement: string, detail: string): MarketingSalesCheck {
  return Object.freeze({ id, passed, statement, detail })
}

/** Did the gate refuse? Returns the refusal, or null when it wrongly allowed the request. */
function refusedBy(request: AdCampaignRequest, context: Parameters<typeof checkSpendGate>[1] = {}): string | null {
  return checkSpendGate(request, context)
}

function gateCheck(id: MarketingSalesCheckId, statement: string, refusal: string | null): MarketingSalesCheck {
  return check(
    id,
    refusal !== null,
    statement,
    refusal !== null ? `Refused: ${refusal}` : 'ALLOWED. The gate accepted a request it must refuse.',
  )
}

/**
 * Run acceptance against the buyer's adapter and account.
 *
 * The gate and arithmetic checks run first and cost nothing. The live campaign runs last, so a
 * buyer whose gate is misconfigured finds out before anything touches their ad account.
 */
export async function runMarketingSalesAcceptance(options: MarketingSalesAcceptanceOptions): Promise<MarketingSalesAcceptanceResult> {
  const ranAt = new Date().toISOString()
  const currency = String(options.currency || 'USD').toUpperCase()
  const capMinor = Number.isInteger(options.capMinor) && Number(options.capMinor) > 0 ? Number(options.capMinor) : 100

  // ── Refuse to run rather than run a weaker test ────────────────────────────
  const missing: string[] = []
  if (!options.adapter?.id) missing.push('an ad platform adapter')
  if (!String(options.accountRef || '').trim()) missing.push('an ad account reference')
  if (!String(options.accessToken || '').trim()) missing.push('an access token')
  if (!String(options.landingUrl || '').trim()) missing.push('a landing URL you own')
  if (!String(options.spendApprovedBy || '').trim()) missing.push('a named spend approver')
  if (missing.length) {
    return Object.freeze({
      schema: MARKETING_SALES_ACCEPTANCE_SCHEMA,
      passed: false,
      ranAt,
      platform: options.adapter?.id || '',
      accountRef: String(options.accountRef || ''),
      campaignCreated: null,
      checks: [],
      refusal: `Cannot run without ${missing.join(', ')}. Substituting our own would test our wiring instead of yours, and a live campaign belongs on an account you nominate.`,
    })
  }

  const checks: MarketingSalesCheck[] = []
  const platform = options.adapter.id

  const goodRequest: AdCampaignRequest = {
    platform,
    accountRef: options.accountRef,
    name: `acceptance-${ranAt}`,
    creative: { headline: 'Acceptance run', body: 'Created paused by the acceptance harness.', landingUrl: options.landingUrl },
    cap: { campaignMax: { amount: capMinor, currency } },
    spendApprovedBy: options.spendApprovedBy,
    spendApprovedAt: ranAt,
  }

  // The gate consults the registry, so the adapter must be registered before it can refuse
  // for the right reason rather than for an unknown platform.
  let registrationRefusal: string | null = null
  try {
    if (!getAdPlatform(platform)) registerAdPlatform(options.adapter)
  } catch (error) {
    registrationRefusal = error instanceof Error ? error.message : String(error)
  }
  if (registrationRefusal) {
    return Object.freeze({
      schema: MARKETING_SALES_ACCEPTANCE_SCHEMA,
      passed: false,
      ranAt,
      platform,
      accountRef: options.accountRef,
      campaignCreated: null,
      checks: [],
      refusal: `The adapter was refused at registration: ${registrationRefusal}`,
    })
  }

  // ── 1-6. The gate must refuse ──────────────────────────────────────────────
  checks.push(gateCheck(
    'gate_requires_cap',
    'A campaign with no spend cap is refused.',
    refusedBy({ ...goodRequest, cap: { campaignMax: undefined as never } }),
  ))
  checks.push(gateCheck(
    'gate_requires_spend_approver',
    'A campaign with no recorded spend approver is refused. Approving the creative is not approving the budget.',
    refusedBy({ ...goodRequest, spendApprovedBy: '' }),
  ))
  checks.push(gateCheck(
    'gate_requires_account',
    'A campaign with no ad account is refused.',
    refusedBy({ ...goodRequest, accountRef: '' }),
  ))
  checks.push(gateCheck(
    'gate_requires_landing_url',
    'A campaign with no landing URL is refused — an ad that leads nowhere still costs money.',
    refusedBy({ ...goodRequest, creative: { ...goodRequest.creative, landingUrl: '' } }),
  ))
  checks.push(gateCheck(
    'gate_refuses_currency_mismatch',
    'A cap and an account ceiling in different currencies are refused rather than converted at a rate we invented.',
    refusedBy(goodRequest, { accountCeiling: { amount: 100_000, currency: currency === 'EUR' ? 'USD' : 'EUR' } }),
  ))
  checks.push(gateCheck(
    'gate_enforces_account_ceiling',
    'A campaign that would take committed spend past the account ceiling is refused.',
    refusedBy(goodRequest, { accountCeiling: { amount: capMinor, currency }, alreadySpent: { amount: capMinor, currency } }),
  ))

  // ── 7-10. The arithmetic, before any money moves ───────────────────────────
  const micro = flatten(toMinorUnits('1000000', 'micro', 'USD'))
  checks.push(check(
    'micro_units_converted_correctly',
    micro.ok && micro.minor === 100,
    'One million micros is one major unit — 100 minor units in a two-decimal currency, not one million.',
    micro.ok ? `1000000 micro USD → ${micro.minor} minor units.` : `Conversion failed: ${micro.reason || 'unknown'}`,
  ))

  const yen = flatten(toMinorUnits('1000', 'major', 'JPY'))
  const dinar = flatten(toMinorUnits('1', 'major', 'KWD'))
  checks.push(check(
    'currency_exponent_respected',
    currencyExponent('JPY') === 0 && currencyExponent('KWD') === 3 && yen.ok && yen.minor === 1000 && dinar.ok && dinar.minor === 1000,
    'A minor unit is not always a hundredth: yen has none, Kuwaiti dinar has three.',
    `JPY exponent ${currencyExponent('JPY')}, KWD exponent ${currencyExponent('KWD')}; 1000 JPY → ${yen.ok ? yen.minor : 'error'}, 1 KWD → ${dinar.ok ? dinar.minor : 'error'} minor.`,
  ))

  const fraction = flatten(toMinorUnits('0.001', 'major', 'USD'))
  checks.push(check(
    'spend_rounds_up',
    fraction.ok && fraction.minor === 1 && fraction.roundedUp,
    'A fractional minor unit rounds UP, because understating spend against a cap is the only rounding error that can hurt a buyer.',
    fraction.ok ? `0.001 USD → ${fraction.minor} minor, roundedUp=${fraction.roundedUp}.` : `Conversion failed: ${fraction.reason || 'unknown'}`,
  ))

  checks.push(check(
    'over_cap_detected',
    isOverCap(capMinor + 1, capMinor) === true && isOverCap(capMinor, capMinor) === false,
    'Reported spend above the cap is detected; spend exactly at the cap is not a breach.',
    `${capMinor + 1} over ${capMinor}: ${isOverCap(capMinor + 1, capMinor)}; ${capMinor} over ${capMinor}: ${isOverCap(capMinor, capMinor)}.`,
  ))

  // ── 11. A platform that cannot be reconciled or stopped must not register ──
  let incompleteRefused = false
  let incompleteDetail = ''
  try {
    registerAdPlatform({
      id: `acceptance-incomplete-${Date.now()}`,
      label: 'Incomplete platform',
      createCampaign: async () => ({ platformCampaignId: 'x', status: 'paused' }),
    } as unknown as AdPlatformAdapter)
    incompleteDetail = 'REGISTERED. A platform that cannot report spend or be paused was accepted.'
  } catch (error) {
    incompleteRefused = true
    incompleteDetail = `Refused: ${error instanceof Error ? error.message : String(error)}`
  }
  checks.push(check(
    'registration_requires_reconcile_and_pause',
    incompleteRefused,
    'A platform that can start spending but cannot report spend or be stopped is refused at registration.',
    incompleteDetail,
  ))

  // ── 12-14. ONE real campaign on the buyer's account ────────────────────────
  let campaignCreated: string | null = null
  try {
    const startedRaw = await startAdCampaign(goodRequest, options.accessToken)
    // Same reason as `flatten` above: read every field structurally rather than through
    // narrowing, so this compiles under any toolchain a buyer points at it.
    const started = startedRaw as { ok?: boolean; platformCampaignId?: string; status?: string; reason?: string }
    // Hoisted to plain locals so nothing below depends on narrowing an optional property.
    const campaignId = String(started.platformCampaignId || '')
    const campaignStatus = String(started.status || 'unknown')
    if (started.ok === true && campaignId) {
      campaignCreated = campaignId
      checks.push(check(
        'buyer_adapter_created_campaign',
        true,
        'A valid campaign is created through the buyer adapter, on the buyer account.',
        `Campaign ${campaignId} created with status "${campaignStatus}" and cap ${capMinor} ${currency}. DELETE THIS CAMPAIGN when you are done with it.`,
      ))

      const reconciled = await reconcileAdSpend(platform, campaignId, goodRequest.cap, options.accessToken, options.accountRef)
      const report = (reconciled as { report?: { spent?: { amount?: number; currency?: string }; raw?: unknown } })?.report
      checks.push(check(
        'spend_read_from_provider',
        Boolean(report),
        'Spend is read back from the provider rather than assumed, and the provider figure is retained beside the converted one.',
        report
          ? `Provider reported ${report.spent?.amount ?? 'unknown'} ${report.spent?.currency ?? ''} minor units${report.raw ? ' with the raw figure retained' : ''}.`
          : 'The adapter returned no spend report.',
      ))

      const paused = await pauseAdCampaign(platform, campaignId, options.accessToken, options.accountRef)
      const stopped = Boolean((paused as { ok?: boolean })?.ok)
      checks.push(check(
        'campaign_stopped',
        stopped,
        'The campaign can be stopped on demand — the capability nobody tests until 2am.',
        stopped ? 'Pause acknowledged by the provider.' : 'The provider did not acknowledge the pause. Stop this campaign in the ad console NOW.',
      ))
    } else {
      for (const id of ['buyer_adapter_created_campaign', 'spend_read_from_provider', 'campaign_stopped'] as MarketingSalesCheckId[]) {
        checks.push(check(id, false, 'Depends on one real campaign through the buyer adapter.', `The campaign was refused: ${started.reason || 'no reason given'}`))
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    for (const id of ['buyer_adapter_created_campaign', 'spend_read_from_provider', 'campaign_stopped'] as MarketingSalesCheckId[]) {
      checks.push(check(id, false, 'Depends on one real campaign through the buyer adapter.', `The attempt threw: ${detail}. If a campaign was created it may be running — check the ad account.`))
    }
  }

  // ── 15-16. Two pure properties that protect the prospect list ──────────────
  const sameAddress = normalizeAddress(' Person@Example.COM ') === normalizeAddress('person@example.com')
  const differentProducts = productKeyOf('promote-business') !== productKeyOf('press-media')
  checks.push(check(
    'duplicate_scoped_to_product',
    sameAddress && differentProducts,
    'Duplicate protection normalises the address and is scoped to the product, so a prospect can be approached about something else but never twice about the same thing.',
    `Address normalisation matches: ${sameAddress}; distinct product keys: ${differentProducts}.`,
  ))

  const targetLanguage = pickOutreachLanguage({ url: 'https://exemplo.com.br/contato', name: 'Loja Exemplo' })
  checks.push(check(
    'language_from_target',
    targetLanguage === 'pt',
    'Outreach language is decided from the target, never from the operator interface language.',
    `A .com.br target resolved to "${targetLanguage}".`,
  ))

  return Object.freeze({
    schema: MARKETING_SALES_ACCEPTANCE_SCHEMA,
    passed: checks.every(item => item.passed),
    ranAt,
    platform,
    accountRef: options.accountRef,
    campaignCreated,
    checks: Object.freeze(checks) as MarketingSalesCheck[],
    refusal: null,
  })
}
