// saas/app/api/hub/providers/verify/route.ts
//
// Connects provider template cards to LIVE data. Owner-gated. Reads the running
// deployment's Production environment (process.env on the Production deploy) and
// verifies each provider against its own API. Returns canonical, non-secret live
// values plus a mismatch list. NEVER invents values: a missing var is reported as
// missing; a key is never echoed, only derived/probed.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const present = (v: string | undefined | null): boolean => !!(v && v.trim())
const mask = (v: string | undefined): string => (v ? '••••' + v.slice(-4) : 'not set')

// ── Stripe ────────────────────────────────────────────────────────────────────
async function verifyStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  const mismatches: string[] = []
  const canonical: Record<string, unknown> = {
    secret_key_present: present(key),
    webhook_secret_present: present(process.env.STRIPE_WEBHOOK_SECRET),
    account_family: key?.includes('51H8a') ? 'SaaS' : key?.includes('51TVXg') ? 'Operations' : 'unknown',
  }
  if (!present(key)) { mismatches.push('STRIPE_SECRET_KEY missing'); return { ok: false, canonical, mismatches } }

  // Configured STRIPE_PRICE_* env entries
  const priceEnv = Object.entries(process.env)
    .filter(([n, v]) => n.startsWith('STRIPE_PRICE_') && typeof v === 'string' && v!.startsWith('price_')) as [string, string][]
  canonical.configured_price_vars = priceEnv.map(([n]) => n)

  try {
    const [acctRes, pricesRes, hooksRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
      fetch('https://api.stripe.com/v1/prices?active=true&limit=100', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
      fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
    ])
    if (!acctRes.ok) { mismatches.push(`Stripe key did not authenticate (HTTP ${acctRes.status})`); return { ok: false, canonical, mismatches } }
    const acct = await acctRes.json()
    canonical.account_id = acct?.id ?? null
    canonical.account_name = acct?.business_profile?.name ?? acct?.settings?.dashboard?.display_name ?? null

    const liveIds = new Set<string>()
    if (pricesRes.ok) { const p = await pricesRes.json(); for (const pr of p.data || []) liveIds.add(String(pr.id)) }
    for (const [name, val] of priceEnv) {
      if (!liveIds.has(val)) mismatches.push(`${name} points to a price not active in Stripe`)
    }
    canonical.active_prices = liveIds.size

    if (hooksRes.ok) {
      const h = await hooksRes.json()
      canonical.webhooks = (h.data || []).map((w: any) => ({ url: w.url, status: w.status, events: (w.enabled_events || []).length }))
    }
    return { ok: mismatches.length === 0, canonical, mismatches }
  } catch (e: any) {
    mismatches.push(`Stripe verification failed: ${e?.message || 'request error'}`)
    return { ok: false, canonical, mismatches }
  }
}

