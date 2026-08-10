import type { CommunicationAdapter, CommunicationCapability, CommunicationContext, CommunicationResult, EmailAddress, EmailMessageInput } from './contracts'

const now = () => new Date().toISOString()
const fail = (errorCode: string): CommunicationResult => ({ ok: false, errorCode, retrievedAt: now() })
const success = <T>(data: T, mode: string): CommunicationResult<T> => ({ ok: true, data, mode, retrievedAt: now() })

function token(context: CommunicationContext): string {
  const value = String(context.accessToken || '').trim()
  if (!value) throw new Error('EMAIL_ACCESS_TOKEN_REQUIRED')
  return value
}

function addresses(values?: EmailAddress[]): string {
  return (values || []).map((value) => value.name ? `${value.name} <${value.email}>` : value.email).join(', ')
}

function assertMessage(value: Record<string, unknown>): EmailMessageInput {
  const message = value as unknown as EmailMessageInput
  if (!Array.isArray(message.to) || !message.to.length) throw new Error('EMAIL_RECIPIENT_REQUIRED')
  if (!String(message.subject || '').trim()) throw new Error('EMAIL_SUBJECT_REQUIRED')
  return message
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function gmailRaw(message: EmailMessageInput): string {
  const lines = [
    message.from ? `From: ${addresses([message.from])}` : '',
    `To: ${addresses(message.to)}`,
    message.cc?.length ? `Cc: ${addresses(message.cc)}` : '',
    message.bcc?.length ? `Bcc: ${addresses(message.bcc)}` : '',
    `Subject: ${message.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: ${message.html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
    '',
    message.html || message.text || '',
  ].filter((line, index) => line !== '' || index >= 7)
  return base64Url(lines.join('\r\n'))
}

async function json(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

export class GmailCommunicationAdapter implements CommunicationAdapter {
  readonly providerId = 'gmail'
  readonly displayName = 'Gmail / Google Workspace'
  readonly capabilities = ['email_send','email_draft','email_reply','email_search','email_read'] as const satisfies readonly CommunicationCapability[]

  async execute<TOutput>(capability: CommunicationCapability, input: Record<string, unknown>, context: CommunicationContext): Promise<CommunicationResult<TOutput>> {
    try {
      const headers = { Authorization: `Bearer ${token(context)}`, 'Content-Type': 'application/json' }
      if (capability === 'email_send' || capability === 'email_reply') {
        const message = assertMessage(input)
        const body: Record<string, unknown> = { raw: gmailRaw(message) }
        if (message.threadId) body.threadId = message.threadId
        const r = await json('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers, body: JSON.stringify(body) })
        if (!r.ok) return fail(`GMAIL_SEND_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'gmail_sent') as CommunicationResult<TOutput>
      }
      if (capability === 'email_draft') {
        const message = assertMessage(input)
        const r = await json('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', headers, body: JSON.stringify({ message: { raw: gmailRaw(message), threadId: message.threadId } }) })
        if (!r.ok) return fail(`GMAIL_DRAFT_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'gmail_draft_created') as CommunicationResult<TOutput>
      }
      if (capability === 'email_search') {
        const query = encodeURIComponent(String(input.query || ''))
        const maxResults = Math.min(Math.max(Number(input.limit || 25), 1), 100)
        const r = await json(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`, { headers })
        if (!r.ok) return fail(`GMAIL_SEARCH_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'gmail_search') as CommunicationResult<TOutput>
      }
      if (capability === 'email_read') {
        const id = encodeURIComponent(String(input.messageId || ''))
        if (!id) return fail('GMAIL_MESSAGE_ID_REQUIRED') as CommunicationResult<TOutput>
        const r = await json(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers })
        if (!r.ok) return fail(`GMAIL_READ_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'gmail_message_read') as CommunicationResult<TOutput>
      }
      return fail('GMAIL_CAPABILITY_UNSUPPORTED') as CommunicationResult<TOutput>
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'GMAIL_EXECUTION_FAILED') as CommunicationResult<TOutput>
    }
  }
}

function graphRecipients(values?: EmailAddress[]) {
  return (values || []).map((value) => ({ emailAddress: { address: value.email, name: value.name } }))
}

