// saas/self-healing-host/signalboost-host-context.ts
//
// THE PLATFORM'S OWN HostContext — the host-side wiring that makes this platform a real
// deployment of the Self-Healing Supervisor portable rather than the place it was written.
//
// WHY THIS FILE HAD TO EXIST. The portable has had a complete boundary, a reference approver
// directory, an acceptance harness and a verified release archive for some time. What it did
// NOT have was a single caller: `createSupervisorDispatcher` appeared only in tests and in the
// architecture-closure listing. So item 7 of the integration guide — "you have run an
// end-to-end incident against your own wiring" — could not be satisfied by anyone, including
// us, because no HostContext existed anywhere to run it against.
//
// This is that HostContext, implemented against this platform's own systems exactly as a buyer
// implements one against theirs. It lives in a *-host directory, matching the convention every
// other portable here follows, and the portable does not import it — the dependency points
// host → portable and never back.
//
// It is also the honest proof for a buyer: the vendor runs the product on itself, and the
// acceptance record it produces is the same artifact format the buyer will produce.
//
// IMPORTANT: nothing here belongs in the release payload. This file names the platform, reads
// platform environment variables and imports platform singletons — all correct for a host
// adapter, all disqualifying for portable code. The release packer's payload walk starts at
// the portable's entry points and never reaches this directory.

import { sendEmail } from '@/lib/email'
import {
  createStaticApproverDirectory,
  type Approver,
  type HostContext,
  type NotificationSink,
  type PortableNotification,
  type SecretsProvider,
  approvalCopy,
  resolveSupervisorLocale,
} from '@/lib/supervisor/portable'

/** Owner addresses, from the same environment variables the platform already uses. */
function ownerAddresses(): string[] {
  const raw = process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''
  return raw.split(/[,;\s]+/).map(value => value.trim()).filter(Boolean)
}

function ownerApprovers(): Approver[] {
  return ownerAddresses().map((address, index) => ({
    id: `owner-${index + 1}`,
    displayName: 'Platform owner',
    address,
  }))
}

/**
 * Secrets come from the environment on this host. A buyer would back this with Vault, AWS
 * Secrets Manager or Azure Key Vault; the portable cannot tell the difference, which is the
 * entire point of the interface.
 */
const platformSecrets: SecretsProvider = {
  async getSecret(name: string) {
    // Only an explicit allowlist is readable. A supervisor step naming an arbitrary variable
    // must not be able to read the whole environment of the host it runs on.
    const allowed = new Set(['VERCEL_API_TOKEN', 'GITHUB_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'])
    if (!allowed.has(name)) return undefined
    return process.env[name] || undefined
  },
}

/**
 * The locale every human-facing message from this deployment is written in.
 *
 * SUPERVISOR_LOCALE is the buyer-equivalent setting: a buyer operating in Brazil sets pt-BR
 * once and their approvers are asked in Portuguese. Region tags are accepted because that is
 * how an operator thinks about it; anything unsupported falls back to English.
 */
function platformLocale(): string {
  return resolveSupervisorLocale(process.env.SUPERVISOR_LOCALE || process.env.NEXT_PUBLIC_DEFAULT_LOCALE)
}

function notificationHtml(notification: PortableNotification): string {
  const rows: Array<[string, string]> = [
    ['Category', notification.category],
    ['Step', `${notification.stepId} — ${notification.stepAction}`],
    ['Description', notification.stepDescription],
    ['Reason', notification.reason],
    ['Incident', notification.incidentId],
    ['Dispatch', notification.dispatchId],
  ]
  const copy = approvalCopy(platformLocale())
  const escape = (value: string) => value.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
  return [
    `<h2>${escape(notification.title)}</h2>`,
    `<p>${escape(copy.intro)}</p>`,
    '<table cellpadding="6" style="border-collapse:collapse">',
    ...rows.map(([label, value]) => `<tr><td><strong>${label}</strong></td><td>${escape(String(value))}</td></tr>`),
    '</table>',
    notification.consoleUrl ? `<p><a href="${escape(notification.consoleUrl)}">${escape(copy.cta)}</a></p>` : '',
  ].join('\n')
}

/**
 * Delivery through the platform's existing transactional mailer.
 *
 * THROWS ON FAILURE, deliberately. The notifier upstream swallows errors so a delivery problem
 * can never take down an executor that has already halted — but the acceptance harness only
 * records a notification as delivered once the sink accepts it. A sink that silently returned
 * on failure would let an acceptance run pass while nobody was actually reachable.
 */
const platformNotifications: NotificationSink = {
  async notify(notification: PortableNotification) {
    const to = notification.recipient?.address || ownerAddresses()[0]
    if (!to) throw new Error('no owner address configured (set OWNER_EMAILS)')
    const result = await sendEmail({
      from: 'saasSupport',
      to,
      subject: notification.title,
      html: notificationHtml(notification),
    })
    if (!result?.ok) throw new Error(`email delivery failed: ${result?.error ?? 'unknown error'}`)
  },
}

/**
 * Build the platform's HostContext.
 *
 * Throws when no owner address is configured rather than constructing a context that cannot
 * notify anyone — the same fail-at-wiring-time posture createStaticApproverDirectory takes,
 * for the same reason: a directory that breaks during an incident breaks silently.
 */
export function createSignalBoostHostContext(overrides: Partial<HostContext> = {}): HostContext {
  const approvers = ownerApprovers()
  if (approvers.length === 0) {
    throw new Error('OWNER_EMAILS (or OWNER_EMAIL) must name at least one approver before the supervisor can pause a step')
  }
  return {
    secrets: platformSecrets,
    notifications: platformNotifications,
    // Every category routes to the owner here, which is honest for a single-operator platform.
    // A buyer splits these across finance, SRE and security — see §5.1 of the integration guide.
    approvers: createStaticApproverDirectory({ fallback: approvers }),
    branding: {
      productName: 'SignalBoost Supervisor',
      locale: platformLocale(),
      // The approval link in every paused-step email is built from this. It must point
      // at the DASHBOARD section, not the site root — and NEXT_PUBLIC_APP_URL is the
      // site root, used everywhere else in the app. Reading it directly dropped the
      // /dashboard segment and sent every approver to a 404, which is the worst
      // possible failure for a control whose entire job is to get a human's attention.
      // So the segment is appended here rather than assumed to be present, and
      // SUPERVISOR_CONSOLE_URL exists for a deployment that mounts the console
      // somewhere else entirely.
      consoleBaseUrl: (process.env.SUPERVISOR_CONSOLE_URL
        || `${(process.env.NEXT_PUBLIC_APP_URL || 'https://saas.signalboostapp.com').replace(/\/+$/, '')}/dashboard`).replace(/\/+$/, ''),
    },
    ...overrides,
  }
}

export default createSignalBoostHostContext
