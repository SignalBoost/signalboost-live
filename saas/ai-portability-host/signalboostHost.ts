// saas/ai-portability-host/signalboostHost.ts
/**
 * AI Portability — SignalBoost Host Binding
 * -------------------------------------------------------------------------
 * The concrete HostContext for THIS deployment. It satisfies the core
 * contract with SignalBoost infrastructure. A buyer writes their own version
 * of this one file (their vault, their datastore, their SIEM) and the whole
 * portable runs on their stack unchanged.
 *
 * Current binding (functional now):
 *   secrets -> process.env  (OPENAI_API_KEY / ANTHROPIC_API_KEY / COHERE_API_KEY in Vercel)
 *   store   -> in-memory     (see note below)
 *   siem    -> logger
 *   http    -> global fetch
 *
 * NOTE ON AUDIT PERSISTENCE: the in-memory store works for a single request
 * but does NOT survive across serverless invocations, so /report only sees the
 * current process. For durable billing/compliance reporting, swap `store` for
 * a Supabase-backed AuditStore (one table + service-role client). That is the
 * only change needed — ask and it ships with a migration.
 */

import {
  HostContext,
  AuditRecord,
  AuditStore,
} from '@/ai-portability-core';

/** In-memory audit store — replace with Supabase for durable reporting. */
class MemoryAuditStore implements AuditStore {
  private rows: AuditRecord[] = [];
  async append(r: AuditRecord) {
    this.rows.push(r);
  }
  async query(f: { from?: number; to?: number; tenant?: string; provider?: string }) {
    return this.rows.filter(
      (r) =>
        (f.from === undefined || r.ts >= f.from) &&
        (f.to === undefined || r.ts <= f.to) &&
        (f.tenant === undefined || r.tenant === f.tenant) &&
        (f.provider === undefined || r.provider_used === f.provider),
    );
  }
}

let cached: HostContext | null = null;

export function createSignalBoostAiPortabilityHost(): HostContext {
  if (cached) return cached;

  const store = new MemoryAuditStore();

  cached = {
    secrets: {
      async getSecret(ref: string) {
        const v = process.env?.[ref];
        if (!v) throw new Error(`missing secret: ${ref}`);
        return v;
      },
    },
    store,
    siem: {
      async emit(e) {
        // Route SIEM events into the platform log stream.
        console.log('[ai-portability]', e.type, JSON.stringify(e.payload));
      },
    },
    clock: { now: () => Date.now() },
    logger: {
      info: (m, c) => console.log('[ai-portability]', m, c ?? ''),
      warn: (m, c) => console.warn('[ai-portability]', m, c ?? ''),
      error: (m, c) => console.error('[ai-portability]', m, c ?? ''),
    },
    http: { fetch: (...a: Parameters<typeof fetch>) => fetch(...a) },
  };
  return cached;
}
