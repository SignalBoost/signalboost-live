// saas/lib/hub/infra-pr-router.ts
// The single, provider-agnostic entry point the Chief of Staff calls for ANY
// write intent. It packages the call into a generic InfrastructurePR and
// persists it to the pending queue. It NEVER executes — merge does that.
import { createInfraPr } from '@/lib/infra-pr/store';
import { classifyAction, ActionVerb, RiskTier, ApprovalTier } from '@/lib/hub/action-policy';

// The one shape all four providers flow through. `payload` is opaque.
export interface InfrastructurePR {
  provider: string;
  actionId: string;
  verb: ActionVerb;
  payload: Record<string, any>;
  title: string;
  description?: string | null;
  risk: RiskTier;
  tier: ApprovalTier;
  triggersRedeploy: boolean;
}

export interface RouteInput {
  provider: string;
  actionId: string;
  payload: Record<string, any>;
  title: string;
  description?: string | null;
  verb?: ActionVerb;
  elevated?: boolean;
  userId?: string | null;
}

export interface RouteResult {
  ok: boolean;
  pr_id?: string;
  tier?: ApprovalTier;
  risk?: RiskTier;
  message?: string;
  error?: string;
}

export async function routeInfrastructureWrite(input: RouteInput): Promise<RouteResult> {
  if (!input || !input.provider || !input.actionId || input.payload === undefined || !input.title) {
    return { ok: false, error: 'provider, actionId, payload and title are required' };
  }

  const cls = classifyAction({
    actionId: input.actionId,
    verb: input.verb,
    elevated: input.elevated,
  });

  const created = await createInfraPr({
    title: input.title,
    description: input.description ?? null,
    service: input.provider, // provider -> service column (agnostic mapping)
    action: input.actionId, // actionId -> action column
    payload: input.payload, // opaque Record<string, any>
    risk: cls.risk,
    triggers_redeploy: cls.triggersRedeploy,
    source: 'assistant',
    created_by: input.userId ?? null,
  });

  if (!created.ok) return { ok: false, error: created.error };

  const oneClick = cls.tier === 'auto_confirm';
  return {
    ok: true,
    pr_id: created.data ? created.data.id : undefined,
    tier: cls.tier,
    risk: cls.risk,
    message:
      `Drafted ${input.provider}/${input.actionId} as a pending PR (${cls.risk} risk). ` +
      (oneClick
        ? 'One click to merge at /dashboard/infrastructure.'
        : 'High-risk — requires an explicit confirm before merge at /dashboard/infrastructure.'),
  };
}
