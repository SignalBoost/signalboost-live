import type {
  CosIntelligenceEnvelope,
  DecisionPackage,
  Observation,
  TenantContext,
} from "./types.ts";

export interface EaeClockPort {
  now(): string;
}

export interface EaeObservationSourcePort {
  readonly sourceId: string;
  collect(tenant: TenantContext): Promise<readonly Observation[]>;
}

export interface EaeDecisionStorePort {
  save(decision: DecisionPackage): Promise<void>;
  load(tenant: TenantContext, decisionId: string): Promise<DecisionPackage | null>;
}

export interface EaeCosBridgePort {
  publish(envelope: CosIntelligenceEnvelope): Promise<void>;
}

export interface EaeTelemetryPort {
  metric(name: string, value: number, attributes: Readonly<Record<string, string>>): void;
  event(name: string, attributes: Readonly<Record<string, string>>): void;
}

export interface EaePolicyConfigPort {
  getPolicyProfile(tenant: TenantContext): Promise<Readonly<Record<string, unknown>>>;
}

export interface EaeIdentityPort {
  resolveTenant(): Promise<TenantContext>;
}

export interface EaeRedactionPort {
  sanitize<T>(value: T): T;
}

export interface EaeHealthPort {
  status(): Promise<{
    readonly state: "healthy" | "degraded" | "unavailable";
    readonly checkedAt: string;
    readonly reasons: readonly string[];
  }>;
}

export interface EaeHostPorts {
  readonly clock: EaeClockPort;
  readonly identity: EaeIdentityPort;
  readonly telemetry?: EaeTelemetryPort;
  readonly redaction?: EaeRedactionPort;
  readonly observationSources?: readonly EaeObservationSourcePort[];
  readonly decisionStore?: EaeDecisionStorePort;
  readonly cosBridge?: EaeCosBridgePort;
  readonly policyConfig?: EaePolicyConfigPort;
  readonly health?: EaeHealthPort;
}
