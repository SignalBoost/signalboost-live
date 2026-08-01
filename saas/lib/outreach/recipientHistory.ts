// saas/lib/outreach/recipientHistory.ts
//
// ADDRESS-LEVEL DUPLICATE PROTECTION.
//
// The existing duplicate guards work on the wrong key. Both send routes check whether
// THIS QUEUE ROW already has an outreach_sends record, and the draft-time guard checks
// whether the company's HOSTNAME is already queued. Neither stops a second email to the
// same person: two rows for the same company under different names, a rejected row
// re-created later, or two sites that publish the same contact address all pass every
// check and produce a second cold email to an inbox that already received one.
//
// This closes it on the only key that matters to the recipient — the address itself.
//
// SCOPED TO THE PRODUCT, NOT THE ADDRESS. The first version of this guard refused any
// second email to an address that had ever been contacted. That stops the real mistake
// — pitching the same product twice — but also stops a legitimate one: pitching a
// DIFFERENT product to a company already contacted about something else. A prospect
// list is an asset used across several products over time, so burning an address after
// one campaign is the wrong trade. Two rows collide only when the address AND the
// product_key match.
//
// A null product_key means "unlabelled". Unlabelled rows are compared against other
// unlabelled rows, keeping the old strict behaviour for anything created before this
// existed — the safe direction, since an unlabelled row can still be sent by hand with
// the override but will never silently re-contact anyone.
//
// The rule is also asymmetric on purpose. An AUTOMATIC send (the batch runner) must
// never re-contact for the same product: nobody is watching, and a repeat is exactly
// the mistake that gets a domain marked as spam. A HUMAN send is allowed to repeat,
// because a person deciding to follow up deliberately is legitimate — but only after
// being shown what was sent before and confirming, never silently.

type AnyClient = { from: (table: string) => any }

export type RecipientHistory = {
  contacted: boolean
  lastSentAt: string | null
  businessName: string | null
  outreachId: string | null
  productKey: string | null
}

/** Slug an offer or product name into a stable comparison key. */
export function productKeyOf(value: string | null | undefined): string | null {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || null
}

export function normalizeAddress(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase()
}

/**
 * Has this address already received an outreach email?
 *
 * Answered from outreach_sends (the record of what actually left the building) joined
 * back to the queue rows carrying that address — not from queue status, which can drift
 * and has done so in production.
 *
 * `excludeOutreachId` skips the row being sent right now, so a retry of a row whose own
 * send record exists is still handled by the per-row guard rather than being reported
 * here as somebody else's history.
 */
export async function getRecipientHistory(
  admin: AnyClient,
  email: string | null | undefined,
  excludeOutreachId?: string,
  productKey?: string | null,
): Promise<RecipientHistory> {
  const address = normalizeAddress(email)
  const empty: RecipientHistory = { contacted: false, lastSentAt: null, businessName: null, outreachId: null, productKey: null }
  if (!address) return empty

  const wanted = productKeyOf(productKey)

  // Every queue row that carries this address. ilike, because addresses have been
  // stored with varying case over the life of the table.
  const { data: rows } = await admin
    .from('outreach_queue')
    .select('id,business_name,contact_email,product_key')
    .ilike('contact_email', address)
    .limit(50)

  const ids = (rows || [])
    .filter((row: any) => normalizeAddress(row.contact_email) === address)
    // Only rows about the SAME product count as a duplicate. Unlabelled rows match
    // other unlabelled rows, never a labelled one.
    .filter((row: any) => productKeyOf(row.product_key) === wanted)
    .map((row: any) => row.id)
    .filter((id: string) => id !== excludeOutreachId)

  if (!ids.length) return empty

  const { data: sends } = await admin
    .from('outreach_sends')
    .select('outreach_id,sent_at')
    .in('outreach_id', ids)
    .order('sent_at', { ascending: false })
    .limit(1)

  const send = (sends || [])[0]
  if (!send) return empty

  const source = (rows || []).find((row: any) => row.id === send.outreach_id)
  return {
    contacted: true,
    lastSentAt: send.sent_at || null,
    businessName: source?.business_name || null,
    outreachId: send.outreach_id || null,
    productKey: wanted,
  }
}

/** Human-readable reason, used verbatim in API responses and the console. */
export function duplicateReason(history: RecipientHistory, address: string): string {
  const when = history.lastSentAt ? new Date(history.lastSentAt).toISOString().slice(0, 10) : 'earlier'
  const who = history.businessName ? ` as ${history.businessName}` : ''
  const about = history.productKey ? ` about ${history.productKey.replace(/-/g, ' ')}` : ''
  return `${address} was already contacted${who}${about} on ${when}. Not sent again automatically for the same product — a different product is allowed.`
}
