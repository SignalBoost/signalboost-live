// saas/lib/audit/findingsEngine.ts
//
// Deterministic findings engine. PURE — no I/O, no API calls, no LLM, no React.
// Collectors normalize live data into an AuditSnapshot; this turns it into
// Finding[] via fixed rules. Same input → same output.
//
// i18n-native: each finding carries a `messageKey` + `params` + an English
// `fallback`. The engine is NOT the source of final prose — the renderer
// resolves `t(messageKey + '.title', fallback.title)` and interpolates params.
//
// Honesty contract: a rule emits a CONCRETE finding only when the snapshot
// carries the evidence; otherwise it emits an `evidenceRequired` finding (never
// a fabricated fact), which does not subtract from the score.

import type {
  Finding,
  FindingText,
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
  /** Structured (not prose) so finding text stays translatable: the env var name that mismatched. */
  mismatches?: { envName: string }[]
  error?: string
}

export interface NormalizedSupabase {
  ok: boolean
  projectHost?: string
  latencyMs?: number
  tables?: { name: string; rlsEnabled: boolean }[]
  publicBuckets?: string[]
  serviceRoleInClient?: boolean
  error?: string
}

export interface NormalizedVercel {
  ok: boolean
  configured: boolean
  envScopes?: { scope: 'production' | 'preview' | 'development' | string; names: string[] }[]
  error?: string
}

export interface NormalizedGithub {
  ok: boolean
  defaultBranch?: string
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
  publicExposed?: boolean
  rotationKnown?: boolean
  lastRotatedAt?: string
}

export interface NormalizedProvider {
  id: string
  status: ConnectionStatus
  category?: string
  connectedBy?: string
}

