// saas/portable-license/verify.ts
//
// Offline verification of a licence token. No network, no environment, no
// filesystem. Everything it needs arrives as an argument.

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import type {
  Clock,
  EntitlementVerdict,
  PortableLicenseClaims,
  PortableLicenseToken,
  RevocationSource,
} from './types.ts';

export const TOKEN_PREFIX = 'portable-license.1.';

const DAY_MS = 86_400_000;

const systemClock: Clock = { now: () => new Date() };

/**
 * Deterministic serialization for signing. Object keys are sorted at every
 * depth; array order is preserved because array order is meaningful. Both the
 * issuer and the verifier must produce byte-identical output for the same
 * claims, so this function is the format — do not "improve" it independently
 * on one side.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function encodeToken(claims: PortableLicenseClaims, signature: Buffer): PortableLicenseToken {
  return (
    TOKEN_PREFIX +
    b64urlEncode(Buffer.from(canonicalize(claims), 'utf8')) +
    '.' +
    b64urlEncode(signature)
  );
}

/** The exact bytes that are signed. Exported so the issuer cannot drift. */
export function signingInput(claims: PortableLicenseClaims): Buffer {
  return Buffer.from(canonicalize(claims), 'utf8');
}

const REQUIRED_STRINGS = ['licenseId', 'issuer', 'licensee', 'productId', 'edition', 'issuedAt', 'notBefore'] as const;

function parseClaims(raw: unknown): PortableLicenseClaims | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (c.schema !== 'portable-license/1') return null;
  for (const k of REQUIRED_STRINGS) {
    if (typeof c[k] !== 'string' || !(c[k] as string).length) return null;
  }
  if (!Array.isArray(c.features) || c.features.some((f) => typeof f !== 'string')) return null;
  if (!(c.seats === null || typeof c.seats === 'number')) return null;
  if (!(c.maxExecutions === null || typeof c.maxExecutions === 'number')) return null;
  if (!(c.expiresAt === null || typeof c.expiresAt === 'string')) return null;
  if (typeof c.graceDays !== 'number' || c.graceDays < 0) return null;
  for (const k of ['issuedAt', 'notBefore'] as const) {
    if (Number.isNaN(Date.parse(c[k] as string))) return null;
  }
  if (typeof c.expiresAt === 'string' && Number.isNaN(Date.parse(c.expiresAt))) return null;
  return c as unknown as PortableLicenseClaims;
}

function verdict(partial: Partial<EntitlementVerdict> & { state: EntitlementVerdict['state']; reason: string }, now: Date): EntitlementVerdict {
  return Object.freeze({
    entitled: partial.state === 'valid' || partial.state === 'grace',
    state: partial.state,
    claims: partial.claims ?? null,
    reason: partial.reason,
    daysRemaining: partial.daysRemaining ?? null,
    graceDaysRemaining: partial.graceDaysRemaining ?? null,
    checkedAt: now.toISOString(),
  });
}

/**
 * Verify a licence token. Returns a verdict; never throws for a bad token,
 * because "the licence is broken" is a state the caller must be able to report
 * rather than an exception to be caught somewhere far away.
 */
export async function verifyLicense(args: {
  token: PortableLicenseToken | null | undefined;
  productId: string;
  issuer: string;
  publicKeysPem: string[];
  revocation?: RevocationSource;
  clock?: Clock;
}): Promise<EntitlementVerdict> {
  const clock = args.clock ?? systemClock;
  const now = clock.now();

  if (!args.token || typeof args.token !== 'string') {
    return verdict({ state: 'missing', reason: 'No licence token is configured for this deployment.' }, now);
  }
  if (!args.token.startsWith(TOKEN_PREFIX)) {
    return verdict({ state: 'malformed', reason: 'Licence token does not carry a recognised format marker.' }, now);
  }

  const body = args.token.slice(TOKEN_PREFIX.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) {
    return verdict({ state: 'malformed', reason: 'Licence token is not in the expected two-part form.' }, now);
  }

  let claims: PortableLicenseClaims | null = null;
  let signature: Buffer;
  let payload: Buffer;
  try {
    payload = b64urlDecode(body.slice(0, dot));
    signature = b64urlDecode(body.slice(dot + 1));
    claims = parseClaims(JSON.parse(payload.toString('utf8')));
  } catch {
    return verdict({ state: 'malformed', reason: 'Licence token could not be decoded.' }, now);
  }
  if (!claims) {
    return verdict({ state: 'malformed', reason: 'Licence claims are missing required fields or use an unsupported schema.' }, now);
  }

  const expected = signingInput(claims);
  let signatureOk = false;
  for (const pem of args.publicKeysPem) {
    try {
      if (cryptoVerify(null, expected, createPublicKey(pem), signature)) {
        signatureOk = true;
        break;
      }
    } catch {
      // A malformed key must not mask a valid one later in the list.
    }
  }
  if (!signatureOk) {
    return verdict({ state: 'bad_signature', reason: 'Licence signature does not verify against any configured issuer key.' }, now);
  }

  if (claims.issuer !== args.issuer) {
    return verdict({ state: 'wrong_issuer', claims, reason: `Licence was issued by "${claims.issuer}", which this deployment does not accept.` }, now);
  }
  if (claims.productId !== args.productId) {
    return verdict({ state: 'wrong_product', claims, reason: `Licence is for "${claims.productId}" and cannot license "${args.productId}".` }, now);
  }

  if (args.revocation) {
    let revoked = false;
    try {
      revoked = await args.revocation.isRevoked(claims.licenseId);
    } catch {
      revoked = false;
    }
    if (revoked) {
      return verdict({ state: 'revoked', claims, reason: 'Licence has been revoked by the issuer.' }, now);
    }
  }

  const nowMs = now.getTime();
  if (nowMs < Date.parse(claims.notBefore)) {
    return verdict({ state: 'not_yet_valid', claims, reason: `Licence is not valid until ${claims.notBefore}.` }, now);
  }

  if (claims.expiresAt === null) {
    return verdict({ state: 'valid', claims, reason: 'Licence is valid and does not expire.', daysRemaining: null }, now);
  }

  const expiryMs = Date.parse(claims.expiresAt);
  const daysRemaining = Math.floor((expiryMs - nowMs) / DAY_MS);
  if (nowMs < expiryMs) {
    return verdict({ state: 'valid', claims, reason: 'Licence is valid.', daysRemaining }, now);
  }

  const graceEndsMs = expiryMs + claims.graceDays * DAY_MS;
  if (nowMs < graceEndsMs) {
    const graceDaysRemaining = Math.floor((graceEndsMs - nowMs) / DAY_MS);
    return verdict(
      {
        state: 'grace',
        claims,
        reason: `Licence expired on ${claims.expiresAt} and is inside its ${claims.graceDays}-day grace period.`,
        daysRemaining,
        graceDaysRemaining,
      },
      now,
    );
  }

  return verdict(
    { state: 'expired', claims, reason: `Licence expired on ${claims.expiresAt} and its grace period has ended.`, daysRemaining },
    now,
  );
}
