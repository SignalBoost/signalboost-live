// saas/lib/supervisor/executors/create-supervisor-dispatcher.ts
//
// The canonical way to build a production-ready Supervisor dispatcher: it registers
// the API executor with the owner-email notifier already wired in, plus the browser
// and manual executors. Any live entry point that runs the Self-Healing Supervisor
// should build its dispatcher through this factory so the danger-gate notification
// path is connected by construction, not left to each caller to remember.
//
// Everything is injectable for tests; production passes nothing and gets the real
// wiring: the platform email helper (lib/email.ts) drives owner notifications, and
// the API executor's default runner drives already-registered providers.

import { APIExecutor } from './api-executor.ts'
import { BrowserExecutor } from './browser-executor.ts'
import { ManualExecutor } from './manual-executor.ts'
import { ExecutorRegistry } from './executor-registry.ts'
import { SupervisorDispatcher } from './supervisor-dispatcher.ts'
import type { DispatchAuditSink } from './executor-types.ts'
import type { DispatchStore } from './dispatch-store.ts'
import type { ApiStepRunner, OwnerNotifier } from './api-executor.ts'
import { createOwnerEmailNotifier } from './owner-notifier.ts'

export interface CreateSupervisorDispatcherOptions {
  audit: DispatchAuditSink
  dispatchStore?: DispatchStore
  /** Override the API step runner (defaults to the universal-provider runner). */
  apiRunner?: ApiStepRunner
  /** Override the owner notifier (defaults to the email notifier via lib/email.ts). */
  notifyOwner?: OwnerNotifier
  /** Override the owner dashboard URL used in notification emails. */
  dashboardUrl?: string
}

// Default owner notifier: the email notifier bound to the platform email helper.
// Imported lazily so this factory has no hard email dependency until it actually
// builds the default (tests that inject notifyOwner never touch email).
function defaultNotifier(dashboardUrl?: string): OwnerNotifier {
  return async (input) => {
    try {
      const { sendEmail } = await import('@/lib/email')
      const notifier = createOwnerEmailNotifier({
        send: opts => sendEmail(opts),
        dashboardUrl,
      })
      await notifier(input)
    } catch {
      // best-effort: notification must never throw into the executor
    }
  }
}

export function createSupervisorDispatcher(options: CreateSupervisorDispatcherOptions): SupervisorDispatcher {
  const registry = new ExecutorRegistry()
  registry.register('api', new APIExecutor({
    runner: options.apiRunner,
    notifyOwner: options.notifyOwner ?? defaultNotifier(options.dashboardUrl),
  }))
  registry.register('browser', new BrowserExecutor())
  registry.register('manual', new ManualExecutor())
  return new SupervisorDispatcher({
    registry,
    audit: options.audit,
    dispatchStore: options.dispatchStore,
  })
}