export interface NormalizedIdentity {
  provider: string
  principal: string
  kind: IdentityKind
  role?: string
  isPrivileged?: boolean
  mfaEnabled?: boolean // undefined = provider doesn't expose MFA state
  active?: boolean
  lastActivity?: string // ISO; undefined = never recorded
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
// Builder
// ─────────────────────────────────────────────────────────────────────────────

interface MkOpts {
  severity: Severity
  messageKey: string
  params?: Record<string, string | number>
  fallback: FindingText
  derivedFrom: FindingSource
  evidenceRequired?: boolean
  suggestedFixTemplateId?: string
}

function mk(provider: string, category: FindingCategory, o: MkOpts): Finding {
  // Language-independent dedup basis: the message key + sorted params.
  const disc = o.params
    ? Object.keys(o.params).sort().map(k => `${k}=${o.params![k]}`).join('&')
    : ''
  return {
    id: makeFindingId(provider, category, `${o.messageKey}|${disc}`),
    provider,
    category,
    severity: o.severity,
    messageKey: o.messageKey,
    params: o.params,
    fallback: o.fallback,
    derivedFrom: o.derivedFrom,
    evidenceRequired: !!o.evidenceRequired,
    status: 'open',
    suggestedFixTemplateId: o.suggestedFixTemplateId,
  }
}

const SECRETISH = /(secret|token|service[_-]?role|private[_-]?key|password|api[_-]?key|webhook[_-]?secret|signing)/i
const SAFE_PUBLIC = /(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_STRIPE_PUBLISHABLE)/i
const CRITICAL_WEBHOOK_EVENTS = ['invoice.payment_failed', 'checkout.session.completed', 'customer.subscription.deleted']
const STALE_BRANCH_DAYS = 90
const MAX_PER_RULE = 25

// ─────────────────────────────────────────────────────────────────────────────
// Identity & Access
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

function identityRules(identities?: NormalizedIdentity[]): Finding[] {
  if (!Array.isArray(identities) || identities.length === 0) return []
  const out: Finding[] = []
  let staleEmitted = 0
  let mfaUnknownPriv = 0

  for (const id of identities) {
    const priv = isPrivileged(id)
    const who = `${id.principal} (${id.provider})`
    const seenDays = daysSince(id.lastActivity)

    if (seenDays !== undefined && seenDays >= STALE_ACCESS_DAYS) {
      if (staleEmitted++ < MAX_PER_RULE) {
        out.push(mk(id.provider, 'access', {
          severity: 'high', derivedFrom: sourceFor(id.provider),
          messageKey: 'audit.finding.staleIdentity',
          params: { principal: id.principal, provider: id.provider, days: seenDays, threshold: STALE_ACCESS_DAYS },
          fallback: {
            title: `Stale identity: ${who}`,
            detail: `No recorded activity for ${seenDays} days (threshold ${STALE_ACCESS_DAYS}).`,
            recommendation: 'Review whether this access is still needed; remove or rotate if not.',
            impact: 'Unused credentials widen the attack surface with no benefit.',
          },
        }))
      }
    } else if (id.lastActivity === undefined) {
      const ageDays = daysSince(id.createdAt)
      if (ageDays !== undefined && ageDays >= STALE_ACCESS_DAYS && staleEmitted++ < MAX_PER_RULE) {
        out.push(mk(id.provider, 'access', {
          severity: 'high', derivedFrom: sourceFor(id.provider),
          messageKey: 'audit.finding.neverUsedIdentity',
          params: { principal: id.principal, provider: id.provider, days: ageDays },
          fallback: {
            title: `Never-used identity: ${who}`,
            detail: `Created ${ageDays} days ago with no recorded login/use.`,
            recommendation: 'Confirm this principal is required; remove if it was never activated.',
            impact: 'Dormant accounts are a common foothold for attackers.',
          },
        }))
      }
    }

    if (priv) {
      if (id.mfaEnabled === false) {
        out.push(mk(id.provider, 'identity', {
          severity: OWNER_ROLE.test(id.role || '') ? 'critical' : 'high',
          derivedFrom: sourceFor(id.provider),
          messageKey: 'audit.finding.privilegedNoMfa',
          params: { principal: id.principal, provider: id.provider, role: id.role || 'privileged' },
          fallback: {
            title: `Privileged account without MFA: ${who}`,
            detail: `Role "${id.role || 'privileged'}" has admin-level access but MFA is disabled.`,
            recommendation: 'Require and enable MFA on this account immediately.',
            impact: 'A single phished password grants full administrative control.',
          },
        }))
      } else if (id.mfaEnabled === undefined) {
        mfaUnknownPriv++
      }
    }
  }

  if (mfaUnknownPriv > 0) {
    out.push(mk('platform', 'identity', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      messageKey: 'audit.finding.mfaStateUnavailable',
      params: { count: mfaUnknownPriv },
      fallback: {
        title: `MFA state unavailable for ${mfaUnknownPriv} privileged identity(ies)`,
        detail: 'These providers do not expose per-account MFA status via their API.',
        recommendation: 'Confirm MFA is enforced and attach evidence for these accounts.',
      },
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider inventory
// ─────────────────────────────────────────────────────────────────────────────

function inventoryRules(providers?: NormalizedProvider[]): Finding[] {
  if (!Array.isArray(providers)) return []
  const out: Finding[] = []
  for (const p of providers) {
    if (p.status === 'error') {
      out.push(mk(p.id, 'inventory', {
        severity: 'medium', derivedFrom: 'hub-records',
        messageKey: 'audit.finding.providerError',
        params: { provider: p.id },
        fallback: {
          title: `Provider "${p.id}" is in an error state`,
          detail: `The Hub reports ${p.id} as errored.`,
          recommendation: `Re-check the ${p.id} connection and credentials.`,
        },
      }))
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe
// ─────────────────────────────────────────────────────────────────────────────

function stripeRules(s?: NormalizedStripe): Finding[] {
  if (!s) return []
  const out: Finding[] = []
  if (s.ok === false) {
    out.push(mk('stripe', 'billing', {
      severity: 'medium', derivedFrom: 'stripe-api',
      messageKey: 'audit.finding.stripeReadFail',
      fallback: {
        title: 'Stripe configuration could not be read',
        detail: 'The Stripe API call failed during collection.',
        recommendation: 'Verify STRIPE_SECRET_KEY is set and can read prices and webhooks.',
        impact: 'Billing posture is unknown until Stripe is reachable.',
      },
    }))
    return out
  }

  for (const m of (s.mismatches || []).slice(0, MAX_PER_RULE)) {
    out.push(mk('stripe', 'billing', {
      severity: 'high', derivedFrom: 'stripe-api',
      messageKey: 'audit.finding.stripePriceMismatch',
      params: { name: m.envName },
      fallback: {
        title: 'Stripe price/env mismatch',
        detail: `${m.envName} points to a price that is not active in Stripe.`,
        recommendation: 'Point the env var at an active price, or activate the referenced price.',
        impact: 'Checkout can reference a price that no longer exists, breaking purchases.',
      },
    }))
  }

  const hooks = s.webhooks || []
  const anyEventsVisible = hooks.some(h => Array.isArray(h.enabledEvents))
  if (hooks.length === 0) {
    out.push(mk('stripe', 'billing', {
      severity: 'medium', derivedFrom: 'stripe-api',
      messageKey: 'audit.finding.stripeWebhookNone',
      fallback: {
        title: 'No Stripe webhook endpoint configured',
        detail: 'No webhook endpoints were returned by Stripe.',
        recommendation: 'Add a webhook endpoint covering payment and subscription lifecycle events.',
        impact: 'Failed payments and cancellations may not propagate to the app.',
      },
    }))
  } else if (anyEventsVisible) {
    const covered = new Set<string>()
    for (const h of hooks) for (const e of h.enabledEvents || []) covered.add(e)
    for (const ev of CRITICAL_WEBHOOK_EVENTS) {
      if (!covered.has(ev)) {
        out.push(mk('stripe', 'billing', {
          severity: 'medium', derivedFrom: 'stripe-api',
          messageKey: 'audit.finding.stripeWebhookMissingEvent',
          params: { event: ev },
          fallback: {
            title: `Stripe webhook missing "${ev}"`,
            detail: `No configured webhook endpoint subscribes to ${ev}.`,
            recommendation: `Add ${ev} to a webhook endpoint so the app reacts to this event.`,
            impact: 'Important billing events are not delivered to the platform.',
          },
        }))
      }
    }
  } else {
    out.push(mk('stripe', 'billing', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      messageKey: 'audit.finding.stripeWebhookUnverified',
      fallback: {
        title: 'Stripe webhook event coverage not verified',
        detail: 'Webhook endpoints exist but their subscribed event list was not collected.',
        recommendation: 'Confirm each endpoint subscribes to required payment/subscription events.',
      },
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase / database
// ─────────────────────────────────────────────────────────────────────────────

function supabaseRules(s?: NormalizedSupabase): Finding[] {
  if (!s) return []
  const out: Finding[] = []
  if (s.ok === false) {
    out.push(mk('supabase', 'database', {
      severity: 'high', derivedFrom: 'supabase-api',
      messageKey: 'audit.finding.supabaseHealthFail',
      fallback: {
        title: 'Supabase health check failed',
        detail: 'The Supabase reachability check did not succeed.',
        recommendation: 'Verify the project URL and service-role key, and that the database is online.',
        impact: 'Core data layer availability is unconfirmed.',
      },
    }))
  }

  if (s.serviceRoleInClient === true) {
    out.push(mk('supabase', 'rls-bypass', {
      severity: 'critical', derivedFrom: 'supabase-api',
      messageKey: 'audit.finding.serviceRoleInClient',
      fallback: {
        title: 'Service-role key reachable from client code',
        detail: 'The service-role key (which bypasses RLS) was detected on a client-exposed path.',
        recommendation: 'Move all service-role usage strictly server-side and rotate the key immediately.',
        impact: 'Full database access could be extracted by any visitor — severe data-breach risk.',
      },
    }))
  }

  if (Array.isArray(s.tables)) {
    const noRls = s.tables.filter(t => !t.rlsEnabled).slice(0, MAX_PER_RULE)
    for (const t of noRls) {
      out.push(mk('supabase', 'rls-bypass', {
        severity: 'high', derivedFrom: 'supabase-api',
        messageKey: 'audit.finding.rlsDisabled',
        params: { table: t.name },
        fallback: {
          title: `Table "${t.name}" has RLS disabled`,
          detail: `Row Level Security is not enabled on ${t.name}.`,
          recommendation: `Enable RLS on ${t.name} and add explicit access policies.`,
          impact: 'Without RLS, a leaked anon key can read or write this table directly.',
        },
      }))
    }
  } else {
    out.push(mk('supabase', 'database', {
      severity: 'high', derivedFrom: 'manual', evidenceRequired: true,
      messageKey: 'audit.finding.rlsUnverified',
      fallback: {
        title: 'RLS coverage not verified',
        detail: 'Table-level RLS state was not collected for this run.',
        recommendation: 'Enumerate tables and confirm RLS is enabled on every table holding user data.',
      },
    }))
  }

  if (Array.isArray(s.publicBuckets) && s.publicBuckets.length > 0) {
    for (const b of s.publicBuckets.slice(0, MAX_PER_RULE)) {
      out.push(mk('supabase', 'database', {
        severity: 'high', derivedFrom: 'supabase-api',
        messageKey: 'audit.finding.publicBucket',
        params: { bucket: b },
        fallback: {
          title: `Storage bucket "${b}" is public`,
          detail: `The "${b}" bucket allows public access.`,
          recommendation: 'Confirm public access is intended; otherwise make the bucket private with signed URLs.',
          impact: 'Public buckets may expose user-uploaded or internal files.',
        },
      }))
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel / deployment + env
// ─────────────────────────────────────────────────────────────────────────────

function vercelRules(v?: NormalizedVercel): Finding[] {
  if (!v) return []
  const out: Finding[] = []
  if (!v.configured) {
    out.push(mk('vercel', 'deployment', {
      severity: 'low', derivedFrom: 'vercel-api',
      messageKey: 'audit.finding.vercelNotConnected',
      fallback: {
        title: 'Vercel not connected',
        detail: 'No Vercel token is configured, so deployment posture cannot be assessed.',
        recommendation: 'Connect Vercel to include deployment and env-var checks in the audit.',
      },
    }))
    return out
  }

  const scopes = v.envScopes || []
  for (const sc of scopes) {
    for (const name of sc.names || []) {
      if (/^NEXT_PUBLIC_/i.test(name) && SECRETISH.test(name) && !SAFE_PUBLIC.test(name)) {
        out.push(mk('vercel', 'secret', {
          severity: 'critical', derivedFrom: 'vercel-api',
          messageKey: 'audit.finding.publicSensitiveEnv',
          params: { name },
          fallback: {
            title: `Public env var looks sensitive: ${name}`,
            detail: `${name} is exposed to the browser (NEXT_PUBLIC_) but its name suggests a secret.`,
            recommendation: 'Rename to a server-only variable (drop NEXT_PUBLIC_) and rotate the value.',
            impact: 'Secret values shipped to the browser are readable by anyone.',
          },
        }))
      }
    }
  }

  const prod = scopes.find(s => s.scope === 'production')?.names || []
  const prev = scopes.find(s => s.scope === 'preview')?.names || []
  if (prod.length && prev.length) {
    const prodSet = new Set(prod)
    const prevSet = new Set(prev)
    const onlyPreview = prev.filter(n => !prodSet.has(n))
    const onlyProd = prod.filter(n => !prevSet.has(n))
    if (onlyProd.length || onlyPreview.length) {
      out.push(mk('vercel', 'config', {
        severity: 'medium', derivedFrom: 'vercel-api',
        messageKey: 'audit.finding.envScopeDrift',
        params: { onlyProd: onlyProd.slice(0, 8).join(', ') || '—', onlyPreview: onlyPreview.slice(0, 8).join(', ') || '—' },
        fallback: {
          title: 'Production and Preview env vars differ',
          detail: `Only in production: ${onlyProd.slice(0, 8).join(', ') || 'none'}. Only in preview: ${onlyPreview.slice(0, 8).join(', ') || 'none'}.`,
          recommendation: 'Reconcile env var names across scopes so preview reflects production.',
          impact: 'Preview deploys may behave differently from production, masking bugs.',
        },
      }))
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub / change management
// ─────────────────────────────────────────────────────────────────────────────

function githubRules(g?: NormalizedGithub): Finding[] {
  if (!g) return []
  const out: Finding[] = []
  if (g.ok === false) {
    out.push(mk('github', 'change-management', {
      severity: 'medium', derivedFrom: 'github-api',
      messageKey: 'audit.finding.githubReadFail',
      fallback: {
        title: 'GitHub could not be read',
        detail: 'The GitHub API call failed during collection.',
        recommendation: 'Verify the GitHub token and its repo scope.',
      },
    }))
    return out
  }

  if (g.branchProtection === undefined) {
    out.push(mk('github', 'change-management', {
      severity: 'high', derivedFrom: 'manual', evidenceRequired: true,
      messageKey: 'audit.finding.branchProtectionUnverified',
      fallback: {
        title: 'Branch protection not verified',
        detail: 'Branch protection state for the default branch was not collected.',
        recommendation: 'Confirm the default branch requires pull-request review before merge.',
      },
    }))
  } else if (g.branchProtection === null || !g.branchProtection.requiresReview) {
    const branch = g.defaultBranch || 'main'
    out.push(mk('github', 'change-management', {
      severity: 'high', derivedFrom: 'github-api',
      messageKey: 'audit.finding.branchProtectionMissing',
      params: { branch },
      fallback: {
        title: `Default branch "${branch}" does not require PR review`,
        detail: 'Changes can be merged to the default branch without an approving review.',
        recommendation: 'Enable branch protection and require at least one approving review.',
        impact: 'Production code can change without a second set of eyes.',
      },
      suggestedFixTemplateId: 'github.enable-branch-protection',
    }))
  }

  const stale = (g.staleBranches || []).filter(b => b.ageDays >= STALE_BRANCH_DAYS)
  if (stale.length) {
    out.push(mk('github', 'change-management', {
      severity: 'low', derivedFrom: 'github-api',
      messageKey: 'audit.finding.staleBranches',
      params: { count: stale.length, days: STALE_BRANCH_DAYS, names: stale.slice(0, 10).map(b => b.name).join(', ') },
      fallback: {
        title: `${stale.length} stale branch(es) older than ${STALE_BRANCH_DAYS} days`,
        detail: `Stale branches: ${stale.slice(0, 10).map(b => b.name).join(', ')}.`,
        recommendation: 'Review and delete merged or abandoned branches.',
        impact: 'Stale branches add confusion and may carry outdated config.',
      },
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Secrets inventory
// ─────────────────────────────────────────────────────────────────────────────

function secretRules(secrets?: NormalizedSecret[]): Finding[] {
  if (!Array.isArray(secrets)) return []
  const out: Finding[] = []
  let rotationUnknown = 0

  for (const s of secrets) {
    if (s.present && s.publicExposed && SECRETISH.test(s.name) && !SAFE_PUBLIC.test(s.name)) {
      out.push(mk(s.provider || 'platform', 'secret', {
        severity: 'critical', derivedFrom: 'env-inventory',
        messageKey: 'audit.finding.clientExposedSecret',
        params: { name: s.name, provider: s.provider || 'platform' },
        fallback: {
          title: `Client-exposed secret: ${s.name}`,
          detail: `${s.name} appears to be a secret but is exposed to the client.`,
          recommendation: 'Move server-side and rotate immediately.',
          impact: 'A leaked production secret can be abused by anyone.',
        },
      }))
    }
    if (s.present && s.rotationKnown === false) rotationUnknown++
  }

  if (rotationUnknown > 0) {
    out.push(mk('platform', 'secret', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      messageKey: 'audit.finding.rotationUnknown',
      params: { count: rotationUnknown },
      fallback: {
        title: `Rotation age unknown for ${rotationUnknown} secret(s)`,
        detail: 'Provider APIs do not expose last-rotation dates for these credentials.',
        recommendation: 'Record rotation dates in the Key Vault and set a rotation policy.',
      },
    }))
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual-evidence baseline — only genuinely non-derivable checks
// ─────────────────────────────────────────────────────────────────────────────

function manualEvidenceBaseline(): Finding[] {
  return [
    mk('platform', 'audit-log', {
      severity: 'low', derivedFrom: 'manual', evidenceRequired: true,
      messageKey: 'audit.finding.backupTestMissing',
      fallback: {
        title: 'Backup recovery test not on record',
        detail: 'No evidence of a tested database backup/restore was collected.',
        recommendation: 'Perform a restore test and attach the result.',
      },
    }),
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

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
