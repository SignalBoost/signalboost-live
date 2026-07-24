// saas/ai-portability-core/schema.ts
/**
 * AI Portability — Unified Schema
 * -------------------------------------------------------------------------
 * The contract every provider is normalized to. Nothing in here knows or
 * cares which host it runs inside. Enterprise buyers integrate against these
 * types only.
 */

/* ----------------------------- Capabilities ----------------------------- */

export type ProviderCapability =
  | 'chat'
  | 'reasoning'
  | 'long_context'
  | 'style'
  | 'json_mode'
  | 'vision'
  | 'embeddings'
  | 'cheap'
  | 'fast';

/* ------------------------------- Requests ------------------------------- */

export type RoutingPolicy =
  | 'manual'     // caller named a provider explicitly
  | 'cost'       // cheapest provider for the estimated token size
  | 'latency'    // lowest average latency
  | 'capability' // best match for required capabilities
  | 'auto';      // system decides (defaults to cost, capability-filtered)

export interface UnifiedRequestMetadata {
  /** Free-form tenant / customer id for billing + audit segregation. */
  tenant?: string;
  /** Correlation id supplied by the host; generated if absent. */
  requestId?: string;
  /** Capabilities the task requires; used by capability/auto routing. */
  requiredCapabilities?: ProviderCapability[];
  /** Which routing policy to apply when no provider is pinned. */
  policy?: RoutingPolicy;
  /** Ordered fallback provider ids to try on failure (overrides default). */
  fallback?: string[];
  /** Anything else the host wants carried through untouched. */
  [key: string]: unknown;
}

export interface UnifiedRequest {
  prompt: string;
  temperature?: number;   // 0..2, default 0.7
  max_tokens?: number;    // default 1024
  provider?: string;      // pin a provider id; null/absent => routed
  metadata?: UnifiedRequestMetadata;
}

/* ------------------------------ Responses ------------------------------- */

export interface UnifiedResponse {
  output: string;
  tokens_used: {
    input: number;
    output: number;
    total: number;
  };
  provider: string;       // provider id actually used (or "blend:<strategy>")
  latency_ms: number;
  cost_usd: number;
  /** Present only on blended / multi-attempt responses. */
  metadata?: {
    attempts?: ProviderAttempt[];
    candidates?: BlendCandidate[];
    strategy?: string;
    [key: string]: unknown;
  };
}

export interface ProviderAttempt {
  provider: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export interface BlendCandidate {
  provider: string;
  output: string;
  tokens_used: { input: number; output: number; total: number };
  cost_usd: number;
  latency_ms: number;
}

/* --------------------------- Provider metadata -------------------------- */

export interface ProviderMetadata {
  id: string;
  label: string;
  capabilities: ProviderCapability[];
  /** USD per 1k tokens. Prices drift — buyers override via config. */
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  /** Prior estimate used by latency routing; actuals are measured live. */
  avg_latency_ms: number;
}

/* ---------------------------- JSON Schemas ------------------------------ */
/* Plain JSON Schema objects — usable with any validator the buyer already
 * runs (ajv, zod-to-json-schema consumers, API gateways, etc.). */

export const UnifiedRequestSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'UnifiedRequest',
  type: 'object',
  required: ['prompt'],
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1 },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    max_tokens: { type: 'integer', minimum: 1 },
    provider: { type: 'string' },
    metadata: { type: 'object' },
  },
} as const;

export const UnifiedResponseSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'UnifiedResponse',
  type: 'object',
  required: ['output', 'tokens_used', 'provider', 'latency_ms', 'cost_usd'],
  properties: {
    output: { type: 'string' },
    tokens_used: {
      type: 'object',
      required: ['input', 'output', 'total'],
      properties: {
        input: { type: 'integer' },
        output: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
    provider: { type: 'string' },
    latency_ms: { type: 'number' },
    cost_usd: { type: 'number' },
    metadata: { type: 'object' },
  },
} as const;

/* --------------------------- Minimal validation ------------------------- */
/* Zero-dependency guard so core never forces a validator choice on the
 * buyer. Swap for ajv against the schema above if you prefer. */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateUnifiedRequest(input: unknown): ValidationResult {
  const errors: string[] = [];
  const r = input as Record<string, unknown>;

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['request must be an object'] };
  }
  if (typeof r.prompt !== 'string' || r.prompt.length === 0) {
    errors.push('prompt is required and must be a non-empty string');
  }
  if (r.temperature !== undefined) {
    const t = r.temperature;
    if (typeof t !== 'number' || t < 0 || t > 2) {
      errors.push('temperature must be a number between 0 and 2');
    }
  }
  if (r.max_tokens !== undefined) {
    const m = r.max_tokens;
    if (typeof m !== 'number' || m < 1 || !Number.isInteger(m)) {
      errors.push('max_tokens must be a positive integer');
    }
  }
  if (r.provider !== undefined && typeof r.provider !== 'string') {
    errors.push('provider must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/** Rough token estimate (~4 chars/token) for cost/latency routing before a
 * call is made. Adapters report true counts after the call. */
export function estimateTokens(prompt: string, maxTokens = 1024): number {
  return Math.ceil(prompt.length / 4) + maxTokens;
}

export function computeCost(
  inputTokens: number,
  outputTokens: number,
  meta: Pick<ProviderMetadata, 'cost_per_1k_input' | 'cost_per_1k_output'>,
): number {
  const cost =
    (inputTokens / 1000) * meta.cost_per_1k_input +
    (outputTokens / 1000) * meta.cost_per_1k_output;
  // Round to 6 dp — enterprise billing needs sub-cent precision.
  return Math.round(cost * 1e6) / 1e6;
}
