import type { Request, Response } from 'express'
import Stripe from 'stripe'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { env } from '../config/env.js'
import { query } from '../db.js'

const plans = {
  starter: { name: 'Starter', amount: 2900 },
  growth: { name: 'Growth', amount: 9900 },
}

function getPlan(plan: keyof typeof plans) {
  return plans[plan] ?? plans.starter
}

export async function createStripeCheckout(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  if (!env.stripeSecretKey) return res.status(503).json({ error: 'Stripe is not configured' })

  const stripe = new Stripe(env.stripeSecretKey)
  const planKey = (req.body.plan === 'growth' ? 'growth' : 'starter') as keyof typeof plans
  const plan = getPlan(planKey)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: req.user.email,
    line_items: [{ price_data: { currency: 'usd', product_data: { name: `SignalBoost Live ${plan.name}` }, unit_amount: plan.amount, recurring: { interval: 'month' } }, quantity: 1 }],
    success_url: `${env.frontendUrl}/dashboard?checkout=success&plan=${planKey}`,
    cancel_url: `${env.frontendUrl}/pricing?checkout=cancelled`,
    metadata: { userId: req.user.id, plan: planKey },
  })

  await query('insert into payments (user_id, provider, provider_reference, plan, status, amount_cents) values ($1, $2, $3, $4, $5, $6)', [req.user.id, 'stripe', session.id, planKey, 'created', plan.amount])
  return res.json({ checkoutUrl: session.url })
}

export async function createMercadoPagoPreference(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  if (!env.mercadoPagoAccessToken) return res.status(503).json({ error: 'MercadoPago is not configured' })

  const planKey = (req.body.plan === 'growth' ? 'growth' : 'starter') as keyof typeof plans
  const plan = getPlan(planKey)
  const client = new MercadoPagoConfig({ accessToken: env.mercadoPagoAccessToken })
  const preference = new Preference(client)
  const response = await preference.create({
    body: {
      items: [{ id: planKey, title: `SignalBoost Live ${plan.name}`, quantity: 1, unit_price: plan.amount / 100, currency_id: 'USD' }],
      back_urls: { success: `${env.frontendUrl}/dashboard?checkout=success&plan=${planKey}`, failure: `${env.frontendUrl}/pricing?checkout=failed`, pending: `${env.frontendUrl}/pricing?checkout=pending` },
      metadata: { user_id: req.user.id, plan: planKey },
    },
  })

  await query('insert into payments (user_id, provider, provider_reference, plan, status, amount_cents) values ($1, $2, $3, $4, $5, $6)', [req.user.id, 'mercadopago', response.id, planKey, 'created', plan.amount])
  return res.json({ checkoutUrl: response.init_point })
}

export async function updateSubscription(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  const plan = req.body.plan === 'growth' ? 'growth' : 'starter'
  const status = req.body.status === 'canceled' ? 'canceled' : 'active'
  await query('update users set plan = $1, subscription_status = $2, updated_at = now() where id = $3', [plan, status, req.user.id])
  return res.json({ plan, subscriptionStatus: status })
}
