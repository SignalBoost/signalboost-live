// saas/app/api/hub/operator/sweep/route.ts
//
// SignalBoost Core Operations Sweep. Owner-gated. Runs every SAFE READ-ONLY check
// across the 9 required providers using LIVE data, through the governed operator
// for executor-backed providers and direct read-only API reads for Stripe /
// Supabase / Vercel. NO write or risky action is ever executed — those are listed
// as approval-required. Unhealthy providers' actions are reported as blocked.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { createOperator, permits, lintTemplate, type PreflightChecks } from '@/console-core/operator'
import { createOperatorHost } from '@/lib/hub/operatorHost'
import { probeAll, type ProbeResult } from '@/lib/hub/preflightProbe'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const REPO = 'SignalBoost/signalboost-live'

// Safe read-only executor actions (policyActionId: read_provider_status).
const READONLY: Record<string, { actionId: string; input: Record<string, unknown> }[]> = {
  github: [
    { actionId: 'list_repos', input: {} },
    { actionId: 'list_prs', input: { repo: REPO } },
    { actionId: 'list_branches', input: { repo: REPO } },
    { actionId: 'list_commits', input: { repo: REPO } },
    { actionId: 'list_issues', input: { repo: REPO } },
  ],
  openai: [
    { actionId: 'list_models', input: {} },
    { actionId: 'list_files', input: {} },
    { actionId: 'list_fine_tunes', input: {} },
    { actionId: 'list_batches', input: {} },
  ],
  anthropic: [{ actionId: 'list_models', input: {} }],
  gemini: [{ actionId: 'list_models', input: {} }],
  assemblyai: [{ actionId: 'list_transcripts', input: {} }],
  resend: [
    { actionId: 'list_domains', input: {} },
    { actionId: 'list_audiences', input: {} },
    { actionId: 'list_broadcasts', input: {} },
    { actionId: 'list_api_keys', input: {} },
  ],
}

// Write/risky actions — never auto-run; surfaced as approval cards.
const WRITE_ACTIONS = [
  { provider: 'github', action: 'open_issue', risk: 'Medium', why: 'Creates a public issue' },
  { provider: 'github', action: 'edit_issue', risk: 'Medium', why: 'Modifies an issue' },
  { provider: 'github', action: 'close_issue', risk: 'Medium', why: 'Closes an issue' },
  { provider: 'github', action: 'merge_pr', risk: 'High', why: 'Merges code to a branch' },
  { provider: 'github', action: 'close_pr', risk: 'Medium', why: 'Closes a pull request' },
  { provider: 'github', action: 'delete_branch', risk: 'High', why: 'Deletes a branch (hard to reverse)' },
  { provider: 'github', action: 'rotate_token', risk: 'High', why: 'Rotates a credential' },
  { provider: 'github', action: 'manage_secrets', risk: 'High', why: 'Changes repository secrets' },
]

function bearer(k: string) { return { Authorization: `Bearer ${k}` } }
async function jget(url: string, headers: Record<string, string>) {
  try { const r = await fetch(url, { headers, cache: 'no-store' }); return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : null } }
  catch (e: any) { return { ok: false, status: 0, body: null, error: e?.message } }
}

// ── Stripe (read-only) ────────────────────────────────────────────────────────
async function stripeSweep() {
  const k = process.env.STRIPE_SECRET_KEY
  if (!k) return { ok: false, error: 'STRIPE_SECRET_KEY missing' }
  const h = bearer(k)
  const [products, prices, links, customers, subs, charges] = await Promise.all([
    jget('https://api.stripe.com/v1/products?active=true&limit=100', h),
    jget('https://api.stripe.com/v1/prices?active=true&limit=100', h),
    jget('https://api.stripe.com/v1/payment_links?limit=100', h),
    jget('https://api.stripe.com/v1/customers?limit=100', h),
    jget('https://api.stripe.com/v1/subscriptions?status=all&limit=100', h),
    jget('https://api.stripe.com/v1/charges?limit=100', h),
  ])
  const failed = (charges.body?.data || []).filter((c: any) => c.status === 'failed').length
  return {
    ok: true,
    products: products.body?.data?.length ?? null,
    prices: prices.body?.data?.length ?? null,
    payment_links: links.body?.data?.length ?? null,
    customers_sample: customers.body?.data?.length ?? null,
    subscriptions: subs.body?.data?.length ?? null,
    failed_charges_recent: failed,
  }
}

