// saas/lib/ads/ads-attention.ts
//
// WHAT THE OWNER NEEDS TELLING BEFORE IT BITES.
//
// Everything else in the ads surface reports what happened. This reports what is about to,
// because the failures that actually stop paid advertising are all silent. The network keeps
// answering our questions correctly; it simply is not running the ads. A flat spend figure
// with nothing beside it reads as a quiet campaign rather than a stopped one.
//
// EVERY SIZE OF BUYER, because each billing arrangement ends differently:
//
//   invoiced   the credit line fills, or the invoice ages past due
//   card       the card expires, or a charge declines at the threshold
//   prepaid    the balance reaches zero
//   any        the access token expires
//
// A watcher that only understood credit lines would leave every small buyer unwatched — and
// a small buyer is the one least likely to notice a card expiring, because nothing tells
// them until delivery has already stopped.
//
// PROVENANCE IS CARRIED THROUGH TO THE NOTICE. A due date a person typed and a credit limit
// read from the platform are not the same claim, and a notice that blurs them teaches the
// operator to stop trusting all of them.
//
// NO SIDE EFFECTS AND NO IMPORTS. This decides what deserves attention; sending is the
// host's job, through whatever digest it already runs. That keeps it inside the portable
// boundary, so a buyer gets the same watching without our notification stack.

export type AttentionSeverity = 'critical' | 'warning' | 'info'

export type AccountHealthRow = {
  platformId: string
  accountRef: string
  tokenExpiresAt?: string | null
  tokenSource?: string | null
  billingMode?: string | null
  currency?: string | null
  // invoiced
  creditLimitMinor?: number | null
  creditUsedMinor?: number | null
  invoiceDueAt?: string | null
  // card
  cardLast4?: string | null
  cardExpiresOn?: string | null
  lastChargeFailedAt?: string | null
  lastChargeError?: string | null
  // prepaid
  balanceMinor?: number | null
  // any
  paymentState?: string | null
  billingSource?: string | null
  lastCheckedAt?: string | null
  checkError?: string | null
}

export type CampaignPositionRow = {
  id: string
  platformId: string
  accountRef: string
  name: string
  status: string
  currency: string
  capMinor: number
  spentMinor: number
  overCap?: boolean
  lastReconciledAt?: string | null
  reconcileError?: string | null
}

export type AttentionItem = {
  id: string
  severity: AttentionSeverity
  /** Machine-readable so a host can route or suppress by category. */
  kind:
    | 'token_expired' | 'token_expiring'
    | 'credit_exhausted' | 'credit_low'
    | 'invoice_past_due' | 'invoice_due'
    | 'card_expired' | 'card_expiring' | 'charge_declined'
    | 'balance_exhausted' | 'balance_short'
    | 'payment_state' | 'health_unknown' | 'billing_unset'
    | 'spend_over_cap' | 'spend_near_cap'
    | 'reconcile_failing' | 'reconcile_stale'
  platformId: string
  accountRef?: string
  subject: string
  /** One line, written to be read in a digest without opening anything. */
  message: string
  /** Whether the underlying fact came from the network, from a person, or from our ledger. */
  source: 'network' | 'declared' | 'ledger'
  dueAt?: string
  daysLeft?: number
}

export type AttentionInput = {
  health?: AccountHealthRow[]
  campaigns?: CampaignPositionRow[]
  /** Overridable so the same inputs always produce the same output in a test. */
  now?: Date
}

const DAY = 24 * 60 * 60 * 1000

// Chosen to be actionable rather than tidy, and each for its own reason. A token needs long
// enough to re-authorise through whichever setup path the buyer uses. An invoice needs long
// enough for a finance department to move, which is slower than an engineer. A card needs
// longest of all, because re-issuing one is measured in postal days.
const TOKEN_WARNING_DAYS = 7
const INVOICE_WARNING_DAYS = 5
const CARD_WARNING_DAYS = 21
const CREDIT_LOW_RATIO = 0.85
const CAP_NEAR_RATIO = 0.9
const RECONCILE_STALE_HOURS = 36

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 }

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY)
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function provenance(row: AccountHealthRow): 'network' | 'declared' {
  return row.billingSource === 'network' ? 'network' : 'declared'
}

