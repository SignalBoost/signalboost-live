import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Price-ID → internal plan maps ────────────────────────────────────────────
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

// ─── Audit plan map (populated by audit.provision_pricing provisioner) ─────────
// Keys are the live Stripe price IDs written to Vercel env vars by the
// audit.provision_pricing one-shot provisioner. Values are the four valid
// audit tier slugs that match the CHECK constraint on subscriptions.audit_plan.
const AUDIT_PLAN_MAP: Record<string, string> = buildPriceMap(
  [
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER,    'starter'],
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH,     'growth'],
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO,        'pro'],
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE, 'enterprise'],
  ],
  'audit',
)

function resolvePlanAndLine(
  priceId: string | undefined,
  metaProductLine?: string,
  metaPlan?: string,
): { plan: string; productLine: 'website' | 'podcast' | 'audit' | 'unsupported' } {
  // 1. Try explicit price ID lookup (most reliable)
  if (priceId) {
    if (WEBSITE_PLAN_MAP[priceId]) {
      return { plan: WEBSITE_PLAN_MAP[priceId], productLine: 'website' }
    }
    if (PODCAST_PLAN_MAP[priceId]) {
      return { plan: PODCAST_PLAN_MAP[priceId], productLine: 'podcast' }
    }
    if (AUDIT_PLAN_MAP[priceId]) {
      return { plan: AUDIT_PLAN_MAP[priceId], productLine: 'audit' }
    }
  }
  // 2. Fall back to metadata.
  if (metaProductLine === 'podcast') {
    return { plan: metaPlan || 'indie', productLine: 'podcast' }
  }
  if (metaProductLine === 'audit') {
    const validAuditPlans = ['starter', 'growth', 'pro', 'enterprise']
    const plan = metaPlan && validAuditPlans.includes(metaPlan) ? metaPlan : 'starter'
    return { plan, productLine: 'audit' }
  }
  if (!metaProductLine || metaProductLine === 'website') {
    return { plan: metaPlan || 'starter', productLine: 'website' }
  }
  return { plan: metaPlan || '', productLine: 'unsupported' }
}

// ─── Status normalisation ─────────────────────────────────────────────────────
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
      return 'past_due'
    case 'canceled':
    case 'cancelled':
    case 'incomplete_expired':
    case 'paused':
      return 'cancelled'
    default:
      return 'past_due'
  }
}

// ─── Stripe signature verification (Web Crypto — edge compatible) ─────────────
// Uses SubtleCrypto (globalThis.crypto.subtle) instead of Node's crypto module
// so the route works in both Node.js and Edge runtimes without a native import.
// Logic is identical: HMAC-SHA256 over "timestamp.payload", compared against
// every v1 signature in the header using a timing-safe byte comparison.

function hexToUint8(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
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

    const enc = new TextEncoder()
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signed = `${timestamp}.${payload}`
    const sigBuffer = await globalThis.crypto.subtle.sign('HMAC', keyMaterial, enc.encode(signed))
    const expected = new Uint8Array(sigBuffer)

    return v1Signatures.some((candidate) => {
      try {
        const candidateBytes = hexToUint8(candidate)
        return timingSafeEqualBytes(expected, candidateBytes)
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

// ─── period-end extraction ────────────────────────────────────────────────────
function extractPeriodEnd(sub: any): string | null {
  const epoch =
    sub?.current_period_end ??
    sub?.items?.data?.[0]?.current_period_end ??
    null
  return epoch ? new Date(epoch * 1000).toISOString() : null
}

// ─── Auth user lookup by email ────────────────────────────────────────────────
async function findUserIdByEmail(
  supabase: any,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase()
  const perPage = 200
  const maxPages = 20
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('Webhook: admin.listUsers failed during email fallback', error.message)
      return null
    }
    const users = data?.users ?? []
    const match = users.find((u: any) => (u.email || '').toLowerCase() === target)
    if (match?.id) return match.id
    if (users.length < perPage) break
  }
  return null
}

// ─── Stripe event idempotency ─────────────────────────────────────────────────
async function claimStripeEvent(supabase: any, eventId: string | undefined): Promise<boolean> {
  if (!eventId) return true
  const { error } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: eventId })
  if (!error) return true
  if (error.code === '23505') return false
  console.warn('Webhook: claimStripeEvent insert error (proceeding fail-open)', error.code, error.message)
  return true
}

async function releaseStripeEvent(supabase: any, eventId: string | undefined): Promise<void> {
  if (!eventId) return
  await supabase
    .from('stripe_processed_events')
    .delete()
    .eq('event_id', eventId)
    .then(() => {}, () => {})
}

