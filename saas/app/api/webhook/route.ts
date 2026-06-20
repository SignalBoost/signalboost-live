import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─── Price-ID → internal plan maps ────────────────────────────────────────────
// Defect #5 fix: build the maps from ONLY the env vars that are actually set.
// Previously an unset STRIPE_PRICE_* var became the literal string key
// "undefined", and two unset vars collided on that same key — silently
// misrouting plans. We now skip undefined entries and log any that are missing.

function buildPriceMap(
  entries: Array<[string | undefined, string]>,
  label: string,
): Record<string, string> {
  const map: Record<string, string> = {}
  const missing: string[] = []
  for (const [priceId, plan] of entries) {
    if (priceId && priceId.trim()) {
      map[priceId] = plan
    } else {
      missing.push(plan)
    }
  }
  if (missing.length) {
    console.warn(
      `Webhook: missing ${label} price env vars for plan(s): ${missing.join(', ')}`,
    )
  }
  return map
}

const WEBSITE_PLAN_MAP: Record<string, string> = buildPriceMap(
  [
    [process.env.STRIPE_PRICE_WEBSITE_STARTER, 'starter'],
    [process.env.STRIPE_PRICE_WEBSITE_PRO, 'pro'],
    [process.env.STRIPE_PRICE_WEBSITE_BUSINESS, 'business'],
  ],
  'website',
)

const PODCAST_PLAN_MAP: Record<string, string> = buildPriceMap(
  [
    [process.env.STRIPE_PRICE_PODCAST_INDIE, 'indie'],
    [process.env.STRIPE_PRICE_PODCAST_PRO, 'pro'],
    [process.env.STRIPE_PRICE_PODCAST_NETWORK, 'network'],
  ],
  'podcast',
)

function resolvePlanAndLine(
  priceId: string | undefined,
  metaProductLine?: string,
  metaPlan?: string,
): { plan: string; productLine: 'website' | 'podcast' | 'unsupported' } {
  // 1. Try explicit price ID lookup (most reliable)
  if (priceId) {
    if (WEBSITE_PLAN_MAP[priceId]) {
      return { plan: WEBSITE_PLAN_MAP[priceId], productLine: 'website' }
    }
    if (PODCAST_PLAN_MAP[priceId]) {
      return { plan: PODCAST_PLAN_MAP[priceId], productLine: 'podcast' }
    }
  }
  // 2. Fall back to metadata. Only 'website' and 'podcast' are real product
  //    lines today. An unset line is treated as website for backward-compat
  //    (legacy sessions), but any OTHER explicit value (e.g. 'audit', set by the
  //    not-yet-real audit checkout) is 'unsupported' — the handler MUST NOT write
  //    website/podcast columns for it, or it would silently overwrite the buyer's
  //    real plan with a website 'starter'.
  if (metaProductLine === 'podcast') {
    return { plan: metaPlan || 'indie', productLine: 'podcast' }
  }
  if (!metaProductLine || metaProductLine === 'website') {
    return { plan: metaPlan || 'starter', productLine: 'website' }
  }
  return { plan: metaPlan || '', productLine: 'unsupported' }
}

// ─── Status normalisation ─────────────────────────────────────────────────────
// Defect #1 fix: the `subscriptions` CHECK constraint only permits
// ('active','trialing','cancelled','past_due') — note UK 'cancelled'.
// Stripe emits US 'canceled' plus other statuses ('unpaid','incomplete',
// 'incomplete_expired','paused') that are NOT in the constraint, so writing
// `sub.status` raw causes Postgres to REJECT the update. We map every Stripe
// status onto the allowed set. Unknown values resolve to 'past_due' (a safe
// middle that never silently grants access).

type DbStatus = 'active' | 'trialing' | 'cancelled' | 'past_due'

function normalizeStatus(stripeStatus: string | undefined): DbStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'unpaid':
    case 'incomplete':
      // payment not (yet) good — withhold access without fully cancelling
      return 'past_due'
    case 'canceled':            // Stripe US spelling
    case 'cancelled':           // defensive
    case 'incomplete_expired':
    case 'paused':
      return 'cancelled'
    default:
      return 'past_due'
  }
}

