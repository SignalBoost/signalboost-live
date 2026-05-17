import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER!]: 'starter',
  [process.env.STRIPE_PRICE_PRO!]:     'pro',
  [process.env.STRIPE_PRICE_BUSINESS!]:'business',
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: any

  try {
    // Dynamically import stripe to avoid edge runtime issues
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object
        const userId  = session.metadata?.userId
        const priceId = session.line_items?.data?.[0]?.price?.id || session.metadata?.priceId
        const plan    = PLAN_MAP[priceId] || 'starter'

        if (userId) {
          await supabase.from('subscriptions').upsert({
            user_id:              userId,
            plan,
            status:               'active',
            stripe_customer_id:   session.customer,
            stripe_subscription_id: session.subscription,
            current_period_end:   null,
            updated_at:           new Date().toISOString(),
          }, { onConflict: 'user_id' })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub     = event.data.object
        const priceId = sub.items?.data?.[0]?.price?.id
        const plan    = PLAN_MAP[priceId] || 'starter'

        await supabase.from('subscriptions')
          .update({
            plan,
            status:             sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at:         new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase.from('subscriptions')
          .update({
            plan:       'free',
            status:     'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        await supabase.from('subscriptions')
          .update({
            status:     'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', invoice.customer)
        break
      }
    }

    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error('Webhook handler error:', err.message)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}

export const config = {
  api: { bodyParser: false }
}
