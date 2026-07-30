import { Resend } from 'resend'

// Verified sender identities, aligned to the Signal ecosystem.
// These addresses are used for outbound sending through Resend.
// Reply handling is controlled separately by fallbackReplyTo() so replies do not depend on an inbound mailbox existing for every sender alias.
export const SENDERS = {
  signalSupport: 'SignalBoost Team <signalsupport@signalboostapp.com>',
  saasSupport:   'SaaSSignal Team <saassupport@signalboostapp.com>',
  saasSales:     'SaaSSignal Sales <saassales@signalboostapp.com>',
  saasMarketing: 'SaaSSignal <saasmarketing@signalboostapp.com>',
  saasPartners:  'SaaSSignal Partners <saaspartners@signalboostapp.com>',
  saasContact:   'SaaSSignal <saascontact@signalboostapp.com>',
} as const

type SenderKey = keyof typeof SENDERS

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return new Resend(apiKey)
}

function firstEmail(value: string | undefined) {
  return String(value || '').split(',')[0]?.trim().toLowerCase() || ''
}

function fallbackReplyTo() {
  return (
    firstEmail(process.env.EMAIL_REPLY_TO) ||
    firstEmail(process.env.REPLY_TO_EMAIL) ||
    firstEmail(process.env.OWNER_EMAILS) ||
    firstEmail(process.env.OWNER_EMAIL) ||
    firstEmail(process.env.SIGNALBOOST_OWNER_EMAIL) ||
    firstEmail(process.env.ADMIN_EMAIL) ||
    undefined
  )
}

export async function sendEmail(opts: {
  from: SenderKey
  to: string
  subject: string
  html: string
  replyTo?: string
}) {
  try {
    const resend = getResendClient()
    if (!resend) return { ok: false as const, mode: 'unavailable' as const, error: 'RESEND_API_KEY is not configured' }

    const { data, error } = await resend.emails.send({
      from: SENDERS[opts.from],
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo || fallbackReplyTo(),
    })
    if (error) return { ok: false as const, mode: 'resend' as const, error: error.message }

    // The admin console distinguishes a real provider send from manual_record_only
    // by providerResult.mode. Older code returned only { ok, id }, so successful
    // Resend sends were mislabeled as "recorded only" even though Resend accepted them.
    return { ok: true as const, mode: 'resend' as const, id: data?.id }
  } catch (err) {
    return { ok: false as const, mode: 'resend' as const, error: err instanceof Error ? err.message : 'send failed' }
  }
}
