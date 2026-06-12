// saas/app/api/hub/status/route.ts
// Hub Console — Phase 1B read-only aggregator.
// Owner/admin only. Fetches live Stripe prices, Supabase health, and Vercel env names.
// STRICTLY READ-ONLY: no write calls anywhere. Only display-safe values are returned
// to the browser — never secret values, never full keys.  

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireOwner } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Tier = { name: string; priceId: string; amount: number; interval: string; mismatch: boolean }
type Webhook = { url: string; status: string; events: number }
type ScopeInfo = { scope: string; count: number; names: string[] }

function maskTail(value: string | undefined, visible: number = 3): string {
  if (!value) return 'not set'
  const tail = value.slice(-visible)
  return '••••••••' + tail
}

// ── Stripe (live, read-only) ─────────────────────────────────────────────────
async function fetchStripe(): Promise<{ ok: boolean; tiers: Tier[]; webhooks: Webhook[]; mismatches: string[]; error?: string }> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { ok: false, tiers: [], webhooks: [], mismatches: [], error: 'STRIPE_SECRET_KEY not configured' }
  try {
    const [pricesRes, hooksRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/prices?active=true&limit=50&expand[]=data.product', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
      fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
    ])
    if (!pricesRes.ok) return { ok: false, tiers: [], webhooks: [], mismatches: [], error: `Stripe prices HTTP ${pricesRes.status}` }
    const prices = await pricesRes.json()
    const liveIds = new Set<string>()
    const tiers: Tier[] = []
    for (const p of prices.data || []) {
      liveIds.add(String(p.id))
      const productName = p.product && typeof p.product === 'object' ? String(p.product.name || p.id) : String(p.id)
      tiers.push({
        name: productName,
        priceId: String(p.id),
        amount: (p.unit_amount || 0) / 100,
        interval: p.recurring?.interval || 'one-time',
        mismatch: false,
      })
    }
    // Cross-check every configured STRIPE_PRICE_* env var against live active prices.
    const mismatches: string[] = []
    for (const [envName, envValue] of Object.entries(process.env)) {
      if (!envName.startsWith('STRIPE_PRICE_') || !envValue) continue
      if (!liveIds.has(envValue)) {
        mismatches.push(`${envName} points to a price that is not active in Stripe`)
      }
    }
    for (const t of tiers) {
      const configured = Object.entries(process.env).some(([n, v]) => n.startsWith('STRIPE_PRICE_') && v === t.priceId)
      if (!configured) t.mismatch = false // live-but-unconfigured prices are informational, not errors
    }
    let webhooks: Webhook[] = []
    if (hooksRes.ok) {
      const hooks = await hooksRes.json()
      webhooks = (hooks.data || []).map((h: any) => ({
        url: String(h.url || ''),
        status: String(h.status || 'unknown'),
        events: Array.isArray(h.enabled_events) ? h.enabled_events.length : 0,
      }))
    }
    return { ok: true, tiers, webhooks, mismatches }
  } catch (err: any) {
    return { ok: false, tiers: [], webhooks: [], mismatches: [], error: err?.message || 'Stripe fetch failed' }
  }
}

// ── Supabase (live health check) ─────────────────────────────────────────────
async function fetchSupabase(): Promise<{ ok: boolean; latencyMs: number; projectHost: string; anonKeyMasked: string; error?: string }> {
  const projectHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host } catch { return 'not configured' }
  })()
  const anonKeyMasked = maskTail(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  try {
    const admin = getAdminSupabase()
    const started = Date.now()
    const { error } = await admin.from('subscriptions').select('plan', { count: 'exact', head: true })
    const latencyMs = Date.now() - started
    if (error) return { ok: false, latencyMs, projectHost, anonKeyMasked, error: error.message }
    return { ok: true, latencyMs, projectHost, anonKeyMasked }
  } catch (err: any) {
    return { ok: false, latencyMs: 0, projectHost, anonKeyMasked, error: err?.message || 'Supabase check failed' }
  }
}

// ── Vercel (env variable NAMES only — values never fetched) ─────────────────
async function fetchVercel(): Promise<{ ok: boolean; configured: boolean; scopes: ScopeInfo[]; error?: string }> {
  const token = process.env.VERCEL_TOKEN
  if (!token) return { ok: true, configured: false, scopes: [] }
  try {
    const projectsRes = await fetch('https://api.vercel.com/v9/projects?limit=50', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!projectsRes.ok) return { ok: false, configured: true, scopes: [], error: `Vercel projects HTTP ${projectsRes.status}` }
    const projects = await projectsRes.json()
    const wantedName = process.env.VERCEL_HUB_PROJECT || 'signalboost-live'
    const project = (projects.projects || []).find((p: any) => p.name === wantedName) || (projects.projects || [])[0]
    if (!project) return { ok: false, configured: true, scopes: [], error: 'No Vercel project found for this token' }
    const envRes = await fetch(`https://api.vercel.com/v9/projects/${project.id}/env`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!envRes.ok) return { ok: false, configured: true, scopes: [], error: `Vercel env HTTP ${envRes.status}` }
    const envData = await envRes.json()
    const buckets: Record<string, string[]> = { production: [], preview: [], development: [] }
    for (const e of envData.envs || []) {
      const name = String(e.key || '')
      for (const target of e.target || []) {
        if (buckets[target]) buckets[target].push(name)
      }
    }
    const scopes: ScopeInfo[] = (['production', 'preview', 'development'] as const).map(s => ({
      scope: s.charAt(0).toUpperCase() + s.slice(1),
      count: buckets[s].length,
      names: buckets[s].sort(),
    }))
    return { ok: true, configured: true, scopes }
  } catch (err: any) {
    return { ok: false, configured: true, scopes: [], error: err?.message || 'Vercel fetch failed' }
  }
}

// ── Aggregate ────────────────────────────────────────────────────────────────
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const [stripe, supabase, vercel] = await Promise.all([fetchStripe(), fetchSupabase(), fetchVercel()])

  // Env-sync alert: variable names that exist in Production but not in Preview (or vice versa).
  const envAlerts: string[] = []
  if (vercel.ok && vercel.configured && vercel.scopes.length === 3) {
    const prod = new Set(vercel.scopes[0].names)
    const prev = new Set(vercel.scopes[1].names)
    for (const n of prod) { if (!prev.has(n)) envAlerts.push(`${n} present in Production, missing in Preview`) }
    for (const n of prev) { if (!prod.has(n)) envAlerts.push(`${n} present in Preview, missing in Production`) }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    stripe,
    supabase,
    vercel,
    alerts: {
      stripeMismatches: stripe.mismatches,
      envSync: envAlerts.slice(0, 8),
    },
  })
}
