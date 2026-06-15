// saas/lib/hub/providers/sendgrid.ts
// Real SendGrid execution handler. Credentials: SENDGRID_API_KEY (required).
// Extra: SENDGRID_FROM_EMAIL (a verified sender) for send_email.

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

export async function executeSendGridAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return { ok: false, error: 'SendGrid not configured — set SENDGRID_API_KEY' }
  const headers = { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' }

  if (template.id === 'sendgrid.send_email') {
    const from = process.env.SENDGRID_FROM_EMAIL
    if (!from) return { ok: false, error: 'Set SENDGRID_FROM_EMAIL (a verified sender) in Vercel' }
    const to = String(payload.to || '')
    const subject = String(payload.subject || '')
    const bodyText = String(payload.body || '')
    if (!to || !subject || !bodyText) return { ok: false, error: 'Recipient, subject, and body are required' }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: 'text/plain', value: bodyText }],
      }),
    })
    if (res.status === 202) return { ok: true, message: `Email queued to ${to}`, data: { status: 'accepted' } }
    const err = await res.text()
    return { ok: false, error: `SendGrid error (HTTP ${res.status}): ${err.slice(0, 300)}` }
  }

  if (template.id === 'sendgrid.check_domain_auth') {
    const domain = String(payload.domain || '').toLowerCase()
    const res = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', { method: 'GET', headers })
    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: `SendGrid error (HTTP ${res.status}): ${err.slice(0, 300)}` }
    }
    const list = await res.json().catch(() => [])
    const arr = Array.isArray(list) ? list : []
    const match = domain ? arr.find((d: any) => String(d?.domain || '').toLowerCase() === domain) : null
    if (domain && !match) return { ok: true, message: `No authenticated domain matching ${domain}`, data: { found: false, domains: arr.map((d: any) => d.domain) } }
    const target = match || arr[0]
    return {
      ok: true,
      message: target ? `Domain auth for ${target.domain}: ${target.valid ? 'valid' : 'pending'}` : 'No authenticated domains configured',
      data: target ? { domain: target.domain, valid: target.valid, dkim: target.dkim, spf: target.spf } : { found: false },
    }
  }

  return { ok: false, error: 'Unknown SendGrid action: ' + template.id }
}
