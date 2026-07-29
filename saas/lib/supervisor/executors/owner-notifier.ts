// saas/lib/supervisor/executors/owner-notifier.ts
//
// Wires the Self-Healing Supervisor's "a dangerous step paused" hook to a real
// owner email. The APIExecutor takes an OwnerNotifier by injection and never
// imports email/Supabase itself, so this adapter is where the platform-specific
// send lives. A send failure never changes the executor's decision to pause: the
// step is already halted; the email is only how the owner finds out.

import type { OwnerNotifier } from './api-executor.ts'
import { approvalCopy, categoryLabel } from '../portable/notification-copy.ts'

function firstOwnerEmail(): string {
  const raw = process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || ''
  return String(raw).split(',')[0]?.trim().toLowerCase() || ''
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ))
}

/**
 * Build an OwnerNotifier bound to the platform email helper. `send` is injected so
 * this module needs no direct dependency wiring in tests; production passes the
 * real sendEmail. Returns a notifier that emails the owner a concise, sanitized
 * summary of the paused step. It swallows its own errors: notification is
 * best-effort and must never throw back into the executor.
 */
export function createOwnerEmailNotifier(deps: {
  send: (opts: { from: 'saasSupport'; to: string; subject: string; html: string }) => Promise<{ ok: boolean; error?: string }>
  ownerEmail?: string
  dashboardUrl?: string
  /** Buyer's locale. Accepts a region tag such as pt-BR; unknown values fall back to English. */
  locale?: string
}): OwnerNotifier {
  return async ({ dispatchId, incidentId, step, verdict }) => {
    try {
      const to = deps.ownerEmail || firstOwnerEmail()
      if (!to) return
      const copy = approvalCopy(deps.locale)
      const label = categoryLabel(deps.locale, verdict.category)
      const dash = deps.dashboardUrl || 'https://saas.signalboostapp.com/dashboard/supervisor'
      const subject = label + ' — ' + copy.subjectSuffix

      const row = (label: string, value: string): string =>
        '<tr><td style="padding:6px 8px;color:#666">' + label + '</td>'
        + '<td style="padding:6px 8px">' + value + '</td></tr>'

      const html =
        '<div style="font-family:system-ui,sans-serif;max-width:560px">'
        + '<h2 style="margin:0 0 8px">' + escapeHtml(copy.heading) + '</h2>'
        + '<p style="margin:0 0 16px;color:#444">' + escapeHtml(copy.intro) + '</p>'
        + '<table style="border-collapse:collapse;width:100%;font-size:14px">'
        + row(escapeHtml(copy.rows.category), '<strong>' + escapeHtml(label) + '</strong>')
        + row(escapeHtml(copy.rows.reason), escapeHtml(verdict.reason))
        + row(escapeHtml(copy.rows.step), escapeHtml(step.stepId) + ' (' + escapeHtml(step.action) + ')')
        + row(escapeHtml(copy.rows.description), escapeHtml(step.description || copy.noDescription))
        + row(escapeHtml(copy.rows.incident), escapeHtml(incidentId))
        + row(escapeHtml(copy.rows.dispatch), escapeHtml(dispatchId))
        + '</table>'
        + '<p style="margin:16px 0 0"><a href="' + escapeHtml(dash) + '" style="background:#ffc300;color:#111;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">' + escapeHtml(copy.cta) + '</a></p>'
        + '<p style="margin:16px 0 0;color:#888;font-size:12px">' + escapeHtml(copy.footer) + '</p>'
        + '</div>'

      await deps.send({ from: 'saasSupport', to, subject, html })
    } catch {
      // best-effort: never throw back into the executor
    }
  }
}
