import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

// ─── Price-ID → internal plan maps ────────────────────────────────────────────
// Build maps from ONLY the env vars that are actually set.
// Unset vars are skipped and logged — they never become the literal key "undefined".

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
    [process.env.STRIPE_PRICE_WEBSITE_STARTER,  'starter'],
    [process.env.STRIPE_PRICE_WEBSITE_PRO,      'pro'],
    [process.env.STRIPE_PRICE_WEBSITE_BUSINESS, 'business'],
  ],
  'website',
)

const PODCAST_PLAN_MAP: Record<string, string> = buildPriceMap(
  [
    [process.env.STRIPE_PRICE_PODCAST_INDIE,   'indie'],
    [process.env.STRIPE_PRICE_PODCAST_PRO,     'pro'],
    [process.env.STRIPE_PRICE_PODCAST_NETWORK, 'network'],
  ],
  'podcast',
)

// ─── Audit plan map (live after DB migration 20260620) ────────────────────────
// Four tiers: starter ($29), growth ($79), pro ($199), enterprise ($599).
// Price IDs injected via NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* env vars after the
// Stripe catalog creation PR is merged and the Vercel env PR is applied.

const AUDIT_PLAN_MAP: Record<string, string> = buildPriceMap(
  [
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_STARTER,    'starter'],
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_GROWTH,     'growth'],
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO,        'pro'],
    [process.env.NEXT_PUBLIC_STRIPE_PRICE_AUDIT_ENTERPRISE, 'enterprise'],
  ],
  'audit',
)

// ─── Plan + product-line resolver ─────────────────────────────────────────────

function resolvePlanAndLine(
  priceId: string | undefined,
  metaProductLine?: string,
  metaPlan?: string,
): { plan: string; productLine: 'website' | 'podcast' | 'audit' | 'unsupported' } {
  // 1. Price-ID lookup (most reliable — set by our checkout route)
  if (priceId) {
    if (WEBSITE_PLAN_MAP[priceId]) return { plan: WEBSITE_PLAN_MAP[priceId], productLine: 'website' }
    if (PODCAST_PLAN_MAP[priceId]) return { plan: PODCAST_PLAN_MAP[priceId], productLine: 'podcast' }
    if (AUDIT_PLAN_MAP[priceId])   return { plan: AUDIT_PLAN_MAP[priceId],   productLine: 'audit'   }
  }
  // 2. Metadata fallback
  if (metaProductLine === 'podcast') return { plan: metaPlan || 'indie',   productLine: 'podcast' }
  if (metaProductLine === 'audit')   return { plan: metaPlan || 'starter', productLine: 'audit'   }
  if (!metaProductLine || metaProductLine === 'website') {
    return { plan: metaPlan || 'starter', productLine: 'website' }
  }
  return { plan: metaPlan || '', productLine: 'unsupported' }
}

// ─── Status normalisation ─────────────────────────────────────────────────────
// The subscriptions CHECK constraint only permits ('active','trialing','cancelled','past_due').
// Stripe emits 'canceled' (US) and other values not in that set — we map them all.

type DbStatus = 'active' | 'trialing' | 'cancelled' | 'past_due'

function normalizeStatus(stripeStatus: string | undefined): DbStatus {
  switch (stripeStatus) {
    case 'active':             return 'active'
    case 'trialing':           return 'trialing'
    case 'past_due':           return 'past_due'
    case 'unpaid':
    case 'incomplete':         return 'past_due'
    case 'canceled':
    case 'cancelled':
    case 'incomplete_expired':
    case 'paused':             return 'cancelled'
    default:                   return 'past_due'
  }
}

// ─── Stripe signature verification ───────────────────────────────────────────
// Accepts multiple v1 signatures (rotation-safe).

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ab.length === 0 || ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
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
    const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
    return v1Signatures.some((c) => safeEqualHex(expected, c))
  } catch {
    return false
  }
}

