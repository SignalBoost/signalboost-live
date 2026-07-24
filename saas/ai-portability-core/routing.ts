// saas/ai-portability-core/routing.ts
/**
 * AI Portability — Routing Engine
 * -------------------------------------------------------------------------
 * Turns a unified request + policy into an ordered provider chain, then
 * executes it with automatic fallback. Returns the normalized response plus
 * the full attempt trail for audit.
 */

import {
  UnifiedRequest,
  UnifiedResponse,
  RoutingPolicy,
  ProviderAttempt,
  ProviderCapability,
} from './schema';
import { HostContext } from './host';
import { ProviderRegistry } from './registry';

export interface RoutingResult {
  response: UnifiedResponse;
  attempts: ProviderAttempt[];
  policy: RoutingPolicy;
  provider_requested?: string;
}

export interface RoutingConfig {
  /** Policy used when the request neither pins a provider nor sets one. */
  defaultPolicy?: RoutingPolicy;
  /** Global fallback chain if the request doesn't supply one. */
  defaultFallback?: string[];
  /** Cap on total attempts (primary + fallbacks). */
  maxAttempts?: number;
}

export class RoutingEngine {
  constructor(
    private registry: ProviderRegistry,
    private host: HostContext,
    private config: RoutingConfig = {},
  ) {}

  /** Resolve the ordered provider chain for a request. */
  plan(req: UnifiedRequest): { policy: RoutingPolicy; chain: string[] } {
    const meta = req.metadata ?? {};
    const caps = (meta.requiredCapabilities ?? []) as ProviderCapability[];

    // Explicit pin => manual.
    if (req.provider) {
      const policy: RoutingPolicy = 'manual';
      const chain = [req.provider, ...this.fallbackChain(req, req.provider)];
      return { policy, chain: this.dedupe(chain) };
    }

    const policy: RoutingPolicy =
      meta.policy ?? this.config.defaultPolicy ?? 'auto';

    let ordered: string[];
    switch (policy) {
      case 'cost': {
        const est = this.estimate(req);
        ordered = this.registry
          .rankByCost(est.input, est.output)
          .map((a) => a.id);
        break;
      }
      case 'latency': {
        ordered = this.registry.rankByLatency().map((a) => a.id);
        break;
      }
      case 'capability': {
        ordered = this.registry.matching(caps).map((a) => a.id);
        break;
      }
      case 'auto':
      default: {
        // Capability-filter, then cheapest within that set.
        const eligible = this.registry.matching(caps).map((a) => a.id);
        const est = this.estimate(req);
        ordered = this.registry
          .rankByCost(est.input, est.output)
          .map((a) => a.id)
          .filter((id) => eligible.includes(id));
        if (!ordered.length) ordered = eligible; // caps but no cost signal
        break;
      }
    }

    if (!ordered.length) ordered = this.registry.ids();
    const chain = this.dedupe([...ordered, ...this.fallbackChain(req)]);
    return { policy, chain };
  }

  /** Execute the planned chain with fallback. */
  async execute(req: UnifiedRequest): Promise<RoutingResult> {
    const { policy, chain } = this.plan(req);
    const cap = this.config.maxAttempts ?? chain.length;
    const attempts: ProviderAttempt[] = [];

    for (const id of chain.slice(0, cap)) {
      if (!this.registry.has(id)) {
        attempts.push({
          provider: id,
          ok: false,
          latency_ms: 0,
          error: 'not registered',
        });
        continue;
      }
      const adapter = this.registry.get(id);
      try {
        const response = await adapter.call(req, this.host);
        attempts.push({ provider: id, ok: true, latency_ms: response.latency_ms });
        response.metadata = { ...(response.metadata ?? {}), attempts };
        return { response, attempts, policy, provider_requested: req.provider };
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        attempts.push({ provider: id, ok: false, latency_ms: 0, error: msg });
        this.host.logger.warn('provider attempt failed', { provider: id, error: msg });
      }
    }

    throw new RoutingError('all providers failed', attempts, policy);
  }

  /* ------------------------------ helpers ------------------------------ */

  private fallbackChain(req: UnifiedRequest, exclude?: string): string[] {
    const fb =
      (req.metadata?.fallback as string[] | undefined) ??
      this.config.defaultFallback ??
      [];
    return exclude ? fb.filter((id) => id !== exclude) : fb;
  }

  private estimate(req: UnifiedRequest) {
    return {
      input: Math.ceil((req.prompt?.length ?? 0) / 4),
      output: req.max_tokens ?? 1024,
    };
  }

  private dedupe(ids: string[]): string[] {
    return [...new Set(ids)];
  }
}

export class RoutingError extends Error {
  constructor(
    message: string,
    public attempts: ProviderAttempt[],
    public policy: RoutingPolicy,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}
