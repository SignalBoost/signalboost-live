import type {
  EnterpriseExecutionSimulationSnapshot,
  SimulatedExecutionTransition,
  SimulatedStepState,
} from './execution-orchestrator-simulation.ts';
import type { TenantContext } from './types.ts';

export const EAE_SIMULATION_REPLAY_VALIDATION_SCHEMA_VERSION = '1.0.0' as const;

export interface SimulationReplayValidationRequest {
  readonly tenant: TenantContext;
  readonly simulation: EnterpriseExecutionSimulationSnapshot;
  readonly expectedPlanId?: string;
  readonly expectedAuthorizationId?: string;
  readonly maxTransitions: number;
}

export interface SimulationReplayValidationIssue {
  readonly code: string;
  readonly detail: string;
}

export interface EnterpriseSimulationReplayValidationSnapshot {
  readonly schemaVersion: typeof EAE_SIMULATION_REPLAY_VALIDATION_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly simulationId: string;
  readonly planId: string;
  readonly authorizationId: string;
  readonly valid: boolean;
  readonly replayableForAudit: boolean;
  readonly executable: false;
  readonly errors: readonly SimulationReplayValidationIssue[];
  readonly warnings: readonly SimulationReplayValidationIssue[];
  readonly verifiedTransitionCount: number;
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

const TRANSITION_STATES: ReadonlySet<SimulatedStepState> = new Set([
  'simulated_success', 'simulated_rollback', 'waiting_for_approval', 'blocked', 'skipped',
]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('non_json_value_rejected');
  return encoded;
}

function hash(value: unknown): string {
  let result = 2166136261;
  for (const character of canonical(value)) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return value;
}

function tenantKey(tenant: TenantContext): string { return `${tenant.tenantId}:${tenant.environmentId}`; }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function refs(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter(nonEmpty) : []; }
function transitions(value: unknown): readonly SimulatedExecutionTransition[] { return Array.isArray(value) ? value as readonly SimulatedExecutionTransition[] : []; }

export function validateEnterpriseSimulationReplay(request: SimulationReplayValidationRequest): EnterpriseSimulationReplayValidationSnapshot {
  if (!request || !request.tenant || !nonEmpty(request.tenant.tenantId) || !nonEmpty(request.tenant.environmentId)) throw new Error('tenant_required');
  if (!Number.isInteger(request.maxTransitions) || request.maxTransitions < 1 || request.maxTransitions > 512) throw new Error('unbounded_replay_validation_rejected');

  const simulation = request.simulation as EnterpriseExecutionSimulationSnapshot;
  const errors: SimulationReplayValidationIssue[] = [];
  const warnings: SimulationReplayValidationIssue[] = [];
  const error = (code: string, detail: string): void => { errors.push({ code, detail }); };
  const simulationTenant = simulation?.tenant;
  if (!simulationTenant || !nonEmpty(simulationTenant.tenantId) || !nonEmpty(simulationTenant.environmentId)) error('tenant_required', 'simulation tenant and environment are required');
  if (!simulationTenant || tenantKey(simulationTenant) !== tenantKey(request.tenant)) error('simulation_tenant_boundary_violation', 'simulation tenant must match request tenant');
  if (simulation?.executable !== false) error('executable_simulation_rejected', 'simulation must be explicitly non-executable');
  if (!nonEmpty(simulation?.simulationId)) error('simulation_id_required', 'simulation ID is required');
  if (!nonEmpty(simulation?.planId)) error('plan_id_required', 'plan ID is required');
  if (!nonEmpty(simulation?.authorizationId)) error('authorization_id_required', 'authorization ID is required');
  if (request.expectedPlanId !== undefined && simulation?.planId !== request.expectedPlanId) error('expected_plan_id_mismatch', 'simulation plan ID does not match expected plan ID');
  if (request.expectedAuthorizationId !== undefined && simulation?.authorizationId !== request.expectedAuthorizationId) error('expected_authorization_id_mismatch', 'simulation authorization ID does not match expected authorization ID');

  const allTransitions = transitions(simulation?.transitions);
  const limitedTransitions = allTransitions.slice(0, request.maxTransitions);
  const truncated = allTransitions.length > request.maxTransitions || simulation?.truncated === true;
  if (allTransitions.length > request.maxTransitions) warnings.push({ code: 'transition_validation_truncated', detail: 'transition validation reached maxTransitions' });

  const stepStates = new Map<string, SimulatedStepState>();
  limitedTransitions.forEach((transition, index) => {
    if (!Number.isInteger(transition?.ordinal) || transition.ordinal !== index + 1) error('invalid_transition_ordinal', `transition ${index + 1} ordinal must equal ${index + 1}`);
    if (!nonEmpty(transition?.stepId)) error('transition_step_id_required', `transition ${index + 1} step ID is required`);
    else if (stepStates.has(transition.stepId)) error('duplicate_transition_step_id', `duplicate transition step ID: ${transition.stepId}`);
    if (!TRANSITION_STATES.has(transition?.state)) error('invalid_transition_state', `invalid transition state at ordinal ${index + 1}`);
    if (!nonEmpty(transition?.reason)) error('transition_reason_required', `transition reason is required at ordinal ${index + 1}`);
    if (nonEmpty(transition?.stepId) && TRANSITION_STATES.has(transition?.state)) stepStates.set(transition.stepId, transition.state);
  });

  const classifications: readonly [string, readonly string[], ReadonlySet<SimulatedStepState>, string][] = [
    ['completed', refs(simulation?.completedStepIds), new Set(['simulated_success']), 'completed_step_state_mismatch'],
    ['rolled back', refs(simulation?.rolledBackStepIds), new Set(['simulated_rollback']), 'rollback_step_state_mismatch'],
    ['blocked', refs(simulation?.blockedStepIds), new Set(['blocked', 'skipped', 'waiting_for_approval']), 'blocked_step_state_mismatch'],
  ];
  const classified = new Map<string, string>();
  for (const [name, stepIds, permittedStates, mismatchCode] of classifications) {
    for (const stepId of stepIds) {
      const existing = classified.get(stepId);
      if (existing && existing !== name) error('conflicting_terminal_classification', `step ${stepId} is both ${existing} and ${name}`);
      classified.set(stepId, name);
      if (!permittedStates.has(stepStates.get(stepId) as SimulatedStepState)) error(mismatchCode, `${name} step ${stepId} has no matching transition state`);
    }
  }

  const states = limitedTransitions.map(transition => transition?.state);
  if (simulation?.status === 'simulated_complete' && states.some(state => state === 'simulated_rollback' || state === 'blocked' || state === 'skipped' || state === 'waiting_for_approval')) error('simulation_status_inconsistent', 'simulated_complete cannot contain rollback, blocked, skipped, or waiting transitions');
  if (simulation?.status === 'simulated_with_rollback' && !states.includes('simulated_rollback')) error('simulation_status_inconsistent', 'simulated_with_rollback requires a rollback transition');
  if (simulation?.status === 'waiting_for_approval' && !states.includes('waiting_for_approval')) error('simulation_status_inconsistent', 'waiting_for_approval requires a waiting transition');
  if (simulation?.status === 'blocked' && !states.some(state => state === 'blocked' || state === 'skipped')) error('simulation_status_inconsistent', 'blocked requires a blocked or skipped transition');
  if (!['simulated_complete', 'simulated_with_rollback', 'waiting_for_approval', 'blocked'].includes(simulation?.status)) error('simulation_status_inconsistent', 'simulation status is unknown');

  const evidenceRefs = [...new Set([...refs(simulation?.evidenceRefs), ...limitedTransitions.flatMap(transition => refs(transition?.evidenceRefs))])].sort();
  const base = { schemaVersion: EAE_SIMULATION_REPLAY_VALIDATION_SCHEMA_VERSION, tenant: request.tenant, simulationId: nonEmpty(simulation?.simulationId) ? simulation.simulationId : '', planId: nonEmpty(simulation?.planId) ? simulation.planId : '', authorizationId: nonEmpty(simulation?.authorizationId) ? simulation.authorizationId : '', valid: errors.length === 0, replayableForAudit: errors.length === 0 && !truncated, executable: false as const, errors, warnings, verifiedTransitionCount: limitedTransitions.length, evidenceRefs, truncated };
  return freeze({ ...base, validationId: `eae_simulation_replay_validation_${hash(base)}` });
}