// ─── Stripe signature verification ───────────────────────────────────────────
// Defect #6 (partial) fix: a signature header may carry MULTIPLE v1 signatures
// (e.g. during webhook-secret rotation). The previous reducer kept only the
// last one. We now accept the event if ANY v1 signature matches.

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ab.length === 0 || ab.length !== bb.length) return false
    return crypto.timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): boolean {
  try {
    let timestamp = ''
    const v1Signatures: string[] = []
    for (const part of sigHeader.split(',')) {
      const idx = part.indexOf('=')
      if (idx === -1) continue
      const key = part.slice(0, idx).trim()
      const val = part.slice(idx + 1).trim()
      if (key === 't') timestamp = val
      else if (key === 'v1') v1Signatures.push(val)
    }
    if (!timestamp || v1Signatures.length === 0) return false

    const signed = `${timestamp}.${payload}`
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signed)
      .digest('hex')

    return v1Signatures.some((candidate) => safeEqualHex(expected, candidate))
  } catch {
    return false
  }
}

// ─── period-end extraction ────────────────────────────────────────────────────
// Defect #4 fix: recent Stripe API versions relocated `current_period_end` from
// the subscription object onto each subscription item. Read both locations so
// the value is captured regardless of the account's API version.

function extractPeriodEnd(sub: any): string | null {
  const epoch =
    sub?.current_period_end ??
    sub?.items?.data?.[0]?.current_period_end ??
    null
  return epoch ? new Date(epoch * 1000).toISOString() : null
}

// ─── Defect #3 fix: look up an auth user by email via the admin API ───────────
// The previous code queried `.from('auth.users')`, which resolves against the
// PUBLIC schema and therefore never matches — a silent dead end. The service
// role can enumerate auth users through the admin API. This fallback only fires
// when a session has no metadata.userId (sessions created by our own checkout
// route always include it), so a bounded scan is acceptable.

async function findUserIdByEmail(
  supabase: any,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase()
  const perPage = 200
  const maxPages = 20 // hard cap so a large user base can never hang the webhook
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('Webhook: admin.listUsers failed during email fallback', error.message)
      return null
    }
    const users = data?.users ?? []
    const match = users.find((u) => (u.email || '').toLowerCase() === target)
    if (match?.id) return match.id
    if (users.length < perPage) break // last page reached
  }
  return null
}

// ─── Stripe event idempotency ─────────────────────────────────────────────────
// Balance increments are NOT idempotent, and Stripe may deliver the same event
// more than once (retries, at-least-once delivery). We claim each event.id in
// `stripe_processed_events` before crediting. claimStripeEvent returns true only
// the FIRST time an id is seen; a redelivery hits the primary-key unique
// violation (23505) and returns false so the handler skips. If the table is
// missing or the insert fails for any other reason we fail OPEN (return true and
// proceed) — better to risk a rare double-credit than to block real purchases —
// but we log loudly so the gap is visible.

async function claimStripeEvent(supabase: any, eventId: string | undefined): Promise<boolean> {
  if (!eventId) return true
  const { error } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: eventId })
  if (!error) return true
  if (error.code === '23505') return false // already processed
  console.warn('Webhook: claimStripeEvent insert error (proceeding fail-open)', error.code, error.message)
  return true
}

// Releases a previously-claimed event so a Stripe retry can re-attempt it. Used
// only when crediting failed AFTER the claim — so the retry is allowed to run.
async function releaseStripeEvent(supabase: any, eventId: string | undefined): Promise<void> {
  if (!eventId) return
  await supabase
    .from('stripe_processed_events')
    .delete()
    .eq('event_id', eventId)
    .then(() => {}, () => {})
}

