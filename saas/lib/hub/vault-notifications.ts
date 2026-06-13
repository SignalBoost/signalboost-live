// saas/lib/hub/vault-notifications.ts
// Send Slack + email alerts for vault events (rotation, expiry, access).

export type NotificationEvent = 'rotation_success' | 'rotation_failed' | 'expiry_alert' | 'access_suspicious' | 'key_revoked'

export type NotificationPayload = {
  event: NotificationEvent
  secretName: string
  provider: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  timestamp: string
  userId?: string
  userEmail?: string
  metadata?: Record<string, unknown>
}

// ── Slack Notifications ──────────────────────────────────────────────────
export async function notifySlack(payload: NotificationPayload): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_VAULT_WEBHOOK_URL
  if (!webhookUrl) {
    return { ok: false, error: 'SLACK_VAULT_WEBHOOK_URL not configured' }
  }

  try {
    const color = {
      info: '#3b82f6',
      warning: '#ffc300',
      critical: '#ef4444',
    }[payload.severity]

    const text = {
      rotation_success: `✅ Key rotated: ${payload.secretName} (${payload.provider})`,
      rotation_failed: `❌ Rotation failed: ${payload.secretName} (${payload.provider})`,
      expiry_alert: `⚠️ Key expiring soon: ${payload.secretName} (${payload.provider})`,
      access_suspicious: `🚨 Suspicious access: ${payload.secretName}`,
      key_revoked: `🚫 Key revoked: ${payload.secretName}`,
    }[payload.event]

    const slackMessage = {
      attachments: [
        {
          color,
          title: text,
          text: payload.message,
          fields: [
            {
              title: 'Provider',
              value: payload.provider,
              short: true,
            },
            {
              title: 'Severity',
              value: payload.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Time',
              value: new Date(payload.timestamp).toLocaleString(),
              short: true,
            },
            ...(payload.userEmail
              ? [
                  {
                    title: 'User',
                    value: payload.userEmail,
                    short: true,
                  },
                ]
              : []),
          ],
          footer: 'SignalBoost Vault',
          ts: Math.floor(new Date(payload.timestamp).getTime() / 1000),
        },
      ],
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    })

    if (!res.ok) {
      const error = await res.text()
      return { ok: false, error: `Slack API error: ${error}` }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

// ── Email Notifications (SMTP) ───────────────────────────────────────────
export async function notifyEmail(payload: NotificationPayload, recipientEmail: string): Promise<{ ok: boolean; error?: string }> {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASSWORD
  const smtpFrom = process.env.SMTP_FROM_EMAIL || 'vault@signalboostapp.com'

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    console.warn('SMTP not configured; email skipped')
    return { ok: true } // Don't fail if SMTP is unconfigured
  }

  try {
    // In production: use nodemailer or similar
    // import nodemailer from 'nodemailer'
    // const transporter = nodemailer.createTransport({
    //   host: smtpHost, port: parseInt(smtpPort), secure: true,
    //   auth: { user: smtpUser, pass: smtpPass }
    // })

    const subject = {
      rotation_success: `✅ Key Rotated: ${payload.secretName}`,
      rotation_failed: `❌ Rotation Failed: ${payload.secretName}`,
      expiry_alert: `⚠️ Alert: ${payload.secretName} expiring soon`,
      access_suspicious: `🚨 Security Alert: Suspicious access`,
      key_revoked: `🚫 Key Revoked: ${payload.secretName}`,
    }[payload.event]

    const htmlBody = `
      <h2>${subject}</h2>
      <p>${payload.message}</p>
      <hr />
      <table style="font-size: 12px; color: #666;">
        <tr><td><strong>Provider:</strong></td><td>${payload.provider}</td></tr>
        <tr><td><strong>Severity:</strong></td><td>${payload.severity.toUpperCase()}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${new Date(payload.timestamp).toLocaleString()}</td></tr>
        ${payload.userEmail ? `<tr><td><strong>User:</strong></td><td>${payload.userEmail}</td></tr>` : ''}
      </table>
      <hr />
      <p style="font-size: 11px; color: #999;">SignalBoost Vault Management</p>
    `

    // TODO: Implement with nodemailer or send via API
    // For now: log to console
    console.log(`[SMTP] Email to ${recipientEmail}:`, subject)

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Email notification failed:', msg)
    return { ok: false, error: msg }
  }
}

// ── Batch notifications (Slack + Email) ──────────────────────────────────
export async function notifyBoth(
  payload: NotificationPayload,
  options?: { slackOnly?: boolean; emailOnly?: boolean; recipientEmail?: string },
): Promise<{ slack: { ok: boolean; error?: string }; email: { ok: boolean; error?: string } }> {
  const results = {
    slack: { ok: true },
    email: { ok: true },
  }

  if (!options?.emailOnly) {
    results.slack = await notifySlack(payload)
  }

  if (!options?.slackOnly && options?.recipientEmail) {
    results.email = await notifyEmail(payload, options.recipientEmail)
  }

  return results
}
