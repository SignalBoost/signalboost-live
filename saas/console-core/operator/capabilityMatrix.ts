// saas/console-core/operator/capabilityMatrix.ts
//
// MODULE 3 — PROVIDER CAPABILITY MATRIX (SignalBoost AI Operator)
//
// The truth table the engine MUST consult before executing any template:
// idempotency, rollback feasibility, retry rules, rate-limit sensitivity, auth
// model, destructive vs safe actions, and provider quirks.
//
// Doctrine compliance ("never assume provider behavior"): the provider QUIRKS
// below are transcribed verbatim from Module 3 §10. Attribute values are set
// CONSERVATIVELY (no idempotency, no rollback, no retry) unless the quirk text
// directly states otherwise. Any provider not declared here resolves to the
// fail-closed DEFAULT_CAPABILITY — the engine will not grant retry/rollback it
// cannot justify.

export type AuthModel = 'api_key' | 'token' | 'service_role' | 'oauth'

export interface ProviderCapability {
  providerId: string
  idempotent: boolean
  rollbackPossible: boolean
  retryOnFailure: boolean
  rateLimitSensitive: boolean
  authModel: AuthModel
  /** Action ids / patterns known to be irreversible or state-mutating. */
  destructiveActions: string[]
  /** Action ids / patterns known to be read-only and safe to auto-run. */
  safeActions: string[]
  /** Verbatim quirks from Module 3 §10 — never paraphrased away. */
  providerQuirks: string[]
  notes: string
}

// ── Declared matrix (only providers the doctrine specifies) ───────────────────
export const CAPABILITY_MATRIX: Record<string, ProviderCapability> = {
  stripe: {
    providerId: 'stripe',
    idempotent: false,         // conservative: avoid duplicate charges/subscriptions
    rollbackPossible: false,
    retryOnFailure: false,
    rateLimitSensitive: true,
    authModel: 'api_key',
    destructiveActions: ['delete_product', 'archive_product'],
    safeActions: ['list_prices', 'list_products', 'get_account', 'list_webhooks'],
    providerQuirks: [
      'prices cannot be edited; must create new ones',
      'products can be archived but not fully deleted',
    ],
    notes: 'Stripe writes are not safe to blindly retry without idempotency keys.',
  },
  supabase: {
    providerId: 'supabase',
    idempotent: false,         // §10: "writes are not idempotent"
    rollbackPossible: false,
    retryOnFailure: false,     // follows from non-idempotent writes (§3)
    rateLimitSensitive: true,
    authModel: 'service_role', // §10: "service role key bypasses RLS"
    destructiveActions: ['delete_row', 'delete_rows', 'drop_table', 'delete_user'],
    safeActions: ['list_tables', 'list_rows', 'list_users', 'list_buckets'],
    providerQuirks: [
      'service role key bypasses RLS',
      'writes are not idempotent',
    ],
    notes: 'Service-role access is elevated; never expose or log the key.',
  },
  vercel: {
    providerId: 'vercel',
    idempotent: false,
    rollbackPossible: false,
    retryOnFailure: false,
    rateLimitSensitive: true,
    authModel: 'token',
    destructiveActions: ['overwrite_env', 'delete_env', 'delete_project'],
    safeActions: ['list_env', 'list_projects', 'list_deployments'],
    providerQuirks: [
      'env var updates require redeploy',
      'overwriting env vars is destructive',
    ],
    notes: 'Env changes do not take effect until a redeploy occurs.',
  },
  cloudflare: {
    providerId: 'cloudflare',
    idempotent: false,
    rollbackPossible: false,    // §10: "no rollback for DNS deletions"
    retryOnFailure: false,
    rateLimitSensitive: true,
    authModel: 'token',
    destructiveActions: ['delete_dns_record', 'delete_zone'],
    safeActions: ['list_dns_records', 'list_zones'],
    providerQuirks: [
      'DNS changes propagate instantly',
      'no rollback for DNS deletions',
    ],
    notes: 'DNS deletions are immediate and irreversible.',
  },
  github: {
    providerId: 'github',
    idempotent: false,          // provider-level conservative; PR creation noted below
    rollbackPossible: false,
    retryOnFailure: false,
    rateLimitSensitive: true,
    authModel: 'token',
    destructiveActions: ['delete_branch', 'delete_repo', 'force_push'],
    safeActions: ['list_repos', 'read_file', 'list_branches', 'list_prs'],
    providerQuirks: [
      'PR creation is idempotent',
      'branch deletion is destructive',
    ],
    notes: 'Branch/repo deletion is irreversible; PR creation can be safely repeated.',
  },
}

