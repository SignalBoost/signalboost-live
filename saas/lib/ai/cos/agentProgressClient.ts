import { isConciergeBuilderObjective } from './cosReasoningRolePolicy.ts'

export type AgentProgressEvent = {
  phase: 'accepted' | 'running' | 'complete'
  message: string
  sequence: number
  elapsedMs: number
}

const JOB_POLL_DELAY_MS = 1_500
const JOB_POLL_ATTEMPTS = 180
const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|py)$/i
const MAX_CLIENT_FILE_BYTES = 512 * 1024

type ConciergeAttachment = Readonly<{
  name?: unknown
  type?: unknown
  mimeType?: unknown
  dataUrl?: unknown
}>

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function bodyRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

function latestUserText(body: Record<string, any>): string {
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message?.content === 'string') return message.content.trim()
  }
  return ''
}

function decodeTextDataUrl(value: string): string | null {
  const comma = value.indexOf(',')
  if (comma < 0) return null
  const header = value.slice(0, comma)
  const payload = value.slice(comma + 1)
  try {
    if (/;base64(?:;|$)/i.test(header)) {
      const bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0))
      if (bytes.byteLength > MAX_CLIENT_FILE_BYTES) return null
      return new TextDecoder().decode(bytes)
    }
    const decoded = decodeURIComponent(payload)
    return new TextEncoder().encode(decoded).byteLength <= MAX_CLIENT_FILE_BYTES ? decoded : null
  } catch {
    return null
  }
}

/**
 * The public Concierge transports executable source-file requests directly into the same durable
 * Builder job contract used by the authenticated Developer surface. Source attachments alone are
 * not enough to override read-only questions such as “explain” or “summarize”; those remain on
 * ordinary Concierge. This is transport selection only: the server still authenticates the user
 * and enforces the 1–4 file, size, extension and execution limits. Image/PDF/reference attachments
 * also remain on ordinary Concierge.
 */
export function conciergeBuilderRequest(body: unknown): { endpoint: '/api/builder'; body: Record<string, unknown> } | null {
  const record = bodyRecord(body)
  if (!record) return null
  const attachments = Array.isArray(record.attachments) ? record.attachments as ConciergeAttachment[] : []
  if (!attachments.length) return null

  const attachmentNames = attachments.map(attachment => typeof attachment?.name === 'string' ? attachment.name.trim().replace(/\\/g, '/') : '')
  const attachmentMimeTypes = attachments.map(attachment => String(attachment?.mimeType || attachment?.type || ''))
  const objective = latestUserText(record)
  if (!objective || !isConciergeBuilderObjective(objective, { attachmentNames, attachmentMimeTypes })) return null

  const files: Array<{ path: string; content: string }> = []
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index]
    const path = attachmentNames[index]
    const dataUrl = typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : ''
    if (!path || !SOURCE_FILE.test(path) || !dataUrl) return null
    const content = decodeTextDataUrl(dataUrl)
    if (content === null) return null
    files.push({ path, content })
  }

  const conversationId = typeof record.context?.conversationId === 'string' ? record.context.conversationId : ''
  if (!conversationId) return null
  return {
    endpoint: '/api/builder',
    body: { objective, conversationId, files },
  }
}

export async function postWithAgentProgress(args: {
  target: 'concierge' | 'cos'
  body: unknown
  signal: AbortSignal
  onProgress: (event: AgentProgressEvent) => void
}): Promise<{ ok: boolean; status: number; data: any }> {
  const startedAt = Date.now()
  let sequence = 0
  const report = (phase: AgentProgressEvent['phase'], message: string) => {
    args.onProgress({ phase, message, sequence: ++sequence, elapsedMs: Date.now() - startedAt })
  }

  const builderRequest = args.target === 'concierge' ? conciergeBuilderRequest(args.body) : null
  report('accepted', args.target === 'cos' ? 'COS received the request' : 'Concierge received the request')
  report('running', builderRequest
    ? 'Concierge sent the supplied source files to COS Builder'
    : args.target === 'cos' ? 'COS is processing the request' : 'Concierge is consulting COS')
  const heartbeat = window.setInterval(() => report('running', builderRequest
    ? 'COS Builder is working in the isolated user workspace'
    : 'Waiting for the COS response — connection active'), 2_000)

  const endpoint = builderRequest?.endpoint ?? (args.target === 'cos' ? '/api/cos-primary' : '/api/concierge')
  const requestBody = builderRequest?.body ?? args.body
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(requestBody),
      signal: args.signal,
    })
  } finally {
    window.clearInterval(heartbeat)
  }
  let data: any = await response.json().catch(() => ({ error: 'assistant_response_unavailable' }))
  const jobId = typeof data?.jobId === 'string' ? data.jobId : ''

  if (!jobId || !['queued', 'running'].includes(String(data?.status || ''))) {
    report('complete', response.ok ? 'Response completed' : 'Request completed with an error')
    return { ok: response.ok, status: response.status, data }
  }

  for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
    report('running', `COS Builder job ${String(data.status || 'running')} — checking durable progress`)
    await wait(JOB_POLL_DELAY_MS, args.signal)
    const poll = await fetch(`/api/builder?jobId=${encodeURIComponent(jobId)}`, {
      method: 'GET', credentials: 'include', cache: 'no-store', signal: args.signal,
      headers: { accept: 'application/json' },
    })
    data = await poll.json().catch(() => ({ error: 'builder_job_status_unavailable' }))
    if (poll.status === 202 || ['queued', 'running'].includes(String(data?.status || ''))) continue
    report('complete', poll.ok ? 'COS Builder completed the job' : 'COS Builder job failed')
    return { ok: poll.ok, status: poll.status, data }
  }

  report('running', 'COS Builder is still running; the final result remains durable in History')
  return { ok: true, status: 202, data }
}
