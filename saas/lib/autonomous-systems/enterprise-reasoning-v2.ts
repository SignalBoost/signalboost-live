import type { ContextSnapshot } from './enterprise-context.ts';
import type { EnterpriseIntelligenceEnvelopeV1 } from './reasoning.ts';

export type EnterpriseIntelligenceEnvelopeV2 = Omit<EnterpriseIntelligenceEnvelopeV1, 'schemaVersion'> & {
  readonly schemaVersion: '2.0.0';
  readonly enterpriseContext: ContextSnapshot;
  readonly affectedEntities: readonly string[];
  readonly affectedRelationships: readonly string[];
  readonly applicablePolicyIds: readonly string[];
  readonly activeObjectiveIds: readonly string[];
  readonly dependencyPaths: readonly (readonly string[])[];
  readonly capabilityReferences: readonly string[];
  readonly contextRelevanceExplanations: Readonly<Record<string, readonly string[]>>;
  readonly contextConfidence: number;
  readonly unresolvedContextGaps: readonly string[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('non_json_value_rejected');
  return encoded;
}

function fingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const character of canonical(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

export function buildEnterpriseIntelligenceEnvelopeV2(input: {
  readonly envelope: EnterpriseIntelligenceEnvelopeV1;
  readonly enterpriseContext: ContextSnapshot;
}): EnterpriseIntelligenceEnvelopeV2 {
  if (
    input.envelope.tenant.tenantId !== input.enterpriseContext.tenant.tenantId ||
    input.envelope.tenant.environmentId !== input.enterpriseContext.tenant.environmentId
  ) throw new Error('tenant_environment_boundary_violation');

  const criticalGaps = input.enterpriseContext.gaps.filter((gap) => gap.severity === 'critical');
  const warningGaps = input.enterpriseContext.gaps.filter((gap) => gap.severity === 'warning');
  const contextConfidence = Math.max(
    0,
    Number((1 - criticalGaps.length * 0.5 - warningGaps.length * 0.1).toFixed(2)),
  );
  const base = {
    ...input.envelope,
    schemaVersion: '2.0.0' as const,
    enterpriseContext: input.enterpriseContext,
    affectedEntities: input.enterpriseContext.relevance.includedEntityIds,
    affectedRelationships: input.enterpriseContext.relationships.map((item) => item.relationshipId),
    applicablePolicyIds: input.enterpriseContext.applicablePolicies.map((item) => item.entityId),
    activeObjectiveIds: input.enterpriseContext.activeObjectives.map((item) => item.entityId),
    dependencyPaths: input.enterpriseContext.relevance.relationshipPaths,
    capabilityReferences: input.enterpriseContext.capabilities.map((item) => item.reference),
    contextRelevanceExplanations: input.enterpriseContext.relevance.inclusionReasons,
    contextConfidence,
    unresolvedContextGaps: input.enterpriseContext.gaps.map((item) => item.code),
    boundary: 'pre_cos_reasoning_only' as const,
  };
  return deepFreeze({ ...base, envelopeId: `eae_envelope_v2_${fingerprint(base)}` });
}
