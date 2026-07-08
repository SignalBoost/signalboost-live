import { Resend } from 'resend'

type EmailResult = { ok: boolean; skipped?: boolean; reason?: string; error?: string }

type PreviewArgs = {
  campaignId: string
  title: string
  objective: string
  channel: string
  contact?: string
  dashboardUrl?: string
}

type PublishedArgs = PreviewArgs & {
  liveUrl?: string
  publicationDate?: string
}

function ownerEmail() {
  return process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || process.env.ADMIN_EMAIL || ''
}

function fromEmail() {
  return process.env.RESEND_FROM_EMAIL || 'SignalBoost Press <press@signalboostapp.com>'
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://saas.signalboostapp.com').replace(/\/$/, '')
}

function dashboardLink(campaignId: string) {
  return `${appBaseUrl()}/dashboard/marketing/press-print?campaign=${encodeURIComponent(campaignId)}`
}

async function sendOwnerMail(subject: string, text: string): Promise<EmailResult> {
  const to = ownerEmail()
  const key = process.env.RESEND_API_KEY
  if (!to || !key) return { ok: false, skipped: true, reason: 'missing_owner_email_or_resend_key' }

  try {
    const resend = new Resend(key)
    await resend.emails.send({ from: fromEmail(), to, subject, text })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function sendPressPrintPreviewEmail(args: PreviewArgs): Promise<EmailResult> {
  return sendOwnerMail(
    `Owner approval required: ${args.title || 'Press & Print campaign'}`,
    [
      'A Press & Print Media campaign is ready for owner review before publication.',
      '',
      `Campaign: ${args.campaignId}`,
      `Channel: ${args.channel || 'press-print'}`,
      args.contact ? `Publication/contact: ${args.contact}` : '',
      '',
      'Preview:',
      args.objective || 'No preview text was provided.',
      '',
      `Review and approve here: ${args.dashboardUrl || dashboardLink(args.campaignId)}`,
      '',
      'Nothing should be published or sent externally until the owner approves it.',
    ].filter(Boolean).join('\n'),
  )
}

export async function sendPressPrintPublishedEmail(args: PublishedArgs): Promise<EmailResult> {
  const location = args.liveUrl || args.dashboardUrl || dashboardLink(args.campaignId)
  return sendOwnerMail(
    `Press & Print published/completed: ${args.title || 'campaign'}`,
    [
      'A Press & Print Media campaign has been marked published/completed.',
      '',
      `Campaign: ${args.campaignId}`,
      `Channel: ${args.channel || 'press-print'}`,
      args.contact ? `Publication/contact: ${args.contact}` : '',
      args.publicationDate ? `Publication date: ${args.publicationDate}` : '',
      `Publication/proof location: ${location}`,
      '',
      'Final published/placed content preview:',
      args.objective || 'No campaign text was provided.',
    ].filter(Boolean).join('\n'),
  )
}
