// saas/ai-portability-core/audit.ts
/**
 * AI Portability — Audit & Reporting
 * -------------------------------------------------------------------------
 * Every invocation writes one AuditRecord to the buyer's store and emits a
 * SIEM event. The reporter aggregates those records into compliance +
 * enterprise-billing summaries.
 */

import { UnifiedResponse, ProviderAttempt } from './schema';
import { HostContext, AuditRecord } from './host';

export class AuditLogger {
  constructor(private host: HostContext) {}

  async record(input: {
    requestId: string;
    tenant?: string;
    policy: string;
    provider_requested?: string;
    response?: UnifiedResponse;
    attempts: ProviderAttempt[];
    status: 'ok' | 'error';
    error?: string;
    blend?: { strategy: string; providers: string[] };
  }): Promise<AuditRecord> {
    const r: AuditRecord = {
      id: genId(),
      ts: this.host.clock.now(),
      requestId: input.requestId,
      tenant: input.tenant,
      policy: input.policy,
      provider_requested: input.provider_requested,
      provider_used: input.response?.provider ?? 'none',
      attempts: input.attempts,
      tokens_used: input.response?.tokens_used ?? { input: 0, output: 0, total: 0 },
      cost_usd: input.response?.cost_usd ?? 0,
      latency_ms: input.response?.latency_ms ?? 0,
      status: input.status,
      error: input.error,
      blend: input.blend,
    };

    await this.host.store.append(r);
    await this.host.siem.emit({
      type: input.status === 'ok' ? 'ai.invocation' : 'ai.invocation.error',
      payload: {
        requestId: r.requestId,
        tenant: r.tenant,
        provider: r.provider_used,
        cost_usd: r.cost_usd,
        latency_ms: r.latency_ms,
        status: r.status,
      },
    });
    return r;
  }
}

/* ------------------------------- Reporter ------------------------------- */

export interface ReportRow {
  key: string;
  invocations: number;
  errors: number;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  cost_usd: number;
  avg_latency_ms: number;
}

export interface Report {
  from?: number;
  to?: number;
  group_by: 'provider' | 'tenant';
  rows: ReportRow[];
  totals: Omit<ReportRow, 'key'>;
  generated_at: number;
}

export class Reporter {
  constructor(private host: HostContext) {}

  async generate(params: {
    from?: number;
    to?: number;
    tenant?: string;
    groupBy?: 'provider' | 'tenant';
  }): Promise<Report> {
    const groupBy = params.groupBy ?? 'provider';
    const records = await this.host.store.query({
      from: params.from,
      to: params.to,
      tenant: params.tenant,
    });

    const map = new Map<string, ReportRow>();
    const latencyAccum = new Map<string, number[]>();

    for (const rec of records) {
      const key = groupBy === 'tenant' ? rec.tenant ?? 'unknown' : rec.provider_used;
      const row =
        map.get(key) ??
        {
          key,
          invocations: 0,
          errors: 0,
          tokens_input: 0,
          tokens_output: 0,
          tokens_total: 0,
          cost_usd: 0,
          avg_latency_ms: 0,
        };
      row.invocations += 1;
      if (rec.status === 'error') row.errors += 1;
      row.tokens_input += rec.tokens_used.input;
      row.tokens_output += rec.tokens_used.output;
      row.tokens_total += rec.tokens_used.total;
      row.cost_usd += rec.cost_usd;
      map.set(key, row);

      const lat = latencyAccum.get(key) ?? [];
      lat.push(rec.latency_ms);
      latencyAccum.set(key, lat);
    }

    const rows = [...map.values()].map((row) => {
      const lat = latencyAccum.get(row.key) ?? [];
      row.avg_latency_ms = lat.length
        ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
        : 0;
      row.cost_usd = Math.round(row.cost_usd * 1e6) / 1e6;
      return row;
    });

    const totals = rows.reduce(
      (acc, r) => ({
        invocations: acc.invocations + r.invocations,
        errors: acc.errors + r.errors,
        tokens_input: acc.tokens_input + r.tokens_input,
        tokens_output: acc.tokens_output + r.tokens_output,
        tokens_total: acc.tokens_total + r.tokens_total,
        cost_usd: Math.round((acc.cost_usd + r.cost_usd) * 1e6) / 1e6,
        avg_latency_ms: 0,
      }),
      {
        invocations: 0,
        errors: 0,
        tokens_input: 0,
        tokens_output: 0,
        tokens_total: 0,
        cost_usd: 0,
        avg_latency_ms: 0,
      },
    );

    return {
      from: params.from,
      to: params.to,
      group_by: groupBy,
      rows,
      totals,
      generated_at: this.host.clock.now(),
    };
  }
}

function genId(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'aud_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
