// lib/infra-pr/router.ts
// The single, provider-agnostic entry the Chief of Staff calls for ANY
// write. Packages into a generic PR, computes the dry-run diff, persists.
// Never executes — merge does that. RBAC is enforced at MERGE, not here
// (drafting stays open so the AI can queue proposals).
import { createInfraPr } from './store';
import { classifyAction, requiredRoleForRisk } from './action-policy';
import { buildSimulationDiff } from './execute';
import { ActionVerb, ApprovalTier, RiskTier, Role } from './types';

export interface RouteInput {
  provider: string;
  actionId: string;
  payload: Record<string, any>;
  title: string;
  description?: string | null;
  verb?: ActionVerb;
  role?: string | null; // drafter role (tier hint only)
  userId?: string | null;
}

export interface RouteResult {
  ok: boolean;
  pr_id?: string;
  tier?: ApprovalTier;
  risk?: RiskTier;
  requiredRole?: Role;
  message?: string;
  error?: string;
}

export async function routeInfrastructureWrite(input: RouteInput): Promise<RouteResult> {
  if (!input || !input.provider || !input.actionId || input.payload === undefined || !input.title) {
    return { ok: false, error: 'provider, actionId, payload and title are required' };
  }

  const cls = classifyAction({ actionId: input.actionId, verb: input.verb, role: input.role });
  const diff = buildSimulationDiff(input.provider, input.actionId, input.payload, cls.verb);

  const created = await createInfraPr({
    title: input.title,
    description: input.description ?? null,
    service: input.provider,
    action: input.actionId,
    payload: input.payload,
    diff, // simulated diff stored for UI review
    risk: cls.risk,
    triggers_redeploy: cls.triggersRedeploy,
    source: 'assistant',
    created_by: input.userId ?? null,
  });

  if (!created.ok) return { ok: false, error: created.error };

  const requiredRole = requiredRoleForRisk(cls.risk);
  return {
    ok: true,
    pr_id: created.data ? created.data.id : undefined,
    tier: cls.tier,
    risk: cls.risk,
    requiredRole,
    message:
      `Drafted ${input.provider}/${input.actionId} as a pending PR (${cls.risk} risk, ` +
      `requires ${requiredRole} to merge). Review the simulated diff at /dashboard/infrastructure.`,
  };
}
