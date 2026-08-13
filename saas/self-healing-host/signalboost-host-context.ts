// SignalBoost's real HostContext for the buyer-portable Self-Healing Supervisor.
import { sendEmail } from '@/lib/email'
import { createSignalBoostSupervisorConnectorRuntime } from './signalboost-supervisor-connectors'
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

function ownerAddresses(): string[] { const raw = process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''; return raw.split(/[,;\s]+/).map(v => v.trim()).filter(Boolean) }
function ownerApprovers(): Approver[] { return ownerAddresses().map((address, index) => ({ id: `owner-${index + 1}`, displayName: 'Platform owner', address })) }
const platformSecrets: SecretsProvider = { async getSecret(name: string) { const allowed = new Set(['VERCEL_API_TOKEN','GITHUB_TOKEN','SUPABASE_SERVICE_ROLE_KEY']); if (!allowed.has(name)) return undefined; return process.env[name] || undefined } }
function platformLocale(): string { return resolveSupervisorLocale(process.env.SUPERVISOR_LOCALE || process.env.NEXT_PUBLIC_DEFAULT_LOCALE) }
function notificationHtml(notification: PortableNotification): string {
  const rows: Array<[string,string]> = [['Category',notification.category],['Step',`${notification.stepId} — ${notification.stepAction}`],['Description',notification.stepDescription],['Reason',notification.reason],['Incident',notification.incidentId],['Dispatch',notification.dispatchId]]
  const copy = approvalCopy(platformLocale()); const escape = (value:string) => value.replace(/[<>&]/g,c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c] || c))
  return [`<h2>${escape(notification.title)}</h2>`,`<p>${escape(copy.intro)}</p>`,'<table cellpadding="6" style="border-collapse:collapse">',...rows.map(([l,v])=>`<tr><td><strong>${l}</strong></td><td>${escape(String(v))}</td></tr>`),'</table>',notification.consoleUrl?`<p><a href="${escape(notification.consoleUrl)}">${escape(copy.cta)}</a></p>`:''].join('\n')
}
const platformNotifications: NotificationSink = { async notify(notification) { const to = notification.recipient?.address || ownerAddresses()[0]; if (!to) throw new Error('no owner address configured (set OWNER_EMAILS)'); const result = await sendEmail({ from:'saasSupport',to,subject:notification.title,html:notificationHtml(notification) }); if (!result?.ok) throw new Error(`email delivery failed: ${result?.error ?? 'unknown error'}`) } }

export function createSignalBoostHostContext(overrides: Partial<HostContext> = {}): HostContext {
  const approvers = ownerApprovers(); if (!approvers.length) throw new Error('OWNER_EMAILS (or OWNER_EMAIL) must name at least one approver before the supervisor can pause a step')
  return {
    secrets: platformSecrets,
    notifications: platformNotifications,
    approvers: createStaticApproverDirectory({ fallback: approvers }),
    branding: { productName:'SignalBoost Supervisor', locale:platformLocale(), consoleBaseUrl:(process.env.SUPERVISOR_CONSOLE_URL || `${(process.env.NEXT_PUBLIC_APP_URL || 'https://saas.signalboostapp.com').replace(/\/+$/, '')}/dashboard`).replace(/\/+$/,'') },
    // SignalBoost now uses the same permissioned connector boundary buyers receive.
    connectors: createSignalBoostSupervisorConnectorRuntime(),
    ...overrides,
  }
}
export default createSignalBoostHostContext
