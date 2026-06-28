// saas/lib/hub/provider-templates-resend.ts
// Dedicated Hub Console action templates for Resend.
//
// Why its own file: the Resend console module grows toward a full control panel
// (delivery list + domains/api-keys/webhooks/broadcasts/segments/contacts/topics
// CRUD). Keeping these here — instead of in the 700+ line provider-templates-extra
// — means adding a Resend action never requires re-pasting a giant file, which is
// the exact situation that has caused mis-filed pastes before.
//
// Merged into PROVIDER_TEMPLATES by provider-templates.ts (Object.assign), so
// getTemplate(), the console cards, the action engine, and the audit layer all
// pick these up automatically. Each action is executed by a registered executor
// in console-core/executors/resend.ts; the `api` block here is display metadata.
//
// policyActionId tiers (defined in lib/hub/action-policy.ts):
//   read_provider_status .......... read-only (current wave)
//   resend_manage_* / resend_delete_* / resend_send_* ... added in the write waves,
//                                     gated owner_with_audit so deletes/sends are
//                                     owner-confirmed and audit-logged.

import type { ProviderTemplate } from './provider-templates'

export const RESEND_CONSOLE_TEMPLATES: Record<string, ProviderTemplate> = {
  // ── Wave 1: live delivery list (reads from our own delivery tables) ─────────
  'resend.email_deliveries': {
    id: 'resend.email_deliveries',
    label: 'Email Delivery',
    description: 'Live list of sent emails with delivered / bounced / opened state, pulled from the delivery webhook.',
    icon: '📬',
    policyActionId: 'read_provider_status',
    api: { service: 'resend', method: 'GET', endpoint: '/__console/email-deliveries' },
    fields: [],
  },

  // Write/CRUD actions (domains, api keys, webhooks, broadcasts, segments,
  // contacts, topics) are appended here in subsequent waves, each with its own
  // gated policyActionId. Adding them touches only this file + the executor.
}
