import type { CodeSandboxProvider, RuntimeLanguage, SandboxCapability } from './contracts.ts'
import type { SandboxRuntimePolicy } from './policy.ts'
import type { AgentSandboxProviderConfig } from './provider-config.ts'
import type { AgentSandboxProviderRegistry } from './provider-registry.ts'
import type { AgentSandboxQuotaLedger } from './provider-quotas.ts'
import type { RepairController } from './repair-controller.ts'
import type { RepairWorkflowRequest } from './repair-types.ts'
import type { AgentOperationActivityStore } from './activity-store.ts'

export type AgentWorkflowStage = 'validation' | 'authorization' | 'quota_reservation' | 'provider_resolution' | 'repair' | 'quota_release' | 'completed'
export type AgentWorkflowAuditAction = 'workflow_received' | 'validation_denied' | 'authorization_denied' | 'quota_reserved' | 'quota_denied' | 'provider_resolved' | 'provider_unavailable' | 'repair_started' | 'repair_completed' | 'repair_failed' | 'quota_released' | 'quota_release_failed' | 'workflow_completed' | 'workflow_failed'
export interface AgentWorkflowPrincipal { privileged: boolean; executionEntitled: boolean }
export interface AgentWorkflowEntitlement { readonly executionEntitled: boolean }
export interface AgentWorkflowRequest { requestId: string; workflowId: string; userId: string; language: RuntimeLanguage; capabilities: readonly SandboxCapability[]; repairRequest: RepairWorkflowRequest; estimatedCostUnits: number }
export interface AgentWorkflowAuthorization { readonly authorized: true; readonly language: RuntimeLanguage; readonly capabilities: readonly SandboxCapability[] }
export interface AgentWorkflowDenial { readonly kind: 'denial'; readonly reason: string; readonly stage: AgentWorkflowStage; readonly diagnostics: readonly string[]; readonly timing: AgentWorkflowTimingMetadata; readonly cleanup: AgentWorkflowCleanupStatus; readonly auditEvents: readonly AgentWorkflowAuditEvent[] }
export interface AgentWorkflowExecutionFailure { readonly kind: 'failure'; readonly category: string; readonly failedStage: AgentWorkflowStage; readonly diagnostics: readonly string[]; readonly timing: AgentWorkflowTimingMetadata; readonly cleanup: AgentWorkflowCleanupStatus; readonly auditEvents: readonly AgentWorkflowAuditEvent[] }
export interface AgentWorkflowVerifiedSuccess { readonly kind: 'success'; readonly verified: true; readonly attempts: number; readonly corrections: number; readonly timing: AgentWorkflowTimingMetadata; readonly cleanup: AgentWorkflowCleanupStatus; readonly auditEvents: readonly AgentWorkflowAuditEvent[] }
export type AgentWorkflowResult = AgentWorkflowDenial | AgentWorkflowExecutionFailure | AgentWorkflowVerifiedSuccess
export interface AgentWorkflowTimingMetadata { readonly startedAtMs: number; readonly completedAtMs: number; readonly totalDurationMs: number; readonly deadlineMs: number }
export interface AgentWorkflowCleanupStatus { readonly quotaReserved: boolean; readonly quotaReleased: boolean; readonly quotaReleaseSucceeded: boolean }
export interface AgentWorkflowAuditEvent { readonly eventId: string; readonly action: AgentWorkflowAuditAction; readonly requestId: string; readonly workflowId: string; readonly userId: string; readonly providerId?: string; readonly language?: RuntimeLanguage; readonly attemptCount?: number; readonly correctionCount?: number; readonly verified?: boolean; readonly denialReason?: string; readonly failureCategory?: string; readonly failedStage?: AgentWorkflowStage; readonly durationMs?: number; readonly quotaCostUnits?: number; readonly timestamp: string }
export interface AgentWorkflowCoordinatorDependencies { providerConfig: AgentSandboxProviderConfig; providerRegistry: AgentSandboxProviderRegistry; quotaLedger: AgentSandboxQuotaLedger; runtimePolicy: SandboxRuntimePolicy; toolPolicy: { permitsCodeExecution: boolean }; supportedLanguages: readonly RuntimeLanguage[]; supportedCapabilities: readonly SandboxCapability[]; createRepairController(provider: CodeSandboxProvider): RepairController; activityStore: AgentOperationActivityStore; now?: () => number; createAuditId?: () => string }
