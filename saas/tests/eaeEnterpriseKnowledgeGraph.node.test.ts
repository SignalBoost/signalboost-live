import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EAE_ENTERPRISE_CONTEXT_SCHEMA_VERSION as CONTEXT_VERSION,
  EnterpriseRelationshipGraph,
  buildEnterpriseContextSnapshot,
  type DigitalTwinEntity,
  type EnterpriseRelationship,
} from '../lib/autonomous-systems/enterprise-context.ts';
import { buildEnterpriseKnowledgeGraph } from '../lib/autonomous-systems/enterprise-knowledge-graph.ts';

const tenant = { tenantId: 'acme', environmentId: 'production', region: 'us' };
const now = '2026-07-24T00:00:00.000Z';

function entity(entityId: string, entityType: DigitalTwinEntity['entityType'], extra: Record<string, unknown> = {}): DigitalTwinEntity {
  return {
    schemaVersion: CONTEXT_VERSION,
    entityId,
    tenant,
    entityType,
    displayName: entityId,
    status: 'active',
    provenance: { source: 'customer-cmdb', evidenceRefs: [`evidence-${entityId}`] },
    observedAt: now,
    effectiveAt: now,
    metadata: { classification: 'internal', tags: ['tested'] },
    ...extra,
  } as DigitalTwinEntity;
}

function relationship(relationshipId: string, fromEntityId: string, toEntityId: string, type: EnterpriseRelationship['type'] = 'depends_on'): EnterpriseRelationship {
  return {
    schemaVersion: CONTEXT_VERSION,
    relationshipId,
    tenant,
    type,
    fromEntityId,
    toEntityId,
    provenance: { source: 'customer-cmdb', evidenceRefs: [`evidence-${relationshipId}`] },
    observedAt: now,
    effectiveAt: now,
    metadata: {},
  };
}

function snapshot() {
  const graph = new EnterpriseRelationshipGraph(tenant, [
    entity('application', 'application'),
    entity('database', 'system', { critical: true }),
    entity('owner', 'team'),
  ], [
    relationship('app-db', 'application', 'database'),
    relationship('owner-app', 'owner', 'application', 'owns'),
  ]);
  return buildEnterpriseContextSnapshot(graph, {
    tenant,
    affectedEntityIds: ['application', 'owner'],
    maxDepth: 3,
    maxEntities: 10,
    snapshotAt: now,
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return { tenant, seedEntityIds: ['application'], maxDepth: 2, maxNodes: 10, generatedAt: now, ...overrides };
}

test('materializes a deterministic, immutable, JSON-serializable pre-COS knowledge graph', () => {
  const context = snapshot();
  const first = buildEnterpriseKnowledgeGraph({ snapshot: context, request: request() });
  const second = buildEnterpriseKnowledgeGraph({ snapshot: context, request: request() });

  assert.equal(first.graphId, second.graphId);
  assert.equal(first.boundary, 'pre_cos_reasoning_only');
  assert.deepEqual(first.nodes.map((node) => node.nodeId), ['application', 'database', 'owner']);
  assert.deepEqual(first.edges.map((edge) => edge.edgeId), ['app-db', 'owner-app']);
  assert.ok(first.facts.some((fact) => fact.object === 'depends_on:database'));
  assert.ok(Object.isFrozen(first));
  assert.doesNotThrow(() => JSON.stringify(first));
});

test('uses bounded, relationship-filtered traversal and reports node truncation deterministically', () => {
  const context = snapshot();
  const graph = buildEnterpriseKnowledgeGraph({
    snapshot: context,
    request: request({ relationshipTypes: ['depends_on'], maxNodes: 1 }),
  });

  assert.deepEqual(graph.nodes.map((node) => node.nodeId), ['application']);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.truncated, true);
  assert.deepEqual(graph.traversedPaths, [['application']]);
});

test('fails closed for tenant escapes, contradictory context, secret-shaped values, invalid bounds, and unknown seeds', () => {
  const context = snapshot();
  assert.throws(() => buildEnterpriseKnowledgeGraph({ snapshot: context, request: request({ tenant: { ...tenant, environmentId: 'preview' } }) }), /boundary/);
  assert.throws(() => buildEnterpriseKnowledgeGraph({ snapshot: context, request: request({ maxDepth: 9 }) }), /unbounded/);
  assert.throws(() => buildEnterpriseKnowledgeGraph({ snapshot: context, request: request({ seedEntityIds: ['missing'] }) }), /seed/);
  assert.throws(() => buildEnterpriseKnowledgeGraph({ snapshot: context, request: request({ relationshipTypes: ['not_a_relationship'] }) }), /relationship_type/);
  assert.throws(() => buildEnterpriseKnowledgeGraph({
    snapshot: { ...context, gaps: [...context.gaps, { code: 'policy_conflict', severity: 'warning', detail: 'contradiction' }] },
    request: request(),
  }), /contradictory/);
  assert.throws(() => buildEnterpriseKnowledgeGraph({
    snapshot: { ...context, entities: [{ ...context.entities[0], metadata: { apiKey: 'not-allowed' } }, ...context.entities.slice(1)] },
    request: request(),
  }), /secret/);
});
