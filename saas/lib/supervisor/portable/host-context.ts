// saas/lib/supervisor/portable/host-context.ts
//
// THE ENTERPRISE INTEGRATION BOUNDARY for the Self-Healing Supervisor portable.
//
// A portable that is sold into another company's systems must never name, import,
// or assume the platform it happens to have been built on. It brings BEHAVIOR; the
// buyer brings INFRASTRUCTURE. This module defines the single contract through which
// a buyer supplies everything the portable needs from their environment: datastore,
// secrets, outbound notifications, identity of the approving humans, and the branding
// used in anything user-facing. Nothing in the portable's core may read process.env
// or import a host singleton directly; it receives a HostContext instead.
//
// Everything here is an interface the buyer implements against THEIR stack:
//   - their vault (HashiCorp / AWS Secrets Manager / Azure Key Vault) behind SecretsProvider
//   - their mailer / ticketing / SIEM behind NotificationSink
//   - their database behind DispatchStore (already injectable elsewhere)
//   - their SSO-derived approver identity behind ApproverDirectory
//   - their product name / console URL behind HostBranding

// Secrets: the portable never holds long-lived credentials. It asks the buyer's
// secrets provider for a named secret at the moment of use.
export interface SecretsProvider {
  getSecret(name: string): Promise<string | undefined>
}

// Notifications: when a dangerous step pauses, the portable emits a structured
// notification. The buyer decides what that means (email, Slack, ServiceNow,
// PagerDuty, SIEM). The portable does not know or care.
export interface PortableNotification {
  kind: 'approval_required'
  category: 'financial' | 'destructive' | 'credential_security'
  title: string
  reason: string
  stepId: string
  stepAction: string
  stepDescription: string
  incidentId: string
  dispatchId: string
  consoleUrl?: string
  /** The approver this notification is addressed to, when resolved from the directory.
   *  The buyer's sink uses recipient.address to route (email, Slack id, ticket assignee). */
  recipient?: Approver
}

export interface NotificationSink {
  // Best-effort by contract: the step is already paused; delivery failure must not throw.
  notify(notification: PortableNotification): Promise<void> | void
}

// Approver identity: enterprises approve through roles and hierarchies, not a single
// "owner email". The buyer's SSO/IdP resolves who is notified / may approve.
export interface Approver {
  id: string
  displayName?: string
  address: string
}

export interface ApproverDirectory {
  approversFor(category: PortableNotification['category']): Promise<Approver[]> | Approver[]
}

// Branding: anything user-facing uses the buyer's product identity.
export interface HostBranding {
  productName: string
  consoleBaseUrl?: string
  /**
   * The buyer's locale, as a language or region tag: 'pt', 'pt-BR', 'es-MX', 'en'.
   *
   * It governs the language of messages this product sends to PEOPLE — above all the approval
   * request, which reaches an engineer who may never open the console and asks them to consent
   * to a consequential action. Comprehension is part of consent, so a buyer operating in
   * Portuguese should have their approvers asked in Portuguese.
   *
   * Supported: en, es, pt, pl, ru. An unrecognised or absent value falls back to English —
   * a request in the wrong language is bad, and no request at all would be worse.
   *
   * It does NOT change machine-readable output. Audit event types, step ids and incident
   * identifiers stay stable across locales, because a SIEM rule written against them must not
   * break when someone changes this field.
   */
  locale?: string
}

// The aggregate context the buyer assembles once and hands to the portable factory.
export interface HostContext {
  secrets: SecretsProvider
  notifications: NotificationSink
  approvers: ApproverDirectory
  branding: HostBranding
}

export function buildConsoleUrl(branding: HostBranding, path: string): string | undefined {
  if (!branding.consoleBaseUrl) return undefined
  const base = branding.consoleBaseUrl.replace(/\/+$/, '')
  const suffix = path.replace(/^\/+/, '')
  return base + '/' + suffix
}
