import { createHash } from 'node:crypto'

/**
 * COS cache-key foundation.
 *
 * Cache identity belongs to COS, never to a provider or Portable. The same
 * logical request should therefore produce the same key regardless of which
 * external compute engine may eventually execute it.
 */
export type CosCacheKeyInput = {
  capability: string
  operation: string
  input: unknown
  tenantId?: string | null
  locale?: string | null
  knowledgeVersion?: string | null
  policyVersion?: string | null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }

  return value
}

export function stableCosPayload(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function createCosCacheKey(input: CosCacheKeyInput): string {
  const identity = stableCosPayload({
    capability: input.capability,
    operation: input.operation,
    input: input.input,
    tenantId: input.tenantId ?? null,
    locale: input.locale ?? null,
    knowledgeVersion: input.knowledgeVersion ?? null,
    policyVersion: input.policyVersion ?? null,
  })

  return `cos:v1:${createHash('sha256').update(identity).digest('hex')}`
}
