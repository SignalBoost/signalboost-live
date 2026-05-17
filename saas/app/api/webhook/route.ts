import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLAN_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER!]: 'starter',
  [process.env.STRIPE_PRICE_PRO!]:     'pro',
  [process.env.STRIPE_PRICE_BUSINESS!]:'business',
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
    const signed = `${timestamp}.${payload}`
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') || ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET!

  if (!verifyStripeSignature(body, sig, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object
        const userId  = session.metadata?.userId
        const priceId = session.metadata?.priceId
        const plan    = PLAN_MAP[priceId] || 'starter'

        if (userId) {
          await supabase.from('subscriptions').upsert({
            user_id:                userId,
            plan,
            status:                 'active',
            stripe_customer_id:     session.customer,
            stripe_subscription_id: session.subscription,
            updated_at:             new Date().toISOString(),
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