function graphMessage(message: EmailMessageInput) {
  return {
    subject: message.subject,
    body: { contentType: message.html ? 'HTML' : 'Text', content: message.html || message.text || '' },
    toRecipients: graphRecipients(message.to),
    ccRecipients: graphRecipients(message.cc),
    bccRecipients: graphRecipients(message.bcc),
    replyTo: message.from ? graphRecipients([message.from]) : undefined,
  }
}

export class MicrosoftGraphCommunicationAdapter implements CommunicationAdapter {
  readonly providerId = 'microsoft-365'
  readonly displayName = 'Microsoft 365 / Exchange Online'
  readonly capabilities = ['email_send','email_draft','email_reply','email_forward','email_search','email_read'] as const satisfies readonly CommunicationCapability[]

  async execute<TOutput>(capability: CommunicationCapability, input: Record<string, unknown>, context: CommunicationContext): Promise<CommunicationResult<TOutput>> {
    try {
      const headers = { Authorization: `Bearer ${token(context)}`, 'Content-Type': 'application/json' }
      const mailbox = context.accountRef ? `/users/${encodeURIComponent(context.accountRef)}` : '/me'
      const root = `https://graph.microsoft.com/v1.0${mailbox}`
      if (capability === 'email_send') {
        const message = assertMessage(input)
        const r = await json(`${root}/sendMail`, { method: 'POST', headers, body: JSON.stringify({ message: graphMessage(message), saveToSentItems: true }) })
        if (!r.ok && r.status !== 202) return fail(`GRAPH_SEND_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success({ accepted: true }, 'microsoft_graph_sent') as CommunicationResult<TOutput>
      }
      if (capability === 'email_draft') {
        const message = assertMessage(input)
        const r = await json(`${root}/messages`, { method: 'POST', headers, body: JSON.stringify(graphMessage(message)) })
        if (!r.ok) return fail(`GRAPH_DRAFT_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'microsoft_graph_draft_created') as CommunicationResult<TOutput>
      }
      if (capability === 'email_reply' || capability === 'email_forward') {
        const id = encodeURIComponent(String(input.messageId || ''))
        if (!id) return fail('GRAPH_MESSAGE_ID_REQUIRED') as CommunicationResult<TOutput>
        const message = input as unknown as EmailMessageInput
        const endpoint = capability === 'email_reply' ? 'reply' : 'forward'
        const body = capability === 'email_reply'
          ? { comment: message.text || message.html || '' }
          : { comment: message.text || message.html || '', toRecipients: graphRecipients(message.to) }
        const r = await json(`${root}/messages/${id}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) })
        if (!r.ok && r.status !== 202) return fail(`GRAPH_${endpoint.toUpperCase()}_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success({ accepted: true }, `microsoft_graph_${endpoint}`) as CommunicationResult<TOutput>
      }
      if (capability === 'email_search') {
        const query = String(input.query || '').replace(/"/g, '\\"')
        const top = Math.min(Math.max(Number(input.limit || 25), 1), 100)
        const params = query ? `?$search=${encodeURIComponent(`\"${query}\"`)}&$top=${top}` : `?$top=${top}`
        const r = await json(`${root}/messages${params}`, { headers: { ...headers, ConsistencyLevel: 'eventual' } })
        if (!r.ok) return fail(`GRAPH_SEARCH_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'microsoft_graph_search') as CommunicationResult<TOutput>
      }
      if (capability === 'email_read') {
        const id = encodeURIComponent(String(input.messageId || ''))
        if (!id) return fail('GRAPH_MESSAGE_ID_REQUIRED') as CommunicationResult<TOutput>
        const r = await json(`${root}/messages/${id}`, { headers })
        if (!r.ok) return fail(`GRAPH_READ_HTTP_${r.status}`) as CommunicationResult<TOutput>
        return success(r.data, 'microsoft_graph_message_read') as CommunicationResult<TOutput>
      }
      return fail('GRAPH_CAPABILITY_UNSUPPORTED') as CommunicationResult<TOutput>
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'GRAPH_EXECUTION_FAILED') as CommunicationResult<TOutput>
    }
  }
}
