// saas/ai-portability-core/adapters.ts
/**
 * AI Portability — Provider Adapters
 * -------------------------------------------------------------------------
 * Each adapter: translate (unified -> provider), invoke (via injected fetch +
 * secret), normalize (provider -> unified). Add a provider by copying one
 * class, wiring its request/response shape, and registering it. Base URLs and
 * model names are configurable so buyers can point at Azure OpenAI, Bedrock
 * gateways, or their own proxy.
 */

import {
  UnifiedRequest,
  UnifiedResponse,
  ProviderMetadata,
  computeCost,
} from './schema.ts';
import { HostContext } from './host.ts';

export interface AdapterConfig {
  /** Vault ref name for this provider's API key. */
  secretRef: string;
  /** Override the default model. */
  model?: string;
  /** Override the default base URL (Azure / Bedrock / gateway). */
  baseUrl?: string;
  /** Override pricing / latency priors (prices drift). */
  pricing?: Partial<
    Pick<
      ProviderMetadata,
      'cost_per_1k_input' | 'cost_per_1k_output' | 'avg_latency_ms'
    >
  >;
}

export abstract class ProviderAdapter {
  abstract readonly baseMetadata: ProviderMetadata;
  protected readonly cfg: AdapterConfig;

  constructor(cfg: AdapterConfig) {
    this.cfg = cfg;
  }

  get id(): string {
    return this.baseMetadata.id;
  }

  /** Effective metadata after config overrides. */
  get metadata(): ProviderMetadata {
    return {
      ...this.baseMetadata,
      cost_per_1k_input:
        this.cfg.pricing?.cost_per_1k_input ??
        this.baseMetadata.cost_per_1k_input,
      cost_per_1k_output:
        this.cfg.pricing?.cost_per_1k_output ??
        this.baseMetadata.cost_per_1k_output,
      avg_latency_ms:
        this.cfg.pricing?.avg_latency_ms ?? this.baseMetadata.avg_latency_ms,
    };
  }

  protected abstract translate(req: UnifiedRequest): {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  };

  protected abstract normalize(
    raw: any,
    latency_ms: number,
  ): UnifiedResponse;

  /** Full round trip. Measures latency with the injected clock. */
  async call(req: UnifiedRequest, host: HostContext): Promise<UnifiedResponse> {
    const key = await host.secrets.getSecret(this.cfg.secretRef);
    const t = this.translate(req);
    const started = host.clock.now();

    const res = await host.http.fetch(t.url, {
      method: 'POST',
      headers: this.injectKey(t.headers, key),
      body: JSON.stringify(t.body),
    });

    const latency = host.clock.now() - started;
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`${this.id} HTTP ${res.status}: ${text}`);
    }
    const raw = await res.json();
    return this.normalize(raw, latency);
  }

  protected abstract injectKey(
    headers: Record<string, string>,
    key: string,
  ): Record<string, string>;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}

/* =============================== OpenAI ================================= */
export class OpenAIAdapter extends ProviderAdapter {
  readonly baseMetadata: ProviderMetadata = {
    id: 'openai',
    label: 'OpenAI',
    capabilities: ['chat', 'reasoning', 'json_mode', 'vision', 'fast'],
    cost_per_1k_input: 0.005,
    cost_per_1k_output: 0.015,
    avg_latency_ms: 900,
  };

  protected translate(req: UnifiedRequest) {
    const base = this.cfg.baseUrl ?? 'https://api.openai.com/v1';
    return {
      url: `${base}/chat/completions`,
      headers: { 'content-type': 'application/json' },
      body: {
        model: this.cfg.model ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: req.prompt }],
        temperature: req.temperature ?? 0.7,
        max_tokens: req.max_tokens ?? 1024,
      },
    };
  }

  protected injectKey(h: Record<string, string>, key: string) {
    return { ...h, authorization: `Bearer ${key}` };
  }

  protected normalize(raw: any, latency_ms: number): UnifiedResponse {
    const input = raw?.usage?.prompt_tokens ?? 0;
    const output = raw?.usage?.completion_tokens ?? 0;
    return {
      output: raw?.choices?.[0]?.message?.content ?? '',
      tokens_used: { input, output, total: input + output },
      provider: this.id,
      latency_ms,
      cost_usd: computeCost(input, output, this.metadata),
    };
  }
}

