import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER!]:  'starter',
  [process.env.STRIPE_PRICE_PRO!]:      'pro',
  [process.env.STRIPE_PRICE_BUSINESS!]: 'business',
}

function verifyStripeSignature(payload: string, sig: string, secret: string): boolean {
  try {
    const parts = sig.split(',').reduce((acc: Record<string, string>, part) => {
      const [key, val] = part.split('=')
      acc[key] = val
      return acc
    }, {})
    const timestamp = parts['t']
    const signature = parts['v1']
    if (!timestamp || !signature) return false
    const signed = `${timestamp}.${payload}`
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.text()
  const sig = req.headers.get('stripe-signature') || ''
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
      case 'checkout.session.completed': {
        const session = event.data.object
        let userId = session.metadata?.userId
        const priceId = session.metadata?.priceId
        const plan = PLAN_MAP[priceId] || 'starter'

        // Fallback: if metadata.userId is missing, try to find the user by email
        if (!userId && session.customer_email) {
          console.warn('Webhook: metadata.userId missing, falling back to email lookup', session.customer_email)
          const { data: userByEmail } = await supabase
            .from('auth.users')
            .select('id')
            .eq('email', session.customer_email)
            .maybeSingle()
          if (userByEmail?.id) {
            userId = userByEmail.id
          }
        }

        if (!userId) {
          console.error('Webhook checkout.session.completed: no userId found', {
            sessionId: session.id,
            metadata: session.metadata,
            email: session.customer_email,
          })
          // Return 200 anyway so Stripe does not retry this forever
          return NextResponse.json({ received: true, warning: 'no userId' })
        }

        console.log('Webhook: upserting subscription', { userId, plan, priceId })

        const { error } = await supabase.from('subscriptions').upsert({
          user_id:                userId,
          plan,
          status:                 'active',
          stripe_customer_id:     session.customer,
          stripe_subscription_id: session.subscription,
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'user_id' })

        if (error) {
          console.error('Webhook: supabase upsert error', error)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }

        console.log('Webhook: subscription upserted successfully for', userId)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object
        const priceId = sub.items?.data?.[0]?.price?.id
        const plan = PLAN_MAP[priceId] || 'starter'

        const { error } = await supabase.from('subscriptions')
          .update({
            plan,
            status:                  sub.status,
            current_period_ends_at:  sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            updated_at:              new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error('Webhook subscription.updated: supabase error', error)
        } else {
          console.log('Webhook: subscription updated', sub.id, '->', plan, sub.status)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const { error } = await supabase.from('subscriptions')
          .update({
            plan:       'free',
            status:     'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error('Webhook subscription.deleted: supabase error', error)
        } else {
          console.log('Webhook: subscription canceled', sub.id)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const { error } = await supabase.from('subscriptions')
          .update({
            status:     'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', invoice.customer)

        if (error) {
          console.error('Webhook invoice.payment_failed: supabase error', error)
        } else {
          console.log('Webhook: marked past_due for customer', invoice.customer)
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
