import type { TenantContext } from './types.ts';

export const EAE_OBJECTIVE_SCHEMA_VERSION = '1.0.0' as const;
export type ObjectiveLevel = 'strategic' | 'tactical' | 'operational' | 'mission' | 'task';
export type ObjectiveStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'cancelled';
export type ObjectiveConflictType = 'competing_priority' | 'metric_tension' | 'dependency_cycle' | 'deadline_tension';

export interface ObjectiveMetric {
  readonly metricId: string;
  readonly name: string;
  readonly target: number;
  readonly direction: 'increase' | 'decrease' | 'maintain';
  readonly weight: number;
}

export interface EnterpriseObjectiveNode {
  readonly schemaVersion: typeof EAE_OBJECTIVE_SCHEMA_VERSION;
  readonly objectiveId: string;
  readonly tenant: TenantContext;
  readonly title: string;
  readonly level: ObjectiveLevel;
  readonly status: ObjectiveStatus;
  readonly ownerEntityId: string;
  readonly parentObjectiveId?: string;
  readonly dependencyObjectiveIds: readonly string[];
  readonly affectedEntityIds: readonly string[];
  readonly priority: number;
  readonly deadline?: string;
  readonly metrics: readonly ObjectiveMetric[];
  readonly constraints: readonly string[];
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ObjectiveConflict {
  readonly conflictId: string;
  readonly type: ObjectiveConflictType;
  readonly objectiveIds: readonly string[];
  readonly severity: 'warning' | 'critical';
  readonly explanation: string;
}

export interface ObjectiveEvaluationRequest {
  readonly tenant: TenantContext;
  readonly affectedEntityIds: readonly string[];
  readonly requestedObjectiveIds?: readonly string[];
  readonly now: string;
  readonly maxObjectives: number;
}

export interface RankedObjective {
  readonly objectiveId: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface ObjectiveEvaluation {
  readonly schemaVersion: typeof EAE_OBJECTIVE_SCHEMA_VERSION;
  readonly tenant: TenantContext;
  readonly evaluatedAt: string;
  readonly evaluationId: string;
  readonly rankedObjectives: readonly RankedObjective[];
  readonly conflicts: readonly ObjectiveConflict[];
  readonly dependencyOrder: readonly string[];
  readonly blockedObjectiveIds: readonly string[];
  readonly truncated: boolean;
}

const secret = /(secret|token|password|credential|authorization|private.?key|api.?key)/i;
const levelWeight: Readonly<Record<ObjectiveLevel, number>> = { strategic: 50, tactical: 40, operational: 30, mission: 20, task: 10 };

function tenantKey(tenant: TenantContext): string { return `${tenant.tenantId}:${tenant.environmentId}`; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('non_json_value_rejected');
  return encoded;
}
function hash(value: unknown): string { let h=2166136261; for (const char of canonical(value)) { h ^= char.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(value:T):T { if(!value||typeof value!=='object'||Object.isFrozen(value)) return value; Object.freeze(value); for(const child of Object.values(value as Record<string,unknown>)) freeze(child); return value; }
function assertSafe(value: unknown, path='value'): void {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error(`${path}_executable_rejected`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}_non_finite_number`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (secret.test(key)) throw new Error(`${path}_secret_rejected`); assertSafe(child, `${path}.${key}`); }
}

function validateObjective(objective: EnterpriseObjectiveNode, tenant: TenantContext): void {
  if (objective.schemaVersion !== EAE_OBJECTIVE_SCHEMA_VERSION) throw new Error('unsupported_objective_schema');
  if (tenantKey(objective.tenant) !== tenantKey(tenant)) throw new Error('tenant_environment_boundary_violation');
  if (!objective.objectiveId || !objective.title || !objective.ownerEntityId) throw new Error('invalid_objective');
  if (!Number.isInteger(objective.priority) || objective.priority < 0 || objective.priority > 1000) throw new Error('invalid_objective_priority');
  if (!Number.isFinite(Date.parse(objective.createdAt)) || !Number.isFinite(Date.parse(objective.updatedAt)) || (objective.deadline && !Number.isFinite(Date.parse(objective.deadline)))) throw new Error('invalid_objective_timestamp');
  if (objective.metrics.some(metric => !metric.metricId || !metric.name || !Number.isFinite(metric.target) || !Number.isFinite(metric.weight) || metric.weight < 0 || metric.weight > 1)) throw new Error('invalid_objective_metric');
  assertSafe(objective, 'objective');
}

export class EnterpriseObjectiveGraph {
  readonly tenant: TenantContext;
  private readonly objectives = new Map<string, EnterpriseObjectiveNode>();

  constructor(tenant: TenantContext, objectives: readonly EnterpriseObjectiveNode[] = []) {
    if (!tenant.tenantId || !tenant.environmentId) throw new Error('tenant_required');
    this.tenant = freeze({ ...tenant });
    objectives.forEach(objective => this.addObjective(objective));
    this.assertAcyclic();
  }

  addObjective(objective: EnterpriseObjectiveNode): void {
    validateObjective(objective, this.tenant);
    if (this.objectives.has(objective.objectiveId)) throw new Error('duplicate_objective_id');
    this.objectives.set(objective.objectiveId, freeze({ ...objective }));
  }

  snapshot(): readonly EnterpriseObjectiveNode[] {
    return freeze([...this.objectives.values()].sort((a,b) => a.objectiveId.localeCompare(b.objectiveId)));
  }

  dependencyOrder(ids?: readonly string[]): readonly string[] {
    this.assertAcyclic();
    const selected = new Set(ids ?? [...this.objectives.keys()]);
    const order: string[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      const objective = this.objectives.get(id);
      if (!objective) throw new Error('unknown_objective');
      for (const dependency of objective.dependencyObjectiveIds.slice().sort()) visit(dependency);
      visited.add(id);
      if (selected.has(id)) order.push(id);
    };
    [...selected].sort().forEach(visit);
    return freeze(order);
  }

  private assertAcyclic(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error('objective_dependency_cycle');
      if (visited.has(id)) return;
      const objective = this.objectives.get(id);
      if (!objective) throw new Error('unknown_objective');
      visiting.add(id);
      for (const dependency of objective.dependencyObjectiveIds) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    [...this.objectives.keys()].sort().forEach(visit);
  }
}

export function evaluateObjectives(graph: EnterpriseObjectiveGraph, request: ObjectiveEvaluationRequest): ObjectiveEvaluation {
  if (tenantKey(graph.tenant) !== tenantKey(request.tenant)) throw new Error('tenant_environment_boundary_violation');
  if (!Number.isInteger(request.maxObjectives) || request.maxObjectives < 1 || request.maxObjectives > 128) throw new Error('unbounded_objective_request_rejected');
  if (!Number.isFinite(Date.parse(request.now))) throw new Error('invalid_evaluation_timestamp');

  const all = graph.snapshot();
  const requested = new Set(request.requestedObjectiveIds ?? []);
  const affected = new Set(request.affectedEntityIds);
  const ranked = all.filter(objective => objective.status === 'active' || objective.status === 'blocked').map(objective => {
    const reasons: string[] = [];
    let score = objective.priority + levelWeight[objective.level];
    if (requested.has(objective.objectiveId)) { score += 200; reasons.push('explicitly_requested'); }
    const overlap = objective.affectedEntityIds.filter(id => affected.has(id)).length;
    if (overlap) { score += overlap * 25; reasons.push('affected_entity_overlap'); }
    if (objective.status === 'blocked') { score -= 100; reasons.push('currently_blocked'); }
    if (objective.deadline) {
      const remainingDays = (Date.parse(objective.deadline) - Date.parse(request.now)) / 86_400_000;
      if (remainingDays < 0) { score += 75; reasons.push('deadline_overdue'); }
      else if (remainingDays <= 7) { score += 50; reasons.push('deadline_imminent'); }
    }
    return { objectiveId: objective.objectiveId, score, reasons: reasons.sort() };
  }).sort((a,b) => b.score - a.score || a.objectiveId.localeCompare(b.objectiveId));

  const selected = ranked.slice(0, request.maxObjectives);
  const selectedIds = new Set(selected.map(item => item.objectiveId));
  const conflicts: ObjectiveConflict[] = [];
  const selectedObjectives = all.filter(objective => selectedIds.has(objective.objectiveId));
  for (let i=0; i<selectedObjectives.length; i++) {
    for (let j=i+1; j<selectedObjectives.length; j++) {
      const a = selectedObjectives[i]; const b = selectedObjectives[j];
      const shared = a.affectedEntityIds.some(id => b.affectedEntityIds.includes(id));
      if (shared && Math.abs(a.priority - b.priority) <= 5 && a.level === b.level) conflicts.push({ conflictId: `objective_conflict_${hash([a.objectiveId,b.objectiveId,'priority'])}`, type: 'competing_priority', objectiveIds: [a.objectiveId,b.objectiveId].sort(), severity: 'warning', explanation: 'Objectives have similar precedence and affect at least one common enterprise entity.' });
      const tension = a.metrics.some(left => b.metrics.some(right => left.name === right.name && left.direction !== right.direction));
      if (tension) conflicts.push({ conflictId: `objective_conflict_${hash([a.objectiveId,b.objectiveId,'metric'])}`, type: 'metric_tension', objectiveIds: [a.objectiveId,b.objectiveId].sort(), severity: 'critical', explanation: 'Objectives apply opposing directions to the same metric.' });
    }
  }

  const blocked = selectedObjectives.filter(objective => objective.status === 'blocked' || objective.dependencyObjectiveIds.some(id => !all.some(candidate => candidate.objectiveId === id && candidate.status === 'completed'))).map(objective => objective.objectiveId).sort();
  const dependencyOrder = graph.dependencyOrder(selected.map(item => item.objectiveId));
  const base = { schemaVersion: EAE_OBJECTIVE_SCHEMA_VERSION, tenant: graph.tenant, evaluatedAt: request.now, rankedObjectives: selected, conflicts: conflicts.sort((a,b)=>a.conflictId.localeCompare(b.conflictId)), dependencyOrder, blockedObjectiveIds: blocked, truncated: ranked.length > request.maxObjectives };
  return freeze({ ...base, evaluationId: `eae_objectives_${hash(base)}` });
}
