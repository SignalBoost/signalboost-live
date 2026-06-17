// saas/lib/hub/infra-action-policy.ts
// PR-queue classifier. Single source of truth: it READS the existing hand-
// curated HUB_ACTION_POLICIES via getHubActionPolicy(). It does not duplicate
// risk logic and never checks providers directly — your policy map already
// encodes risk/approval per action ID across all providers.
import { getHubActionPolicy, HubActionPolicy } from '@/lib/hub/action-policy';

export type ActionVerb = 'read' | 'create' | 'update' | 'delete';
export type RiskTier = 'low' | 'medium' | 'high';
export type ApprovalTier = 'auto_confirm' | 'needs_approval';

// Map the engine's 4-level risk onto the PR queue's 3 tiers.
function toRiskTier(policy: HubActionPolicy): RiskTier {
  if (policy.risk === 'critical' || policy.risk === 'high') return 'high';
  if (policy.risk === 'medium') return 'medium';
  return 'low';
}

// Infer a CRUD verb from the action ID (display/metadata only; the engine
// policy, not the verb, decides risk). Unknown shapes default to 'update'.
export function deriveVerb(actionId: string): ActionVerb {
  const a = (actionId || '').toLowerCase();
  if (/(?:^|_)(delete|drop|truncate|empty|purge|destroy|remove|revoke)(?:_|$)/.test(a)) return 'delete';
  if (/(?:^|_)(update|edit|patch|set|rotate|reset|modify|sync)(?:_|$)/.test(a)) return 'update';
  if (/(?:^|_)(create|insert|add|new|invite|provision|upload|generate)(?:_|$)/.test(a)) return 'create';
  if (/(?:^|_)(list|get|read|fetch|query|select|describe|show|explain)(?:_|$)/.test(a)) return 'read';
  return 'update';
}

// production-sensitive actions (env, deploy, domains) should also redeploy.
function shouldRedeploy(policy: HubActionPolicy): boolean {
  return !!policy.productionSensitive;
}

export interface ActionClassification {
  verb: ActionVerb;
  risk: RiskTier;
  tier: ApprovalTier;
  triggersRedeploy: boolean;
  approval: HubActionPolicy['approval'];
  blocked: boolean;
}

export function classifyAction(input: {
  actionId: string;
  verb?: ActionVerb;
  elevated?: boolean;
}): ActionClassification {
  const policy = getHubActionPolicy(input.actionId);
  const risk = toRiskTier(policy);
  const blocked = policy.approval === 'blocked';

  // High risk, blocked, or any owner/admin-approval action => needs explicit
  // confirm. Low/medium that the engine allows => one-click when elevated.
  let tier: ApprovalTier = 'needs_approval';
  if (!blocked && risk !== 'high' && policy.approval === 'none') {
    tier = input.elevated ? 'auto_confirm' : 'needs_approval';
  }

  return {
    verb: input.verb || deriveVerb(input.actionId),
    risk,
    tier,
    triggersRedeploy: shouldRedeploy(policy),
    approval: policy.approval,
    blocked,
  };
}
