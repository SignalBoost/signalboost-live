// saas/lib/ads/spend-ledger.ts
//
// HOST SIDE of the ad spend ledger.
//
// ads-connector.ts enforces the three rules in memory, and memory does not survive a cold
// serverless process. This file is the SignalBoost host's answer to "what is authorised to
// spend right now, who approved it, and what has it actually spent" — a table, read and
// written through an INJECTED client so nothing here imports the host's database.
//
// NAMED DELIBERATELY UNLIKE ITS NEIGHBOURS. Not ads-connector-store, not
// ads-declared-platform-store. Two files whose names differ by a suffix have been
// cross-pasted twice in this repo, and the second time the real content of one went missing
// from both. lib/outreach/platform-declarations.ts exists under that name for the same
// reason; this is the ads equivalent of it.
//
// WHY THE LEDGER IS WRITTEN BEFORE THE PROVIDER IS CALLED. A campaign row is inserted as
// 'pending' first, then updated with the provider's id. If the create request succeeds and
// the response is lost — a timeout, a cold start, a deploy mid-flight — there is still a
// row saying a campaign was attempted on that account with that cap and that approver. The
// alternative writes the row only on success, which means the one case you most need a
// record of is the one case you have none.
//
// SPEND IS NEVER COMPUTED HERE. Every figure written to this table came back from the
// provider. The raw value and the units it arrived in are stored beside the converted
// amount, so a units error is provable after the fact rather than argued about.

import type { AdSpendCap, AdSpendReport, Money } from './ads-connector.ts'

type AnyClient = { from: (table: string) => any }

const CAMPAIGNS = 'ads_campaigns'
const EVENTS = 'ads_spend_events'
const CEILINGS = 'ads_account_ceilings'
const POSITION_VIEW = 'ads_campaign_position'

export type LedgerCampaignInput = {
  platformId: string
  accountRef: string
  name: string
  productKey?: string | null
  cap: AdSpendCap
  contentApprovedBy: string
  spendApprovedBy: string
  createdBy: string
}

export type LedgerResult = { ok: boolean; id?: string; error?: string }

/**
 * Record the intent to spend, before anything is contacted.
 *
 * Both approvers are required by the table itself, so a campaign that reaches the provider
 * without a recorded spend approver is not possible through this path — the insert fails
 * before the network call happens.
 */
export async function recordCampaignIntent(admin: AnyClient, input: LedgerCampaignInput): Promise<LedgerResult> {
  const now = new Date().toISOString()
  const row = {
    platform_id: input.platformId,
    account_ref: input.accountRef,
    campaign_ref: null,
    product_key: input.productKey || null,
    name: input.name,
    currency: input.cap.campaignMax.currency,
    campaign_max_minor: input.cap.campaignMax.amount,
    daily_max_minor: input.cap.dailyMax ? input.cap.dailyMax.amount : null,
    content_approved_by: input.contentApprovedBy,
    content_approved_at: now,
    spend_approved_by: input.spendApprovedBy,
    spend_approved_at: now,
    status: 'pending',
    created_by: input.createdBy,
  }

  const { data, error } = await admin.from(CAMPAIGNS).insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data?.id ? String(data.id) : undefined }
}

/**
 * Attach the provider's campaign id once it is known.
 *
 * 'created_paused' is the expected status: every network this portable declares creates
 * campaigns paused, so a human turns them on and a mistake in the create request costs
 * nothing until someone deliberately spends.
 */
export async function markCampaignCreated(
  admin: AnyClient,
  ledgerId: string,
  campaignRef: string,
  status = 'created_paused',
): Promise<LedgerResult> {
  const { error } = await admin
    .from(CAMPAIGNS)
    .update({ campaign_ref: campaignRef, status, updated_at: new Date().toISOString() })
    .eq('id', ledgerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: ledgerId }
}

/**
 * Record a create that failed.
 *
 * Kept rather than deleted. A failed attempt on a live ad account is exactly the thing
 * someone will want to see later, and a table that only holds successes cannot answer
 * "did we try to start this twice".
 */
