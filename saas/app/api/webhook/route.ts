import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─── Plan lookup maps ─────────────────────────────────────────────────────────

const WEBSITE_PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_WEBSITE_STARTER!]:  'starter',
  [process.env.STRIPE_PRICE_WEBSITE_PRO!]:      'pro',
  [process.env.STRIPE_PRICE_WEBSITE_BUSINESS!]: 'business',
}

const PODCAST_PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_PODCAST_INDIE!]:   'indie',
  [process.env.STRIPE_PRICE_PODCAST_PRO!]:     'pro',
  [process.env.STRIPE_PRICE_PODCAST_NETWORK!]: 'network',
}

function resolvePlanAndLine(
  priceId: string | undefined,
  metaProductLine?: string,
  metaPlan?: string,
): { plan: string; productLine: 'website' | 'podcast' } {
  // 1. Try explicit price ID lookup (most reliable)
  if (priceId) {
    if (WEBSITE_PLAN_MAP[priceId]) {
      return { plan: WEBSITE_PLAN_MAP[priceId], productLine: 'website' }
    }
    if (PODCAST_PLAN_MAP[priceId]) {
      return { plan: PODCAST_PLAN_MAP[priceId], productLine: 'podcast' }
    }
  }
  // 2. Fall back to metadata (useful during transition / unknown prices)
  const productLine: 'website' | 'podcast' =
    metaProductLine === 'podcast' ? 'podcast' : 'website'
  const plan =
    metaPlan ||
    (productLine === 'podcast' ? 'indie' : 'starter')
  return { plan, productLine }
}

// ─── Stripe signature verification ───────────────────────────────────────────

function verifyStripeSignature(
  payload: string,
  sig: string,
  secret: string,
): boolean {
  try {
    const parts = sig.split(',').reduce(
      (acc: Record<string, string>, part) => {
        const [key, val] = part.split('=')
        acc[key] = val
        return acc
      },
      {},
    )
    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return false
    const signed   = `${timestamp}.${payload}`
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signed)
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    )
  } catch {
    return false
  }
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
        let userId    = session.metadata?.userId
        const priceId      = session.metadata?.priceId
        const metaLine     = session.metadata?.productLine
        const metaPlan     = session.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)

        // Fallback: find user by email if metadata.userId is missing
        if (!userId && session.customer_email) {
          console.warn(
            'Webhook: metadata.userId missing, falling back to email lookup',
            session.customer_email,
          )
          const { data: userByEmail } = await supabase
            .from('auth.users')
            .select('id')
            .eq('email', session.customer_email)
            .maybeSingle()
          if (userByEmail?.id) userId = userByEmail.id
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
        const sub     = event.data.object
        const priceId = sub.items?.data?.[0]?.price?.id
        const metaLine = sub.metadata?.productLine
        const metaPlan = sub.metadata?.plan
        const { plan, productLine } = resolvePlanAndLine(priceId, metaLine, metaPlan)
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null

        if (productLine === 'podcast') {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              podcast_plan:                   plan,
              podcast_status:                 sub.status,
              podcast_current_period_ends_at: periodEnd,
              updated_at:                     new Date().toISOString(),
            })
            .eq('podcast_stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.updated (podcast): supabase error', error)
          else console.log('Webhook: podcast subscription updated', sub.id, '->', plan, sub.status)
        } else {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              plan,
              status:                 sub.status,
              current_period_ends_at: periodEnd,
              updated_at:             new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.updated (website): supabase error', error)
          else console.log('Webhook: website subscription updated', sub.id, '->', plan, sub.status)
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
              status:     'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.deleted (website): supabase error', error)
          else console.log('Webhook: website subscription canceled', sub.id)
        } else {
          // Try podcast subscription
          const { error } = await supabase
            .from('subscriptions')
            .update({
              podcast_plan:   null,
              podcast_status: 'canceled',
              updated_at:     new Date().toISOString(),
            })
            .eq('podcast_stripe_subscription_id', sub.id)

          if (error) console.error('Webhook subscription.deleted (podcast): supabase error', error)
          else console.log('Webhook: podcast subscription canceled', sub.id)
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