function said(row: AccountHealthRow): string {
  // Spelled out in the notice itself. "The platform reports" and "you recorded" carry very
  // different weight when someone is deciding whether to act at 7am.
  return provenance(row) === 'network' ? 'The platform reports' : 'You recorded'
}

/** Authorised but not yet spent, across live campaigns on one account in one currency. */
function remainingAuthorised(campaigns: CampaignPositionRow[], platformId: string, accountRef: string, currency: string): number {
  let total = 0
  for (const campaign of campaigns) {
    if (campaign.platformId !== platformId || campaign.accountRef !== accountRef) continue
    if (campaign.status === 'stopped' || campaign.status === 'failed') continue
    if (String(campaign.currency).toUpperCase() !== String(currency).toUpperCase()) continue
    const left = campaign.capMinor - campaign.spentMinor
    if (left > 0) total += left
  }
  return total
}

/**
 * Everything that deserves the owner's attention, worst first.
 *
 * Pure: same inputs, same output. The host decides when to run it and where to send it.
 */
export function collectAdsAttention(input: AttentionInput = {}): AttentionItem[] {
  const now = input.now ? new Date(input.now) : new Date()
  const campaigns = input.campaigns || []
  const items: AttentionItem[] = []

  for (const row of input.health || []) {
    const where = `${row.platformId} · ${row.accountRef}`

    // ── Credentials, whatever the billing arrangement ────────────────────────
    const expiry = parseDate(row.tokenExpiresAt)
    if (expiry) {
      const left = daysBetween(now, expiry)
      if (left < 0) {
        items.push({
          id: `token:${row.platformId}:${row.accountRef}`,
          severity: 'critical',
          kind: 'token_expired',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `The access token expired ${Math.abs(left)} day${Math.abs(left) === 1 ? '' : 's'} ago. Nothing on this account can start, read spend or be paused until it is renewed.`,
          source: 'network',
          dueAt: expiry.toISOString(),
          daysLeft: left,
        })
      } else if (left <= TOKEN_WARNING_DAYS) {
        items.push({
          id: `token:${row.platformId}:${row.accountRef}`,
          severity: 'warning',
          kind: 'token_expiring',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `The access token expires in ${left} day${left === 1 ? '' : 's'}. Renew it before then and nothing stops.`,
          source: 'network',
          dueAt: expiry.toISOString(),
          daysLeft: left,
        })
      }
    }

    // ── Invoiced: the credit line and the invoice ────────────────────────────
    const limit = Number(row.creditLimitMinor || 0)
    const used = Number(row.creditUsedMinor || 0)
    if (limit > 0) {
      const ratio = used / limit
      if (ratio >= 1) {
        items.push({
          id: `credit:${row.platformId}:${row.accountRef}`,
          severity: 'critical',
          kind: 'credit_exhausted',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} the credit line is fully used. Delivery pauses across this whole account until the invoice is paid or the limit is raised — individual campaigns will still look fine.`,
          source: provenance(row),
        })
      } else if (ratio >= CREDIT_LOW_RATIO) {
        items.push({
          id: `credit:${row.platformId}:${row.accountRef}`,
          severity: 'warning',
          kind: 'credit_low',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} ${Math.round(ratio * 100)}% of the credit line is used. At 100% the network stops delivery, not just one campaign.`,
          source: provenance(row),
        })
      }
    }

    const due = parseDate(row.invoiceDueAt)
    if (due) {
      const left = daysBetween(now, due)
      if (left < 0) {
        items.push({
          id: `invoice:${row.platformId}:${row.accountRef}`,
          severity: 'critical',
          kind: 'invoice_past_due',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} the invoice was due ${Math.abs(left)} day${Math.abs(left) === 1 ? '' : 's'} ago. Networks suspend delivery on a past-due account.`,
          source: provenance(row),
          dueAt: due.toISOString(),
          daysLeft: left,
        })
      } else if (left <= INVOICE_WARNING_DAYS) {
        items.push({
          id: `invoice:${row.platformId}:${row.accountRef}`,
          severity: 'warning',
          kind: 'invoice_due',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} the invoice is due in ${left} day${left === 1 ? '' : 's'}. Finance usually needs longer notice than engineering does.`,
          source: provenance(row),
          dueAt: due.toISOString(),
          daysLeft: left,
        })
      }
    }

    // ── Card: the instrument itself ─────────────────────────────────────────
    // The commonest silent stop for a smaller advertiser, and the one nobody thinks to check
    // until delivery has already halted.
    const cardExpiry = parseDate(row.cardExpiresOn)
    if (cardExpiry) {
      const left = daysBetween(now, cardExpiry)
      const card = row.cardLast4 ? `card ending ${row.cardLast4}` : 'the payment card'
      if (left < 0) {
        items.push({
          id: `card:${row.platformId}:${row.accountRef}`,
          severity: 'critical',
          kind: 'card_expired',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} ${card} expired. The next threshold charge will decline and the network will halt delivery on the whole account.`,
          source: provenance(row),
          dueAt: cardExpiry.toISOString(),
          daysLeft: left,
        })
      } else if (left <= CARD_WARNING_DAYS) {
        items.push({
          id: `card:${row.platformId}:${row.accountRef}`,
          severity: 'warning',
          kind: 'card_expiring',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} ${card} expires in ${left} day${left === 1 ? '' : 's'}. A replacement card usually takes longer than that to arrive.`,
          source: provenance(row),
          dueAt: cardExpiry.toISOString(),
          daysLeft: left,
        })
      }
    }

    if (row.lastChargeFailedAt || row.paymentState === 'declined') {
      items.push({
        id: `charge:${row.platformId}:${row.accountRef}`,
        severity: 'critical',
        kind: 'charge_declined',
        platformId: row.platformId,
        accountRef: row.accountRef,
        subject: where,
        message: `A charge was declined${row.lastChargeError ? `: ${String(row.lastChargeError).slice(0, 120)}` : ''}. Networks retry, then halt every campaign on the account until the balance clears — and repeated failures damage the account's standing.`,
        source: provenance(row),
      })
    }

    // ── Prepaid: what is left to spend ──────────────────────────────────────
    if (row.balanceMinor !== null && row.balanceMinor !== undefined && row.currency) {
      const balance = Number(row.balanceMinor)
      if (balance <= 0) {
        items.push({
          id: `balance:${row.platformId}:${row.accountRef}`,
          severity: 'critical',
          kind: 'balance_exhausted',
          platformId: row.platformId,
          accountRef: row.accountRef,
          subject: where,
          message: `${said(row)} the prepaid balance is exhausted. Delivery stops at zero regardless of what any campaign cap still allows.`,
          source: provenance(row),
        })
      } else {
        // The useful comparison is not a percentage of nothing — it is the balance against
        // what has already been authorised to spend on this account.
        const owed = remainingAuthorised(campaigns, row.platformId, row.accountRef, row.currency)
        if (owed > 0 && balance < owed) {
          items.push({
            id: `balance:${row.platformId}:${row.accountRef}`,
            severity: 'warning',
            kind: 'balance_short',
            platformId: row.platformId,
            accountRef: row.accountRef,
            subject: where,
            message: `${said(row)} the prepaid balance covers only ${Math.round((balance / owed) * 100)}% of the spend already authorised on this account. Campaigns will stop mid-flight rather than at their caps.`,
            source: provenance(row),
          })
        }
      }
    }

    // ── Whole-account state ─────────────────────────────────────────────────
    if (row.paymentState === 'suspended' || row.paymentState === 'past_due' || row.paymentState === 'limit_reached') {
      items.push({
        id: `payment:${row.platformId}:${row.accountRef}`,
        severity: 'critical',
        kind: 'payment_state',
        platformId: row.platformId,
        accountRef: row.accountRef,
        subject: where,
        message: `${said(row)} this account is ${String(row.paymentState).replace(/_/g, ' ')}. Campaigns will report spend correctly and still not be running.`,
        source: provenance(row),
      })
    }

    if (row.checkError) {
      items.push({
        id: `health:${row.platformId}:${row.accountRef}`,
        severity: 'warning',
        kind: 'health_unknown',
        platformId: row.platformId,
        accountRef: row.accountRef,
        subject: where,
        message: `The last health check on this account failed: ${String(row.checkError).slice(0, 160)}. Treat the figures above as unverified rather than good.`,
        source: 'network',
      })
    }

    // An account whose arrangement is unknown cannot be watched at all. Said once, quietly,
    // rather than repeated as an alarm.
    if (!row.billingMode || row.billingMode === 'unknown') {
      items.push({
        id: `billing:${row.platformId}:${row.accountRef}`,
        severity: 'info',
        kind: 'billing_unset',
        platformId: row.platformId,
        accountRef: row.accountRef,
        subject: where,
        message: `No billing arrangement recorded for this account, so nothing here can warn you before it stops. Pick the arrangement in the ads cockpit — it takes one selection.`,
        source: 'declared',
      })
    }
  }

  // ── Campaign level ─────────────────────────────────────────────────────────
  for (const campaign of campaigns) {
    if (campaign.status === 'stopped' || campaign.status === 'failed') continue
    const where = `${campaign.name} (${campaign.platformId})`

    if (campaign.overCap === true || (campaign.capMinor > 0 && campaign.spentMinor > campaign.capMinor)) {
      items.push({
        id: `cap:${campaign.id}`,
        severity: 'warning',
        kind: 'spend_over_cap',
        platformId: campaign.platformId,
        accountRef: campaign.accountRef,
        subject: where,
        message: `Reported spend has passed the authorised cap. Platforms overdeliver; this is the network's own figure, not our arithmetic.`,
        source: 'ledger',
      })
    } else if (campaign.capMinor > 0 && campaign.spentMinor / campaign.capMinor >= CAP_NEAR_RATIO) {
      items.push({
        id: `cap:${campaign.id}`,
        severity: 'info',
        kind: 'spend_near_cap',
        platformId: campaign.platformId,
        accountRef: campaign.accountRef,
        subject: where,
        message: `${Math.round((campaign.spentMinor / campaign.capMinor) * 100)}% of the authorised cap is spent. Raising it is a new spend decision and needs its own approval.`,
        source: 'ledger',
      })
    }

    if (campaign.reconcileError) {
      items.push({
        id: `reconcile:${campaign.id}`,
        severity: 'warning',
        kind: 'reconcile_failing',
        platformId: campaign.platformId,
        accountRef: campaign.accountRef,
        subject: where,
        message: `Spend could not be read from the network: ${String(campaign.reconcileError).slice(0, 160)}. The figure shown is the last one that worked.`,
        source: 'ledger',
      })
      continue
    }

    const checked = parseDate(campaign.lastReconciledAt)
    const staleFor = checked ? (now.getTime() - checked.getTime()) / (60 * 60 * 1000) : Infinity
    if (staleFor > RECONCILE_STALE_HOURS) {
      items.push({
        id: `reconcile:${campaign.id}`,
        severity: 'warning',
        kind: 'reconcile_stale',
        platformId: campaign.platformId,
        accountRef: campaign.accountRef,
        subject: where,
        message: checked
          ? `Spend has not been read for ${Math.round(staleFor)} hours. A stale figure with nothing beside it reads as a campaign that is not spending.`
          : `Spend has never been read for this campaign. There is no evidence yet of what it is costing.`,
        source: 'ledger',
      })
    }
  }

  return items.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    const aDays = a.daysLeft === undefined ? 9999 : a.daysLeft
    const bDays = b.daysLeft === undefined ? 9999 : b.daysLeft
    return aDays - bDays
  })
}

/**
 * True when something here should reach a person today.
 *
 * The digest is pull-only by design and sends nothing when there is nothing — silence has to
 * mean "nothing needs you", or it stops being read. Info items alone are not worth a message.
 */
export function needsOwnerAttention(items: AttentionItem[]): boolean {
  return items.some(item => item.severity !== 'info')
}

/** Plain-text block for the daily digest. Ordered worst first, no counts without detail. */
export function formatAttentionDigest(items: AttentionItem[]): string {
  if (!items.length) return ''
  const lines: string[] = []
  for (const item of items) {
    const mark = item.severity === 'critical' ? '!!' : item.severity === 'warning' ? '!' : '·'
    lines.push(`${mark} ${item.subject} — ${item.message}`)
  }
  return lines.join('\n')
}
