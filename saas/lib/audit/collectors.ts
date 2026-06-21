// saas/lib/audit/collectors.ts
//
// Live provider readers → a single normalized AuditSnapshot for the findings
// engine. SERVER-ONLY: reads service-role keys, provider tokens, and IAM data.
// Never import this into a client component — surface its output through an
// owner-gated API route instead.
//
// Widened from identities-only to a full cross-provider snapshot (identities +
// stripe + supabase + vercel + github + secrets) so the Executive Summary and
// the per-provider reports can all run off one collection pass. The Identity &
// Access report keeps working unchanged: collectSnapshot() still returns
// `identities` exactly as before.
//
// Every collector is wrapped so a failing or unconfigured provider degrades
// gracefully (ok:false / configured:false) instead of throwing — the engine
// turns those into honest read-fail or evidence-required findings.

import { listWorkspaceUsers } from '@/lib/auth/rbac-service'
import { scanAWSUsers, scanAWSAccessKeys } from '@/lib/hub/aws-scanner'
import { getVaultSecrets } from '@/lib/hub/vault-operations'
import { listEnv } from '@/lib/hub/vercel-env'
import type {
  AuditSnapshot,
  NormalizedIdentity,
  NormalizedProvider,
  NormalizedStripe,
  NormalizedSupabase,
  NormalizedVercel,
  NormalizedGithub,
  NormalizedSecret,
} from '@/lib/audit/findingsEngine'
import type { ConnectionStatus } from '@/lib/audit/reportModel'

const REPO = process.env.AUDIT_GITHUB_REPO || 'SignalBoost/signalboost-live'
const SECRETISH = /(secret|token|service[_-]?role|private[_-]?key|password|api[_-]?key|webhook[_-]?secret|signing)/i

