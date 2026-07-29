// saas/lib/supervisor/portable/enterprise-notifier.ts
//
// Host-agnostic, locale-aware approval routing through the buyer's own
// approver directory and notification sink. Machine identifiers remain stable.

import type { OwnerNotifier } from '../executors/api-executor.ts'
import type { HostContext, PortableNotification } from './host-context.ts'
import { buildConsoleUrl } from './host-context.ts'
import { approvalCopy, categoryLabel } from './notification-copy.ts'

export function createEnterpriseNotifier(host: HostContext): OwnerNotifier {
  return async ({ dispatchId, incidentId, step, verdict }) => {
    try {
      const category = (verdict.category ?? 'destructive') as PortableNotification['category']
      const copy = approvalCopy(host.branding.locale)
      const categoryTitle = categoryLabel(host.branding.locale, category)
      const consoleUrl = buildConsoleUrl(host.branding, 'supervisor/approvals')
      const notification: PortableNotification = {
        kind: 'approval_required',
        category,
        title: `${host.branding.productName}: ${copy.heading} — ${categoryTitle}`,
        reason: copy.intro,
        stepId: step.stepId,
        stepAction: step.action,
        stepDescription: step.description || copy.noDescription,
        incidentId,
        dispatchId,
        consoleUrl,
      }

      const approvers = await host.approvers.approversFor(category)
      if (!approvers || approvers.length === 0) {
        await host.notifications.notify(notification)
        return
      }
      for (const approver of approvers) {
        await host.notifications.notify({ ...notification, recipient: approver })
      }
    } catch {
      // best-effort: never throw back into an executor that already paused
    }
  }
}
