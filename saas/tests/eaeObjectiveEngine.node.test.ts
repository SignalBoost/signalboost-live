import assert from 'node:assert/strict';
import test from 'node:test';
import { EAE_OBJECTIVE_SCHEMA_VERSION, EnterpriseObjectiveGraph, evaluateObjectives, type EnterpriseObjectiveNode } from '../lib/autonomous-systems/objective-engine.ts';

const tenant = { tenantId: 'tenant-a', environmentId: 'prod', region: 'us' } as const;
const now = '2026-07-24T14:00:00.000Z';

function objective(overrides: Partial<EnterpriseObjectiveNode> & Pick<EnterpriseObjectiveNode, 'objectiveId' | 'title'>): EnterpriseObjectiveNode {
  return {
    schemaVersion: EAE_OBJECTIVE_SCHEMA_VERSION,
    tenant,
    objectiveId: overrides.objectiveId,
    title: overrides.title,
    level: overrides.level ?? 'operational',
    status: overrides.status ?? 'active',
    ownerEntityId: overrides.ownerEntityId ?? 'team-1',
    parentObjectiveId: overrides.parentObjectiveId,
    dependencyObjectiveIds: overrides.dependencyObjectiveIds ?? [],
    affectedEntityIds: overrides.affectedEntityIds ?? ['system-1'],
    priority: overrides.priority ?? 100,
    deadline: overrides.deadline,
    metrics: overrides.metrics ?? [],
    constraints: overrides.constraints ?? [],
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

test('ranks objectives deterministically and prioritizes explicit requests', () => {
  const graph = new EnterpriseObjectiveGraph(tenant, [
    objective({ objectiveId: 'b', title: 'B', priority: 200 }),
    objective({ objectiveId: 'a', title: 'A', priority: 10 }),
  ]);
  const request = { tenant, affectedEntityIds: ['system-1'], requestedObjectiveIds: ['a'], now, maxObjectives: 10 } as const;
  const first = evaluateObjectives(graph, request);
  const second = evaluateObjectives(graph, request);
  assert.equal(first.evaluationId, second.evaluationId);
  assert.equal(first.rankedObjectives[0].objectiveId, 'a');
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
});

test('orders dependencies before dependents and marks incomplete dependencies blocked', () => {
  const graph = new EnterpriseObjectiveGraph(tenant, [
    objective({ objectiveId: 'foundation', title: 'Foundation', status: 'active' }),
    objective({ objectiveId: 'mission', title: 'Mission', dependencyObjectiveIds: ['foundation'] }),
  ]);
  const result = evaluateObjectives(graph, { tenant, affectedEntityIds: ['system-1'], now, maxObjectives: 10 });
  assert.ok(result.dependencyOrder.indexOf('foundation') < result.dependencyOrder.indexOf('mission'));
  assert.ok(result.blockedObjectiveIds.includes('mission'));
});

test('detects metric tension and competing priority', () => {
  const graph = new EnterpriseObjectiveGraph(tenant, [
    objective({ objectiveId: 'growth', title: 'Growth', level: 'strategic', priority: 500, metrics: [{ metricId: 'm1', name: 'cost', target: 100, direction: 'increase', weight: 1 }] }),
    objective({ objectiveId: 'efficiency', title: 'Efficiency', level: 'strategic', priority: 503, metrics: [{ metricId: 'm2', name: 'cost', target: 50, direction: 'decrease', weight: 1 }] }),
  ]);
  const result = evaluateObjectives(graph, { tenant, affectedEntityIds: ['system-1'], now, maxObjectives: 10 });
  assert.deepEqual(result.conflicts.map(conflict => conflict.type).sort(), ['competing_priority', 'metric_tension']);
  assert.equal(result.conflicts.find(conflict => conflict.type === 'metric_tension')?.severity, 'critical');
});

test('rejects tenant crossing, duplicate IDs, cycles, secrets, and unbounded requests', () => {
  assert.throws(() => new EnterpriseObjectiveGraph(tenant, [objective({ objectiveId: 'x', title: 'X' }), objective({ objectiveId: 'x', title: 'X2' })]), /duplicate_objective_id/);
  assert.throws(() => new EnterpriseObjectiveGraph(tenant, [objective({ objectiveId: 'a', title: 'A', dependencyObjectiveIds: ['b'] }), objective({ objectiveId: 'b', title: 'B', dependencyObjectiveIds: ['a'] })]), /objective_dependency_cycle/);
  assert.throws(() => new EnterpriseObjectiveGraph(tenant, [objective({ objectiveId: 's', title: 'Secret', tags: [{ apiKey: 'bad' } as unknown as string] })]), /secret_rejected/);
  const graph = new EnterpriseObjectiveGraph(tenant, [objective({ objectiveId: 'a', title: 'A' })]);
  assert.throws(() => evaluateObjectives(graph, { tenant: { tenantId: 'tenant-b', environmentId: 'prod' }, affectedEntityIds: [], now, maxObjectives: 10 }), /tenant_environment_boundary_violation/);
  assert.throws(() => evaluateObjectives(graph, { tenant, affectedEntityIds: [], now, maxObjectives: 129 }), /unbounded_objective_request_rejected/);
});

test('truncates bounded results and boosts imminent deadlines', () => {
  const graph = new EnterpriseObjectiveGraph(tenant, [
    objective({ objectiveId: 'later', title: 'Later', priority: 100, deadline: '2026-12-01T00:00:00.000Z' }),
    objective({ objectiveId: 'soon', title: 'Soon', priority: 100, deadline: '2026-07-25T00:00:00.000Z' }),
  ]);
  const result = evaluateObjectives(graph, { tenant, affectedEntityIds: ['system-1'], now, maxObjectives: 1 });
  assert.equal(result.rankedObjectives[0].objectiveId, 'soon');
  assert.equal(result.truncated, true);
});
