// saas/lib/hub/action-policy.ts
// System-wide, PROVIDER-AGNOSTIC action policy. Classification is keyed on
// the action TYPE (verb) and explicit action IDs — never on which provider
// the action belongs to. The same rules apply to GitHub, Vercel, Supabase,
// Stripe and any future provider.

export type ActionVerb = 'read' | 'create' | 'update' | 'delete';
export type RiskTier = 'low' | 'medium' | 'high';
export type ApprovalTier = 'auto_confirm' | 'needs_approval';

// Explicit High-Risk action IDs across ALL providers: destructive, irreversible,
// money-moving, or credential-rotating. Keyed by actionId, not by provider.
const HIGH_RISK_ACTION_IDS: Record<string, true> = {
  // schema / data destruction
  drop_table: true,
  drop_schema: true,
  truncate_table: true,
  delete_row: true,
  archive_rows: true,
  empty_bucket: true,
  delete_bucket: true,
  // source-control destruction
  delete_branch: true,
  delete_repo: true,
  force_push: true,
  delete_tag: true,
  // identity / credentials
  delete_user: true,
  rotate_keys: true,
  reset_password: true,
  // money movement
  create_payout: true,
  refund_charge: true,
  delete_product: true,
  cancel_subscription: true,
  // deploy / infra destruction
  delete_deployment: true,
  delete_env_var: true,
  delete_domain: true,
};

// Action IDs that are always low-risk reads regardless of verb inference.
const LOW_RISK_ACTION_IDS: Record<string, true> = {
  list_repos: true,
  get_repo: true,
  list_deployments: true,
  list_env_vars: true,
  list_products: true,
  list_users: true,
  list_buckets: true,
  storage_panel: true,
};

// Action IDs whose merge should also trigger a production redeploy.
const REDEPLOY_HINTS = ['env_var', 'env-var', 'environment', 'redeploy', 'domain'];

const VERB_RISK: Record<ActionVerb, RiskTier> = {
  read: 'low',
  create: 'medium',
  update: 'medium',
  delete: 'high',
};

// Infer a CRUD verb from the action ID. Unknown shapes default to 'update'
// (treated as a write) so nothing slips through as a harmless read.
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

// High-risk always needs explicit approval. Low/medium drop to one-click
// auto-confirm only when the caller is elevated (owner/admin).
export function resolveTier(risk: RiskTier, elevated: boolean): ApprovalTier {
  if (risk === 'high') return 'needs_approval';
  return elevated ? 'auto_confirm' : 'needs_approval';
}

export interface ActionClassification {
  verb: ActionVerb;
  risk: RiskTier;
  tier: ApprovalTier;
  triggersRedeploy: boolean;
}

export function classifyAction(input: {
  actionId: string;
  verb?: ActionVerb;
  elevated?: boolean;
}): ActionClassification {
  const verb = input.verb || deriveVerb(input.actionId);
  const risk = classifyRisk(input.actionId, verb);
  const tier = resolveTier(risk, !!input.elevated);
  return { verb, risk, tier, triggersRedeploy: triggersRedeploy(input.actionId) };
}
