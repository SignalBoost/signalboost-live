import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireOwner } from '@/lib/auth/access'

// Reads live env + session + DB; must never be cached.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

// ─── helpers ──────────────────────────────────────────────────────────────────

const present = (v: string | undefined | null): boolean => !!(v && v.trim())

function keyMode(key: string | undefined): 'live' | 'test' | 'unknown' {
  if (!key) return 'unknown'
  if (key.startsWith('sk_live')) return 'live'
  if (key.startsWith('sk_test')) return 'test'
  return 'unknown'
}

// SaaS keys contain "51H8a"; Operations keys contain "51TVXg". The substring
// lives inside the secret — we derive the family WITHOUT ever returning the key.
function accountFamily(key: string | undefined): 'SaaS' | 'Operations' | 'unknown' {
  if (!key) return 'unknown'
  if (key.includes('51H8a')) return 'SaaS'
  if (key.includes('51TVXg')) return 'Operations'
  return 'unknown'
}

// ─── route ──────────────────────────────────────────────────────────────────

export async function GET() {
  // Owner-only. requireOwner verifies the Supabase session server-side and
  // returns the real auth UUID — not a hub-workspace id — so the row read below
  // is bound to the correct user.
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  const userId = guard.ctx.userId
  const email = guard.ctx.email
  const failures: string[] = []

  // ── Stripe key + account family ────────────────────────────────────────────
  const secretKey = process.env.STRIPE_SECRET_KEY
  const family = accountFamily(secretKey)
  const mode = keyMode(secretKey)
  const secretPresent = present(secretKey)

  if (!secretPresent) failures.push('STRIPE_SECRET_KEY is missing')
  if (secretPresent && family !== 'SaaS') {
    failures.push(
      family === 'Operations'
        ? 'STRIPE_SECRET_KEY belongs to the Operations account (51TVXg) — must be the SaaS account (51H8a)'
        : 'STRIPE_SECRET_KEY account family is unrecognised (neither 51H8a nor 51TVXg)',
    )
  }

  // ── Ping Stripe to prove the key actually authenticates ─────────────────────
  let apiReachable = false
  let accountId: string | null = null
  let accountName: string | null = null
  let stripeError: string | null = null
  if (secretPresent) {
    try {
      const res = await fetch('https://api.stripe.com/v1/account', {
        method: 'GET',
        headers: { Authorization: `Bearer ${secretKey}` },
      })
      const acct = await res.json()
      if (res.ok) {
        apiReachable = true
        accountId = acct?.id ?? null
        accountName =
          acct?.business_profile?.name ??
          acct?.settings?.dashboard?.display_name ??
          null
      } else {
        stripeError = acct?.error?.message || `Stripe returned ${res.status}`
        failures.push(`Stripe key did not authenticate: ${stripeError}`)
      }
    } catch (err: any) {
      stripeError = err?.message || 'Stripe request failed'
      failures.push(`Stripe ping failed: ${stripeError}`)
    }
  }

  // ── Other required env (never echo secret values) ───────────────────────────
  const webhookSecretPresent = present(process.env.STRIPE_WEBHOOK_SECRET)
  if (!webhookSecretPresent) failures.push('STRIPE_WEBHOOK_SECRET is missing')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRolePresent = present(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!present(supabaseUrl)) failures.push('NEXT_PUBLIC_SUPABASE_URL is missing')
  if (!serviceRolePresent) failures.push('SUPABASE_SERVICE_ROLE_KEY is missing')

  const appUrlPresent = present(process.env.NEXT_PUBLIC_APP_URL)
  if (!appUrlPresent) failures.push('NEXT_PUBLIC_APP_URL is missing')

  // ── Price IDs (the 6 the checkout + webhook depend on) ──────────────────────
  const priceIds = {
    website: {
      starter: present(process.env.STRIPE_PRICE_WEBSITE_STARTER),
      pro: present(process.env.STRIPE_PRICE_WEBSITE_PRO),
      business: present(process.env.STRIPE_PRICE_WEBSITE_BUSINESS),
    },
    podcast: {
      indie: present(process.env.STRIPE_PRICE_PODCAST_INDIE),
      pro: present(process.env.STRIPE_PRICE_PODCAST_PRO),
      network: present(process.env.STRIPE_PRICE_PODCAST_NETWORK),
    },
  }
  const missingPrices: string[] = []
  for (const [line, plans] of Object.entries(priceIds)) {
    for (const [plan, ok] of Object.entries(plans)) {
      if (!ok) missingPrices.push(`STRIPE_PRICE_${line.toUpperCase()}_${plan.toUpperCase()}`)
    }
  }
  if (missingPrices.length) failures.push(`Missing price env vars: ${missingPrices.join(', ')}`)

  // ── Phase D: read back THIS owner's subscription row ────────────────────────
  // Informational — only populated after a real purchase. Does not gate config_ok.
  let subscription: Record<string, unknown> = { found: false }
  if (supabaseUrl && serviceRolePresent && userId) {
    try {
      const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data: row } = await supabase
        .from('subscriptions')
        .select(
          'plan, status, stripe_customer_id, stripe_subscription_id, current_period_ends_at, podcast_plan, podcast_status',
        )
        .eq('user_id', userId)
        .maybeSingle()
      if (row) {
        subscription = {
          found: true,
          plan: (row as any).plan ?? null,
          status: (row as any).status ?? null,
          stripe_customer_id_present: present((row as any).stripe_customer_id),
          stripe_subscription_id_present: present((row as any).stripe_subscription_id),
          current_period_ends_at: (row as any).current_period_ends_at ?? null,
          podcast_plan: (row as any).podcast_plan ?? null,
          podcast_status: (row as any).podcast_status ?? null,
        }
      }
    } catch (err: any) {
      subscription = { found: false, error: err?.message || 'row read failed' }
    }
  }

  const configOk = failures.length === 0

  return NextResponse.json({
    ok: configOk, // overall Phase A config readiness
    checked_at: new Date().toISOString(),
    caller: { userId, email },
    stripe: {
      secret_key_present: secretPresent,
      key_mode: mode,
      account_family: family,
      account_family_ok: family === 'SaaS',
      api_reachable: apiReachable,
      account_id: accountId,
      account_name: accountName,
      error: stripeError,
    },
    webhook_secret_present: webhookSecretPresent,
    supabase: { url_present: present(supabaseUrl), service_role_present: serviceRolePresent },
    app_url_present: appUrlPresent,
    price_ids: priceIds,
    subscription,
    failures,
  })
}