/* ============================== Anthropic =============================== */
export class AnthropicAdapter extends ProviderAdapter {
  readonly baseMetadata: ProviderMetadata = {
    id: 'anthropic',
    label: 'Anthropic',
    capabilities: ['chat', 'reasoning', 'long_context', 'style', 'vision'],
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    avg_latency_ms: 1100,
  };

  protected translate(req: UnifiedRequest) {
    const base = this.cfg.baseUrl ?? 'https://api.anthropic.com/v1';
    return {
      url: `${base}/messages`,
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: this.cfg.model ?? 'claude-3-5-sonnet-20241022',
        max_tokens: req.max_tokens ?? 1024,
        temperature: req.temperature ?? 0.7,
        messages: [{ role: 'user', content: req.prompt }],
      },
    };
  }

  protected injectKey(h: Record<string, string>, key: string) {
    return { ...h, 'x-api-key': key };
  }

  protected normalize(raw: any, latency_ms: number): UnifiedResponse {
    const input = raw?.usage?.input_tokens ?? 0;
    const output = raw?.usage?.output_tokens ?? 0;
    const text = Array.isArray(raw?.content)
      ? raw.content.map((b: any) => b?.text ?? '').join('')
      : '';
    return {
      output: text,
      tokens_used: { input, output, total: input + output },
      provider: this.id,
      latency_ms,
      cost_usd: computeCost(input, output, this.metadata),
    };
  }
}

/* =============================== Cohere ================================= */
export class CohereAdapter extends ProviderAdapter {
  readonly baseMetadata: ProviderMetadata = {
    id: 'cohere',
    label: 'Cohere',
    capabilities: ['chat', 'cheap', 'fast', 'embeddings'],
    cost_per_1k_input: 0.0015,
    cost_per_1k_output: 0.002,
    avg_latency_ms: 700,
  };

  protected translate(req: UnifiedRequest) {
    const base = this.cfg.baseUrl ?? 'https://api.cohere.com/v2';
    return {
      url: `${base}/chat`,
      headers: { 'content-type': 'application/json' },
      body: {
        model: this.cfg.model ?? 'command-r-plus',
        messages: [{ role: 'user', content: req.prompt }],
        temperature: req.temperature ?? 0.7,
        max_tokens: req.max_tokens ?? 1024,
      },
    };
  }

  protected injectKey(h: Record<string, string>, key: string) {
    return { ...h, authorization: `Bearer ${key}` };
  }

  protected normalize(raw: any, latency_ms: number): UnifiedResponse {
    // Cohere v2 nests usage under billed_units or tokens depending on plan.
    const u = raw?.usage?.tokens ?? raw?.usage?.billed_units ?? {};
    const input = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const text = Array.isArray(raw?.message?.content)
      ? raw.message.content.map((b: any) => b?.text ?? '').join('')
      : raw?.text ?? '';
    return {
      output: text,
      tokens_used: { input, output, total: input + output },
      provider: this.id,
      latency_ms,
      cost_usd: computeCost(input, output, this.metadata),
    };
  }
}

/* ------------------------------ Factory --------------------------------- */
export type ProviderKind = 'openai' | 'anthropic' | 'cohere';

const KINDS: Record<ProviderKind, new (c: AdapterConfig) => ProviderAdapter> = {
  openai: OpenAIAdapter,
  anthropic: AnthropicAdapter,
  cohere: CohereAdapter,
};

export function createAdapter(
  kind: ProviderKind,
  cfg: AdapterConfig,
): ProviderAdapter {
  const Ctor = KINDS[kind];
  if (!Ctor) throw new Error(`unknown provider kind: ${kind}`);
  return new Ctor(cfg);
}
