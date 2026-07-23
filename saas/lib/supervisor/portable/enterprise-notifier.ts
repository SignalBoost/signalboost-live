// saas/lib/supervisor/portable/enterprise-notifier.ts
//
// The host-agnostic replacement for owner-notifier.ts. It turns a paused dangerous
// step into a structured PortableNotification and routes it to the buyer's approvers
// through the buyer's channel — using only the HostContext boundary. It names no
// platform, reads no process.env, and imports no host singleton. This is what makes
// the Self-Healing portable sellable into an enterprise: notification is entirely
// the buyer's infrastructure, reached through interfaces they implement.

import type { OwnerNotifier } from '../executors/api-executor.ts'
import type { HostContext, PortableNotification } from './host-context.ts'
import { buildConsoleUrl } from './host-context.ts'

const CATEGORY_TITLE: Record<PortableNotification['category'], string> = {
  financial: 'Money / billing / payments',
  destructive: 'Destructive / irreversible',
  credential_security: 'Credentials / security',
}

/**
 * Build an OwnerNotifier (the executor's pause hook) backed by the enterprise
 * HostContext. On a paused step it resolves the responsible approvers from the
 * buyer's directory and delivers one structured notification per approver through
 * the buyer's sink. Best-effort: any failure is swallowed so it can never throw
 * back into the executor, which has already halted the step.
 */
export function createEnterpriseNotifier(host: HostContext): OwnerNotifier {
  return async ({ dispatchId, incidentId, step, verdict }) => {
    try {
      const category = (verdict.category ?? 'destructive') as PortableNotification['category']
      const consoleUrl = buildConsoleUrl(host.branding, 'supervisor/approvals')
      const notification: PortableNotification = {
        kind: 'approval_required',
        category,
        title: host.branding.productName + ' paused a ' + (CATEGORY_TITLE[category] || 'consequential') + ' step',
        reason: verdict.reason,
        stepId: step.stepId,
        stepAction: step.action,
        stepDescription: step.description || '(no description)',
        incidentId,
        dispatchId,
        consoleUrl,
      }

      // Resolve who should approve this category from the buyer's SSO-backed directory.
      const approvers = await host.approvers.approversFor(category)
      if (!approvers || approvers.length === 0) {
        // No directory match: still emit one notification so the event is never lost.
        await host.notifications.notify(notification)
        return
      }
      // One notification per responsible approver; the sink routes by recipient.address.
      for (const approver of approvers) {
        await host.notifications.notify({ ...notification, recipient: approver })
      }
    } catch {
      // best-effort: never throw back into the executor
    }
  }
}
