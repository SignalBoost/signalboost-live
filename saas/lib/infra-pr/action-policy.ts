// saas/lib/infra-pr/action-policy.ts
// lib/infra-pr/action-policy.ts
// SELF-CONTAINED, PROVIDER-AGNOSTIC policy + multi-level RBAC. Zero external
// imports beyond this module's own types. Provider is NEVER inspected.
//
// Risk (Option 2): CRUD verb baseline across all providers, with explicit
// critical/destructive action IDs flagged strict high-risk.
//
// RBAC: tiered clearance. Roles are INJECTED by the host app (auth-agnostic).
import type { ActionVerb, RiskTier, ApprovalTier, Role } from './types.ts';

const HIGH_RISK_ACTION_IDS: Record<string, true> = {
  drop_table: true, drop_schema: true, truncate_table: true, delete_row: true,
  archive_rows: true, empty_bucket: true, delete_bucket: true,
  delete_branch: true, delete_repo: true, force_push: true, delete_tag: true,
  delete_user: true, rotate_keys: true, reset_password: true,
  create_payout: true, refund_charge: true, delete_product: true, cancel_subscription: true,
  delete_deployment: true, delete_env_var: true, delete_domain: true,
};

const LOW_RISK_ACTION_IDS: Record<string, true> = {
  list_repos: true, get_repo: true, list_deployments: true, list_env_vars: true,
  list_products: true, list_users: true, list_buckets: true, storage_panel: true,
};

const REDEPLOY_HINTS = ['env_var', 'env-var', 'environment', 'redeploy', 'domain'];

const VERB_RISK: Record<ActionVerb, RiskTier> = {
  read: 'low', create: 'medium', update: 'medium', delete: 'high',
};

// ── RBAC matrix ────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<Role, number> = { NONE: 0, AI_OPERATOR: 1, LEAD_DEV: 2, CTO: 3 };
const LEVEL_ROLE: Record<number, Role> = { 0: 'NONE', 1: 'AI_OPERATOR', 2: 'LEAD_DEV', 3: 'CTO' };
// low -> AI_OPERATOR(1), medium -> LEAD_DEV(2), high -> CTO/ADMIN(3)
const RISK_REQUIRED_LEVEL: Record<RiskTier, number> = { low: 1, medium: 2, high: 3 };

export function normalizeRole(role?: string | null): Role {
  const r = (role || '').toString().trim().toLowerCase();
  if (['cto', 'admin', 'owner', 'super_admin', 'superadmin'].includes(r)) return 'CTO';
  if (['lead_dev', 'lead', 'developer', 'dev', 'engineer', 'maintainer'].includes(r)) return 'LEAD_DEV';
  if (['ai_operator', 'operator', 'ai', 'bot', 'service'].includes(r)) return 'AI_OPERATOR';
  return 'NONE';
}

export function clearanceLevel(role?: string | null): number {
  return ROLE_LEVEL[normalizeRole(role)];
}

export function requiredRoleForRisk(risk: RiskTier): Role {
  return LEVEL_ROLE[RISK_REQUIRED_LEVEL[risk]] || 'CTO';
}

// Hierarchical: a higher clearance satisfies any lower tier.
export function canMerge(
  role: string | undefined | null,
  risk: RiskTier,
): { ok: boolean; have: Role; required: Role; error?: string } {
  const have = normalizeRole(role);
  const haveLvl = ROLE_LEVEL[have];
  const reqLvl = RISK_REQUIRED_LEVEL[risk];
  const required = LEVEL_ROLE[reqLvl];
  if (haveLvl >= reqLvl) return { ok: true, have, required };
  return {
    ok: false,
    have,
    required,
    error: `Insufficient clearance: ${required} required to merge ${risk}-risk action (session role: ${have}).`,
  };
}

// ── Classification ─────────────────────────────────────────────────────────
export function deriveVerb(actionId: string): ActionVerb {
  const a = (actionId || '').toLowerCase();
  if (/(?:^|_)(delete|drop|truncate|empty|purge|destroy|remove|revoke)(?:_|$)/.test(a)) return 'delete';
  if (/(?:^|_)(update|edit|patch|set|rotate|reset|modify|sync)(?:_|$)/.test(a)) return 'update';
  if (/(?:^|_)(create|insert|add|new|invite|provision|upload|generate)(?:_|$)/.test(a)) return 'create';
  if (/(?:^|_)(list|get|read|fetch|query|select|describe|show|explain)(?:_|$)/.test(a)) return 'read';
  return 'update';
}

export function classifyRisk(actionId: string, verb: ActionVerb): RiskTier {
  const a = (actionId || '').toLowerCase();
  if (HIGH_RISK_ACTION_IDS[a]) return 'high';
  if (LOW_RISK_ACTION_IDS[a]) return 'low';
  return VERB_RISK[verb] || 'medium';
}

export function triggersRedeploy(actionId: string): boolean {
  const a = (actionId || '').toLowerCase();
  if (a.includes('list') || a.includes('get')) return false;
  return REDEPLOY_HINTS.some((h) => a.includes(h));
}

export interface ActionClassification {
  verb: ActionVerb;
  risk: RiskTier;
  tier: ApprovalTier;
  triggersRedeploy: boolean;
  requiredRole: Role;
}

export function classifyAction(input: {
  actionId: string;
  verb?: ActionVerb;
  role?: string | null;
}): ActionClassification {
  const verb = input.verb || deriveVerb(input.actionId);
  const risk = classifyRisk(input.actionId, verb);
  const requiredRole = requiredRoleForRisk(risk);
  const cleared = clearanceLevel(input.role) >= RISK_REQUIRED_LEVEL[risk];
  // High always needs explicit confirm; otherwise one-click if the drafter clears it.
  const tier: ApprovalTier = risk === 'high' ? 'needs_approval' : cleared ? 'auto_confirm' : 'needs_approval';
  return { verb, risk, tier, triggersRedeploy: triggersRedeploy(input.actionId), requiredRole };
}
