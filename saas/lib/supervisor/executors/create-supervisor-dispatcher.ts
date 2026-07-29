// saas/lib/supervisor/executors/create-supervisor-dispatcher.ts
//
// Internal dispatcher construction. All infrastructure boundaries are injected;
// this module contains no platform email, provider or environment fallback.

import { APIExecutor } from './api-executor.ts'
import { BrowserExecutor } from './browser-executor.ts'
import { ManualExecutor } from './manual-executor.ts'
import { ExecutorRegistry } from './executor-registry.ts'
import { SupervisorDispatcher } from './supervisor-dispatcher.ts'
import type { DispatchAuditSink } from './executor-types.ts'
import type { DispatchStore } from './dispatch-store.ts'
import type { ApiStepRunner, OwnerNotifier } from './api-executor.ts'
import type { ApiCapabilityRegistry } from './api-capability-registry.ts'
import type { ApprovalContinuationVerifier } from './approval-continuation.ts'
import type { HostContext } from '../portable/host-context.ts'
import { createEnterpriseNotifier } from '../portable/enterprise-notifier.ts'

export interface CreateSupervisorDispatcherOptions {
  audit: DispatchAuditSink
  dispatchStore?: DispatchStore
  apiRunner?: ApiStepRunner
  apiCapabilities?: ApiCapabilityRegistry
  approvalVerifier?: ApprovalContinuationVerifier
  host?: HostContext
  notifyOwner?: OwnerNotifier
}

const noNotificationSink: OwnerNotifier = async () => {}

function resolveNotifier(options: CreateSupervisorDispatcherOptions): OwnerNotifier {
  if (options.notifyOwner) return options.notifyOwner
  if (options.host) return createEnterpriseNotifier(options.host)
  return noNotificationSink
}

export function createSupervisorDispatcher(options: CreateSupervisorDispatcherOptions): SupervisorDispatcher {
  const registry = new ExecutorRegistry()
  registry.register('api', new APIExecutor({
    runner: options.apiRunner,
    notifyOwner: resolveNotifier(options),
    capabilityRegistry: options.apiCapabilities,
    approvalVerifier: options.approvalVerifier,
  }))
  registry.register('browser', new BrowserExecutor())
  registry.register('manual', new ManualExecutor())
  return new SupervisorDispatcher({
    registry,
    audit: options.audit,
    dispatchStore: options.dispatchStore,
  })
}
