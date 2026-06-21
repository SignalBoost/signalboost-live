// saas/lib/audit/findingsEngine.ts
//
// Deterministic findings engine for the Audit Center.
//
// PURE. No I/O, no API calls, no LLM. Collectors (next layer) fetch live data
// and normalize it into an AuditSnapshot; this file turns that snapshot into
// Finding[] using fixed rules. Same input → same output, every time. That
// reproducibility is what makes the audit defensible.
//
// Honesty contract: a rule emits a CONCRETE finding only when the snapshot
// actually carries the evidence. When a check is expected by customers but the
// provider APIs don't expose the data (MFA state, last-login, rotation age,
// offboarding status), the rule emits an `evidenceRequired` finding instead of
// fabricating a fact. Evidence-required findings never subtract from the score.

import type {
  Finding,
  FindingCategory,
  FindingSource,
  Severity,
  ConnectionStatus,
  IdentityKind,
} from './reportModel'
import { makeFindingId, STALE_ACCESS_DAYS, daysSince } from './reportModel'

// ─────────────────────────────────────────────────────────────────────────────
// Normalized snapshot — what collectors fill, what rules read
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedStripe {
  ok: boolean
  liveMode?: boolean
  tiers?: { name: string; priceId: string; amount: number; interval: string; mismatch?: boolean }[]
  webhooks?: { url: string; status: string; events: number; enabledEvents?: string[] }[]
  /** Human-readable mismatch strings already computed by the collector. */
  mismatches?: string[]
  error?: string
}

export interface NormalizedSupabase {
  ok: boolean
  projectHost?: string
  latencyMs?: number
  /** Present only if the collector could enumerate tables + RLS state. */
  tables?: { name: string; rlsEnabled: boolean }[]
  /** Present only if the collector could enumerate storage buckets. */
  publicBuckets?: string[]
  /** True only when the collector confirmed service-role usage in client code. */
  serviceRoleInClient?: boolean
  error?: string
}

export interface NormalizedVercel {
  ok: boolean
  configured: boolean
  /** Env var NAMES per scope (values never collected). */
  envScopes?: { scope: 'production' | 'preview' | 'development' | string; names: string[] }[]
  error?: string
}

export interface NormalizedGithub {
  ok: boolean
  defaultBranch?: string
  /** null = confirmed no protection; undefined = not checked (→ evidence required). */
  branchProtection?: { requiresReview: boolean; enforced: boolean } | null
  staleBranches?: { name: string; ageDays: number }[]
  openPRs?: number
  collaborators?: { login: string; role: string }[]
  error?: string
}

export interface NormalizedSecret {
  name: string
  provider: string
  environment?: 'production' | 'preview' | 'development' | 'unknown'
  present: boolean
  /** True when the var is a NEXT_PUBLIC_* / client-exposed name. */
  publicExposed?: boolean
  /** False when rotation age is not tracked (the common case). */
  rotationKnown?: boolean
  lastRotatedAt?: string
}

export interface NormalizedProvider {
  id: string
  status: ConnectionStatus
  category?: string
  connectedBy?: string
}

/**
 * One access principal as the provider reports it. Field absence is meaningful:
 *   mfaEnabled === undefined  → provider does not expose MFA state (→ unknown).
 *   lastActivity === undefined → no activity/login ever recorded for this run.
 * Sources today: hub_workspace_users (role, mfaEnabled, lastLogin, active),
 * AWS IAM users/access keys (lastUsed), vault secrets (last_accessed_at).
 */
export interface NormalizedIdentity {
  provider: string
  principal: string
  kind: IdentityKind
  role?: string
  /** owner/admin/root-equivalent. When omitted, inferred from `role`. */
  isPrivileged?: boolean
  /** undefined = provider doesn't expose MFA state. */
  mfaEnabled?: boolean
  active?: boolean
  /** ISO of last login/use. undefined = never recorded. */
  lastActivity?: string
  createdAt?: string
}

export interface AuditSnapshot {
  capturedAt?: string
  providers?: NormalizedProvider[]
  stripe?: NormalizedStripe
  supabase?: NormalizedSupabase
  vercel?: NormalizedVercel
  github?: NormalizedGithub
  secrets?: NormalizedSecret[]
  identities?: NormalizedIdentity[]
}

