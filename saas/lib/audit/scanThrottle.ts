// saas/lib/audit/scanThrottle.ts
// ─────────────────────────────────────────────────────────────────────────────
// Audit-scan throttle policy — canonical, aligned 1:1 with the pricing page.
//
// Entitlement source of truth: the AUDIT subscription written by the Stripe
// webhook — `subscriptions.audit_plan` (the tier) + `subscriptions.audit_status`.
// This is DELIBERATELY NOT `subscriptions.plan` (that is the website/SaaS plan,
// a different product). No active audit subscription ⇒ the Free/Demo tier.
//
// Per-tier rules (must match auditPricingCopy.ts / the pricing page exactly):
//
//   tier        scans            window     files/scan   patch generation
//   ──────────  ───────────────  ─────────  ───────────  ────────────────
//   free        1                LIFETIME   10           DISABLED
//   starter     20               month      20           DISABLED
//   growth      100              month      40           DISABLED
//   pro         300              month      60           ENABLED
//   enterprise  unlimited        —          unlimited    ENABLED
//
// Owner / privileged callers are exempt (treated as enterprise: unlimited, patch
// on). All results are flat objects (the repo tsconfig is non-strict, so
// discriminated unions don't narrow) — callers read the boolean fields.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditTier = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise'

export type ScanWindow = 'month' | 'lifetime'

export type TierRule = {
  scanCap: number | null   // scans permitted per window; null = unlimited
  window: ScanWindow
  maxFiles: number | null  // hard files-per-scan ceiling; null = unlimited
  patch: boolean           // AI patch generation allowed?
}

// THE one place that defines tier economics. Change here, everywhere follows.
export const TIER_RULES: Record<AuditTier, TierRule> = {
  free:       { scanCap: 1,    window: 'lifetime', maxFiles: 10,   patch: false },
  starter:    { scanCap: 20,   window: 'month',    maxFiles: 20,   patch: false },
  growth:     { scanCap: 100,  window: 'month',    maxFiles: 40,   patch: false },
  pro:        { scanCap: 300,  window: 'month',    maxFiles: 60,   patch: true  },
  enterprise: { scanCap: null, window: 'month',    maxFiles: null, patch: true  },
}

// Even "unlimited" files gets a hard upper bound so a single run can never blow
// up model cost. Generous, but finite.
export const UNLIMITED_FILE_CEILING = 500
const DEFAULT_FILES_PER_SCAN = 6

const PAID_TIERS: AuditTier[] = ['starter', 'growth', 'pro', 'enterprise']

/**
 * Resolve the audit tier from the webhook-written entitlement. Falls back to
 * 'free' unless there is an ACTIVE audit subscription on a recognized tier.
 */
export function normalizeTier(
  auditPlan: string | null | undefined,
  auditStatus?: string | null,
): AuditTier {
  const p = String(auditPlan || '').toLowerCase().trim()
  const status = String(auditStatus ?? 'active').toLowerCase().trim()
  const active = status === 'active' || status === 'trialing'
  if (active && (PAID_TIERS as string[]).includes(p)) return p as AuditTier
  return 'free'
}

export function patchEnabledForTier(tier: AuditTier): boolean {
  return TIER_RULES[tier].patch
}

export function maxFilesForTier(tier: AuditTier): number {
  const m = TIER_RULES[tier].maxFiles
  return m == null ? UNLIMITED_FILE_CEILING : m
}

/**
 * Pre-call size check — tier-aware. Clamp a requested file count into
 * [1, tier ceiling]. Never throws; always returns a safe, cost-bounded integer.
 */
export function clampScanSize(requested: unknown, tier: AuditTier): number {
  const ceiling = maxFilesForTier(tier)
  const n =
    typeof requested === 'number' && Number.isFinite(requested)
      ? Math.floor(requested)
      : DEFAULT_FILES_PER_SCAN
  if (n < 1) return 1
  return Math.min(n, ceiling)
}

function monthStartUtcIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString()
}

/**
 * Read a workspace's audit tier from the webhook-written entitlement on
 * `subscriptions` (audit_plan + audit_status). Defaults to 'free' on any miss.
 */
export async function readAuditTier(admin: any, userId: string): Promise<AuditTier> {
  try {
    const { data } = await admin
      .from('subscriptions')
      .select('audit_plan, audit_status')
      .eq('user_id', userId)
      .maybeSingle()
    return normalizeTier(data?.audit_plan, data?.audit_status)
  } catch {
    return 'free'
  }
}

/**
 * Count scans for a workspace within the tier's window. 'lifetime' counts every
 * non-failed run ever (Free/Demo); 'month' counts the current UTC calendar month.
 */
export async function countScans(
  admin: any,
  userId: string,
  window: ScanWindow,
): Promise<number> {
  try {
    let q = admin
      .from('audit_runs')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .neq('status', 'failed')
    if (window === 'month') q = q.gte('created_at', monthStartUtcIso())
    const { count } = await q
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

export type ScanQuota = {
  ok: boolean              // true ⇒ a scan is permitted right now
  exempt: boolean          // true ⇒ owner / privileged, no cap applied
  tier: AuditTier
  window: ScanWindow
  cap: number | null       // null ⇒ unlimited
  used: number
  remaining: number | null // null ⇒ unlimited
  patch: boolean           // whether this tier may generate patches
  code?: string            // 'scan_quota_exceeded' when ok === false
}

/**
 * Decide whether a workspace may run another scan. Owner/privileged callers are
 * exempt (unlimited, patch on). Everyone else is resolved from their live audit
 * tier entitlement and counted within that tier's window.
 */
export async function checkScanQuota(
  admin: any,
  opts: { userId: string; isOwner: boolean },
): Promise<ScanQuota> {
  if (opts.isOwner) {
    return {
      ok: true, exempt: true, tier: 'enterprise', window: 'month',
      cap: null, used: 0, remaining: null, patch: true,
    }
  }

  const tier = await readAuditTier(admin, opts.userId)
  const rule = TIER_RULES[tier]

  // Unlimited tier (enterprise): never blocked on count.
  if (rule.scanCap == null) {
    return {
      ok: true, exempt: false, tier, window: rule.window,
      cap: null, used: 0, remaining: null, patch: rule.patch,
    }
  }

  const used = await countScans(admin, opts.userId, rule.window)
  const remaining = Math.max(0, rule.scanCap - used)
  const ok = used < rule.scanCap
  return {
    ok, exempt: false, tier, window: rule.window,
    cap: rule.scanCap, used, remaining, patch: rule.patch,
    code: ok ? undefined : 'scan_quota_exceeded',
  }
}