// ─── Audit credit top-up (one-time credit-pack purchase) ──────────────────────
// Distinct from the audit SUBSCRIPTION (productLine: 'audit'). A top-up is a
// mode:'payment' Checkout Session whose metadata carries:
//   metadata.type         = 'audit_credit_topup'   (the discriminator)
//   metadata.userId       = buyer's Supabase auth id (set by our checkout route)
//   metadata.creditAmount = how many audit credits this pack grants (integer)
//
// It must NEVER fall through to the subscription upsert (that would clobber the
// buyer's real plan). We resolve the buyer, bound-check the quantity, then add
// the credits ATOMICALLY in Postgres via the increment_audit_credits RPC — we
// never read-modify-write a balance from JS (lost-update risk). The Stripe event
// id guards against double-crediting on redelivery.

async function handleAuditCreditTopup(
  supabase: any,
  session: any,
  eventId: string | undefined,
): Promise<NextResponse> {
  const fresh = await claimStripeEvent(supabase, eventId)
  if (!fresh) {
    console.log('Webhook audit_credit_topup: event already processed — skipping', eventId)
    return NextResponse.json({ received: true, deduped: true })
  }

  // Resolve the buyer (metadata.userId first, email fallback — same as subs).
  let userId = session.metadata?.userId
  if (!userId && session.customer_email) {
    console.warn('Webhook audit_credit_topup: metadata.userId missing, email fallback', session.customer_email)
    userId = await findUserIdByEmail(supabase, session.customer_email)
  }
  if (!userId) {
    console.error('Webhook audit_credit_topup: no userId found', {
      sessionId: session.id, metadata: session.metadata, email: session.customer_email,
    })
    // 200 so Stripe stops retrying a session we can never attribute.
    return NextResponse.json({ received: true, warning: 'no userId' })
  }

  // Bound-check the quantity: positive integer, sane upper cap so a malformed or
  // tampered metadata value can never mint an absurd balance.
  const raw = session.metadata?.creditAmount
  const credits = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isInteger(credits) || credits <= 0 || credits > 100000) {
    console.error('Webhook audit_credit_topup: invalid creditAmount', { raw, sessionId: session.id })
    return NextResponse.json({ received: true, warning: 'invalid creditAmount' })
  }

  // Atomic increment (creates the subscriptions row if the buyer has none yet).
  const { data, error } = await supabase.rpc('increment_audit_credits', {
    target_user_id: userId,
    add_amount: credits,
  })
  if (error) {
    console.error('Webhook audit_credit_topup: increment_audit_credits failed', error.message)
    // Roll back the idempotency claim so Stripe's retry can re-attempt crediting.
    await releaseStripeEvent(supabase, eventId)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log('Webhook audit_credit_topup: credited', {
    userId, credits, newBalance: data, sessionId: session.id,
  })
  return NextResponse.json({ received: true, credited: credits, balance: data ?? null })
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const body   = await req.text()
  const sig    = req.headers.get('stripe-signature') || ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET!

  if (!verifyStripeSignature(body, sig, secret)) {
    console.error('Webhook: signature verification FAILED')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    console.error('Webhook: invalid JSON')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('Webhook received:', event.type, event.id)

  try {
    switch (event.type) {

      // ── New subscription purchased ─────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object

        // Audit credit-pack top-up (one-time payment) — handled and returned
        // here so it can NEVER fall through to the subscription upsert below.
        if (session.metadata?.type === 'audit_credit_topup') {
          return await handleAuditCreditTopup(supabase, session, event.id)
        }

        let userId    = session.metadata?.userId
        const priceId      = session.metadata?.priceId
        const metaLine     = session.metadata?.productLine
        const metaPlan     = session.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)

        // Refuse to write a subscription for a product line we don't support yet
        // (e.g. 'audit'). Returning 200 stops Stripe retrying; crucially we do NOT
        // fall through to the website upsert, which would clobber a real plan.
        if (productLine === 'unsupported') {
          console.warn('Webhook checkout.session.completed: unsupported product line — no subscription written', {
            productLine: metaLine, sessionId: session.id,
          })
          return NextResponse.json({ received: true, warning: 'unsupported product line' })
        }
        if (!userId && session.customer_email) {
          console.warn(
            'Webhook: metadata.userId missing, falling back to email lookup',
            session.customer_email,
          )
          userId = await findUserIdByEmail(supabase, session.customer_email)
        }

        if (!userId) {
          console.error('Webhook checkout.session.completed: no userId found', {
            sessionId: session.id,
            metadata:  session.metadata,
            email:     session.customer_email,
          })
          // Return 200 so Stripe does not retry forever
          return NextResponse.json({ received: true, warning: 'no userId' })
        }

        console.log('Webhook: upserting subscription', { userId, plan, productLine, priceId })

        if (productLine === 'podcast') {
          // Upsert only podcast columns — website columns are untouched
          const { error } = await supabase.from('subscriptions').upsert(
            {
              user_id:                        userId,
              podcast_plan:                   plan,
              podcast_status:                 'active',
              podcast_stripe_customer_id:     session.customer,
              podcast_stripe_subscription_id: session.subscription,
              updated_at:                     new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          if (error) {
            console.error('Webhook: supabase upsert error (podcast)', error)
            return NextResponse.json({ error: 'DB error' }, { status: 500 })
          }
        } else {
          // Upsert only website columns — podcast columns are untouched
          const { error } = await supabase.from('subscriptions').upsert(
            {
              user_id:                userId,
              plan,
              status:                 'active',
              stripe_customer_id:     session.customer,
              stripe_subscription_id: session.subscription,
              updated_at:             new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          if (error) {
            console.error('Webhook: supabase upsert error (website)', error)
            return NextResponse.json({ error: 'DB error' }, { status: 500 })
          }
        }

        console.log('Webhook: subscription upserted successfully for', userId)
        break
      }

      // ── Plan change / renewal ──────────────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub      = event.data.object
        const priceId  = sub.items?.data?.[0]?.price?.id
        const metaLine  = sub.metadata?.productLine
        const metaPlan  = sub.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)
        const periodEnd = extractPeriodEnd(sub)
        const status    = normalizeStatus(sub.status)

        if (productLine === 'unsupported') {
          console.warn('Webhook subscription.updated: unsupported product line — skipping', sub.id)
          break
        }

        if (productLine === 'podcast') {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              podcast_plan:                   plan,
              podcast_status:                 status,
              podcast_current_period_ends_at: periodEnd,
              updated_at:                     new Date().toISOString(),
            })
            .eq('podcast_stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.updated (podcast): supabase error', error)
          else console.log('Webhook: podcast subscription updated', sub.id, '->', plan, status)
        } else {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              plan,
              status,
              current_period_ends_at: periodEnd,
              updated_at:             new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.updated (website): supabase error', error)
          else console.log('Webhook: website subscription updated', sub.id, '->', plan, status)
        }
        break
      }

      // ── Cancellation ──────────────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object

        // Check if this is a website subscription
        const { data: websiteRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()

        if (websiteRow) {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              plan:       'free',
              status:     'cancelled', // Defect #1: was 'canceled' → constraint violation
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.deleted (website): supabase error', error)
          else console.log('Webhook: website subscription cancelled', sub.id)
        } else {
          // Try podcast subscription
          const { error } = await supabase
            .from('subscriptions')
            .update({
              podcast_plan:   null,
              podcast_status: 'cancelled', // Defect #1: was 'canceled'
              updated_at:     new Date().toISOString(),
            })
            .eq('podcast_stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.deleted (podcast): supabase error', error)
          else console.log('Webhook: podcast subscription cancelled', sub.id)
        }
        break
      }

      // ── Payment failure ───────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice        = event.data.object
        const subscriptionId = invoice.subscription

        // Determine which product line's payment failed
        const { data: websiteRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (websiteRow) {
          const { error } = await supabase
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subscriptionId)

          if (error) console.error('Webhook payment_failed (website): supabase error', error)
          else console.log('Webhook: website marked past_due, subscription', subscriptionId)
        } else {
          const { error } = await supabase
            .from('subscriptions')
            .update({ podcast_status: 'past_due', updated_at: new Date().toISOString() })
            .eq('podcast_stripe_subscription_id', subscriptionId)

          if (error) console.error('Webhook payment_failed (podcast): supabase error', error)
          else console.log('Webhook: podcast marked past_due, subscription', subscriptionId)
        }
        break
      }

      default:
        console.log('Webhook: unhandled event type', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('Webhook handler error:', err.message)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}
