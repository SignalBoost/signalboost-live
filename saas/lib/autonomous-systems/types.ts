export const EAE_SCHEMA_VERSION = "1.0.0" as const;

export type PolicyDisposition =
  | "observe_only"
  | "recommend"
  | "approval_required"
  | "blocked";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface TenantContext {
  tenantId: string;
  environmentId: string;
  region?: string;
}

export interface Observation {
  schemaVersion: typeof EAE_SCHEMA_VERSION;
  observationId: string;
  tenant: TenantContext;
  source: string;
  subject: string;
  observedAt: string;
  receivedAt: string;
  critical: boolean;
  payload: Readonly<Record<string, unknown>>;
}

export interface FusedSubjectState {
  subject: string;
  observationIds: readonly string[];
  latestObservedAt: string;
  conflict: boolean;
  stale: boolean;
  values: readonly Readonly<Record<string, unknown>>[];
}

export interface WorldStateSnapshot {
  schemaVersion: typeof EAE_SCHEMA_VERSION;
  snapshotId: string;
  tenant: TenantContext;
  generatedAt: string;
  subjects: readonly FusedSubjectState[];
  criticalConflict: boolean;
  criticalStaleness: boolean;
}

export interface CandidatePlan {
  planId: string;
  title: string;
  mutating: boolean;
  consequential: boolean;
  risk: RiskLevel;
  confidence: number;
  evidenceObservationIds: readonly string[];
  steps: readonly string[];
  verification: readonly string[];
  rollbackRequired: boolean;
}

export interface DecisionPackage {
  schemaVersion: typeof EAE_SCHEMA_VERSION;
  decisionId: string;
  tenant: TenantContext;
  generatedAt: string;
  snapshot: WorldStateSnapshot;
  selectedPlan: CandidatePlan | null;
  disposition: PolicyDisposition;
  reasons: readonly string[];
}

export interface CosIntelligenceEnvelope {
  schemaVersion: typeof EAE_SCHEMA_VERSION;
  envelopeId: string;
  tenant: TenantContext;
  emittedAt: string;
  decision: DecisionPackage;
  requestedCapabilities: readonly (
    | "orchestrate"
    | "request_approval"
    | "verify"
    | "report"
  )[];
}