// ─── Period-end extraction ────────────────────────────────────────────────────
// Handles both old (top-level) and new (per-item) Stripe API versions.

function extractPeriodEnd(sub: any): string | null {
  const epoch = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null
  return epoch ? new Date(epoch * 1000).toISOString() : null
}

// ─── Auth user lookup by email ────────────────────────────────────────────────
// Uses the admin API (service role) — NOT .from('auth.users') which resolves
// against the public schema and never matches.

async function findUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  const target  = email.toLowerCase()
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
// Claims an event id in stripe_processed_events before any crediting.
// Returns false if the event was already processed (PK violation 23505).
// Fails OPEN on any other error — logs loudly but does not block real purchases.

async function claimStripeEvent(supabase: any, eventId: string | undefined): Promise<boolean> {
  if (!eventId) return true
  const { error } = await supabase.from('stripe_processed_events').insert({ event_id: eventId })
  if (!error) return true
  if (error.code === '23505') return false
  console.warn('Webhook: claimStripeEvent insert error (proceeding fail-open)', error.code, error.message)
  return true
}

async function releaseStripeEvent(supabase: any, eventId: string | undefined): Promise<void> {
  if (!eventId) return
  await supabase.from('stripe_processed_events').delete().eq('event_id', eventId).then(() => {}, () => {})
}

// ─── Audit credit top-up ──────────────────────────────────────────────────────
// One-time payment checkout (mode:'payment') with metadata.type = 'audit_credit_topup'.
// Atomically increments audit_credits via the increment_audit_credits RPC.
// NEVER falls through to the subscription upsert path.

