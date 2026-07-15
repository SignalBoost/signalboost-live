import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { AUDIT_PRICING_CONFIG } from '@/lib/audit/pricingConfig'

function buildPriceMap(
  entries: Array<[string | undefined, string]>,
  label: string,
): Record<string, string> {
  const map: Record<string, string> = {}
  const missing: string[] = []
  for (const [priceId, plan] of entries) {
    if (priceId && priceId.trim()) map[priceId] = plan
    else missing.push(plan)
  }
  if (missing.length) {
    console.warn(`Webhook: missing ${label} price env vars for plan(s): ${missing.join(', ')}`)
  }
  return map
}

const WEBSITE_PLAN_MAP: Record<string, string> = buildPriceMap(
  [
    [process.env.STRIPE_PRICE_WEBSITE_LAUNCH ?? process.env.STRIPE_PRICE_WEBSITE_STARTER, 'starter'],
    [process.env.STRIPE_PRICE_WEBSITE_GROWTH ?? process.env.STRIPE_PRICE_WEBSITE_PRO, 'pro'],
    [process.env.STRIPE_PRICE_WEBSITE_COMMAND ?? process.env.STRIPE_PRICE_WEBSITE_BUSINESS, 'business'],
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

const AUDIT_PLAN_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const tier of AUDIT_PRICING_CONFIG.tiers) {
    const priceId = process.env[tier.stripePriceEnvKey]
    if (priceId && priceId.trim()) map[priceId] = tier.id
  }
  return map
})()

const AUDIT_CREDITS_BY_TIER: Record<string, number | null> = {
  starter: 1000,
  growth: 3000,
  pro: 10000,
  enterprise: null,
}

function resolvePlanAndLine(
  priceId: string | undefined,
  metaProductLine?: string,
  metaPlan?: string,
): { plan: string; productLine: 'website' | 'podcast' | 'audit' | 'unsupported' } {
  if (priceId) {
    if (WEBSITE_PLAN_MAP[priceId]) return { plan: WEBSITE_PLAN_MAP[priceId], productLine: 'website' }
    if (PODCAST_PLAN_MAP[priceId]) return { plan: PODCAST_PLAN_MAP[priceId], productLine: 'podcast' }
    if (AUDIT_PLAN_MAP[priceId]) return { plan: AUDIT_PLAN_MAP[priceId], productLine: 'audit' }
  }
  if (metaProductLine === 'podcast') return { plan: metaPlan || 'indie', productLine: 'podcast' }
  if (metaProductLine === 'audit') return { plan: metaPlan || '', productLine: 'audit' }
  if (!metaProductLine || metaProductLine === 'website') {
    return { plan: metaPlan || 'starter', productLine: 'website' }
  }
  return { plan: metaPlan || '', productLine: 'unsupported' }
}

type DbStatus = 'active' | 'trialing' | 'cancelled' | 'past_due'

function normalizeStatus(stripeStatus: string | undefined): DbStatus {
  switch (stripeStatus) {
    case 'active': return 'active'
    case 'trialing': return 'trialing'
    case 'past_due': return 'past_due'
    case 'unpaid':
    case 'incomplete': return 'past_due'
    case 'canceled':
    case 'cancelled':
    case 'incomplete_expired':
    case 'paused': return 'cancelled'
    default: return 'past_due'
  }
}

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

function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  try {
    let timestamp = ''
    const signatures: string[] = []
    for (const part of sigHeader.split(',')) {
      const index = part.indexOf('=')
      if (index === -1) continue
      const key = part.slice(0, index).trim()
      const value = part.slice(index + 1).trim()
      if (key === 't') timestamp = value
      else if (key === 'v1') signatures.push(value)
    }
    if (!timestamp || signatures.length === 0) return false
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
    return signatures.some((candidate) => safeEqualHex(expected, candidate))
  } catch {
    return false
  }
}

function extractPeriodEnd(sub: any): string | null {
  const epoch = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null
  return epoch ? new Date(epoch * 1000).toISOString() : null
}

async function findUserIdByEmail(supabase: any, email: string): Promise<string | null> {
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
    const match = users.find((user: any) => (user.email || '').toLowerCase() === target)
    if (match?.id) return match.id
    if (users.length < perPage) break
  }
  return null
}

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

async function resolveTopupUserId(supabase: any, session: any, type: string): Promise<string | null> {
  let userId = session.metadata?.userId
  if (!userId && session.customer_email) {
    console.warn(`Webhook ${type}: metadata.userId missing, email fallback`, session.customer_email)
    userId = await findUserIdByEmail(supabase, session.customer_email)
  }
  return userId || null
}

async function handleCreditTopup(
  supabase: any,
  session: any,
  eventId: string | undefined,
  type: 'audit_credit_topup' | 'render_credit_topup',
): Promise<NextResponse> {
  const fresh = await claimStripeEvent(supabase, eventId)
  if (!fresh) {
    console.log(`Webhook ${type}: event already processed — skipping`, eventId)
    return NextResponse.json({ received: true, deduped: true })
  }

  const userId = await resolveTopupUserId(supabase, session, type)
  if (!userId) {
    console.error(`Webhook ${type}: no userId found`, {
      sessionId: session.id,
      metadata: session.metadata,
      email: session.customer_email,
    })
    return NextResponse.json({ received: true, warning: 'no userId' })
  }

  const raw = session.metadata?.creditAmount
  const credits = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isInteger(credits) || credits <= 0 || credits > 100000) {
    console.error(`Webhook ${type}: invalid creditAmount`, { raw, sessionId: session.id })
    return NextResponse.json({ received: true, warning: 'invalid creditAmount' })
  }

  const rpc = type === 'audit_credit_topup' ? 'increment_audit_credits' : 'increment_render_credits'
  const { data, error } = await supabase.rpc(rpc, {
    target_user_id: userId,
    add_amount: credits,
  })
  if (error) {
    console.error(`Webhook ${type}: ${rpc} failed`, error.message)
    await releaseStripeEvent(supabase, eventId)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log(`Webhook ${type}: credited`, {
    userId,
    credits,
    newBalance: data,
    sessionId: session.id,
  })
  return NextResponse.json({ received: true, credited: credits, balance: data ?? null })
}

