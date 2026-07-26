// Reference implementations of RevocationSource — the one part of licence
// verification that cannot be answered from the token alone.
//
// The governing rule, the same one verify.ts applies: NEVER REVOKE ON
// IGNORANCE. A revocation check that fails, times out or goes stale is not
// evidence that a licence was revoked, and treating it as such means a network
// blip disables a paying buyer's incident response. What these do instead is
// make the ignorance VISIBLE — staleness is reported so the buyer's own
// monitoring can alert on it, rather than being silently swallowed.
//
// No environment, no network, no filesystem. The buyer supplies the fetch.

import type { Clock, RevocationSource } from './types.ts';

const systemClock: Clock = { now: () => new Date() };

/**
 * The simplest source: a list the buyer already has. Suitable for air-gapped
 * deployments that receive a revocation list out of band.
 */
export function createStaticRevocationList(revokedIds: readonly string[]): RevocationSource {
  const set = new Set(revokedIds);
  return {
    isRevoked(licenseId: string) {
      return set.has(licenseId);
    },
  };
}

export interface CachingRevocationOptions {
  /**
   * The buyer's own check. May do anything — call an endpoint, read a table,
   * consult a file. May throw or hang; this wrapper contains both.
   */
  fetchRevoked(licenseId: string): Promise<boolean> | boolean;
  /** How long a successful answer is reused. Default 15 minutes. */
  ttlMs?: number;
  /** How long a single fetch may take before it is abandoned. Default 5s. */
  timeoutMs?: number;
  /**
   * How old a cached answer may get before the source is considered stale.
   * Reaching this does NOT revoke — it calls onStale so the buyer can alert.
   * Default 24 hours.
   */
  maxStalenessMs?: number;
  /**
   * Called when an answer is served that is older than maxStalenessMs, or when
   * a fetch fails with nothing cached. Wire this to your monitoring: it is the
   * signal that revocation is not actually being enforced right now.
   */
  onStale?(info: { licenseId: string; ageMs: number | null; error: string | null }): void;
  clock?: Clock;
}

interface CacheEntry {
  revoked: boolean;
  atMs: number;
}

/**
 * Wraps a buyer's revocation check with caching, a timeout, and last-known-good
 * fallback. Never throws.
 */
export function createCachingRevocationSource(options: CachingRevocationOptions): RevocationSource {
  const ttlMs = options.ttlMs ?? 15 * 60_000;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxStalenessMs = options.maxStalenessMs ?? 24 * 60 * 60_000;
  const clock = options.clock ?? systemClock;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<boolean | null>>();

  function reportStale(licenseId: string, ageMs: number | null, error: string | null) {
    if (!options.onStale) return;
    try {
      options.onStale({ licenseId, ageMs, error });
    } catch {
      // Monitoring that throws must not become the outage.
    }
  }

  async function fetchWithTimeout(licenseId: string): Promise<boolean | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        // Deliberately NOT unref'd. An unref'd timer lets a quiet process exit
        // while a revocation check is still outstanding, which turns the
        // timeout into something that only fires when it was not needed.
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      const result = await Promise.race([Promise.resolve(options.fetchRevoked(licenseId)), timeout]);
      return typeof result === 'boolean' ? result : null;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    async isRevoked(licenseId: string): Promise<boolean> {
      const nowMs = clock.now().getTime();
      const cached = cache.get(licenseId);
      if (cached && nowMs - cached.atMs < ttlMs) return cached.revoked;

      let pending = inFlight.get(licenseId);
      if (!pending) {
        pending = fetchWithTimeout(licenseId).finally(() => inFlight.delete(licenseId));
        inFlight.set(licenseId, pending);
      }
      const fresh = await pending;

      if (fresh !== null) {
        cache.set(licenseId, { revoked: fresh, atMs: clock.now().getTime() });
        return fresh;
      }

      if (cached) {
        const ageMs = clock.now().getTime() - cached.atMs;
        if (ageMs >= maxStalenessMs) reportStale(licenseId, ageMs, 'revocation source unavailable');
        return cached.revoked;
      }

      // Nothing cached and the check failed. Ignorance is not revocation.
      reportStale(licenseId, null, 'revocation source unavailable and nothing cached');
      return false;
    },
  };
}

/**
 * Combines several sources. Revoked by any one of them means revoked — a
 * revocation is a positive statement, so unanimity is not required and a source
 * that cannot answer cannot veto one that can.
 */
export function mergeRevocationSources(...sources: RevocationSource[]): RevocationSource {
  return {
    async isRevoked(licenseId: string): Promise<boolean> {
      for (const source of sources) {
        try {
          if (await source.isRevoked(licenseId)) return true;
        } catch {
          // A source that throws contributes nothing and blocks nothing.
        }
      }
      return false;
    },
  };
}
