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