async function handleAuditCreditTopup(supabase: any, session: any, eventId: string | undefined) {
  return handleCreditTopup(supabase, session, eventId, 'audit_credit_topup')
}

async function handleRenderCreditTopup(supabase: any, session: any, eventId: string | undefined) {
  return handleCreditTopup(supabase, session, eventId, 'render_credit_topup')
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const body = await req.text()
  const signature = req.headers.get('stripe-signature') || ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET!

  if (!verifyStripeSignature(body, signature, secret)) {
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
      case 'checkout.session.completed': {
        const session = event.data.object

        if (session.metadata?.type === 'audit_credit_topup') {
          return await handleAuditCreditTopup(supabase, session, event.id)
        }
        if (session.metadata?.type === 'render_credit_topup') {
          return await handleRenderCreditTopup(supabase, session, event.id)
        }

        let userId = session.metadata?.userId
        const priceId = session.metadata?.priceId
        const metaLine = session.metadata?.productLine
        const metaPlan = session.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)

        if (productLine === 'unsupported') {
          console.warn('Webhook checkout.session.completed: unsupported product line — no subscription written', {
            productLine: metaLine,
            sessionId: session.id,
          })
          return NextResponse.json({ received: true, warning: 'unsupported product line' })
        }

        if (!userId && session.customer_email) {
          console.warn('Webhook: metadata.userId missing, falling back to email lookup', session.customer_email)
          userId = await findUserIdByEmail(supabase, session.customer_email)
        }
        if (!userId) {
          console.error('Webhook checkout.session.completed: no userId found', {
            sessionId: session.id,
            metadata: session.metadata,
            email: session.customer_email,
          })
          return NextResponse.json({ received: true, warning: 'no userId' })
        }

        if (productLine === 'audit') {
          const credits = AUDIT_CREDITS_BY_TIER[plan]
          const row: Record<string, unknown> = {
            user_id: userId,
            audit_plan: plan || null,
            audit_status: 'active',
            updated_at: new Date().toISOString(),
          }
          if (typeof credits === 'number' && credits > 0) row.audit_credits = credits
          const { error } = await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id' })
          if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
        } else if (productLine === 'podcast') {
          const { error } = await supabase.from('subscriptions').upsert(
            {
              user_id: userId,
              podcast_plan: plan,
              podcast_status: 'active',
              podcast_stripe_customer_id: session.customer,
              podcast_stripe_subscription_id: session.subscription,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
        } else {
          const { error } = await supabase.from('subscriptions').upsert(
            {
              user_id: userId,
              plan,
              status: 'active',
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object
        const priceId = sub.items?.data?.[0]?.price?.id
        const { plan, productLine } = resolvePlanAndLine(priceId, sub.metadata?.productLine, sub.metadata?.plan)
        const periodEnd = extractPeriodEnd(sub)
        const status = normalizeStatus(sub.status)

        if (productLine === 'unsupported') break
        if (productLine === 'audit') {
          const userId = sub.metadata?.userId
          if (!userId) break
          const update: Record<string, unknown> = {
            audit_status: status,
            updated_at: new Date().toISOString(),
          }
          if (plan) update.audit_plan = plan
          await supabase.from('subscriptions').update(update).eq('user_id', userId)
        } else if (productLine === 'podcast') {
          await supabase.from('subscriptions').update({
            podcast_plan: plan,
            podcast_status: status,
            podcast_current_period_ends_at: periodEnd,
            updated_at: new Date().toISOString(),
          }).eq('podcast_stripe_subscription_id', sub.id)
        } else {
          await supabase.from('subscriptions').update({
            plan,
            status,
            current_period_ends_at: periodEnd,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        if (sub.metadata?.productLine === 'audit') {
          const userId = sub.metadata?.userId
          if (userId) {
            await supabase.from('subscriptions').update({
              audit_status: 'cancelled',
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId)
          }
          break
        }

        const { data: websiteRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()

        if (websiteRow) {
          await supabase.from('subscriptions').update({
            plan: 'free',
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id)
        } else {
          await supabase.from('subscriptions').update({
            podcast_plan: null,
            podcast_status: 'cancelled',
            updated_at: new Date().toISOString(),
          }).eq('podcast_stripe_subscription_id', sub.id)
        }
        break
      }

      case 'invoice.payment_failed': {
        const subscriptionId = event.data.object.subscription
        const { data: websiteRow } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (websiteRow) {
          await supabase.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', subscriptionId)
        } else {
          await supabase.from('subscriptions').update({
            podcast_status: 'past_due',
            updated_at: new Date().toISOString(),
          }).eq('podcast_stripe_subscription_id', subscriptionId)
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