async function handleAuditCreditTopup(
  supabase: any,
  session: any,
  eventId: string | undefined,
): Promise<NextResponse> {
  const fresh = await claimStripeEvent(supabase, eventId)
  if (!fresh) {
    console.log('Webhook audit_credit_topup: already processed — skipping', eventId)
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

  const raw     = session.metadata?.creditAmount
  const credits = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isInteger(credits) || credits <= 0 || credits > 100000) {
    console.error('Webhook audit_credit_topup: invalid creditAmount', { raw, sessionId: session.id })
    return NextResponse.json({ received: true, warning: 'invalid creditAmount' })
  }

  const { data, error } = await supabase.rpc('increment_audit_credits', {
    target_user_id: userId,
    add_amount:     credits,
  })
  if (error) {
    console.error('Webhook audit_credit_topup: increment_audit_credits failed', error.message)
    await releaseStripeEvent(supabase, eventId)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log('Webhook audit_credit_topup: credited', { userId, credits, newBalance: data, sessionId: session.id })
  return NextResponse.json({ received: true, credited: credits, balance: data ?? null })
}

// ─── Audit subscription handlers ──────────────────────────────────────────────
// Writes audit_plan / audit_status / audit_stripe_* columns added by migration
// 20260620_add_audit_module_schema.sql.
// audit_credits is NOT touched here — managed exclusively by top-up events.

async function handleAuditSubscriptionUpsert(
  supabase: any,
  userId: string,
  plan: string,
  session: any,
): Promise<NextResponse> {
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id:                      userId,
      audit_plan:                   plan,
      audit_status:                 'active',
      audit_stripe_customer_id:     session.customer,
      audit_stripe_subscription_id: session.subscription,
      updated_at:                   new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) {
    console.error('Webhook: supabase upsert error (audit subscription)', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  console.log('Webhook: audit subscription upserted for', userId, '->', plan)
  return NextResponse.json({ received: true })
}

async function handleAuditSubscriptionUpdate(supabase: any, sub: any, plan: string): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({
      audit_plan:                   plan,
      audit_status:                 normalizeStatus(sub.status),
      audit_current_period_ends_at: extractPeriodEnd(sub),
      updated_at:                   new Date().toISOString(),
    })
    .eq('audit_stripe_subscription_id', sub.id)
  if (error) console.error('Webhook subscription.updated (audit): supabase error', error)
  else console.log('Webhook: audit subscription updated', sub.id, '->', plan)
}

async function handleAuditSubscriptionCancelled(supabase: any, sub: any): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ audit_plan: null, audit_status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('audit_stripe_subscription_id', sub.id)
  if (error) console.error('Webhook subscription.deleted (audit): supabase error', error)
  else console.log('Webhook: audit subscription cancelled', sub.id)
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

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

      // ── New subscription / one-time purchase ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object

        // Audit credit top-up — handled and returned first; never falls through.
        if (session.metadata?.type === 'audit_credit_topup') {
          return await handleAuditCreditTopup(supabase, session, event.id)
        }

        let userId         = session.metadata?.userId
        const priceId      = session.metadata?.priceId
        const metaLine     = session.metadata?.productLine
        const metaPlan     = session.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)

        if (productLine === 'unsupported') {
          console.warn('Webhook checkout.session.completed: unsupported product line', {
            productLine: metaLine, sessionId: session.id,
          })
          return NextResponse.json({ received: true, warning: 'unsupported product line' })
        }

        if (!userId && session.customer_email) {
          console.warn('Webhook: metadata.userId missing, falling back to email lookup', session.customer_email)
          userId = await findUserIdByEmail(supabase, session.customer_email)
        }

        if (!userId) {
          console.error('Webhook checkout.session.completed: no userId found', {
            sessionId: session.id, metadata: session.metadata, email: session.customer_email,
          })
          return NextResponse.json({ received: true, warning: 'no userId' })
        }

        console.log('Webhook: upserting subscription', { userId, plan, productLine, priceId })

        // ── Audit subscription ─────────────────────────────────────────────
        if (productLine === 'audit') {
          return await handleAuditSubscriptionUpsert(supabase, userId, plan, session)
        }

        // ── Podcast subscription ───────────────────────────────────────────
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
          // ── Website subscription ─────────────────────────────────────────
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
        const metaLine = sub.metadata?.productLine
        const metaPlan = sub.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)
        const periodEnd = extractPeriodEnd(sub)
        const status    = normalizeStatus(sub.status)

        if (productLine === 'unsupported') {
          console.warn('Webhook subscription.updated: unsupported product line — skipping', sub.id)
          break
        }

        if (productLine === 'audit') {
          await handleAuditSubscriptionUpdate(supabase, sub, plan)
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

        // Check audit first
        const { data: auditRow } = await supabase
          .from('subscriptions').select('user_id').eq('audit_stripe_subscription_id', sub.id).maybeSingle()
        if (auditRow) {
          await handleAuditSubscriptionCancelled(supabase, sub)
          break
        }

        // Check website
        const { data: websiteRow } = await supabase
          .from('subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).maybeSingle()
        if (websiteRow) {
          const { error } = await supabase
            .from('subscriptions')
            .update({ plan: 'free', status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', sub.id)
          if (error) console.error('Webhook subscription.deleted (website): supabase error', error)
          else console.log('Webhook: website subscription cancelled', sub.id)
        } else {
          // Podcast
          const { error } = await supabase
            .from('subscriptions')
            .update({ podcast_plan: null, podcast_status: 'cancelled', updated_at: new Date().toISOString() })
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

        // Check audit first
        const { data: auditRow } = await supabase
          .from('subscriptions').select('user_id').eq('audit_stripe_subscription_id', subscriptionId).maybeSingle()
        if (auditRow) {
          const { error } = await supabase
            .from('subscriptions')
            .update({ audit_status: 'past_due', updated_at: new Date().toISOString() })
            .eq('audit_stripe_subscription_id', subscriptionId)
          if (error) console.error('Webhook payment_failed (audit): supabase error', error)
          else console.log('Webhook: audit marked past_due, subscription', subscriptionId)
          break
        }

        // Check website
        const { data: websiteRow } = await supabase
          .from('subscriptions').select('user_id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
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
