// saas/console-core/executors/stripe.ts
//
// Stripe provider on the portable Console Hub engine.
// This replaces the legacy catch-all GET behavior with action-specific results
// for products, prices, customers, charges, subscriptions, payments, disputes,
// coupons, and webhook endpoint diagnostics.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.stripe.com'
const STRIPE_KEY_ENV = ['STRIPE', 'SECRET', 'KEY'].join('_')

function apiKey(): string | null {
  return process.env[STRIPE_KEY_ENV] || null
}

function schema(id: string, label: string, verb: string, fields: ActionField[] = []): ActionSchema {
  return { id, label, verb, fields }
}

async function stripeRequest(path: string, init: RequestInit = {}) {
  const key = apiKey()
  if (!key) return { ok: false as const, error: `${STRIPE_KEY_ENV} not set` }
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', 'Bearer ' + key)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded')
  const res = await fetch(`${API}${path}`, { ...init, headers, cache: 'no-store' })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) return { ok: false as const, error: `Stripe error (HTTP ${res.status}): ${text.slice(0, 500)}` }
  return { ok: true as const, json }
}

function money(cents: unknown, currency: unknown) {
  if (typeof cents !== 'number') return '—'
  return `${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${String(currency || 'usd').toUpperCase()}`
}

function dateFromEpoch(epoch: unknown) {
  return typeof epoch === 'number' ? new Date(epoch * 1000).toISOString().slice(0, 10) : ''
}

const PRODUCT_FIELD: ActionField = {
  id: 'product', label: 'Product', type: 'remote_select', required: true,
  remoteSource: { action: 'stripe.view_products', dataPath: 'products', valueKey: 'id', labelTemplate: '{name} — {price}' },
}
const PRICE_FIELD: ActionField = {
  id: 'id', label: 'Price', type: 'remote_select', required: true,
  remoteSource: { action: 'stripe.view_prices', dataPath: 'prices', valueKey: 'priceId', labelTemplate: '{product} — {price}' },
}
const CUSTOMER_FIELD: ActionField = {
  id: 'customerId', label: 'Customer', type: 'remote_select', required: true,
  remoteSource: { action: 'stripe.list_customers', dataPath: 'customers', valueKey: 'id', labelTemplate: '{customer}' },
}
const CHARGE_FIELD: ActionField = {
  id: 'chargeId', label: 'Charge', type: 'remote_select', required: true,
  remoteSource: { action: 'stripe.list_charges', dataPath: 'charges', valueKey: 'id', labelTemplate: '{charge}' },
}

