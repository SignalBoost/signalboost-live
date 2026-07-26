// saas/portable-license/types.ts
//
// The entitlement contract shared by every portable.
//
// A licence is a signed statement about what a named buyer bought. It is
// verified inside the buyer's own deployment, with no call home, because a
// product that has to reach the seller to run is not one an enterprise will
// install behind their firewall.
//
// This file has no imports. It must stay that way.

/** Risk-free actions that entitlement never blocks. See enforce.ts. */
export type PortableActionClass = 'read' | 'observe' | 'execute' | 'dispatch';

export interface PortableLicenseClaims {
  /** Format marker. Reject anything that is not exactly this. */
  schema: 'portable-license/1';
  /** Unique id for this licence. Used for revocation. */
  licenseId: string;
  /** Who issued it. Must match the verifying deployment's configured issuer. */
  issuer: string;
  /** Who bought it. Free text for display and audit; not a security boundary. */
  licensee: string;
  /** Which portable this licence is for. Must match the product being run. */
  productId: string;
  /** Plan or edition name, e.g. 'standard' | 'enterprise'. Display and gating. */
  edition: string;
  /** Named capabilities this licence unlocks. Absent feature = not entitled. */
  features: string[];
  /** Max concurrent seats, or null for unlimited. Counted by the host. */
  seats: number | null;
  /** Max executions in the current period, or null for unmetered. */
  maxExecutions: number | null;
  /** ISO-8601. */
  issuedAt: string;
  /** ISO-8601. A licence is not valid before this instant. */
  notBefore: string;
  /** ISO-8601, or null for perpetual. */
  expiresAt: string | null;
  /**
   * Days after expiry during which the product keeps working in a degraded
   * mode. Deliberately not zero: this product repairs infrastructure, and a
   * licence that goes hard-dead mid-incident is a licence that causes outages.
   */
  graceDays: number;
  /** Optional free-text note carried into audit records. */
  note?: string;
}

/** A licence token is `portable-license.1.<base64url claims>.<base64url sig>`. */
export type PortableLicenseToken = string;

export type EntitlementState =
  | 'valid'
  | 'grace'
  | 'expired'
  | 'not_yet_valid'
  | 'revoked'
  | 'wrong_product'
  | 'wrong_issuer'
  | 'malformed'
  | 'bad_signature'
  | 'missing';

export interface EntitlementVerdict {
  /** True only for 'valid' and 'grace'. */
  entitled: boolean;
  state: EntitlementState;
  /** Present whenever the signature verified, even if the licence has lapsed. */
  claims: PortableLicenseClaims | null;
  /** Human-readable, safe to log and to show an operator. Never contains the token. */
  reason: string;
  /** Whole days remaining before expiry; negative once inside grace. */
  daysRemaining: number | null;
  /** Set when state is 'grace'. Whole days of grace left. */
  graceDaysRemaining: number | null;
  /** The instant the verdict was computed, ISO-8601. */
  checkedAt: string;
}

/**
 * Revocation is the buyer's or host's responsibility to supply, because it is
 * the only part of verification that cannot be answered from the token alone.
 * An implementation may cache; it must never block indefinitely.
 */
export interface RevocationSource {
  /** Return true if this licenceId has been revoked. Must not throw. */
  isRevoked(licenseId: string): Promise<boolean> | boolean;
}

/** Injected so tests and audits are deterministic. Defaults to Date.now. */
export interface Clock {
  now(): Date;
}

export interface EntitlementGateConfig {
  /** The product being run. A licence for another product is rejected. */
  productId: string;
  /** Expected issuer string. A licence from another issuer is rejected. */
  issuer: string;
  /** SPKI PEM Ed25519 public key(s). Several allows key rotation. */
  publicKeysPem: string[];
  /** The licence token, from the buyer's own configuration or vault. */
  token: PortableLicenseToken | null | undefined;
  /** Optional. Absent means nothing is treated as revoked. */
  revocation?: RevocationSource;
  /** Optional. */
  clock?: Clock;
  /**
   * Action classes that stay available even without a valid licence.
   * Defaults to ['read', 'observe'] — see enforce.ts for why.
   */
  alwaysAllowed?: PortableActionClass[];
}

export class EntitlementError extends Error {
  readonly state: EntitlementState;
  readonly action: string;
  readonly actionClass: PortableActionClass;
  readonly licenseId: string | null;

  constructor(args: {
    message: string;
    state: EntitlementState;
    action: string;
    actionClass: PortableActionClass;
    licenseId: string | null;
  }) {
    super(args.message);
    this.name = 'EntitlementError';
    this.state = args.state;
    this.action = args.action;
    this.actionClass = args.actionClass;
    this.licenseId = args.licenseId;
  }
}