// ── Fail-closed default for any UNDECLARED provider ────────────────────────────
export const DEFAULT_CAPABILITY: Omit<ProviderCapability, 'providerId'> = {
  idempotent: false,
  rollbackPossible: false,
  retryOnFailure: false,
  rateLimitSensitive: true,
  authModel: 'api_key',
  destructiveActions: [],
  safeActions: [],
  providerQuirks: [],
  notes: 'Capabilities not declared — treated conservatively (no idempotency, no rollback, no retry).',
}

export function getCapability(providerId: string): { cap: ProviderCapability; known: boolean } {
  const declared = CAPABILITY_MATRIX[providerId]
  if (declared) return { cap: declared, known: true }
  return { cap: { providerId, ...DEFAULT_CAPABILITY }, known: false }
}

// ── Fail-safe action classification ───────────────────────────────────────────
// In addition to the declared lists, a conservative keyword heuristic flags likely
// destructive actions (erring toward caution is doctrine-safe; erring toward
// "auto-run" is not). Read-only verbs auto-run only when clearly safe.
const DESTRUCTIVE_HINTS = ['delete', 'remove', 'disable', 'overwrite', 'drop', 'destroy', 'revoke', 'purge', 'force']
const SAFE_HINTS = ['list', 'get', 'fetch', 'read', 'view', 'status', 'describe', 'show']

function matchesAny(actionId: string, patterns: string[]): boolean {
  const a = actionId.toLowerCase()
  return patterns.some(p => a === p.toLowerCase() || a.includes(p.toLowerCase()))
}

export function isDestructive(cap: ProviderCapability, actionId: string): boolean {
  if (matchesAny(actionId, cap.destructiveActions)) return true
  return matchesAny(actionId, DESTRUCTIVE_HINTS)
}

export function isSafe(cap: ProviderCapability, actionId: string): boolean {
  if (isDestructive(cap, actionId)) return false
  if (matchesAny(actionId, cap.safeActions)) return true
  return matchesAny(actionId, SAFE_HINTS)
}

/** §3: a non-idempotent action must NEVER be retried. */
export function canRetry(cap: ProviderCapability): boolean {
  return cap.retryOnFailure && cap.idempotent
}

// ── Pre-execution consultation (Module 3 §11) ─────────────────────────────────
export interface CapabilityVerdict {
  ok: boolean
  known: boolean
  retryable: boolean
  destructive: boolean
  requiresExplicitApproval: boolean
  rollbackPossible: boolean
  rollbackWarning: string | null
  authModel: AuthModel
  quirks: string[]
  blockers: string[]
  warnings: string[]
}

/**
 * Consult the matrix before executing. Returns a structured verdict the engine
 * (Module 7) and Safety layer (Module 6) act on. This never executes anything.
 */
export function preExecutionCheck(providerId: string, actionId: string): CapabilityVerdict {
  const { cap, known } = getCapability(providerId)
  const destructive = isDestructive(cap, actionId)
  const blockers: string[] = []
  const warnings: string[] = []

  if (!known) {
    warnings.push(`Provider "${providerId}" has no declared capabilities — treated conservatively.`)
  }
  if (cap.rateLimitSensitive) {
    warnings.push('Provider is rate-limit sensitive; avoid rapid retries.')
  }

  let rollbackWarning: string | null = null
  if (destructive && !cap.rollbackPossible) {
    rollbackWarning = 'Destructive action with no rollback — requires explicit approval and an irreversibility warning.'
    warnings.push(rollbackWarning)
  }

  return {
    ok: blockers.length === 0,
    known,
    retryable: canRetry(cap),
    destructive,
    requiresExplicitApproval: destructive, // §8: destructive actions never auto-run
    rollbackPossible: cap.rollbackPossible,
    rollbackWarning,
    authModel: cap.authModel,
    quirks: cap.providerQuirks,
    blockers,
    warnings,
  }
}
