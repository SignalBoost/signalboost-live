// saas/ai-portability-core/orchestrator.ts
/**
 * AI Portability — Orchestrator
 * -------------------------------------------------------------------------
 * The one thing a buyer instantiates. Give it a HostContext (their infra) and
 * a config (their providers + policy). It wires registry -> routing ->
 * blending -> audit and exposes a tiny, stable surface.
 *
 *   const orch = createOrchestrator(host, config);
 *   const res  = await orch.invoke({ prompt: '...' });
 */

import {
  UnifiedRequest,
  UnifiedResponse,
  validateUnifiedRequest,
  RoutingPolicy,
} from './schema';
import { HostContext } from './host';
import {
  ProviderAdapter,
  ProviderKind,
  AdapterConfig,
  createAdapter,
} from './adapters';
import { AiProviderRegistry } from './registry';
import { RoutingEngine, RoutingConfig, RoutingError } from './routing';
import { Blender, BlendOptions } from './blending';
import { AuditLogger, Reporter, Report } from './audit';

export interface ProviderConfigEntry extends AdapterConfig {
  kind: ProviderKind;
}

export interface OrchestratorConfig {
  /** Providers to register at startup. */
  providers: ProviderConfigEntry[];
  /** Default routing behavior. */
  routing?: RoutingConfig;
  /** Extra custom adapters (already constructed) to register. */
  customAdapters?: ProviderAdapter[];
}

export class Orchestrator {
  readonly registry = new AiProviderRegistry();
  private routing: RoutingEngine;
  private blender: Blender;
  private audit: AuditLogger;
  private reporter: Reporter;

  constructor(
    private host: HostContext,
    config: OrchestratorConfig,
  ) {
    for (const p of config.providers) {
      this.registry.register(createAdapter(p.kind, p));
    }
    for (const a of config.customAdapters ?? []) {
      this.registry.register(a);
    }
    this.routing = new RoutingEngine(this.registry, host, config.routing);
    this.blender = new Blender(this.registry, host);
    this.audit = new AuditLogger(host);
    this.reporter = new Reporter(host);
  }

  /** List provider metadata (drives the UI dropdown). */
  listProviders() {
    return this.registry.list();
  }

  /** Single-provider (routed or pinned) invocation with fallback + audit. */
  async invoke(request: UnifiedRequest): Promise<UnifiedResponse> {
    const v = validateUnifiedRequest(request);
    if (!v.valid) throw new Error(`invalid request: ${v.errors.join('; ')}`);

    const requestId = request.metadata?.requestId ?? genReqId();
    const tenant = request.metadata?.tenant;

    try {
      const result = await this.routing.execute(request);
      await this.audit.record({
        requestId,
        tenant,
        policy: result.policy,
        provider_requested: result.provider_requested,
        response: result.response,
        attempts: result.attempts,
        status: 'ok',
      });
      return result.response;
    } catch (err: any) {
      const attempts = err instanceof RoutingError ? err.attempts : [];
      const policy: RoutingPolicy =
        err instanceof RoutingError ? err.policy : 'auto';
      await this.audit.record({
        requestId,
        tenant,
        policy,
        provider_requested: request.provider,
        attempts,
        status: 'error',
        error: err?.message ?? String(err),
      });
      throw err;
    }
  }

  /** Multi-model blend (ensemble / voting / fusion) with audit. */
  async blend(
    request: UnifiedRequest,
    opts: BlendOptions,
  ): Promise<UnifiedResponse> {
    const v = validateUnifiedRequest(request);
    if (!v.valid) throw new Error(`invalid request: ${v.errors.join('; ')}`);

    const requestId = request.metadata?.requestId ?? genReqId();
    const tenant = request.metadata?.tenant;

    try {
      const response = await this.blender.blend(request, opts);
      await this.audit.record({
        requestId,
        tenant,
        policy: `blend:${opts.strategy}`,
        response,
        attempts: [],
        status: 'ok',
        blend: { strategy: opts.strategy, providers: opts.providers },
      });
      return response;
    } catch (err: any) {
      await this.audit.record({
        requestId,
        tenant,
        policy: `blend:${opts.strategy}`,
        attempts: [],
        status: 'error',
        error: err?.message ?? String(err),
        blend: { strategy: opts.strategy, providers: opts.providers },
      });
      throw err;
    }
  }

  /** Compliance + billing report. */
  report(params: {
    from?: number;
    to?: number;
    tenant?: string;
    groupBy?: 'provider' | 'tenant';
  }): Promise<Report> {
    return this.reporter.generate(params);
  }
}

export function createOrchestrator(
  host: HostContext,
  config: OrchestratorConfig,
): Orchestrator {
  return new Orchestrator(host, config);
}

function genReqId(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'req_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* Re-export the public surface so buyers import from one place. */
export * from './schema';
export * from './host';
export * from './adapters';
export { AiProviderRegistry, AiProviderRegistry as ProviderRegistry } from './registry';
export { RoutingEngine, RoutingError } from './routing';
export { Blender } from './blending';
export type { BlendOptions, BlendStrategy } from './blending';
export { AuditLogger, Reporter } from './audit';
export type { Report, ReportRow } from './audit';
