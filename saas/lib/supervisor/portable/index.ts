// saas/lib/supervisor/portable/index.ts
//
// The public integration surface of the Self-Healing Supervisor portable. An
// enterprise buyer imports everything they need to plug the portable into their
// stack from here: the HostContext boundary they implement, and the host-agnostic
// building blocks (enterprise notifier, database-neutral dispatch store) that the
// portable's factory wires to it.

export type {
  HostContext,
  SecretsProvider,
  NotificationSink,
  PortableNotification,
  Approver,
  ApproverDirectory,
  HostBranding,
} from './host-context.ts'
export { buildConsoleUrl } from './host-context.ts'
export { createEnterpriseNotifier } from './enterprise-notifier.ts'
export {
  EnterpriseDispatchStore,
  createEnterpriseDispatchStore,
  type SqlExecutor,
  type EnterpriseDispatchStoreOptions,
} from './enterprise-dispatch-store.ts'
export {
  createSiemAuditSink,
  teeAuditSinks,
  formatSiemRecord,
  formatEcsJson,
  formatCef,
  type SiemTransport,
  type SiemFormat,
  type SiemSeverity,
  type SiemAuditSinkConfig,
} from './siem-audit-sink.ts'
export {
  createStaticApproverDirectory,
  ApproverDirectoryConfigError,
  APPROVER_CATEGORIES,
  type StaticApproverDirectoryConfig,
} from './static-approver-directory.ts'
export {
  runAcceptanceScenario,
  type AcceptanceOptions,
  type AcceptanceResult,
  type AcceptanceCheck,
} from './acceptance-harness.ts'

export {
  createIncidentSource,
  createIncidentSourceRegistry,
  createInMemoryDedupeStore,
  createInMemoryIncidentStore,
  fingerprintIncident,
  normalizeEnvironment,
  normalizeSeverity,
  sanitizeMetadata,
  IncidentSourceConfigError,
  INTAKE_LIMITS,
  REDACTED,
  REDACTED_KEYS_FIELD,
} from './incident-source.ts'
export type {
  DedupeStore,
  IncidentMapping,
  IncidentSource,
  IncidentSourceDefinition,
  IncidentSourceHealth,
  IncidentSourceOutcome,
  IncidentSourceSingleOutcome,
  IncidentSourceRuntime,
  IncidentSourceStatus,
  IncidentStore,
  RawIncidentDelivery,
} from './incident-source.ts'

export {
  createSignedWebhookSource,
  signIntakeRequest,
  INTAKE_ENVELOPE_VERSION,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_DEFAULTS,
  WebhookIntakeConfigError,
} from './webhook-intake.ts'
export type { IntakeEnvelope, SignedWebhookOptions } from './webhook-intake.ts'

export {
  createAuthenticatedMonitoringIncidentSourceDefinition,
  createMonitoringIncidentSourceDefinition,
  monitoringAdapterIds,
  stagedMonitoringAdapters,
  type AuthenticatedMonitoringAdapterContext,
  type MonitoringAdapterAuthenticationContext,
  type MonitoringAdapterAuthenticator,
  type MonitoringAdapterContext,
  type MonitoringAdapterDescriptor,
  type MonitoringAdapterId,
  type MonitoringAdapterMaturity,
} from './monitoring-adapters.ts'

export {
  createIncidentRuntime,
  createInMemoryIncidentRecordStore,
  IncidentRuntimeConfigError,
} from './incident-runtime.ts'
export type {
  DeliveryResult,
  DeliverySingleResult,
  IncidentHandler,
  IncidentRecord,
  IncidentRecordStatus,
  IncidentRecordStore,
  IncidentRunOutcome,
  IncidentRuntimeHealth,
  IncidentRuntimeOptions,
} from './incident-runtime.ts'

export {
  createReferenceVerifier,
  READ_ONLY_VERIFICATION_ACTIONS,
  VERIFIER_DEFAULTS,
} from './reference-verifier.ts'
export type {
  ReferenceVerifierOptions,
  VerificationCheckResult,
  VerificationStepRunner,
} from './reference-verifier.ts'

export {
  createSharedSecretAuthenticator,
  createHmacSignatureAuthenticator,
  createTrustedNetworkAuthenticator,
  AuthenticatorConfigError,
  AUTHENTICATOR_DEFAULTS,
} from './monitoring-authenticators.ts'
export type { AuthenticationOutcome, DeliveryAuthenticator, HmacSignatureOptions } from './monitoring-authenticators.ts'

export {
  createTriageThinker,
  classifyIncidentShape,
  TRIAGE_PLAN_SCHEMA_VERSION,
} from './triage-thinker.ts'
export type { TriageThinkerOptions } from './triage-thinker.ts'

export {
  createResourceCheckRunner,
  createHttpResourceCheck,
  createReadOnlyExecutor,
  ResourceCheckConfigError,
  READ_ONLY_ACTIONS,
  CHECK_DEFAULTS,
} from './resource-check-runner.ts'
export type {
  CheckOutcome,
  ResourceCheck,
  ResourceCheckContext,
  ResourceCheckRunnerOptions,
  HttpResourceCheckOptions,
  ReadOnlyExecutorOptions,
} from './resource-check-runner.ts'

// Locale-aware copy for the messages this product sends to PEOPLE. Exported because a buyer
// writing their own notification sink needs the same wording their approvers would otherwise
// get from the reference adapter — the translations belong to the product, not to the host.
export {
  approvalCopy,
  categoryLabel,
  resolveSupervisorLocale,
  SUPERVISOR_LOCALES,
} from './notification-copy.ts'
export type { ApprovalCopy, SupervisorLocale } from './notification-copy.ts'
