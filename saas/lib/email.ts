// saas/lib/email.ts
import { Resend } from 'resend'
import { PUBLIC_BRAND } from '@/lib/public-brand'

// Verified sender identities. The mailbox domain intentionally stays on the legacy
// corporate domain (DNS/DKIM live there); only the display name carries the public brand.
// These addresses are used for outbound sending through Resend.
export const SENDERS = {
  signalSupport: `${PUBLIC_BRAND.name} Team <signalsupport@signalboostapp.com>`,
  saasSupport:   `${PUBLIC_BRAND.name} Team <saassupport@signalboostapp.com>`,
  saasSales:     `${PUBLIC_BRAND.name} Sales <saassales@signalboostapp.com>`,
  saasMarketing: `${PUBLIC_BRAND.name} <saasmarketing@signalboostapp.com>`,
  saasPartners:  `${PUBLIC_BRAND.name} Partners <saaspartners@signalboostapp.com>`,
  saasContact:   `${PUBLIC_BRAND.name} <saascontact@signalboostapp.com>`,
} as const

type SenderKey = keyof typeof SENDERS

// Business-facing sender aliases must receive replies at the matching business
// address. Never allow an owner/admin fallback address to leak into customer email.
const REPLY_TO_BY_SENDER: Record<SenderKey, string> = {
  signalSupport: 'signalsupport@signalboostapp.com',
  saasSupport: 'saassupport@signalboostapp.com',
  saasSales: 'saassales@signalboostapp.com',
  saasMarketing: 'saasmarketing@signalboostapp.com',
  saasPartners: 'saaspartners@signalboostapp.com',
  saasContact: 'saascontact@signalboostapp.com',
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return new Resend(apiKey)
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
      replyTo: opts.replyTo || REPLY_TO_BY_SENDER[opts.from],
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