// ─── Audit credit top-up (one-time credit-pack purchase) ──────────────────────
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

  let userId = session.metadata?.userId
  if (!userId && session.customer_email) {
    console.warn('Webhook audit_credit_topup: metadata.userId missing, email fallback', session.customer_email)
    userId = await findUserIdByEmail(supabase, session.customer_email)
  }
  if (!userId) {
    console.error('Webhook audit_credit_topup: no userId found', {
      sessionId: session.id, metadata: session.metadata, email: session.customer_email,
    })
    return NextResponse.json({ received: true, warning: 'no userId' })
  }

  const raw = session.metadata?.creditAmount
  const credits = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isInteger(credits) || credits <= 0 || credits > 100000) {
    console.error('Webhook audit_credit_topup: invalid creditAmount', { raw, sessionId: session.id })
    return NextResponse.json({ received: true, warning: 'invalid creditAmount' })
  }

  const { data, error } = await supabase.rpc('increment_audit_credits', {
    target_user_id: userId,
    add_amount: credits,
  })
  if (error) {
    console.error('Webhook audit_credit_topup: increment_audit_credits failed', error.message)
    await releaseStripeEvent(supabase, eventId)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log('Webhook audit_credit_topup: credited', {
    userId, credits, newBalance: data, sessionId: session.id,
  })
  return NextResponse.json({ received: true, credited: credits, balance: data ?? null })
}

// ─── Audit subscription upsert ────────────────────────────────────────────────
// Handles checkout.session.completed for productLine === 'audit'.
// Writes audit_plan, audit_status, and the Stripe IDs into the subscriptions
// row. Does NOT touch website or podcast columns.

async function handleAuditSubscription(
  supabase: any,
  session: any,
  plan: string,
): Promise<NextResponse> {
  let userId = session.metadata?.userId
  if (!userId && session.customer_email) {
    console.warn('Webhook audit subscription: metadata.userId missing, email fallback', session.customer_email)
    userId = await findUserIdByEmail(supabase, session.customer_email)
  }
  if (!userId) {
    console.error('Webhook audit subscription: no userId found', {
      sessionId: session.id, metadata: session.metadata, email: session.customer_email,
    })
    return NextResponse.json({ received: true, warning: 'no userId' })
  }

  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id:                         userId,
      audit_plan:                      plan,
      audit_status:                    'active',
      audit_stripe_customer_id:        session.customer,
      audit_stripe_subscription_id:    session.subscription,
      updated_at:                      new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    console.error('Webhook audit subscription: supabase upsert error', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log('Webhook: audit subscription upserted', { userId, plan, sessionId: session.id })
  return NextResponse.json({ received: true })
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

  const sigValid = await verifyStripeSignature(body, sig, secret)
  if (!sigValid) {
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

      // ── New subscription / one-time purchase ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object

        // Audit credit-pack top-up — handled first, never falls through.
        if (session.metadata?.type === 'audit_credit_topup') {
          return await handleAuditCreditTopup(supabase, session, event.id)
        }

        const priceId      = session.metadata?.priceId
        const metaLine     = session.metadata?.productLine
        const metaPlan     = session.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)

        // ── Audit subscription (recurring) ─────────────────────────────────
        if (productLine === 'audit') {
          return await handleAuditSubscription(supabase, session, plan)
        }

        // Truly unknown product line — return 200 to stop Stripe retrying.
        if (productLine === 'unsupported') {
          console.warn('Webhook checkout.session.completed: unsupported product line — no subscription written', {
            productLine: metaLine, sessionId: session.id,
          })
          return NextResponse.json({ received: true, warning: 'unsupported product line' })
        }

        // ── Website / Podcast subscription ─────────────────────────────────
        let userId = session.metadata?.userId
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
          return NextResponse.json({ received: true, warning: 'no userId' })
        }

        console.log('Webhook: upserting subscription', { userId, plan, productLine, priceId })

        if (productLine === 'podcast') {
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

        if (productLine === 'audit') {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              audit_plan:   plan,
              audit_status: status,
              updated_at:   new Date().toISOString(),
            })
            .eq('audit_stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.updated (audit): supabase error', error)
          else console.log('Webhook: audit subscription updated', sub.id, '->', plan, status)
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

        // Check audit subscription first
        const { data: auditRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('audit_stripe_subscription_id', sub.id)
          .maybeSingle()

        if (auditRow) {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              audit_plan:   null,
              audit_status: 'cancelled',
              updated_at:   new Date().toISOString(),
            })
            .eq('audit_stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.deleted (audit): supabase error', error)
          else console.log('Webhook: audit subscription cancelled', sub.id)
          break
        }

        // Check website subscription
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
              status:     'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.deleted (website): supabase error', error)
          else console.log('Webhook: website subscription cancelled', sub.id)
        } else {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              podcast_plan:   null,
              podcast_status: 'cancelled',
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

        // Check audit subscription first
        const { data: auditRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('audit_stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (auditRow) {
          const { error } = await supabase
            .from('subscriptions')
            .update({ audit_status: 'past_due', updated_at: new Date().toISOString() })
            .eq('audit_stripe_subscription_id', subscriptionId)

          if (error) console.error('Webhook payment_failed (audit): supabase error', error)
          else console.log('Webhook: audit marked past_due, subscription', subscriptionId)
          break
        }

        // Check website subscription
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