function iso(d?: Date): string | undefined {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Identities — hub workspace users + AWS IAM (users & access keys)
// ─────────────────────────────────────────────────────────────────────────────

export async function collectIdentities(): Promise<NormalizedIdentity[]> {
  const out: NormalizedIdentity[] = []

  try {
    const res = await listWorkspaceUsers()
    if (res.ok && Array.isArray(res.users)) {
      for (const u of res.users) {
        out.push({
          provider: 'hub',
          principal: u.email || u.id,
          kind: 'user',
          role: u.role,
          mfaEnabled: typeof u.mfaEnabled === 'boolean' ? u.mfaEnabled : undefined,
          active: u.active,
          lastActivity: u.lastLogin,
          createdAt: u.createdAt,
        })
      }
    }
  } catch { /* degrade silently */ }

  const awsId = process.env.AWS_ACCESS_KEY_ID
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY
  if (awsId && awsSecret) {
    try {
      const users = await scanAWSUsers(awsId, awsSecret)
      if (users.ok && Array.isArray(users.users)) {
        for (const u of users.users) {
          out.push({
            provider: 'aws', principal: u.username, kind: 'user', role: 'iam-user',
            mfaEnabled: undefined, lastActivity: iso(u.lastUsed), createdAt: iso(u.created),
          })
        }
      }
    } catch { /* skip */ }

    try {
      const keys = await scanAWSAccessKeys(awsId, awsSecret)
      if (keys.ok && Array.isArray(keys.keys)) {
        for (const k of keys.keys) {
          out.push({
            provider: 'aws', principal: k.accessKeyId, kind: 'access_key', role: 'access-key',
            active: k.status === 'Active', lastActivity: iso(k.lastUsed), createdAt: iso(k.created),
          })
        }
      }
    } catch { /* skip */ }
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe — billing config (structured mismatches for translatable findings)
// ─────────────────────────────────────────────────────────────────────────────

export async function collectStripe(): Promise<NormalizedStripe> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { ok: false, error: 'STRIPE_SECRET_KEY not configured' }
  try {
    const priceEntries = Object.entries(process.env).filter(
      ([n, v]) => n.startsWith('STRIPE_PRICE_') && typeof v === 'string' && (v as string).startsWith('price_'),
    ) as [string, string][]

    const [pricesRes, hooksRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/prices?active=true&limit=100', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
      fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' }),
    ])
    if (!pricesRes.ok) return { ok: false, error: `Stripe prices HTTP ${pricesRes.status}` }

    const prices = await pricesRes.json()
    const liveIds = new Set<string>((prices.data || []).map((p: any) => String(p.id)))
    const liveMode = Boolean((prices.data || []).some((p: any) => p.livemode))

    const mismatches = priceEntries
      .filter(([, priceId]) => !liveIds.has(priceId))
      .map(([envName]) => ({ envName }))

    let webhooks: NormalizedStripe['webhooks'] = []
    if (hooksRes.ok) {
      const hooks = await hooksRes.json()
      webhooks = (hooks.data || []).map((h: any) => ({
        url: String(h.url || ''),
        status: String(h.status || 'unknown'),
        events: Array.isArray(h.enabled_events) ? h.enabled_events.length : 0,
        enabledEvents: Array.isArray(h.enabled_events) ? h.enabled_events.map((e: any) => String(e)) : undefined,
      }))
    }

    return { ok: true, liveMode, webhooks, mismatches }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Stripe collection failed' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase — reachability only (RLS/buckets not enumerated → evidence-required)
// ─────────────────────────────────────────────────────────────────────────────

export async function collectSupabase(): Promise<NormalizedSupabase> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { ok: false, error: 'Supabase credentials not configured' }
  try {
    const start = Date.now()
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: serviceKey }, cache: 'no-store' })
    const latencyMs = Date.now() - start
    if (!res.ok) return { ok: false, error: `Supabase health HTTP ${res.status}` }
    let projectHost: string | undefined
    try { projectHost = new URL(url).host } catch { projectHost = undefined }
    return { ok: true, projectHost, latencyMs }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Supabase collection failed' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel — env var scopes (names only, never values)
// ─────────────────────────────────────────────────────────────────────────────

export async function collectVercel(): Promise<NormalizedVercel> {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token || !projectId) return { ok: true, configured: false }
  try {
    const res = await listEnv(projectId, token, teamId)
    if (!res.ok || !Array.isArray(res.vars)) return { ok: false, configured: true, error: res.error || 'env list failed' }

    const byScope: Record<string, string[]> = {}
    for (const v of res.vars) {
      for (const target of v.target || []) {
        ;(byScope[target] = byScope[target] || []).push(v.key)
      }
    }
    const envScopes = Object.entries(byScope).map(([scope, names]) => ({ scope, names }))
    return { ok: true, configured: true, envScopes }
  } catch (err: any) {
    return { ok: false, configured: true, error: err?.message || 'Vercel collection failed' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub — default branch protection (best-effort; needs admin-scoped token)
// ─────────────────────────────────────────────────────────────────────────────

export async function collectGithub(): Promise<NormalizedGithub> {
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) return { ok: true }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'signalboost-audit' }
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${REPO}`, { headers, cache: 'no-store' })
    if (!repoRes.ok) return { ok: false, error: `GitHub repo HTTP ${repoRes.status}` }
    const repo = await repoRes.json()
    const defaultBranch = String(repo.default_branch || 'main')

    let branchProtection: NormalizedGithub['branchProtection'] = undefined
    const protRes = await fetch(`https://api.github.com/repos/${REPO}/branches/${encodeURIComponent(defaultBranch)}/protection`, { headers, cache: 'no-store' })
    if (protRes.status === 404) {
      branchProtection = null
    } else if (protRes.ok) {
      const prot = await protRes.json()
      branchProtection = {
        requiresReview: Boolean(prot.required_pull_request_reviews),
        enforced: Boolean(prot.enforce_admins?.enabled),
      }
    }

    return { ok: true, defaultBranch, branchProtection }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'GitHub collection failed' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Secrets — env inventory (metadata only) enriched with vault rotation data
// ─────────────────────────────────────────────────────────────────────────────

export async function collectSecrets(): Promise<NormalizedSecret[]> {
  const out: NormalizedSecret[] = []

  const rotationByName = new Map<string, string | undefined>()
  try {
    const vault = await getVaultSecrets()
    if (vault.ok && Array.isArray(vault.secrets)) {
      for (const s of vault.secrets) {
        if (s.secret_name) rotationByName.set(String(s.secret_name).toUpperCase(), s.last_rotated_at)
      }
    }
  } catch { /* vault optional */ }

  for (const [name, value] of Object.entries(process.env)) {
    if (!SECRETISH.test(name)) continue
    if (typeof value !== 'string' || value === '') continue
    const rotated = rotationByName.get(name.toUpperCase())
    out.push({
      name, provider: 'platform', environment: 'production', present: true,
      publicExposed: /^NEXT_PUBLIC_/i.test(name),
      rotationKnown: rotated !== undefined, lastRotatedAt: rotated,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider inventory + orchestrator
// ─────────────────────────────────────────────────────────────────────────────

function providerStatus(ok: boolean, configured = true): ConnectionStatus {
  if (!configured) return 'not_configured'
  return ok ? 'connected' : 'error'
}

export interface CollectOptions {
  identities?: boolean
  stripe?: boolean
  supabase?: boolean
  vercel?: boolean
  github?: boolean
  secrets?: boolean
}

export async function collectSnapshot(opts: CollectOptions = {}): Promise<AuditSnapshot> {
  const want = {
    identities: opts.identities !== false,
    stripe: opts.stripe !== false,
    supabase: opts.supabase !== false,
    vercel: opts.vercel !== false,
    github: opts.github !== false,
    secrets: opts.secrets !== false,
  }

  const [identities, stripe, supabase, vercel, github, secrets] = await Promise.all([
    want.identities ? collectIdentities() : Promise.resolve<NormalizedIdentity[]>([]),
    want.stripe ? collectStripe() : Promise.resolve<NormalizedStripe | undefined>(undefined),
    want.supabase ? collectSupabase() : Promise.resolve<NormalizedSupabase | undefined>(undefined),
    want.vercel ? collectVercel() : Promise.resolve<NormalizedVercel | undefined>(undefined),
    want.github ? collectGithub() : Promise.resolve<NormalizedGithub | undefined>(undefined),
    want.secrets ? collectSecrets() : Promise.resolve<NormalizedSecret[]>([]),
  ])

  const providers: NormalizedProvider[] = []
  if (stripe) providers.push({ id: 'stripe', status: providerStatus(stripe.ok), category: 'billing' })
  if (supabase) providers.push({ id: 'supabase', status: providerStatus(supabase.ok), category: 'database' })
  if (vercel) providers.push({ id: 'vercel', status: providerStatus(vercel.ok, vercel.configured), category: 'deployment' })
  if (github) providers.push({ id: 'github', status: providerStatus(github.ok), category: 'change-management' })

  return { capturedAt: new Date().toISOString(), providers, identities, stripe, supabase, vercel, github, secrets }
}
