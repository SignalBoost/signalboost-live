// saas/lib/hub/providers/twilio.ts
// Real Twilio execution handler for the Hub Console.
// Credentials: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (required, in PROVIDER_CREDENTIALS).
// Extra (checked here with clear errors): TWILIO_FROM_NUMBER (SMS), TWILIO_VERIFY_SERVICE_SID (verify).
// Returns the standard { ok, message?, data?, error? } shape.

type Result = { ok: boolean; message?: string; data?: unknown; error?: string }

function form(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

export async function executeTwilioAction(template: any, payload: Record<string, unknown>): Promise<Result> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return { ok: false, error: 'Twilio not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN' }
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')

  if (template.id === 'twilio.send_sms') {
    const from = process.env.TWILIO_FROM_NUMBER
    if (!from) return { ok: false, error: 'Set TWILIO_FROM_NUMBER (your Twilio sending number) in Vercel' }
    const to = String(payload.to || '')
    const bodyText = String(payload.body || '')
    if (!to || !bodyText) return { ok: false, error: 'Recipient and message body are required' }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ To: to, From: from, Body: bodyText }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `Twilio error (HTTP ${res.status})` }
    return { ok: true, message: `SMS sent to ${to}`, data: { sid: data?.sid, status: data?.status } }
  }

  if (template.id === 'twilio.verify_number') {
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID
    if (!serviceSid) return { ok: false, error: 'Set TWILIO_VERIFY_SERVICE_SID (a Twilio Verify Service SID) in Vercel' }
    const to = String(payload.to || '')
    if (!to) return { ok: false, error: 'Phone number is required' }
    const res = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/Verifications`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ To: to, Channel: 'sms' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `Twilio Verify error (HTTP ${res.status})` }
    return { ok: true, message: `Verification code sent to ${to}`, data: { status: data?.status, channel: data?.channel } }
  }

  return { ok: false, error: 'Unknown Twilio action: ' + template.id }
}
