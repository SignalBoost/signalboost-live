// saas/portable-license/enforce.ts
//
// The gate a portable calls before it does anything a buyer paid for.
//
// Two decisions are baked in here and they are the whole design:
//
// 1. Hiding a navigation link is not enforcement. The gate is called at the
//    point of execution, so an entitlement failure blocks the work itself no
//    matter which route, script or scheduled job reached it.
//
// 2. It degrades rather than bricks. Reading state and emitting audit records
//    stay available when a licence lapses; only executing and dispatching stop.
//    A portable that repairs infrastructure must not become the cause of an
//    outage because a renewal was late — and a buyer who cannot read their own
//    incident history after expiry has been taken hostage, not licensed.

import {
  EntitlementError,
  type EntitlementGateConfig,
  type EntitlementVerdict,
  type PortableActionClass,
} from './types.ts';
import { verifyLicense } from './verify.ts';

const DEFAULT_ALWAYS_ALLOWED: PortableActionClass[] = ['read', 'observe'];

/** Milliseconds a verdict is reused before the token is re-verified. */
const VERDICT_TTL_MS = 60_000;

export interface EntitlementCheck {
  allowed: boolean;
  verdict: EntitlementVerdict;
  /** Why it was refused. Empty string when allowed. */
  reason: string;
}

export interface EntitlementGate {
  /** Current verdict. Cached briefly so a hot path is not re-verifying constantly. */
  status(): Promise<EntitlementVerdict>;
  /**
   * Throws EntitlementError unless the action is permitted. Call this
   * immediately before the side effect, not at the edge of the process.
   */
  assertEntitled(action: string, actionClass: PortableActionClass, feature?: string): Promise<void>;
  /**
   * Non-throwing form for call sites that need to branch rather than fail.
   *
   * The result is a FLAT shape, not a discriminated union, and `reason` is
   * always present — empty when the call is allowed. This repository compiles
   * with strictNullChecks off, where narrowing a union on a boolean discriminant
   * does not work, so a union here type-errors at every consumer.
   */
  check(action: string, actionClass: PortableActionClass, feature?: string): Promise<EntitlementCheck>;
  /** True if the licence names this feature. False when unlicensed. */
  hasFeature(feature: string): Promise<boolean>;
  /** A short, safe line for logs, banners and audit records. Never contains the token. */
  describe(): Promise<string>;
  /** Drops the cached verdict. Call after the buyer installs a new token. */
  invalidate(): void;
}

export function createEntitlementGate(config: EntitlementGateConfig): EntitlementGate {
  if (!config.productId) throw new Error('createEntitlementGate: productId is required.');
  if (!config.issuer) throw new Error('createEntitlementGate: issuer is required.');
  if (!Array.isArray(config.publicKeysPem) || config.publicKeysPem.length === 0) {
    throw new Error('createEntitlementGate: at least one issuer public key is required.');
  }

  const alwaysAllowed = new Set<PortableActionClass>(config.alwaysAllowed ?? DEFAULT_ALWAYS_ALLOWED);

  let cached: { verdict: EntitlementVerdict; atMs: number } | null = null;
  let inFlight: Promise<EntitlementVerdict> | null = null;

  const nowMs = () => (config.clock ? config.clock.now().getTime() : Date.now());

  async function status(): Promise<EntitlementVerdict> {
    if (cached && nowMs() - cached.atMs < VERDICT_TTL_MS) return cached.verdict;
    if (inFlight) return inFlight;
    inFlight = verifyLicense({
      token: config.token,
      productId: config.productId,
      issuer: config.issuer,
      publicKeysPem: config.publicKeysPem,
      revocation: config.revocation,
      clock: config.clock,
    })
      .then((verdict) => {
        cached = { verdict, atMs: nowMs() };
        return verdict;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function check(
    action: string,
    actionClass: PortableActionClass,
    feature?: string,
  ): Promise<EntitlementCheck> {
    const verdict = await status();

    if (alwaysAllowed.has(actionClass)) {
      return { allowed: true, verdict, reason: '' };
    }
    if (!verdict.entitled) {
      return { allowed: false, verdict, reason: verdict.reason };
    }
    if (feature && !(verdict.claims?.features ?? []).includes(feature)) {
      return {
        allowed: false,
        verdict,
        reason: `This deployment's ${verdict.claims?.edition ?? 'current'} licence does not include "${feature}".`,
      };
    }
    return { allowed: true, verdict, reason: '' };
  }

  async function assertEntitled(action: string, actionClass: PortableActionClass, feature?: string) {
    const result = await check(action, actionClass, feature);
    if (result.allowed) return;
    throw new EntitlementError({
      message: `"${action}" was not executed. ${result.reason}`,
      state: result.verdict.state,
      action,
      actionClass,
      licenseId: result.verdict.claims?.licenseId ?? null,
    });
  }

  return {
    status,
    check,
    assertEntitled,
    async hasFeature(feature: string) {
      const verdict = await status();
      return verdict.entitled && (verdict.claims?.features ?? []).includes(feature);
    },
    async describe() {
      const v = await status();
      if (!v.claims) return `licence ${v.state}: ${v.reason}`;
      const window = v.claims.expiresAt ? `expires ${v.claims.expiresAt}` : 'perpetual';
      return `${v.claims.productId} · ${v.claims.edition} · ${v.claims.licensee} · ${window} · ${v.state}`;
    },
    invalidate() {
      cached = null;
    },
  };
}

/**
 * A gate that permits everything. For the seller's own deployment and for
 * tests. Named so that finding it in a buyer-facing wiring is obviously wrong.
 */
export function createUnlicensedDevelopmentGate(productId: string): EntitlementGate {
  const verdict: EntitlementVerdict = Object.freeze({
    entitled: true,
    state: 'valid' as const,
    claims: null,
    reason: 'Entitlement enforcement is disabled in this deployment.',
    daysRemaining: null,
    graceDaysRemaining: null,
    checkedAt: new Date(0).toISOString(),
  });
  return {
    async status() {
      return verdict;
    },
    async check() {
      return { allowed: true, verdict, reason: '' };
    },
    async assertEntitled() {},
    async hasFeature() {
      return true;
    },
    async describe() {
      return `${productId} · entitlement enforcement disabled`;
    },
    invalidate() {},
  };
}
