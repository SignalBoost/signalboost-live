// saas/ai-portability-core/host.ts
/**
 * AI Portability — Host Contract (core)
 * -------------------------------------------------------------------------
 * THE plug-and-play boundary. The portable brings behavior; the buyer brings
 * infrastructure. Everything the portable needs from the outside world is one
 * injected object: HostContext. Core imports nothing host-specific — no Next,
 * no Supabase, no SDKs, no process.env. Concrete hosts live in
 * saas/ai-portability-host.
 */

/* ------------------------------ Secrets --------------------------------- */
/** Buyer's secrets vault. Provider API keys resolve here by ref name — they
 * never live in the portable, in config files, or in env from core. */
export interface SecretProvider {
  getSecret(ref: string): Promise<string>;
}

/* ------------------------------- Audit ---------------------------------- */
export interface AuditRecord {
  id: string;
  ts: number;
  requestId: string;
  tenant?: string;
  policy: string;
  provider_requested?: string;
  provider_used: string;
  attempts: { provider: string; ok: boolean; latency_ms: number; error?: string }[];
  tokens_used: { input: number; output: number; total: number };
  cost_usd: number;
  latency_ms: number;
  status: 'ok' | 'error';
  error?: string;
  blend?: { strategy: string; providers: string[] };
}

export interface AuditStore {
  append(record: AuditRecord): Promise<void>;
  query(filter: {
    from?: number;
    to?: number;
    tenant?: string;
    provider?: string;
  }): Promise<AuditRecord[]>;
}

/** Push structured events to the buyer's SIEM / observability pipe. */
export interface SiemSink {
  emit(event: { type: string; payload: Record<string, unknown> }): Promise<void>;
}

/* ---------------------------- Clock & Logger ---------------------------- */
export interface Clock {
  now(): number; // epoch ms
}

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

/* ------------------------------- Network -------------------------------- */
/** Injected fetch so the buyer can route provider calls through their own
 * egress proxy, add mTLS, or stub it entirely in tests. */
export interface HttpClient {
  fetch: typeof fetch;
}

/* ----------------------------- HostContext ------------------------------ */
export interface HostContext {
  secrets: SecretProvider;
  store: AuditStore;
  siem: SiemSink;
  clock: Clock;
  logger: Logger;
  http: HttpClient;
}
