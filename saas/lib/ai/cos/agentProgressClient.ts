import { isConciergeBuilderObjective } from './cosReasoningRolePolicy.ts'
import { isOperatorRepairRequest, isVerifiedBuilderTerminal, operatorProgressMessage } from './operator-progress.ts'

export type AgentProgressEvent = {
  phase: 'accepted' | 'running' | 'complete'
  message: string
  sequence: number
  elapsedMs: number
}

const JOB_POLL_DELAY_MS = 1_500
const JOB_POLL_ATTEMPTS = 180
const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const MAX_CLIENT_FILE_BYTES = 512 * 1024
const FENCED_SOURCE = /```([A-Za-z0-9_+#.-]*)\s*\n?([\s\S]*?)```/m
const SOURCE_START = /^\s*(?:import|export|const|let|var|function|class|interface|type|enum|namespace|def|from\s+\S+\s+import|#include|#define|package\s+|using\s+|public\s+class|private\s+class|protected\s+class)\b/m
const SOURCE_CONTINUATION_START = /^\s*(?:(?:type\s+)?[A-Za-z_$][\w$]*,|}\s*from\s*['"][^'"]+['"])\s*$/
const SOURCE_SHAPE: readonly RegExp[] = [
  /^\s*(?:import|export|from|const|let|var|function|class|def|interface|type|enum|namespace)\b/m,
  /=>|\)\s*\{|^\s*[})\]];?\s*$/m,
  /^\s*(?:if|for|while|switch|catch|elif|foreach|else\s+if)\s*\(/m,
  /\b(?:console\.log|printf|println|System\.out)\s*\(|^\s*(?:print|echo)\s*\(/m,
  /<\/?[A-Za-z][\w.-]*(?:\s[^<>]*)?\/?>/,
]
const FENCE_LANGUAGE_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  js: 'js', javascript: 'js', mjs: 'mjs', cjs: 'cjs',
  ts: 'ts', typescript: 'ts', tsx: 'tsx', jsx: 'jsx',
  py: 'py', python: 'py', html: 'html', css: 'css', json: 'json', sql: 'sql',
  sh: 'sh', shell: 'sh', bash: 'sh', java: 'java', cpp: 'cpp', 'c++': 'cpp', cs: 'cs', 'c#': 'cs',
  go: 'go', golang: 'go', rust: 'rs', rs: 'rs', php: 'php', rb: 'rb', ruby: 'rb',
  swift: 'swift', kotlin: 'kt', kt: 'kt',
})

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