export interface FindingsResult {
  ok: boolean
  findings: Finding[]
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MkOpts {
  severity: Severity
  title: string
  detail: string
  recommendation: string
  derivedFrom: FindingSource
  businessImpact?: string
  evidenceRequired?: boolean
  suggestedFixTemplateId?: string
}

function mk(provider: string, category: FindingCategory, o: MkOpts): Finding {
  return {
    id: makeFindingId(provider, category, o.title),
    provider,
    category,
    severity: o.severity,
    title: o.title,
    detail: o.detail,
    recommendation: o.recommendation,
    businessImpact: o.businessImpact,
    derivedFrom: o.derivedFrom,
    evidenceRequired: !!o.evidenceRequired,
    status: 'open',
    suggestedFixTemplateId: o.suggestedFixTemplateId,
  }
}

const SECRETISH = /(secret|token|service[_-]?role|private[_-]?key|password|api[_-]?key|webhook[_-]?secret|signing)/i
// NEXT_PUBLIC_ names that are SUPPOSED to be public — do not flag these.
const SAFE_PUBLIC = /(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_STRIPE_PUBLISHABLE)/i

const CRITICAL_WEBHOOK_EVENTS = ['invoice.payment_failed', 'checkout.session.completed', 'customer.subscription.deleted']
const STALE_BRANCH_DAYS = 90
const MAX_PER_RULE = 25 // bound output so one noisy provider can't flood the report

// ─────────────────────────────────────────────────────────────────────────────
// Rules — Stripe
// ─────────────────────────────────────────────────────────────────────────────

function stripeRules(s?: NormalizedStripe): Finding[] {
  if (!s) return []
  const out: Finding[] = []
  if (s.ok === false) {
    out.push(mk('stripe', 'billing', {
      severity: 'medium', derivedFrom: 'stripe-api',
      title: 'Stripe configuration could not be read',
      detail: s.error || 'The Stripe API call failed during collection.',
      recommendation: 'Verify STRIPE_SECRET_KEY is set and has read access to prices and webhooks.',
      businessImpact: 'Billing posture is unknown until Stripe is reachable.',
    }))
    return out
  }

  for (const m of (s.mismatches || []).slice(0, MAX_PER_RULE)) {
    out.push(mk('stripe', 'billing', {
      severity: 'high', derivedFrom: 'stripe-api',
      title: 'Stripe price/env mismatch',
      detail: m,
      recommendation: 'Point the STRIPE_PRICE_* env var at an active price, or activate the referenced price.',
      businessImpact: 'Checkout can reference a price that no longer exists, breaking purchases.',
    }))
  }

  // Webhook coverage — only assert when we can actually see enabled events.
  const hooks = s.webhooks || []
  const anyEventsVisible = hooks.some(h => Array.isArray(h.enabledEvents))
  if (hooks.length === 0) {
    out.push(mk('stripe', 'billing', {
      severity: 'medium', derivedFrom: 'stripe-api',
      title: 'No Stripe webhook endpoint configured',
      detail: 'No webhook endpoints were returned by Stripe.',
      recommendation: 'Add a webhook endpoint covering payment and subscription lifecycle events.',
      businessImpact: 'Failed payments and cancellations may not propagate to the app.',
    }))
  } else if (anyEventsVisible) {
    const covered = new Set<string>()
    for (const h of hooks) for (const e of h.enabledEvents || []) covered.add(e)
    for (const ev of CRITICAL_WEBHOOK_EVENTS) {
      if (!covered.has(ev)) {
        out.push(mk('stripe', 'billing', {
          severity: 'medium', derivedFrom: 'stripe-api',
          title: `Stripe webhook missing "${ev}"`,
          detail: `No configured webhook endpoint subscribes to ${ev}.`,
          recommendation: `Add ${ev} to a webhook endpoint so the app reacts to this event.`,
          businessImpact: 'Important billing events are not delivered to the platform.',
        }))
      }
    }
  } else {
    out.push(mk('stripe', 'billing', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      title: 'Stripe webhook event coverage not verified',
      detail: 'Webhook endpoints exist but their subscribed event list was not collected.',
      recommendation: 'Confirm each endpoint subscribes to required payment/subscription events.',
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — Supabase / database
// ─────────────────────────────────────────────────────────────────────────────

function supabaseRules(s?: NormalizedSupabase): Finding[] {
  if (!s) return []
  const out: Finding[] = []
  if (s.ok === false) {
    out.push(mk('supabase', 'database', {
      severity: 'high', derivedFrom: 'supabase-api',
      title: 'Supabase health check failed',
      detail: s.error || 'The Supabase reachability check did not succeed.',
      recommendation: 'Verify the project URL and service-role key, and that the database is online.',
      businessImpact: 'Core data layer availability is unconfirmed.',
    }))
  }

  if (s.serviceRoleInClient === true) {
    out.push(mk('supabase', 'rls-bypass', {
      severity: 'critical', derivedFrom: 'supabase-api',
      title: 'Service-role key reachable from client code',
      detail: 'The service-role key (which bypasses RLS) was detected on a client-exposed path.',
      recommendation: 'Move all service-role usage strictly server-side and rotate the key immediately.',
      businessImpact: 'Full database access could be extracted by any visitor — severe data-breach risk.',
    }))
  }

  if (Array.isArray(s.tables)) {
    const noRls = s.tables.filter(t => !t.rlsEnabled).slice(0, MAX_PER_RULE)
    for (const t of noRls) {
      out.push(mk('supabase', 'rls-bypass', {
        severity: 'high', derivedFrom: 'supabase-api',
        title: `Table "${t.name}" has RLS disabled`,
        detail: `Row Level Security is not enabled on ${t.name}.`,
        recommendation: `Enable RLS on ${t.name} and add explicit access policies.`,
        businessImpact: 'Without RLS, a leaked anon key can read or write this table directly.',
      }))
    }
  } else {
    out.push(mk('supabase', 'database', {
      severity: 'high', derivedFrom: 'manual', evidenceRequired: true,
      title: 'RLS coverage not verified',
      detail: 'Table-level RLS state was not collected for this run.',
      recommendation: 'Enumerate tables and confirm RLS is enabled on every table holding user data.',
    }))
  }

  if (Array.isArray(s.publicBuckets) && s.publicBuckets.length > 0) {
    for (const b of s.publicBuckets.slice(0, MAX_PER_RULE)) {
      out.push(mk('supabase', 'database', {
        severity: 'high', derivedFrom: 'supabase-api',
        title: `Storage bucket "${b}" is public`,
        detail: `The "${b}" bucket allows public access.`,
        recommendation: 'Confirm public access is intended; otherwise make the bucket private with signed URLs.',
        businessImpact: 'Public buckets may expose user-uploaded or internal files.',
      }))
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — Vercel / deployment + env
// ─────────────────────────────────────────────────────────────────────────────

function vercelRules(v?: NormalizedVercel): Finding[] {
  if (!v) return []
  const out: Finding[] = []
  if (!v.configured) {
    out.push(mk('vercel', 'deployment', {
      severity: 'low', derivedFrom: 'vercel-api',
      title: 'Vercel not connected',
      detail: 'No Vercel token is configured, so deployment posture cannot be assessed.',
      recommendation: 'Connect Vercel to include deployment and env-var checks in the audit.',
    }))
    return out
  }

  const scopes = v.envScopes || []
  // Client-exposed names that look like real secrets (excluding known-safe public vars).
  for (const sc of scopes) {
    for (const name of sc.names || []) {
      if (/^NEXT_PUBLIC_/i.test(name) && SECRETISH.test(name) && !SAFE_PUBLIC.test(name)) {
        out.push(mk('vercel', 'secret', {
          severity: 'critical', derivedFrom: 'vercel-api',
          title: `Public env var looks sensitive: ${name}`,
          detail: `${name} is exposed to the browser (NEXT_PUBLIC_) but its name suggests a secret.`,
          recommendation: 'Rename to a server-only variable (drop NEXT_PUBLIC_) and rotate the value.',
          businessImpact: 'Secret values shipped to the browser are readable by anyone.',
        }))
      }
    }
  }

  // Prod vs preview name-set drift.
  const prod = scopes.find(s => s.scope === 'production')?.names || []
  const prev = scopes.find(s => s.scope === 'preview')?.names || []
  if (prod.length && prev.length) {
    const prodSet = new Set(prod)
    const onlyPreview = prev.filter(n => !prodSet.has(n))
    const prevSet = new Set(prev)
    const onlyProd = prod.filter(n => !prevSet.has(n))
    if (onlyProd.length || onlyPreview.length) {
      out.push(mk('vercel', 'config', {
        severity: 'medium', derivedFrom: 'vercel-api',
        title: 'Production and Preview env vars differ',
        detail: `Only in production: ${onlyProd.slice(0, 8).join(', ') || 'none'}. Only in preview: ${onlyPreview.slice(0, 8).join(', ') || 'none'}.`,
        recommendation: 'Reconcile env var names across scopes so preview reflects production.',
        businessImpact: 'Preview deploys may behave differently from production, masking bugs.',
      }))
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — GitHub / code change management
// ─────────────────────────────────────────────────────────────────────────────

function githubRules(g?: NormalizedGithub): Finding[] {
  if (!g) return []
  const out: Finding[] = []
  if (g.ok === false) {
    out.push(mk('github', 'change-management', {
      severity: 'medium', derivedFrom: 'github-api',
      title: 'GitHub could not be read',
      detail: g.error || 'The GitHub API call failed during collection.',
      recommendation: 'Verify the GitHub token and its repo scope.',
    }))
    return out
  }

  if (g.branchProtection === undefined) {
    out.push(mk('github', 'change-management', {
      severity: 'high', derivedFrom: 'manual', evidenceRequired: true,
      title: 'Branch protection not verified',
      detail: 'Branch protection state for the default branch was not collected.',
      recommendation: 'Confirm the default branch requires pull-request review before merge.',
    }))
  } else if (g.branchProtection === null || !g.branchProtection.requiresReview) {
    out.push(mk('github', 'change-management', {
      severity: 'high', derivedFrom: 'github-api',
      title: `Default branch "${g.defaultBranch || 'main'}" does not require PR review`,
      detail: 'Changes can be merged to the default branch without an approving review.',
      recommendation: 'Enable branch protection and require at least one approving review.',
      businessImpact: 'Production code can change without a second set of eyes.',
      suggestedFixTemplateId: 'github.enable-branch-protection',
    }))
  }

  const stale = (g.staleBranches || []).filter(b => b.ageDays >= STALE_BRANCH_DAYS)
  if (stale.length) {
    out.push(mk('github', 'change-management', {
      severity: 'low', derivedFrom: 'github-api',
      title: `${stale.length} stale branch(es) older than ${STALE_BRANCH_DAYS} days`,
      detail: `Stale branches: ${stale.slice(0, 10).map(b => b.name).join(', ')}${stale.length > 10 ? '…' : ''}.`,
      recommendation: 'Review and delete merged or abandoned branches.',
      businessImpact: 'Stale branches add confusion and may carry outdated config.',
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — Secrets inventory
// ─────────────────────────────────────────────────────────────────────────────

function secretRules(secrets?: NormalizedSecret[]): Finding[] {
  if (!Array.isArray(secrets)) return []
  const out: Finding[] = []
  let rotationUnknown = 0

  for (const s of secrets) {
    if (s.present && s.publicExposed && SECRETISH.test(s.name) && !SAFE_PUBLIC.test(s.name)) {
      out.push(mk(s.provider || 'platform', 'secret', {
        severity: 'critical', derivedFrom: 'env-inventory',
        title: `Client-exposed secret: ${s.name}`,
        detail: `${s.name} appears to be a secret but is exposed to the client.`,
        recommendation: 'Move server-side and rotate immediately.',
        businessImpact: 'A leaked production secret can be abused by anyone.',
      }))
    }
    if (s.present && s.rotationKnown === false) rotationUnknown++
  }

  if (rotationUnknown > 0) {
    out.push(mk('platform', 'secret', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      title: `Rotation age unknown for ${rotationUnknown} secret(s)`,
      detail: 'Provider APIs do not expose last-rotation dates for these credentials.',
      recommendation: 'Record rotation dates in the Key Vault and set a rotation policy.',
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — Provider inventory gaps
// ─────────────────────────────────────────────────────────────────────────────

function inventoryRules(providers?: NormalizedProvider[]): Finding[] {
  if (!Array.isArray(providers)) return []
  const out: Finding[] = []
  for (const p of providers) {
    if (p.status === 'error') {
      out.push(mk(p.id, 'inventory', {
        severity: 'medium', derivedFrom: 'hub-records',
        title: `Provider "${p.id}" is in an error state`,
        detail: `The Hub reports ${p.id} as errored.`,
        recommendation: `Re-check the ${p.id} connection and credentials.`,
      }))
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — Identity & Access (stale activity + privilege/MFA)
// ─────────────────────────────────────────────────────────────────────────────

const PRIVILEGED_ROLE = /(owner|admin|root)/i
const OWNER_ROLE = /(owner|root)/i

function sourceFor(provider: string): FindingSource {
  switch ((provider || '').toLowerCase()) {
    case 'stripe': return 'stripe-api'
    case 'supabase': return 'supabase-api'
    case 'vercel': return 'vercel-api'
    case 'github': return 'github-api'
    default: return 'hub-records'
  }
}

function isPrivileged(id: NormalizedIdentity): boolean {
  if (typeof id.isPrivileged === 'boolean') return id.isPrivileged
  return PRIVILEGED_ROLE.test(id.role || '')
}

/**
 * Access-metadata rules. No employment inference — only what the API exposes:
 *   1. Stale access: no activity within STALE_ACCESS_DAYS (or never used + aged).
 *   2. Privilege + MFA: privileged account with MFA confirmed disabled.
 * Where MFA state isn't exposed, we aggregate one evidence-required note rather
 * than asserting anything per account.
 */
function identityRules(identities?: NormalizedIdentity[]): Finding[] {
  if (!Array.isArray(identities) || identities.length === 0) return []
  const out: Finding[] = []
  let staleEmitted = 0
  let mfaUnknownPriv = 0

  for (const id of identities) {
    const priv = isPrivileged(id)
    const who = `${id.principal} (${id.provider})`

    // 1. Stale / never-used access.
    const seenDays = daysSince(id.lastActivity)
    if (seenDays !== undefined && seenDays >= STALE_ACCESS_DAYS) {
      if (staleEmitted++ < MAX_PER_RULE) {
        out.push(mk(id.provider, 'access', {
          severity: 'high', derivedFrom: sourceFor(id.provider),
          title: `Stale identity: ${who}`,
          detail: `No recorded activity for ${seenDays} days (threshold ${STALE_ACCESS_DAYS}).`,
          recommendation: 'Review whether this access is still needed; remove or rotate if not.',
          businessImpact: 'Unused credentials widen the attack surface with no benefit.',
        }))
      }
    } else if (id.lastActivity === undefined) {
      const ageDays = daysSince(id.createdAt)
      if (ageDays !== undefined && ageDays >= STALE_ACCESS_DAYS && staleEmitted++ < MAX_PER_RULE) {
        out.push(mk(id.provider, 'access', {
          severity: 'high', derivedFrom: sourceFor(id.provider),
          title: `Never-used identity: ${who}`,
          detail: `Created ${ageDays} days ago with no recorded login/use.`,
          recommendation: 'Confirm this principal is required; remove if it was never activated.',
          businessImpact: 'Dormant accounts are a common foothold for attackers.',
        }))
      }
    }

    // 2. Privilege without MFA — only when the provider actually reports MFA.
    if (priv) {
      if (id.mfaEnabled === false) {
        out.push(mk(id.provider, 'identity', {
          severity: OWNER_ROLE.test(id.role || '') ? 'critical' : 'high',
          derivedFrom: sourceFor(id.provider),
          title: `Privileged account without MFA: ${who}`,
          detail: `Role "${id.role || 'privileged'}" has admin-level access but MFA is disabled.`,
          recommendation: 'Require and enable MFA on this account immediately.',
          businessImpact: 'A single phished password grants full administrative control.',
        }))
      } else if (id.mfaEnabled === undefined) {
        mfaUnknownPriv++
      }
    }
  }

  // One aggregated note for providers that don't expose MFA state at all.
  if (mfaUnknownPriv > 0) {
    out.push(mk('platform', 'identity', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      title: `MFA state unavailable for ${mfaUnknownPriv} privileged identity(ies)`,
      detail: 'These providers do not expose per-account MFA status via their API.',
      recommendation: 'Confirm MFA is enforced and attach evidence for these accounts.',
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual-evidence baseline — honest stand-ins for non-derivable checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks customers expect that no provider REST API exposes. We surface them as
 * evidence-required so the Identity and Compliance reports are complete and
 * honest, without ever asserting an unverified fact.
 */
/**
 * Checks no provider REST API exposes at all. MFA and stale-access are NO LONGER
 * here — they're derived in identityRules() from live Hub/AWS/vault metadata.
 * Only truly non-derivable evidence (e.g. a tested backup restore) remains.
 */
function manualEvidenceBaseline(): Finding[] {
  return [
    mk('platform', 'audit-log', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      title: 'Backup recovery test not on record',
      detail: 'No evidence of a tested database backup/restore was collected.',
      recommendation: 'Perform a restore test and attach the result.',
    }),
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all rules against a normalized snapshot. Pure + never throws. Findings are
 * de-duplicated by id (stable hash), so re-running with the same data yields the
 * same set.
 */
export function runFindings(snapshot: AuditSnapshot, opts?: { includeManualBaseline?: boolean }): FindingsResult {
  try {
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, findings: [], error: 'Snapshot must be an object.' }
    }
    const all: Finding[] = [
      ...inventoryRules(snapshot.providers),
      ...identityRules(snapshot.identities),
      ...stripeRules(snapshot.stripe),
      ...supabaseRules(snapshot.supabase),
      ...vercelRules(snapshot.vercel),
      ...githubRules(snapshot.github),
      ...secretRules(snapshot.secrets),
    ]
    if (opts?.includeManualBaseline !== false) all.push(...manualEvidenceBaseline())

    const seen = new Set<string>()
    const findings: Finding[] = []
    for (const f of all) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      findings.push(f)
    }
    const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    findings.sort((a, b) => rank[a.severity] - rank[b.severity])
    return { ok: true, findings }
  } catch (err: any) {
    return { ok: false, findings: [], error: err?.message || 'Findings engine failed.' }
  }
}
