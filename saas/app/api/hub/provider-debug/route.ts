// saas/app/api/hub/provider-debug/route.ts
// Combined Hub diagnostic (no auth — read-only, safe). Open in a browser:
//   https://saas.signalboostapp.com/api/hub/provider-debug
// It tests Stripe AND GitHub server-side and reports exactly why a live-data
// picker is empty. Delete this route once both are confirmed working.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'

function mask(v?: string) {
  return v ? `present (${v.slice(0, 4)}…${v.slice(-4)}, len ${v.length})` : '(MISSING)'
}

async function probeStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  const o: Record<string, unknown> = { STRIPE_SECRET_KEY: mask(key) }
  if (!key) { o.verdict = 'STRIPE_SECRET_KEY missing → Stripe picker empty. Set it in Vercel + redeploy.'; return o }
  try {
    const res = await fetch('https://api.stripe.com/v1/products?limit=3&active=true', {
      headers: { Authorization: 'Bearer ' + key }, cache: 'no-store',
    })
    o.httpStatus = res.status
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) { o.error = body?.error?.message || body; o.verdict = 'Stripe rejected the key (invalid/expired/wrong mode).'; return o }
    const products = Array.isArray(body?.data) ? body.data : []
    o.productCount = products.length
    o.sample = products.slice(0, 3).map((p: any) => p.name)
    o.verdict = products.length ? 'Stripe works and returns products. Picker should populate; if not, redeploy (stale build).' : 'Stripe works but 0 active products in this account/mode.'
  } catch (e) { o.error = e instanceof Error ? e.message : 'fetch failed'; o.verdict = 'Could not reach Stripe from the server.' }
  return o
}

async function probeGitHub() {
  const token = process.env.GITHUB_WRITE_TOKEN
  const o: Record<string, unknown> = { GITHUB_WRITE_TOKEN: mask(token) }
  if (!token) { o.verdict = 'GITHUB_WRITE_TOKEN missing → GitHub pickers empty. Set it in Vercel + redeploy.'; return o }
  try {
    const res = await fetch('https://api.github.com/user/repos?per_page=3&sort=updated', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store',
    })
    o.httpStatus = res.status
    o.tokenScopes = res.headers.get('x-oauth-scopes') || '(fine-grained/none reported)'
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) { o.error = body?.message || body; o.verdict = res.status === 401 ? 'Token invalid/expired.' : 'Token lacks repo read scope or is rate-limited.'; return o }
    const repos = Array.isArray(body) ? body : []
    o.repoCount = repos.length
    o.sample = repos.slice(0, 3).map((r: any) => r.full_name)
    o.verdict = repos.length ? 'GitHub works and returns repos. Picker should populate; if not, redeploy (stale build).' : 'GitHub works but sees 0 repos for this token.'
  } catch (e) { o.error = e instanceof Error ? e.message : 'fetch failed'; o.verdict = 'Could not reach GitHub from the server.' }
  return o
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const [stripe, github] = await Promise.all([probeStripe(), probeGitHub()])
  return NextResponse.json({
    env: {
      SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : '(MISSING)',
    },
    stripe,
    github,
    note: 'Both pickers POST /api/hub/action with these same keys. The verdict for each is the exact reason its dropdown is or is not populating.',
  }, { status: 200 })
}