// ── Supabase (main project) ───────────────────────────────────────────────────
async function verifySupabase() {
  const mismatches: string[] = []
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const canonical: Record<string, unknown> = {
    project_host: (() => { try { return new URL(url || '').host } catch { return 'not configured' } })(),
    anon_key_present: present(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    service_role_present: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    service_role_masked: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
  }
  if (!present(url)) mismatches.push('NEXT_PUBLIC_SUPABASE_URL missing')
  if (!present(process.env.SUPABASE_SERVICE_ROLE_KEY)) mismatches.push('SUPABASE_SERVICE_ROLE_KEY missing')

  try {
    const admin = getAdminSupabase()
    const started = Date.now()
    const { error } = await admin.from('subscriptions').select('plan', { count: 'exact', head: true })
    canonical.latency_ms = Date.now() - started
    canonical.reachable = !error
    if (error) mismatches.push(`Supabase health check failed: ${error.message}`)
    return { ok: mismatches.length === 0, canonical, mismatches }
  } catch (e: any) {
    canonical.reachable = false
    mismatches.push(`Supabase verification failed: ${e?.message || 'request error'}`)
    return { ok: false, canonical, mismatches }
  }
}

// ── Vercel ────────────────────────────────────────────────────────────────────
async function verifyVercel() {
  const mismatches: string[] = []
  const token = process.env.VERCEL_TOKEN
  const canonical: Record<string, unknown> = { token_present: present(token) }
  if (!present(token)) { mismatches.push('VERCEL_TOKEN missing — Vercel metadata cannot be read'); return { ok: false, canonical, mismatches } }

  try {
    const projRes = await fetch('https://api.vercel.com/v9/projects?limit=50', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!projRes.ok) { mismatches.push(`Vercel projects HTTP ${projRes.status}`); return { ok: false, canonical, mismatches } }
    const projects = await projRes.json()
    const wanted = process.env.VERCEL_HUB_PROJECT || process.env.VERCEL_PROJECT_ID || 'signalboost-live'
    const project = (projects.projects || []).find((p: any) => p.name === wanted || p.id === wanted) || (projects.projects || [])[0]
    if (!project) { mismatches.push('No Vercel project resolved for this token'); return { ok: false, canonical, mismatches } }
    canonical.project_name = project.name
    canonical.project_id = project.id

    const [envRes, deployRes] = await Promise.all([
      fetch(`https://api.vercel.com/v9/projects/${project.id}/env`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch(`https://api.vercel.com/v6/deployments?projectId=${project.id}&limit=1`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
    ])
    if (envRes.ok) {
      const env = await envRes.json()
      const buckets: Record<string, number> = { production: 0, preview: 0, development: 0 }
      const prod = new Set<string>(); const prev = new Set<string>()
      for (const e of env.envs || []) {
        for (const t of e.target || []) {
          if (buckets[t] != null) buckets[t]++
          if (t === 'production') prod.add(e.key)
          if (t === 'preview') prev.add(e.key)
        }
      }
      canonical.env_counts = buckets
      for (const n of prod) if (!prev.has(n)) mismatches.push(`${n} present in Production, missing in Preview`)
    }
    if (deployRes.ok) {
      const d = await deployRes.json()
      const latest = (d.deployments || [])[0]
      canonical.latest_deployment = latest ? { state: latest.state || latest.readyState, created: latest.created } : null
    }
    return { ok: mismatches.length === 0, canonical, mismatches }
  } catch (e: any) {
    mismatches.push(`Vercel verification failed: ${e?.message || 'request error'}`)
    return { ok: false, canonical, mismatches }
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────
async function verifyOpenAI() {
  const mismatches: string[] = []
  const key = process.env.OPENAI_API_KEY
  const canonical: Record<string, unknown> = { key_present: present(key), key_masked: mask(key) }
  if (!present(key)) { mismatches.push('OPENAI_API_KEY missing'); return { ok: false, canonical, mismatches } }
  try {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
    canonical.reachable = res.ok
    if (!res.ok) { mismatches.push(`OpenAI key did not authenticate (HTTP ${res.status})`); return { ok: false, canonical, mismatches } }
    const data = await res.json()
    canonical.model_count = Array.isArray(data?.data) ? data.data.length : 0
    return { ok: true, canonical, mismatches }
  } catch (e: any) {
    canonical.reachable = false
    mismatches.push(`OpenAI verification failed: ${e?.message || 'request error'}`)
    return { ok: false, canonical, mismatches }
  }
}

// ── Aggregate ─────────────────────────────────────────────────────────────────
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const [stripe, supabase, vercel, openai] = await Promise.all([
    verifyStripe(), verifySupabase(), verifyVercel(), verifyOpenAI(),
  ])

  const providers = { stripe, supabase, vercel, openai }
  const allMismatches = [
    ...stripe.mismatches.map(m => `stripe: ${m}`),
    ...supabase.mismatches.map(m => `supabase: ${m}`),
    ...vercel.mismatches.map(m => `vercel: ${m}`),
    ...openai.mismatches.map(m => `openai: ${m}`),
  ]
  const ok = stripe.ok && supabase.ok && vercel.ok && openai.ok

  return NextResponse.json({
    ok,
    confirmation: ok ? 'Templates connected to live data.' : 'Live data read — mismatches found (see mismatches).',
    checked_at: new Date().toISOString(),
    caller: { userId: guard.ctx.userId, email: guard.ctx.email },
    providers,
    mismatches: allMismatches,
  })
}