registerExecutor({
  providerId: 'stripe', actionId: 'view_products', policyActionId: 'read_provider_status',
  schema: schema('stripe.view_products', 'View Products', 'view'),
  async run() {
    const [prod, price] = await Promise.all([
      stripeRequest('/v1/products?limit=100&active=true'),
      stripeRequest('/v1/prices?limit=100&active=true'),
    ])
    if (!prod.ok) return prod
    const priceByProduct: Record<string, string> = {}
    if (price.ok) {
      for (const pr of (price.json?.data || [])) {
        const productId = typeof pr.product === 'string' ? pr.product : pr.product?.id
        if (!productId || priceByProduct[productId]) continue
        priceByProduct[productId] = money(pr.unit_amount, pr.currency) + (pr.recurring?.interval ? `/${pr.recurring.interval}` : '')
      }
    }
    const products = (prod.json?.data || []).map((p: any) => ({
      id: p.id,
      name: p.name || p.id,
      price: priceByProduct[p.id] || '—',
      active: p.active,
      created: dateFromEpoch(p.created),
    }))
    return { ok: true, message: `Stripe: ${products.length} products`, data: { count: products.length, products } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'view_prices', policyActionId: 'read_provider_status',
  schema: schema('stripe.view_prices', 'View Prices', 'view'),
  async run(_ctx, input) {
    const product = String(input.product || '').trim()
    const query = product ? `product=${encodeURIComponent(product)}&` : ''
    const r = await stripeRequest(`/v1/prices?${query}limit=100&expand[]=data.product`)
    if (!r.ok) return r
    const prices = (r.json?.data || []).map((p: any) => {
      const prodName = p.product && typeof p.product === 'object' ? (p.product.name || p.product.id) : p.product
      return {
        product: prodName || '—',
        price: money(p.unit_amount, p.currency) + (p.recurring?.interval ? `/${p.recurring.interval}` : ' (one-time)'),
        status: p.active ? 'active' : 'archived',
        created: dateFromEpoch(p.created),
        priceId: p.id,
      }
    })
    return { ok: true, message: `Stripe: ${prices.length} prices`, data: { count: prices.length, prices } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_customers', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_customers', 'Customer View', 'view'),
  async run() {
    const r = await stripeRequest('/v1/customers?limit=100')
    if (!r.ok) return r
    const customers = (r.json?.data || []).map((c: any) => ({
      id: c.id,
      customer: c.email || c.name || c.id,
      email: c.email || '—',
      name: c.name || '—',
      created: dateFromEpoch(c.created),
    }))
    return { ok: true, message: `Stripe: ${customers.length} customers`, data: { count: customers.length, customers } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_charges', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_charges', 'List Charges', 'view'),
  async run() {
    const r = await stripeRequest('/v1/charges?limit=100')
    if (!r.ok) return r
    const charges = (r.json?.data || []).map((ch: any) => ({
      id: ch.id,
      charge: `${money(ch.amount, ch.currency)} — ${ch.description || ch.billing_details?.email || ch.id}`,
      amount: money(ch.amount, ch.currency),
      status: ch.status || '—',
      refunded: ch.refunded ? 'yes' : 'no',
      created: dateFromEpoch(ch.created),
    }))
    return { ok: true, message: `Stripe: ${charges.length} charges`, data: { count: charges.length, charges } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_subscriptions', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_subscriptions', 'List Subscriptions', 'view'),
  async run() {
    const r = await stripeRequest('/v1/subscriptions?limit=50&expand[]=data.customer&expand[]=data.items.data.price.product')
    if (!r.ok) return r
    const subscriptions = (r.json?.data || []).map((s: any) => ({
      id: s.id,
      status: s.status,
      customer: typeof s.customer === 'object' ? (s.customer.email || s.customer.name || s.customer.id) : s.customer,
      product: s.items?.data?.[0]?.price?.product?.name || s.items?.data?.[0]?.price?.product || '—',
      price: money(s.items?.data?.[0]?.price?.unit_amount, s.items?.data?.[0]?.price?.currency),
      created: dateFromEpoch(s.created),
      current_period_end: dateFromEpoch(s.current_period_end || s.items?.data?.[0]?.current_period_end),
    }))
    return { ok: true, message: `Stripe: ${subscriptions.length} subscriptions`, data: { count: subscriptions.length, subscriptions } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_payments', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_payments', 'List Payments', 'view'),
  async run() {
    const r = await stripeRequest('/v1/payment_intents?limit=50')
    if (!r.ok) return r
    const payments = (r.json?.data || []).map((p: any) => ({ id: p.id, amount: money(p.amount, p.currency), status: p.status, customer: p.customer || '—', created: dateFromEpoch(p.created) }))
    return { ok: true, message: `Stripe: ${payments.length} payments`, data: { count: payments.length, payments } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_disputes', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_disputes', 'List Disputes', 'view'),
  async run() {
    const r = await stripeRequest('/v1/disputes?limit=50')
    if (!r.ok) return r
    const disputes = (r.json?.data || []).map((d: any) => ({ id: d.id, amount: money(d.amount, d.currency), status: d.status, reason: d.reason, created: dateFromEpoch(d.created) }))
    return { ok: true, message: `Stripe: ${disputes.length} disputes`, data: { count: disputes.length, disputes } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_coupons', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_coupons', 'List Coupons', 'view'),
  async run() {
    const r = await stripeRequest('/v1/coupons?limit=50')
    if (!r.ok) return r
    const coupons = (r.json?.data || []).map((c: any) => ({ id: c.id, name: c.name || c.id, percent_off: c.percent_off, amount_off: c.amount_off, duration: c.duration, valid: c.valid, created: dateFromEpoch(c.created) }))
    return { ok: true, message: `Stripe: ${coupons.length} coupons`, data: { count: coupons.length, coupons } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'list_webhook_endpoints', policyActionId: 'read_provider_status',
  schema: schema('stripe.list_webhook_endpoints', 'Webhook Endpoints', 'view'),
  async run() {
    const r = await stripeRequest('/v1/webhook_endpoints?limit=100')
    if (!r.ok) return r
    const endpoints = (r.json?.data || []).map((w: any) => ({
      id: w.id,
      url: w.url,
      status: w.status,
      enabled_events: Array.isArray(w.enabled_events) ? w.enabled_events.join(', ') : '—',
      api_version: w.api_version || 'default',
      livemode: w.livemode ? 'live' : 'test',
      created: dateFromEpoch(w.created),
      signalboost_match: String(w.url || '').includes('/api/stripe/webhook') || String(w.url || '').includes('/api/webhook') ? 'yes' : 'no',
    }))
    return { ok: true, message: `Stripe: ${endpoints.length} webhook endpoints`, data: { count: endpoints.length, endpoints } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'create_product', policyActionId: 'edit_stripe_product',
  schema: schema('stripe.create_product', 'Create Product', 'create', [
    { id: 'name', label: 'Product Name', type: 'text', required: true },
    { id: 'description', label: 'Description', type: 'text' },
  ]),
  async run(_ctx, input) {
    const params = new URLSearchParams({ name: String(input.name || '') })
    if (input.description) params.set('description', String(input.description))
    const r = await stripeRequest('/v1/products', { method: 'POST', body: params })
    if (!r.ok) return r
    return { ok: true, message: `Product created: ${r.json.id}`, data: { id: r.json.id, name: r.json.name } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'edit_product', policyActionId: 'edit_stripe_product',
  schema: schema('stripe.edit_product', 'Edit Product', 'edit', [
    { id: 'id', label: 'Product', type: 'remote_select', required: true, remoteSource: { action: 'stripe.view_products', dataPath: 'products', valueKey: 'id', labelTemplate: '{name} — {price}' } },
    { id: 'name', label: 'New Product Name', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const id = String(input.id || '')
    if (!id) return { ok: false, error: 'Product ID is required' }
    const params = new URLSearchParams()
    if (input.name) params.set('name', String(input.name))
    if (input.description) params.set('description', String(input.description))
    if (input.active !== undefined && input.active !== '') params.set('active', String(input.active) === 'true' ? 'true' : 'false')
    const r = await stripeRequest('/v1/products/' + encodeURIComponent(id), { method: 'POST', body: params })
    if (!r.ok) return r
    return { ok: true, message: `Product updated: ${r.json.id}`, data: { id: r.json.id, name: r.json.name, active: r.json.active } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'archive_product', policyActionId: 'archive_stripe_product',
  schema: schema('stripe.archive_product', 'Archive Product', 'archive', [{ id: 'id', label: 'Product', type: 'remote_select', required: true, remoteSource: { action: 'stripe.view_products', dataPath: 'products', valueKey: 'id', labelTemplate: '{name} — {price}' } }]),
  async run(_ctx, input) {
    const id = String(input.id || '')
    if (!id) return { ok: false, error: 'Product ID is required' }
    const r = await stripeRequest('/v1/products/' + encodeURIComponent(id), { method: 'POST', body: new URLSearchParams({ active: 'false' }) })
    if (!r.ok) return r
    return { ok: true, message: `Product archived: ${r.json.id}`, data: { id: r.json.id, active: r.json.active } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'delete_product', policyActionId: 'delete_stripe_product',
  schema: schema('stripe.delete_product', 'Delete Product', 'delete', [{ id: 'id', label: 'Product', type: 'remote_select', required: true, remoteSource: { action: 'stripe.view_products', dataPath: 'products', valueKey: 'id', labelTemplate: '{name} — {price}' } }]),
  async run(_ctx, input) {
    const id = String(input.id || '')
    if (!id) return { ok: false, error: 'Product ID is required' }
    const r = await stripeRequest('/v1/products/' + encodeURIComponent(id), { method: 'DELETE' })
    if (!r.ok) return r
    return { ok: true, message: `Product deleted: ${id}`, data: { id, deleted: r.json?.deleted } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'create_price', policyActionId: 'manage_prices',
  schema: schema('stripe.create_price', 'Create Price', 'create', [PRODUCT_FIELD, { id: 'amount', label: 'Amount (USD)', type: 'number', required: true }]),
  async run(_ctx, input) {
    const cents = Math.round(Number(input.amount || 0) * 100)
    if (!input.product || cents <= 0) return { ok: false, error: 'Product and positive amount are required' }
    const params: Record<string, string> = { product: String(input.product), currency: String(input.currency || 'usd'), unit_amount: String(cents) }
    const interval = String(input.interval || 'month')
    if (interval !== 'one_time') params['recurring[interval]'] = interval
    const r = await stripeRequest('/v1/prices', { method: 'POST', body: new URLSearchParams(params) })
    if (!r.ok) return r
    return { ok: true, message: `Price created: ${r.json.id}`, data: { id: r.json.id, unit_amount: r.json.unit_amount, currency: r.json.currency } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'edit_price', policyActionId: 'manage_prices',
  schema: schema('stripe.edit_price', 'Edit Price', 'edit', [PRICE_FIELD]),
  async run(_ctx, input) {
    const id = String(input.id || '')
    if (!id) return { ok: false, error: 'Price ID is required' }
    const params = new URLSearchParams()
    if (input.nickname) params.set('nickname', String(input.nickname))
    if (input.active !== undefined && input.active !== '') params.set('active', String(input.active) === 'true' ? 'true' : 'false')
    const r = await stripeRequest('/v1/prices/' + encodeURIComponent(id), { method: 'POST', body: params })
    if (!r.ok) return r
    return { ok: true, message: `Price updated: ${r.json.id}`, data: { id: r.json.id, active: r.json.active, nickname: r.json.nickname } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'archive_price', policyActionId: 'manage_prices',
  schema: schema('stripe.archive_price', 'Archive Price', 'archive', [PRICE_FIELD]),
  async run(_ctx, input) {
    const id = String(input.id || '')
    if (!id) return { ok: false, error: 'Price ID is required' }
    const r = await stripeRequest('/v1/prices/' + encodeURIComponent(id), { method: 'POST', body: new URLSearchParams({ active: 'false' }) })
    if (!r.ok) return r
    return { ok: true, message: `Price archived: ${r.json.id}`, data: { id: r.json.id, active: r.json.active } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'adjust_balance', policyActionId: 'refunds',
  schema: schema('stripe.adjust_balance', 'Adjust Balance', 'edit', [CUSTOMER_FIELD, { id: 'amount_cents', label: 'Amount (Cents)', type: 'number', required: true }]),
  async run(_ctx, input) {
    const customerId = String(input.customerId || '')
    const amount = String(Math.round(Number(input.amount_cents || 0)))
    if (!customerId || amount === '0') return { ok: false, error: 'Customer and non-zero amount are required' }
    const r = await stripeRequest('/v1/customers/' + encodeURIComponent(customerId) + '/balance_transactions', { method: 'POST', body: new URLSearchParams({ amount, currency: 'usd' }) })
    if (!r.ok) return r
    return { ok: true, message: `Balance adjusted for ${customerId}`, data: { id: r.json.id, amount: r.json.amount, customer: r.json.customer } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'issue_refund', policyActionId: 'refunds',
  schema: schema('stripe.issue_refund', 'Refund/Adjustments', 'create', [CHARGE_FIELD, { id: 'amount_cents', label: 'Amount (Cents)', type: 'number', required: true }]),
  async run(_ctx, input) {
    const charge = String(input.chargeId || '')
    const amount = String(Math.round(Number(input.amount_cents || 0)))
    if (!charge || Number(amount) <= 0) return { ok: false, error: 'Charge and positive amount are required' }
    const r = await stripeRequest('/v1/refunds', { method: 'POST', body: new URLSearchParams({ charge, amount }) })
    if (!r.ok) return r
    return { ok: true, message: `Refund created: ${r.json.id}`, data: { id: r.json.id, status: r.json.status, amount: r.json.amount } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'cancel_subscription', policyActionId: 'delete_provider_resource',
  schema: schema('stripe.cancel_subscription', 'Cancel Subscription', 'delete', [{ id: 'id', label: 'Subscription ID', type: 'text', required: true }]),
  async run(_ctx, input) {
    const id = String(input.id || '')
    if (!id) return { ok: false, error: 'Subscription ID is required' }
    const r = await stripeRequest('/v1/subscriptions/' + encodeURIComponent(id), { method: 'DELETE' })
    if (!r.ok) return r
    return { ok: true, message: `Subscription cancelled: ${id}`, data: { id: r.json.id, status: r.json.status } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'create_coupon', policyActionId: 'crud_actions',
  schema: schema('stripe.create_coupon', 'Create Coupon', 'create', [
    { id: 'id', label: 'Coupon code (optional)', type: 'text' },
    { id: 'percent_off', label: 'Percent off', type: 'number' },
    { id: 'duration', label: 'Duration', type: 'text', required: true },
  ]),
  async run(_ctx, input) {
    const params = new URLSearchParams({ duration: String(input.duration || 'once') })
    if (input.id) params.set('id', String(input.id))
    if (input.percent_off) params.set('percent_off', String(input.percent_off))
    const r = await stripeRequest('/v1/coupons', { method: 'POST', body: params })
    if (!r.ok) return r
    return { ok: true, message: `Coupon created: ${r.json.id}`, data: { id: r.json.id, percent_off: r.json.percent_off, duration: r.json.duration } }
  },
})

registerExecutor({
  providerId: 'stripe', actionId: 'apply_tier_template', policyActionId: 'manage_prices',
  schema: schema('stripe.apply_tier_template', 'Plan Templates', 'create', [{ id: 'tier', label: 'Subscription Tier', type: 'select', required: true, options: [
    { label: 'Indie Tier ($9/mo)', value: 'indie' },
    { label: 'Pro Tier ($29/mo)', value: 'pro' },
    { label: 'Growth Tier ($79/mo)', value: 'growth' },
  ] }]),
  async run(_ctx, input) {
    return { ok: false, error: `Plan template automation for ${String(input.tier || 'this tier')} is not wired in the portable engine yet. Use Create Product and Create Price instead.` }
  },
})