export async function markCampaignFailed(admin: AnyClient, ledgerId: string, reason: string): Promise<LedgerResult> {
  const { error } = await admin
    .from(CAMPAIGNS)
    .update({ status: 'failed', reconcile_error: String(reason).slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', ledgerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: ledgerId }
}

export async function markCampaignStatus(admin: AnyClient, ledgerId: string, status: string): Promise<LedgerResult> {
  const { error } = await admin
    .from(CAMPAIGNS)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ledgerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: ledgerId }
}

/**
 * Write one spend observation and move the campaign's running figure to match it.
 *
 * The event table is append-only. Nothing in this file updates or deletes an event, and
 * nothing should: a spend history that can be rewritten is not a record of anything.
 */
export async function recordSpendObservation(
  admin: AnyClient,
  ledgerId: string,
  report: AdSpendReport,
  cap: AdSpendCap,
): Promise<LedgerResult> {
  const overCap = report.spent.currency === cap.campaignMax.currency && report.spent.amount > cap.campaignMax.amount

  const event = {
    campaign_id: ledgerId,
    observed_at: report.reportedAt || new Date().toISOString(),
    reported_spend_minor: report.spent.amount,
    currency: report.spent.currency,
    // When an adapter does not carry the raw figure, what we have IS the converted one,
    // and the units column says so honestly rather than implying we saw the original.
    raw_amount: report.raw ? report.raw.amount : String(report.spent.amount),
    raw_units: report.raw ? report.raw.units : 'minor',
    over_cap: overCap,
    source: 'provider_report',
  }

  const { error: eventError } = await admin.from(EVENTS).insert(event)
  if (eventError) return { ok: false, error: eventError.message }

  const { error } = await admin
    .from(CAMPAIGNS)
    .update({
      reported_spend_minor: report.spent.amount,
      last_reconciled_at: new Date().toISOString(),
      reconcile_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ledgerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: ledgerId }
}

/**
 * Record that reconciliation could not read the provider.
 *
 * Stored explicitly because the dangerous failure is silent: a stale figure with no error
 * beside it reads as a healthy campaign that has spent nothing recently.
 */
export async function recordReconcileFailure(admin: AnyClient, ledgerId: string, error: string): Promise<LedgerResult> {
  const { error: writeError } = await admin
    .from(CAMPAIGNS)
    .update({
      reconcile_error: String(error).slice(0, 500),
      last_reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ledgerId)
  if (writeError) return { ok: false, error: writeError.message }
  return { ok: true, id: ledgerId }
}

export async function getCampaignRow(admin: AnyClient, ledgerId: string): Promise<any | null> {
  const { data } = await admin.from(CAMPAIGNS).select('*').eq('id', ledgerId).maybeSingle()
  return data || null
}

/** The cockpit read model: cap, reported spend, what is left, and whether it went over. */
export async function listCampaignPositions(
  admin: AnyClient,
  filter: { platformId?: string; accountRef?: string; status?: string } = {},
): Promise<any[]> {
  let query = admin.from(POSITION_VIEW).select('*')
  if (filter.platformId) query = query.eq('platform_id', filter.platformId)
  if (filter.accountRef) query = query.eq('account_ref', filter.accountRef)
  if (filter.status) query = query.eq('status', filter.status)
  const { data } = await query.order('created_at', { ascending: false }).limit(200)
  return data || []
}

export async function listSpendEvents(admin: AnyClient, ledgerId: string, limit = 100): Promise<any[]> {
  const { data } = await admin
    .from(EVENTS)
    .select('*')
    .eq('campaign_id', ledgerId)
    .order('observed_at', { ascending: false })
    .limit(limit)
  return data || []
}

// ── Account ceilings ─────────────────────────────────────────────────────────

export async function getAccountCeiling(admin: AnyClient, platformId: string, accountRef: string): Promise<Money | undefined> {
  const { data } = await admin
    .from(CEILINGS)
    .select('ceiling_minor, currency')
    .eq('platform_id', platformId)
    .eq('account_ref', accountRef)
    .maybeSingle()
  if (!data) return undefined
  return { amount: Number(data.ceiling_minor), currency: String(data.currency).toUpperCase() }
}

export async function listAccountCeilings(admin: AnyClient): Promise<any[]> {
  const { data } = await admin.from(CEILINGS).select('*').order('platform_id', { ascending: true })
  return data || []
}

export async function setAccountCeiling(
  admin: AnyClient,
  input: { platformId: string; accountRef: string; ceilingMinor: number; currency: string; setBy: string },
): Promise<LedgerResult> {
  if (!Number.isInteger(input.ceilingMinor) || input.ceilingMinor <= 0) {
    return { ok: false, error: 'A ceiling must be a positive whole number of minor units. A fractional ceiling means floating-point maths was done on money upstream.' }
  }
  if (!/^[A-Z]{3}$/.test(String(input.currency || '').toUpperCase())) {
    return { ok: false, error: 'A ceiling needs a three-letter ISO currency — the size of a minor unit depends on it.' }
  }

  const { error } = await admin.from(CEILINGS).upsert(
    {
      platform_id: input.platformId,
      account_ref: input.accountRef,
      ceiling_minor: input.ceilingMinor,
      currency: String(input.currency).toUpperCase(),
      set_by: input.setBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'platform_id,account_ref' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * What the gate needs to decide: the ceiling for this ad account, and what is already
 * committed against it.
 *
 * "Already spent" counts every campaign on the account that is not stopped or failed,
 * using each one's REPORTED spend. Counting caps instead would double-count a campaign
 * that finished under budget; counting nothing would let a second campaign be approved
 * against a ceiling the first has already consumed.
 *
 * Campaigns in another currency are ignored rather than converted — an exchange rate
 * applied here would be a guess about real money, and the gate refuses mixed currencies
 * for the same reason.
 */
export async function spendGateContextFor(
  admin: AnyClient,
  platformId: string,
  accountRef: string,
  currency: string,
): Promise<{ accountCeiling?: Money; alreadySpent?: Money }> {
  const accountCeiling = await getAccountCeiling(admin, platformId, accountRef)

  const { data } = await admin
    .from(CAMPAIGNS)
    .select('reported_spend_minor, currency, status')
    .eq('platform_id', platformId)
    .eq('account_ref', accountRef)

  const code = String(currency || '').toUpperCase()
  let total = 0
  for (const row of data || []) {
    if (String(row.currency).toUpperCase() !== code) continue
    if (row.status === 'stopped' || row.status === 'failed') continue
    total += Number(row.reported_spend_minor) || 0
  }

  return {
    accountCeiling,
    alreadySpent: total > 0 ? { amount: total, currency: code } : undefined,
  }
}