// ── Supabase main (read-only) ─────────────────────────────────────────────────
async function supabaseSweep() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase URL or service-role key missing' }
  const spec = await jget(`${url}/rest/v1/`, { apikey: key, ...bearer(key) })
  const tables = spec.body?.definitions ? Object.keys(spec.body.definitions).length : null
  let users: number | null = null
  let buckets: string[] | null = null
  try {
    const admin = getAdminSupabase() as any
    const u = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    users = u?.data?.total ?? u?.data?.users?.length ?? null
    const b = await admin.storage.listBuckets()
    buckets = Array.isArray(b?.data) ? b.data.map((x: any) => x.name) : null
  } catch { /* read-only best-effort */ }
  return { ok: true, tables, auth_users: users, storage_buckets: buckets }
}

// ── Vercel (read-only) ────────────────────────────────────────────────────────
async function vercelSweep() {
  const t = process.env.VERCEL_TOKEN
  if (!t) return { ok: false, error: 'VERCEL_TOKEN missing' }
  const h = bearer(t)
  const projects = await jget('https://api.vercel.com/v9/projects?limit=50', h)
  const wanted = process.env.VERCEL_HUB_PROJECT || process.env.VERCEL_PROJECT_ID || 'signalboost-live'
  const project = (projects.body?.projects || []).find((p: any) => p.name === wanted || p.id === wanted) || (projects.body?.projects || [])[0]
  if (!project) return { ok: false, error: 'No Vercel project resolved' }
  const [deploy, domains, env] = await Promise.all([
    jget(`https://api.vercel.com/v6/deployments?projectId=${project.id}&limit=1`, h),
    jget(`https://api.vercel.com/v9/projects/${project.id}/domains?limit=50`, h),
    jget(`https://api.vercel.com/v9/projects/${project.id}/env`, h),
  ])
  const latest = (deploy.body?.deployments || [])[0]
  const prodEnv = (env.body?.envs || []).filter((e: any) => (e.target || []).includes('production')).length
  return {
    ok: true,
    project: project.name,
    latest_deployment: latest ? { state: latest.state || latest.readyState, created: latest.created } : null,
    domains: (domains.body?.domains || []).map((d: any) => ({ name: d.name, verified: d.verified })),
    production_env_vars: prodEnv,
  }
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const host = createOperatorHost()
  const operator = createOperator(host)
  const userId = guard.ctx.userId || 'unknown'

  const required = ['stripe', 'supabase', 'vercel', 'openai', 'github', 'anthropic', 'gemini', 'resend', 'assemblyai']
  const probes = await probeAll(required)

  const checked: string[] = []
  const completed: Record<string, unknown> = {}
  const blocked: string[] = []

  // Executor-backed read-only sweeps (governed, live).
  for (const [providerId, actions] of Object.entries(READONLY)) {
    const probe: ProbeResult | undefined = probes[providerId]
    if (!probe || !probe.providerHealth) {
      for (const a of actions) blocked.push(`${providerId}.${a.actionId}: PROVIDER AUTH BLOCKED`)
      continue
    }
    for (const a of actions) {
      checked.push(`${providerId}.${a.actionId}`)
      const tpl = host.resolveTemplate(providerId, a.actionId)
      const preflight: PreflightChecks = {
        credentialsValid: probe.credentialsValid,
        providerHealth: probe.providerHealth,
        permissionsValid: !!tpl && permits(tpl.permissionPolicy, 'owner'),
        templatesValid: !!tpl && lintTemplate(tpl).ok,
        dependenciesSatisfied: true,
        rateLimitsSafe: probe.status !== 429,
        idempotencyConfirmed: true,
      }
      const r = await operator.run({
        providerId, actionId: a.actionId, input: a.input,
        user: { id: userId, role: 'owner' },
        executionMode: 'execution', approvalGranted: false, preflight,
      })
      completed[`${providerId}.${a.actionId}`] = r.ok
        ? { ok: true, data: r.normalized.data ?? null }
        : { ok: false, stage: r.stage, error: r.failure?.errorMessage }
    }
  }

  // Direct read-only sweeps for infra providers.
  for (const [name, fn] of [['stripe', stripeSweep], ['supabase', supabaseSweep], ['vercel', vercelSweep]] as const) {
    if (!probes[name]?.providerHealth) { blocked.push(`${name}: PROVIDER AUTH BLOCKED`); continue }
    checked.push(`${name}.sweep`)
    completed[`${name}.sweep`] = await fn()
  }

  const needs_approval = WRITE_ACTIONS.map(w => ({
    title: 'Approval Required',
    action: `${w.provider}.${w.action}`,
    provider: w.provider,
    risk_level: w.risk,
    why: w.why,
    approve: `APPROVE: ${w.action}`,
    reject: `REJECT: ${w.action}`,
  }))

  return NextResponse.json({
    ok: true,
    checked,
    completed,
    needs_approval,
    blocked,
    next_required_action: 'Review completed read-only results. To run any write action, reply APPROVE: <action> with its required inputs.',
    checked_at: new Date().toISOString(),
  })
}
