// saas/lib/supervisor/executors/create-supervisor-dispatcher.ts
//
// The canonical way to build a Supervisor dispatcher. It registers the API executor
// (with its danger-gate notification path wired in), plus the browser and manual
// executors, and returns a ready dispatcher.
//
// Two ways to supply the notification path, because this portable is sold into other
// companies' systems:
//
//   • ENTERPRISE (the product): pass a `host: HostContext`. The dispatcher wires the
//     host-agnostic enterprise notifier, so a paused dangerous step routes through
//     THE BUYER'S approver directory and notification channel with THEIR branding.
//     No platform is named, no env var is read, no host singleton is imported.
//
//   • PLATFORM (the test rig only): pass nothing for notifications. As a convenience
//     for developing the portable on the SignalBoost platform, the factory falls back
//     to the platform email notifier. This path is NOT part of the sellable portable —
//     an enterprise buyer always supplies a HostContext.
//
// `notifyOwner` may still be injected directly to override either default (used by
// tests and by any caller that wants a custom sink).

import { APIExecutor } from './api-executor.ts'
import { BrowserExecutor } from './browser-executor.ts'
import { ManualExecutor } from './manual-executor.ts'
import { ExecutorRegistry } from './executor-registry.ts'
import { SupervisorDispatcher } from './supervisor-dispatcher.ts'
import type { DispatchAuditSink } from './executor-types.ts'
import type { DispatchStore } from './dispatch-store.ts'
import type { ApiStepRunner, OwnerNotifier } from './api-executor.ts'
import type { HostContext } from '../portable/host-context.ts'
import { createEnterpriseNotifier } from '../portable/enterprise-notifier.ts'

export interface CreateSupervisorDispatcherOptions {
  audit: DispatchAuditSink
  dispatchStore?: DispatchStore
  /** Override the API step runner (defaults to the universal-provider runner). */
  apiRunner?: ApiStepRunner
  /**
   * ENTERPRISE integration: the buyer's infrastructure boundary. When provided, the
   * dispatcher wires the host-agnostic enterprise notifier so paused steps route
   * through the buyer's approvers/channel/branding. This is the sellable path.
   */
  host?: HostContext
  /** Directly override the pause notifier (takes precedence over `host`). Used by tests. */
  notifyOwner?: OwnerNotifier
  /**
   * PLATFORM-ONLY fallback: dashboard URL for the platform email notifier used when
   * developing on the SignalBoost test rig (no `host`, no `notifyOwner`). Ignored in
   * enterprise mode.
   */
  dashboardUrl?: string
}

// Platform test-rig fallback: the platform email notifier, imported lazily so this
// factory carries no host/email dependency unless this fallback is actually used.
// This is intentionally the ONLY place the portable can reach the platform, and only
// when no enterprise HostContext and no explicit notifier were supplied.
function platformFallbackNotifier(dashboardUrl?: string): OwnerNotifier {
  return async (input) => {
    try {
      const [{ sendEmail }, { createOwnerEmailNotifier }] = await Promise.all([
        import('@/lib/email'),
        import('./owner-notifier.ts'),
      ])
      await createOwnerEmailNotifier({ send: opts => sendEmail(opts), dashboardUrl })(input)
    } catch {
      // best-effort: notification must never throw into the executor
    }
  }
}

function resolveNotifier(options: CreateSupervisorDispatcherOptions): OwnerNotifier {
  if (options.notifyOwner) return options.notifyOwner
  if (options.host) return createEnterpriseNotifier(options.host)
  return platformFallbackNotifier(options.dashboardUrl)
}

export function createSupervisorDispatcher(options: CreateSupervisorDispatcherOptions): SupervisorDispatcher {
  const registry = new ExecutorRegistry()
  registry.register('api', new APIExecutor({
    runner: options.apiRunner,
    notifyOwner: resolveNotifier(options),
  }))
  registry.register('browser', new BrowserExecutor())
  registry.register('manual', new ManualExecutor())
  return new SupervisorDispatcher({
    registry,
    audit: options.audit,
    dispatchStore: options.dispatchStore,
  })
}
