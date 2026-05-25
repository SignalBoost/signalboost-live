import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Verified sender identities, aligned to the Signal ecosystem.
export const SENDERS = {
  signalSupport: 'SignalBoost Team <signalsupport@signalboostapp.com>',
  saasSupport:   'SaaSSignal Team <saassupport@signalboostapp.com>',
  saasSales:     'SaaSSignal Sales <saassales@signalboostapp.com>',
  saasMarketing: 'SaaSSignal <saasmarketing@signalboostapp.com>',
  saasPartners:  'SaaSSignal Partners <saaspartners@signalboostapp.com>',
  saasContact:   'SaaSSignal <saascontact@signalboostapp.com>',
} as const

type SenderKey = keyof typeof SENDERS

export async function sendEmail(opts: {
  from: SenderKey
  to: string
  subject: string
  html: string
  replyTo?: string
}) {
  try {
    const { data, error } = await resend.emails.send({
      from: SENDERS[opts.from],
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send failed' }
  }
}
