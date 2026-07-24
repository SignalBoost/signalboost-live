import type {
  ContextSnapshot,
  DigitalTwinEntity,
  EnterpriseRelationship,
  RelationshipType,
} from './enterprise-context.ts';
import type { TenantContext } from './types.ts';

export const EAE_ENTERPRISE_KNOWLEDGE_GRAPH_SCHEMA_VERSION = '1.0.0' as const;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface EnterpriseKnowledgeNode {
  readonly nodeId: string;
  readonly entityType: DigitalTwinEntity['entityType'];
  readonly displayName: string;
  readonly status: string;
  readonly critical: boolean;
  readonly region?: string;
  readonly attributes: Readonly<Record<string, Json>>;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseKnowledgeEdge {
  readonly edgeId: string;
  readonly relationshipType: RelationshipType;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseKnowledgeFact {
  readonly factId: string;
  readonly subjectNodeId: string;
  readonly predicate: 'entity_status' | 'entity_criticality' | 'relationship';
  readonly object: string | boolean;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseKnowledgeGraphRequest {
  readonly tenant: TenantContext;
  readonly seedEntityIds: readonly string[];
  readonly relationshipTypes?: readonly RelationshipType[];
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly generatedAt: string;
}

export interface EnterpriseKnowledgeGraph {
  readonly schemaVersion: typeof EAE_ENTERPRISE_KNOWLEDGE_GRAPH_SCHEMA_VERSION;
  readonly graphId: string;
  readonly tenant: TenantContext;
  readonly generatedAt: string;
  readonly sourceSnapshotId: string;
  readonly nodes: readonly EnterpriseKnowledgeNode[];
  readonly edges: readonly EnterpriseKnowledgeEdge[];
  readonly facts: readonly EnterpriseKnowledgeFact[];
  readonly traversedPaths: readonly (readonly string[])[];
  readonly truncated: boolean;
  readonly boundary: 'pre_cos_reasoning_only';
}

const secretPattern = /(secret|token|password|credential|authorization|private.?key|api.?key)/i;
const attributeKeys = new Set(['classification', 'criticality', 'lifecycle', 'tags', 'externalReference', 'riskLevel', 'actionCategory', 'description']);
const relationshipTypes = new Set<RelationshipType>(['owns', 'operates', 'depends_on', 'provides', 'consumes', 'governed_by', 'approved_by', 'monitored_by', 'executes', 'verifies', 'affects', 'blocks', 'supports', 'conflicts_with']);

function tenantKey(tenant: TenantContext): string {
  return `${tenant.tenantId}:${tenant.environmentId}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
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

function assertJsonSafe(value: unknown, path = 'value'): asserts value is Json {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new Error(`${path}_executable_rejected`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}_non_finite_number`);
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (secretPattern.test(key)) throw new Error(`${path}_secret_rejected`);
    assertJsonSafe(entry, `${path}.${key}`);
  }
}

function validateSnapshot(snapshot: ContextSnapshot, tenant: TenantContext): void {
  if (snapshot.schemaVersion !== '2.0.0') throw new Error('unsupported_context_schema');
  if (tenantKey(snapshot.tenant) !== tenantKey(tenant)) throw new Error('tenant_environment_boundary_violation');
  if (!snapshot.snapshotId || !Number.isFinite(Date.parse(snapshot.snapshotAt))) throw new Error('invalid_context_snapshot');
  assertJsonSafe(snapshot, 'context_snapshot');
  if (snapshot.gaps.some((gap) => gap.code === 'policy_conflict' || gap.code === 'conflicting_entity_status')) {
    throw new Error('contradictory_context_rejected');
  }
  if (snapshot.entities.length > 256 || snapshot.relationships.length > 1024) throw new Error('unbounded_context_snapshot_rejected');
  const ids = new Set<string>();
  for (const entity of snapshot.entities) {
    if (!entity.entityId || ids.has(entity.entityId) || tenantKey(entity.tenant) !== tenantKey(tenant)) {
      throw new Error('invalid_context_entity');
    }
    ids.add(entity.entityId);
  }
  for (const relationship of snapshot.relationships) {
    if (!relationshipTypes.has(relationship.type) || !relationship.relationshipId || !ids.has(relationship.fromEntityId) || !ids.has(relationship.toEntityId)
      || tenantKey(relationship.tenant) !== tenantKey(tenant)) throw new Error('invalid_context_relationship');
  }
}

function nodeFrom(entity: DigitalTwinEntity): EnterpriseKnowledgeNode {
  const attributes = Object.fromEntries(
    Object.entries(entity.metadata)
      .filter(([key]) => attributeKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    nodeId: entity.entityId,
    entityType: entity.entityType,
    displayName: entity.displayName,
    status: entity.status,
    critical: entity.critical === true,
    ...(entity.region ? { region: entity.region } : {}),
    attributes,
    evidenceRefs: [...new Set(entity.provenance.evidenceRefs)].sort(),
  };
}

function edgeFrom(relationship: EnterpriseRelationship): EnterpriseKnowledgeEdge {
  return {
    edgeId: relationship.relationshipId,
    relationshipType: relationship.type,
    fromNodeId: relationship.fromEntityId,
    toNodeId: relationship.toEntityId,
    evidenceRefs: [...new Set(relationship.provenance.evidenceRefs)].sort(),
  };
}

export function buildEnterpriseKnowledgeGraph(input: {
  readonly snapshot: ContextSnapshot;
  readonly request: EnterpriseKnowledgeGraphRequest;
}): EnterpriseKnowledgeGraph {
  const { snapshot, request } = input;
  if (!request.tenant.tenantId || !request.tenant.environmentId) throw new Error('tenant_required');
  if (!Number.isFinite(Date.parse(request.generatedAt))) throw new Error('invalid_generated_at');
  if (!Number.isInteger(request.maxDepth) || request.maxDepth < 0 || request.maxDepth > 8) {
    throw new Error('unbounded_knowledge_graph_depth_rejected');
  }
  if (!Number.isInteger(request.maxNodes) || request.maxNodes < 1 || request.maxNodes > 256) {
    throw new Error('unbounded_knowledge_graph_nodes_rejected');
  }
  validateSnapshot(snapshot, request.tenant);

  const entities = new Map(snapshot.entities.map((entity) => [entity.entityId, entity]));
  const seedIds = [...new Set(request.seedEntityIds)].sort();
  if (seedIds.length === 0 || seedIds.some((id) => !entities.has(id))) throw new Error('invalid_knowledge_graph_seed');
  if (request.relationshipTypes && (request.relationshipTypes.length > relationshipTypes.size || request.relationshipTypes.some((type) => !relationshipTypes.has(type)))) {
    throw new Error('invalid_knowledge_graph_relationship_type');
  }
  const allowedTypes = request.relationshipTypes ? new Set(request.relationshipTypes) : null;
  const relationships = snapshot.relationships
    .filter((relationship) => !allowedTypes || allowedTypes.has(relationship.type))
    .sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));
  const adjacent = new Map<string, EnterpriseRelationship[]>();
  for (const relationship of relationships) {
    for (const entityId of [relationship.fromEntityId, relationship.toEntityId]) {
      const values = adjacent.get(entityId) ?? [];
      values.push(relationship);
      adjacent.set(entityId, values);
    }
  }
  for (const values of adjacent.values()) values.sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));

  const selected = new Set<string>();
  const paths: string[][] = [];
  const queue = seedIds.map((id) => [id]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path.at(-1)!;
    if (!selected.has(current)) selected.add(current);
    paths.push(path);
    if (path.length - 1 === request.maxDepth) continue;
    for (const relationship of adjacent.get(current) ?? []) {
      const next = relationship.fromEntityId === current ? relationship.toEntityId : relationship.fromEntityId;
      if (!path.includes(next)) queue.push([...path, next]);
    }
  }

  const orderedIds = [...selected].sort();
  const includedIds = orderedIds.slice(0, request.maxNodes);
  const included = new Set(includedIds);
  const selectedEdges = relationships.filter((relationship) => included.has(relationship.fromEntityId) && included.has(relationship.toEntityId));
  const nodes = includedIds.map((id) => nodeFrom(entities.get(id)!));
  const edges = selectedEdges.map(edgeFrom);
  const facts = [
    ...nodes.flatMap((node) => [
      { subjectNodeId: node.nodeId, predicate: 'entity_status' as const, object: node.status, evidenceRefs: node.evidenceRefs },
      { subjectNodeId: node.nodeId, predicate: 'entity_criticality' as const, object: node.critical, evidenceRefs: node.evidenceRefs },
    ]),
    ...edges.map((edge) => ({ subjectNodeId: edge.fromNodeId, predicate: 'relationship' as const, object: `${edge.relationshipType}:${edge.toNodeId}`, evidenceRefs: edge.evidenceRefs })),
  ].map((fact) => ({ ...fact, factId: `eae_knowledge_fact_${fingerprint(fact)}` }))
    .sort((left, right) => left.factId.localeCompare(right.factId));
  const traversedPaths = paths.filter((path) => included.has(path.at(-1)!)).map((path) => [...path]);
  const base = {
    schemaVersion: EAE_ENTERPRISE_KNOWLEDGE_GRAPH_SCHEMA_VERSION,
    tenant: request.tenant,
    generatedAt: request.generatedAt,
    sourceSnapshotId: snapshot.snapshotId,
    nodes,
    edges,
    facts,
    traversedPaths,
    truncated: selected.size > request.maxNodes,
    boundary: 'pre_cos_reasoning_only' as const,
  };
  return deepFreeze({ ...base, graphId: `eae_knowledge_graph_${fingerprint(base)}` });
}
