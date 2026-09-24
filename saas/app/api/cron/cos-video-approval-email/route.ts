// saas/app/api/cron/cos-video-approval-email/route.ts
// Compatibility cron wrapper for provider-confirmed publication-location emails.
// No approval, progress, quota, or failure email is sent by this endpoint.

import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { GET as approvalEmailGET, POST as approvalEmailPOST } from '@/app/api/cos/video-approval-notify/route'

export async function GET(...args: Parameters<typeof approvalEmailGET>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-video-approval-email' }, async () => approvalEmailGET(...args))
}

export async function POST(...args: Parameters<typeof approvalEmailPOST>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-video-approval-email' }, async () => approvalEmailPOST(...args))
}
