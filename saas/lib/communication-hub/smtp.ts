import net from 'node:net'
import tls from 'node:tls'
import type { CommunicationAdapter, CommunicationCapability, CommunicationContext, CommunicationResult, EmailAddress, EmailMessageInput } from './contracts'

const now = () => new Date().toISOString()

type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; password?: string; from?: string; name?: string }

function cfg(context: CommunicationContext): SmtpConfig {
  const host = String(context.secrets?.SMTP_HOST || context.metadata?.smtpHost || '').trim()
  const port = Number(context.secrets?.SMTP_PORT || context.metadata?.smtpPort || 587)
  const secure = String(context.secrets?.SMTP_SECURE ?? context.metadata?.smtpSecure ?? (port === 465)) === 'true'
  if (!host) throw new Error('SMTP_HOST_REQUIRED')
  if (!Number.isFinite(port) || port <= 0 || port > 65535) throw new Error('SMTP_PORT_INVALID')
  return {
    host, port, secure,
    user: String(context.secrets?.SMTP_USER || context.metadata?.smtpUser || '').trim() || undefined,
    password: String(context.secrets?.SMTP_PASSWORD || '').trim() || undefined,
    from: String(context.secrets?.SMTP_FROM || context.metadata?.smtpFrom || '').trim() || undefined,
    name: String(context.metadata?.smtpFromName || '').trim() || undefined,
  }
}

function formatAddress(address: EmailAddress) { return address.name ? `${address.name} <${address.email}>` : address.email }
function allRecipients(message: EmailMessageInput) { return [...message.to, ...(message.cc || []), ...(message.bcc || [])] }

function mime(message: EmailMessageInput, config: SmtpConfig) {
  const from = message.from ? formatAddress(message.from) : config.from ? (config.name ? `${config.name} <${config.from}>` : config.from) : config.user
  if (!from) throw new Error('SMTP_FROM_REQUIRED')
  const headers = [
    `From: ${from}`,
    `To: ${message.to.map(formatAddress).join(', ')}`,
    message.cc?.length ? `Cc: ${message.cc.map(formatAddress).join(', ')}` : '',
    `Subject: ${message.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${config.host}>`,
    'MIME-Version: 1.0',
    `Content-Type: ${message.html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
    'Content-Transfer-Encoding: 8bit',
  ].filter(Boolean)
  const body = String(message.html || message.text || '').replace(/^\./gm, '..')
  return { from, raw: `${headers.join('\r\n')}\r\n\r\n${body}\r\n` }
}

type Socket = net.Socket | tls.TLSSocket

function readResponse(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    const onData = (chunk: Buffer | string) => {
      data += chunk.toString()
      const lines = data.split(/\r?\n/).filter(Boolean)
      const last = lines[lines.length - 1] || ''
      if (/^\d{3} /.test(last)) { cleanup(); resolve(data) }
    }
    const onError = (error: Error) => { cleanup(); reject(error) }
    const cleanup = () => { socket.off('data', onData); socket.off('error', onError) }
    socket.on('data', onData); socket.on('error', onError)
  })
}

function assertCode(response: string, accepted: number[]) {
  const code = Number(response.slice(0, 3))
  if (!accepted.includes(code)) throw new Error(`SMTP_${code || 'INVALID'}:${response.trim().slice(0, 160)}`)
}

async function command(socket: Socket, value: string, accepted: number[]) {
  socket.write(`${value}\r\n`)
  const response = await readResponse(socket)
  assertCode(response, accepted)
  return response
}

async function connect(config: SmtpConfig): Promise<Socket> {
  const socket: Socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port })
  await new Promise<void>((resolve, reject) => {
    const event = config.secure ? 'secureConnect' : 'connect'
    socket.once(event, () => resolve())
    socket.once('error', reject)
  })
  assertCode(await readResponse(socket), [220])
  return socket
}

async function upgradeStartTls(socket: Socket, config: SmtpConfig): Promise<Socket> {
  await command(socket, 'STARTTLS', [220])
  return await new Promise<tls.TLSSocket>((resolve, reject) => {
    const secured = tls.connect({ socket, servername: config.host }, () => resolve(secured))
    secured.once('error', reject)
  })
}

async function smtpSend(message: EmailMessageInput, config: SmtpConfig) {
  let socket = await connect(config)
  try {
    let ehlo = await command(socket, `EHLO signalboost.local`, [250])
    if (!config.secure && /STARTTLS/i.test(ehlo)) {
      socket = await upgradeStartTls(socket, config)
      ehlo = await command(socket, `EHLO signalboost.local`, [250])
    }
    if (config.user) {
      if (!config.password) throw new Error('SMTP_PASSWORD_REQUIRED')
      await command(socket, 'AUTH LOGIN', [334])
      await command(socket, Buffer.from(config.user).toString('base64'), [334])
      await command(socket, Buffer.from(config.password).toString('base64'), [235])
    }
    const built = mime(message, config)
    const envelopeFrom = message.from?.email || config.from || config.user
    if (!envelopeFrom) throw new Error('SMTP_FROM_REQUIRED')
    await command(socket, `MAIL FROM:<${envelopeFrom}>`, [250])
    for (const recipient of allRecipients(message)) await command(socket, `RCPT TO:<${recipient.email}>`, [250, 251])
    await command(socket, 'DATA', [354])
    socket.write(`${built.raw}.\r\n`)
    const accepted = await readResponse(socket)
    assertCode(accepted, [250])
    await command(socket, 'QUIT', [221]).catch(() => undefined)
    return { accepted: allRecipients(message).map((r) => r.email), response: accepted.trim() }
  } finally {
    socket.destroy()
  }
}

export class SmtpCommunicationAdapter implements CommunicationAdapter {
  readonly providerId = 'smtp'
  readonly displayName = 'SMTP'
  readonly capabilities = ['email_send'] as const satisfies readonly CommunicationCapability[]

  async execute<TOutput>(capability: CommunicationCapability, input: Record<string, unknown>, context: CommunicationContext): Promise<CommunicationResult<TOutput>> {
    if (capability !== 'email_send') return { ok: false, errorCode: 'SMTP_CAPABILITY_UNSUPPORTED', retrievedAt: now() }
    try {
      const message = input as unknown as EmailMessageInput
      if (!message.to?.length) throw new Error('EMAIL_RECIPIENT_REQUIRED')
      if (!String(message.subject || '').trim()) throw new Error('EMAIL_SUBJECT_REQUIRED')
      const data = await smtpSend(message, cfg(context))
      return { ok: true, data: data as TOutput, mode: 'smtp_sent', retrievedAt: now() }
    } catch (error) {
      return { ok: false, errorCode: error instanceof Error ? error.message : 'SMTP_SEND_FAILED', retrievedAt: now() }
    }
  }
}
