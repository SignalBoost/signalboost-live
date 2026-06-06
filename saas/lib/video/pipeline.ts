import { createClient } from '@supabase/supabase-js'

export const VIDEO_BUCKET = 'video-jobs'
export const RENDER_BUCKET = 'video-renders'
export const SIGNED_URL_TTL = 60 * 60 * 6

export const SUPPORTED_VIDEO_LANGS = ['en', 'pt', 'es', 'pl', 'ru'] as const
export type SupportedVideoLang = (typeof SUPPORTED_VIDEO_LANGS)[number]
export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type VideoJobType = 'transcode' | 'caption_burn' | 'export'
export type BillingAction = 'none' | 'charge_overage' | 'block'

export type CaptionStyle = {
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  x: number
  y: number
  width: number
  animation: 'none' | 'fade' | 'pop' | 'slide'
}

export type VideoEntitlement = {
  plan: 'trial' | 'free' | 'starter' | 'pro' | 'business'
  paid: boolean
  demoOnly: boolean
  canExport: boolean
  maxDemoSeconds: number
  quotaMinutes: number
  quotaStorageGb: number
  usedMinutes: number
  usedStorageGb: number
  projectedMinutes: number
  projectedStorageGb: number
  overQuota: boolean
  estimatedOverageUsd: number
  billingAction: BillingAction
  billingProviders: Array<'stripe' | 'paypal'>
  message: string
}

const PLAN_LIMITS: Record<string, { minutes: number; storageGb: number; demo: number; paid: boolean }> = {
  trial: { minutes: 3, storageGb: 0.5, demo: 30, paid: false },
  free: { minutes: 3, storageGb: 0.5, demo: 30, paid: false },
  starter: { minutes: 60, storageGb: 10, demo: 0, paid: true },
  pro: { minutes: 240, storageGb: 50, demo: 0, paid: true },
  business: { minutes: 1200, storageGb: 250, demo: 0, paid: true },
}

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function resolveAccountId(supabase: any, userId: string): Promise<string | null> {
  const probes = [
    supabase.from('accounts').select('id').eq('owner_id', userId).maybeSingle(),
    supabase.from('accounts').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('accounts').select('id').eq('id', userId).maybeSingle(),
  ]
  for (const probe of probes) {
    const { data } = await probe
    if (data?.id) return data.id
  }
  return null
}

export async function getVideoEntitlement(
  supabase: any,
  userId: string,
  projectedSeconds = 0,
  projectedSizeMb = 0,
): Promise<VideoEntitlement> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle()

  const rawPlan = String(sub?.plan || (sub?.status === 'trialing' ? 'trial' : 'free')).toLowerCase()
  const plan = (PLAN_LIMITS[rawPlan] ? rawPlan : 'free') as VideoEntitlement['plan']
  const limits = PLAN_LIMITS[plan]

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const { data: storageRows } = await supabase
    .from('video_storage')
    .select('size_mb, duration_sec')
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString())

  const usedMinutes = (storageRows || []).reduce((sum: number, row: any) => sum + Number(row.duration_sec || 0) / 60, 0)
  const usedStorageGb = (storageRows || []).reduce((sum: number, row: any) => sum + Number(row.size_mb || 0) / 1024, 0)
  const projectedMinutes = usedMinutes + projectedSeconds / 60
  const projectedStorageGb = usedStorageGb + projectedSizeMb / 1024
  const overMinutes = Math.max(0, projectedMinutes - limits.minutes)
  const overStorage = Math.max(0, projectedStorageGb - limits.storageGb)
  const estimatedOverageUsd = Math.round((overMinutes * 0.08 + overStorage * 0.25) * 100) / 100
  const overQuota = overMinutes > 0 || overStorage > 0
  const billingProviders: Array<'stripe' | 'paypal'> = []
  if (process.env.STRIPE_SECRET_KEY) billingProviders.push('stripe')
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) billingProviders.push('paypal')

  return {
    plan,
    paid: limits.paid,
    demoOnly: !limits.paid,
    canExport: limits.paid,
    maxDemoSeconds: limits.demo,
    quotaMinutes: limits.minutes,
    quotaStorageGb: limits.storageGb,
    usedMinutes,
    usedStorageGb,
    projectedMinutes,
    projectedStorageGb,
    overQuota,
    estimatedOverageUsd,
    billingAction: !limits.paid ? 'block' : overQuota ? 'charge_overage' : 'none',
    billingProviders,
    message: !limits.paid
      ? `Your ${plan} plan supports demo playback only. Upgrade to export full videos.`
      : overQuota
      ? `This render exceeds the included ${limits.minutes} minute / ${limits.storageGb} GB quota and will use metered overage billing.`
      : `Your ${plan} plan includes full editing and export.`,
  }
}