function inferredExtension(language: string, source: string): string {
  const value = language.toLowerCase()
  if (FENCE_LANGUAGE_EXTENSION[value]) return FENCE_LANGUAGE_EXTENSION[value]
  if (/\b(?:interface|type)\s+[A-Za-z_$]|\bimport\s+type\b|\bas\s+const\b|:\s*(?:string|number|boolean|unknown|never)\b/.test(source)) return 'ts'
  if (/\bdef\s+[A-Za-z_]\w*\s*\(|^\s*from\s+\S+\s+import\s+/m.test(source)) return 'py'
  if (/<[A-Z][A-Za-z0-9]*(?:\s|>|\/)/.test(source)) return 'tsx'
  return 'js'
}

function sourceLike(value: string): boolean {
  const source = String(value || '').trim()
  if (source.split(/\n/).filter(line => line.trim()).length < 2) return false
  return SOURCE_SHAPE.reduce((count, pattern) => count + (pattern.test(source) ? 1 : 0), 0) >= 2
}

function sourceBeginsHere(value: string): boolean {
  const first = String(value || '').split(/\r?\n/).find(line => line.trim()) || ''
  return SOURCE_START.test(first) || SOURCE_CONTINUATION_START.test(first)
}

function inlineSeparatedSource(raw: string): string | null {
  const separators = [...raw.matchAll(/\s[-–—]\s+/g)]
  for (let index = separators.length - 1; index >= 0; index -= 1) {
    const separator = separators[index]
    const start = (separator.index ?? -1) + separator[0].length
    if (start <= 0) continue
    const candidate = raw.slice(start).trim()
    if (sourceBeginsHere(candidate) && sourceLike(candidate)) return candidate
  }
  return null
}

/**
 * Browser users often paste source directly instead of attaching a file. The routing policy already
 * recognizes that as executable source, but the old transport created no Builder file, leaving an
 * empty workspace. Stage a bounded synthetic source file so Builder can actually inspect/edit it.
 * Prose before the pasted source remains in the objective, not in the executable file. Continuations
 * of multi-line imports are preserved as well, including the common "explanation - code" paste form.
 */
export function pastedConciergeSourceFile(objective: string): { path: string; content: string } | null {
  const raw = String(objective || '').trim()
  if (!raw) return null

  const fenced = FENCED_SOURCE.exec(raw)
  if (fenced?.[2]?.trim()) {
    const content = fenced[2].trim()
    const language = String(fenced[1] || '').trim().toLowerCase()
    const explicitlySupported = Boolean(FENCE_LANGUAGE_EXTENSION[language])
    if ((!explicitlySupported && !sourceLike(content)) || new TextEncoder().encode(content).byteLength > MAX_CLIENT_FILE_BYTES) return null
    return { path: `pasted-source.${inferredExtension(language, content)}`, content }
  }

  const separated = inlineSeparatedSource(raw)
  if (separated) {
    if (new TextEncoder().encode(separated).byteLength > MAX_CLIENT_FILE_BYTES) return null
    return { path: `pasted-source.${inferredExtension('', separated)}`, content: separated }
  }

  const lines = raw.split(/\r?\n/)
  const startLine = lines.findIndex(line => SOURCE_START.test(line) || SOURCE_CONTINUATION_START.test(line))
  if (startLine < 0) return null
  const content = lines.slice(startLine).join('\n').trim()
  if (!sourceLike(content) || new TextEncoder().encode(content).byteLength > MAX_CLIENT_FILE_BYTES) return null
  return { path: `pasted-source.${inferredExtension('', content)}`, content }
}

/**
 * Concierge transports executable source requests directly into the same durable Builder job
 * contract used by the Developer surface. Source attachments alone are not enough to override
 * read-only questions such as “explain” or “summarize”; those remain on ordinary Concierge.
 * A source-dominant paste is also staged as a synthetic file so recognized code never reaches an
 * empty Builder workspace. The server remains authoritative for identity and execution limits.
 */
export function conciergeBuilderRequest(body: unknown): { endpoint: '/api/builder'; body: Record<string, unknown> } | null {
  const record = bodyRecord(body)
  if (!record) return null
  const attachments = Array.isArray(record.attachments) ? record.attachments as ConciergeAttachment[] : []
  const attachmentNames = attachments.map(attachment => typeof attachment?.name === 'string' ? attachment.name.trim().replace(/\\/g, '/') : '')
  const attachmentMimeTypes = attachments.map(attachment => String(attachment?.mimeType || attachment?.type || ''))
  const objective = latestUserText(record)
  if (!objective || !isConciergeBuilderObjective(objective, { attachmentNames, attachmentMimeTypes })) return null

  const files: Array<{ path: string; content: string }> = []
  if (attachments.length) {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index]
      const path = attachmentNames[index]
      const dataUrl = typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : ''
      if (!path || !SOURCE_FILE.test(path) || !dataUrl) return null
      const content = decodeTextDataUrl(dataUrl)
      if (content === null) return null
      files.push({ path, content })
    }
  } else {
    const pasted = pastedConciergeSourceFile(objective)
    if (!pasted) return null
    files.push(pasted)
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
  const requestBody = builderRequest?.body ?? args.body
  const repairRequest = isOperatorRepairRequest(requestBody)
  const progressTarget = args.target
  const builderActive = Boolean(builderRequest)

  report('accepted', repairRequest
    ? operatorProgressMessage({ stage: 'accepted', target: progressTarget, builder: builderActive })
    : args.target === 'cos' ? 'COS received the request' : 'Concierge received the request')
  report('running', repairRequest
    ? operatorProgressMessage({ stage: 'diagnosing', target: progressTarget, builder: builderActive })
    : builderRequest
      ? 'Concierge sent the supplied source files to COS Builder'
      : args.target === 'cos' ? 'COS is processing the request' : 'Concierge is consulting COS')
  const heartbeat = window.setInterval(() => report('running', repairRequest
    ? operatorProgressMessage({ stage: 'fixing', target: progressTarget, builder: builderActive })
    : builderRequest
      ? 'COS Builder is working in the isolated user workspace'
      : 'Waiting for the COS response — connection active'), 2_000)

  // /api/cos-browser remains the canonical browser ingress. The explicit surface header prevents
  // a signed-in owner using the public homepage Concierge from inheriting private owner authority;
  // only the owner Assistant surface may enter the privileged lane after server-side authentication.
  const endpoint = builderRequest?.endpoint ?? '/api/cos-browser'
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-signalboost-surface': args.target,
      },
      body: JSON.stringify(requestBody),
      signal: args.signal,
    })
  } finally {
    window.clearInterval(heartbeat)
  }
  let data: any = await response.json().catch(() => ({ error: 'assistant_response_unavailable' }))
  const jobId = typeof data?.jobId === 'string' ? data.jobId : ''

  if (!jobId || !['queued', 'running'].includes(String(data?.status || ''))) {
    report('complete', repairRequest
      ? operatorProgressMessage({ stage: response.ok ? 'complete' : 'blocked', target: progressTarget, builder: builderActive })
      : response.ok ? 'Response completed' : 'Request completed without a verified result')
    return { ok: response.ok, status: response.status, data }
  }

  for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
    report('running', repairRequest
      ? operatorProgressMessage({ stage: 'fixing', target: progressTarget, builder: true })
      : `COS Builder job ${String(data.status || 'running')} — checking durable progress`)
    await wait(JOB_POLL_DELAY_MS, args.signal)
    const poll = await fetch(`/api/builder?jobId=${encodeURIComponent(jobId)}`, {
      method: 'GET', credentials: 'include', cache: 'no-store', signal: args.signal,
      headers: { accept: 'application/json' },
    })
    data = await poll.json().catch(() => ({ error: 'builder_job_status_unavailable' }))
    if (poll.status === 202 || ['queued', 'running'].includes(String(data?.status || ''))) continue
    const terminalSucceeded = isVerifiedBuilderTerminal(data, poll.ok)
    report('complete', repairRequest
      ? operatorProgressMessage({ stage: terminalSucceeded ? 'verified' : 'blocked', target: progressTarget, builder: true })
      : terminalSucceeded ? 'COS Builder completed the job' : 'COS Builder completed without a verified result')
    return { ok: terminalSucceeded, status: poll.status, data }
  }

  report('running', repairRequest
    ? operatorProgressMessage({ stage: 'durable', target: progressTarget, builder: true })
    : 'COS Builder is still running; the final result remains durable in History')
  return { ok: true, status: 202, data }
}
