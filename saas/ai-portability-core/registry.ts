// saas/ai-portability-core/registry.ts
/**
 * AI Portability — Provider Registry
 * -------------------------------------------------------------------------
 * Holds every registered adapter + its metadata. Extensible: register(adapter)
 * to add a provider at runtime with zero changes to the routing engine.
 */

import {
  ProviderCapability,
  ProviderMetadata,
  estimateTokens,
  computeCost,
} from './schema.ts';
import { ProviderAdapter } from './adapters.ts';

export class AiProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  get(id: string): ProviderAdapter {
    const a = this.adapters.get(id);
    if (!a) throw new Error(`provider not registered: ${id}`);
    return a;
  }

  list(): ProviderMetadata[] {
    return [...this.adapters.values()].map((a) => a.metadata);
  }

  ids(): string[] {
    return [...this.adapters.keys()];
  }

  /** All providers that advertise every requested capability. */
  matching(caps: ProviderCapability[]): ProviderAdapter[] {
    if (!caps.length) return [...this.adapters.values()];
    return [...this.adapters.values()].filter((a) =>
      caps.every((c) => a.metadata.capabilities.includes(c)),
    );
  }

  /** Cheapest provider for an estimated workload (input+output tokens). */
  cheapest(estInput: number, estOutput: number): ProviderAdapter | undefined {
    return this.rankByCost(estInput, estOutput)[0];
  }

  rankByCost(estInput: number, estOutput: number): ProviderAdapter[] {
    return [...this.adapters.values()].sort(
      (a, b) =>
        computeCost(estInput, estOutput, a.metadata) -
        computeCost(estInput, estOutput, b.metadata),
    );
  }

  /** Lowest average-latency provider (prior estimate). */
  fastest(): ProviderAdapter | undefined {
    return this.rankByLatency()[0];
  }

  rankByLatency(): ProviderAdapter[] {
    return [...this.adapters.values()].sort(
      (a, b) => a.metadata.avg_latency_ms - b.metadata.avg_latency_ms,
    );
  }
}

/** Convenience: estimate then rank by cost from a prompt. */
export function costRankForPrompt(
  registry: AiProviderRegistry,
  prompt: string,
  maxTokens = 1024,
): ProviderAdapter[] {
  const estInput = Math.ceil(prompt.length / 4);
  const estOutput = maxTokens;
  void estimateTokens; // kept exported for callers that want the combined figure
  return registry.rankByCost(estInput, estOutput);
}