export function normalizeCaptionStyle(input: any): CaptionStyle {
  return {
    fontFamily: String(input?.fontFamily || 'Arial').slice(0, 80),
    fontSize: clamp(Number(input?.fontSize || 44), 18, 96),
    color: /^#[0-9a-f]{6}$/i.test(String(input?.color || '')) ? input.color : '#ffffff',
    backgroundColor: /^#[0-9a-f]{6}$/i.test(String(input?.backgroundColor || '')) ? input.backgroundColor : '#000000',
    x: clamp(Number(input?.x ?? 12), 0, 100),
    y: clamp(Number(input?.y ?? 72), 0, 100),
    width: clamp(Number(input?.width ?? 76), 20, 100),
    animation: ['none', 'fade', 'pop', 'slide'].includes(String(input?.animation)) ? input.animation : 'fade',
  }
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export async function createBillingOverageIntent(supabase: any, input: {
  userId: string
  accountId: string | null
  jobId: string
  entitlement: VideoEntitlement
}) {
  if (input.entitlement.billingAction !== 'charge_overage') return null
  const provider = input.entitlement.billingProviders[0] || 'stripe'
  const amountUsd = Math.max(0.5, input.entitlement.estimatedOverageUsd)
  const charge = provider === 'paypal'
    ? await createPayPalOrder(amountUsd, input.jobId)
    : await createStripePaymentIntent(supabase, input.userId, amountUsd, input.jobId)
  const row = {
    user_id: input.userId,
    account_id: input.accountId,
    provider,
    job_id: input.jobId,
    amount_usd: amountUsd,
    status: charge?.status === 'requires_capture' || charge?.status === 'CREATED' || charge?.status === 'requires_payment_method' ? 'pending' : 'charged',
    metadata: jsonSafe({ feature: 'video_export_overage', entitlement: input.entitlement, charge }),
    created_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('billing_overage_events').insert(row)
  if (error && !/does not exist/i.test(error.message)) throw error
  return row
}

async function createStripePaymentIntent(supabase: any, userId: string, amountUsd: number, jobId: string) {
  if (!process.env.STRIPE_SECRET_KEY) return { provider: 'stripe', status: 'not_configured' }
  const customerId = await findBillingCustomerId(supabase, userId)
  const params = new URLSearchParams({
    amount: String(Math.round(amountUsd * 100)),
    currency: 'usd',
    description: `SignalBoost video export overage ${jobId}`,
    'metadata[feature]': 'video_export_overage',
    'metadata[job_id]': jobId,
  })
  if (customerId) params.set('customer', customerId)
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Stripe overage request failed (${res.status})`)
  return { provider: 'stripe', id: data.id, status: data.status, customer: data.customer || customerId || null }
}

async function createPayPalOrder(amountUsd: number, jobId: string) {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return { provider: 'paypal', status: 'not_configured' }
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const base = process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com'
  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const token = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(token?.error_description || `PayPal token request failed (${tokenRes.status})`)
  const orderRes = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: jobId, description: 'SignalBoost video export overage', amount: { currency_code: 'USD', value: amountUsd.toFixed(2) } }],
    }),
  })
  const order = await orderRes.json()
  if (!orderRes.ok) throw new Error(order?.message || `PayPal order request failed (${orderRes.status})`)
  return { provider: 'paypal', id: order.id, status: order.status, approveUrl: order.links?.find((l: any) => l.rel === 'approve')?.href || null }
}

async function findBillingCustomerId(supabase: any, userId: string): Promise<string | null> {
  const probes = [
    supabase.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle(),
    supabase.from('customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle(),
    supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle(),
  ]
  for (const probe of probes) {
    const { data, error } = await probe
    if (!error && data?.stripe_customer_id) return data.stripe_customer_id
  }
  return null
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
