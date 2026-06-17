// lib/infra-pr/types.ts
// Shared types for the self-contained infrastructure PR module.

export type InfraPrStatus = 'open' | 'merging' | 'merged' | 'failed' | 'closed';
export type ActionVerb = 'read' | 'create' | 'update' | 'delete';
export type RiskTier = 'low' | 'medium' | 'high';
export type ApprovalTier = 'auto_confirm' | 'needs_approval';

// Enterprise RBAC roles (injected by the host app — see README).
export type Role = 'NONE' | 'AI_OPERATOR' | 'LEAD_DEV' | 'CTO';

export type Result<T> = { ok: boolean; data?: T; error?: string };

export interface InfraPrDraft {
  title: string;
  description?: string | null;
  service: string; // provider
  action: string; // actionId
  payload: Record<string, any>;
  diff?: any; // simulated diff (SimDiff)
  risk?: RiskTier;
  triggers_redeploy?: boolean;
  source?: 'assistant' | 'manual';
  created_by?: string | null;
}

export interface InfraPr {
  id: string;
  title: string;
  description: string | null;
  service: string;
  action: string;
  payload: any;
  diff: any;
  risk: RiskTier;
  triggers_redeploy: boolean;
  source: 'assistant' | 'manual';
  status: InfraPrStatus;
  result: any;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  merged_by: string | null;
}

// Generic shape all providers flow through. payload is opaque.
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

// ── Dry-run simulation diff ────────────────────────────────────────────────
export type DiffOp = 'add' | 'update' | 'delete' | 'noop';

export interface SimChange {
  op: DiffOp;
  target: string; // the key / row / resource being touched
  before?: any;
  after?: any;
}

export interface SimDiff {
  simulated: true;
  provider: string;
  actionId: string;
  verb: ActionVerb;
  summary: string;
  changes: SimChange[];
}

// ── Cryptographic audit ledger row ─────────────────────────────────────────
export interface AuditRow {
  id: string;
  created_at: string;
  pr_id: string | null;
  actor: string | null;
  event: string;
  detail: any;
  signature: string | null;
  previous_signature: string | null;
}

export interface ChainVerification {
  ok: boolean;
  count: number;
  brokenAt?: { index: number; id: string; reason: string };
}
