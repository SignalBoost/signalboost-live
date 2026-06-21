// saas/lib/audit/scanThrottle.ts
// ─────────────────────────────────────────────────────────────────────────────
// Audit-scan throttle policy (MVP: hard block at the monthly cap).
//
//   • Free workspaces:  FREE_MONTHLY_SCAN_CAP deep audit scans / calendar month.
//   • Paid workspaces:  PRO_MONTHLY_SCAN_CAP  scans / calendar month.
//   • Owner / privileged: EXEMPT (no cap).
//
// The Pro cap defaults to 15 (the example value). To change either cap, edit the
// single constant below — nothing else needs to move.
//
// Counting is per workspace (keyed by the user who owns the scan, audit_runs.
// created_by) over the current UTC calendar month, excluding failed runs so a
// transient failure never burns a workspace's allowance.
//
// Plan is read from the `subscriptions` table (same source as lib/credits.ts).
// All results are flat { ... } objects (the repo's tsconfig is non-strict, so
// discriminated unions don't narrow) — callers check the boolean fields.
// ─────────────────────────────────────────────────────────────────────────────

// ── Caps (the one place to change the numbers) ──────────────────────────────
export const FREE_MONTHLY_SCAN_CAP = 1
export const PRO_MONTHLY_SCAN_CAP = 15

// ── Pre-call size ceiling: hard upper bound on files scanned per run, so a
//    single scan can never blow up model cost regardless of what's requested.
export const MAX_FILES_PER_SCAN = 40
const DEFAULT_FILES_PER_SCAN = 6

export type AuditTier = 'free' | 'pro'

// Internal DB plan names that count as a paid ("Pro") audit workspace. Mirrors
// the naming used elsewhere (outreach gating, credits): legacy 'pro'/'business'
// plus the unified 'launch'/'growth'/'command'.
const PAID_PLANS = new Set(['pro', 'business', 'launch', 'growth', 'command'])

export function auditTierForPlan(plan: string | null | undefined): AuditTier {
  const p = String(plan || '').toLowerCase().trim()
  return PAID_PLANS.has(p) ? 'pro' : 'free'
}

export function capForTier(tier: AuditTier): number {
  return tier === 'pro' ? PRO_MONTHLY_SCAN_CAP : FREE_MONTHLY_SCAN_CAP
}

/**
 * Pre-call size check. Clamp a requested file count into [1, MAX_FILES_PER_SCAN].
 * Never throws; always returns a safe, cost-bounded integer.
 */
export function clampScanSize(requested: unknown): number {
  const n =
    typeof requested === 'number' && Number.isFinite(requested)
      ? Math.floor(requested)
      : DEFAULT_FILES_PER_SCAN
  if (n < 1) return 1
  return Math.min(n, MAX_FILES_PER_SCAN)
}

function monthStartUtcIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString()
}

/** Read a workspace's plan from `subscriptions`. Defaults to 'free' on miss. */
export async function readWorkspacePlan(admin: any, userId: string): Promise<string> {
  try {
    const { data } = await admin
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle()
    return String(data?.plan || 'free')
  } catch {
    return 'free'
  }
}

/** Count this month's non-failed scans for a workspace. */
export async function countScansThisMonth(admin: any, userId: string): Promise<number> {
  try {
    const { count } = await admin
      .from('audit_runs')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .neq('status', 'failed')
      .gte('created_at', monthStartUtcIso())
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

export type ScanQuota = {
  ok: boolean        // true ⇒ a scan is permitted right now
  exempt: boolean    // true ⇒ owner / privileged, no cap applied
  tier: AuditTier
  cap: number
  used: number
  remaining: number
  code?: string      // 'scan_quota_exceeded' when ok === false
}

/**
 * Decide whether a workspace may run another scan this month. Owner/privileged
 * callers are exempt (unlimited). Reads plan + usage for everyone else.
 */
export async function checkScanQuota(
  admin: any,
  opts: { userId: string; isOwner: boolean },
): Promise<ScanQuota> {
  if (opts.isOwner) {
    return {
      ok: true, exempt: true, tier: 'pro',
      cap: PRO_MONTHLY_SCAN_CAP, used: 0, remaining: PRO_MONTHLY_SCAN_CAP,
    }
  }
  const plan = await readWorkspacePlan(admin, opts.userId)
  const tier = auditTierForPlan(plan)
  const cap = capForTier(tier)
  const used = await countScansThisMonth(admin, opts.userId)
  const remaining = Math.max(0, cap - used)
  const ok = used < cap
  return {
    ok, exempt: false, tier, cap, used, remaining,
    code: ok ? undefined : 'scan_quota_exceeded',
  }
}
