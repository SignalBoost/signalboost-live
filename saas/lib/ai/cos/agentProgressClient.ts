import { isConciergeBuilderObjective, structuredApplicationBuild } from './cosReasoningRolePolicy.ts'
import { readPendingApproval } from './assistanceMode.ts'
import { isOperatorRepairRequest, isVerifiedBuilderTerminal, operatorProgressMessage } from './operator-progress.ts'
import { ASSISTANT_TRANSPORT_TIMEOUT_COPY, findDurableCosTurnReply, findRecoveredAssistantTurn, type RecoveredAssistantTurn } from './assistantTransportRecovery.ts'
import { planResearchTask } from './researchBudget.ts'
import { BUILDER_JOB_FOLLOW_WINDOW_MS, BUILDER_JOB_POLL_DELAY_MS } from '../../builder/job-poll.ts'

export type AgentProgressEvent = {
  phase: 'accepted' | 'running' | 'complete'
  message: string
  sequence: number
  elapsedMs: number
}

const COS_TURN_POLL_DELAY_MS = 1_500
const COS_TURN_FOREGROUND_WAIT_MS = 180_000
const COS_HISTORY_READ_DEADLINE_MS = 2_000
const PUBLIC_CONCIERGE_TRANSPORT_DEADLINE_MS = 195_000
// History watch for an open COS turn: first read after 5 s, then every 3 s, until 240 s after send.
// 240 s covers the server's 172 s whole-turn watchdog plus the History write, and stays inside the
// Assistant page's 290 s deadline.
const COS_HISTORY_WATCH_START_MS = 5_000
const COS_HISTORY_WATCH_INTERVAL_MS = 3_000
const COS_HISTORY_WATCH_DEADLINE_MS = 240_000
// The server saves the turn just before it responds. When History shows the answer first, give the
// live response this long to land so its extra fields (diagnostics, Builder files) are not lost.
const COS_HISTORY_RESPONSE_GRACE_MS = 4_000
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

/**
 * Read-only History watch for one sent COS turn. Returns the saved assistant turn (reply and delivered visual) for this exact
 * send (matched by prompt and send time, see findRecoveredAssistantTurn) or null at the deadline.
 * It never POSTs, so it can never replay an action.
 */
async function watchHistoryForCompletedTurn(args: {
  conversationId: string
  userText: string
  sentAtMs: number
  signal: AbortSignal
}): Promise<RecoveredAssistantTurn | null> {
  const deadlineMs = args.sentAtMs + COS_HISTORY_WATCH_DEADLINE_MS
  await wait(COS_HISTORY_WATCH_START_MS, args.signal)
  while (Date.now() < deadlineMs) {
    const readBudgetMs = Math.max(1, Math.min(COS_HISTORY_READ_DEADLINE_MS, deadlineMs - Date.now()))
    try {
      const history = await fetch(`/api/assistant/chats?id=${encodeURIComponent(args.conversationId)}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.any([args.signal, AbortSignal.timeout(readBudgetMs)]),
        headers: { accept: 'application/json' },
      })
      // No History for this visitor (signed out): stop watching instead of polling for minutes.
      if (history.status === 401 || history.status === 403) return null
      if (history.ok) {
        const payload = await history.json().catch(() => null)
        const turn = findRecoveredAssistantTurn(
          Array.isArray(payload?.messages) ? payload.messages : [],
          args.userText,
          args.sentAtMs,
        )
        if (turn) return turn
      }
    } catch (error) {
      if (args.signal.aborted) throw error
    }
    const remainingMs = deadlineMs - Date.now()
    if (remainingMs <= 0) break
    await wait(Math.min(COS_HISTORY_WATCH_INTERVAL_MS, remainingMs), args.signal)
  }
  return null
}

/** Last-chance read-only lookup for a request whose HTTP envelope was lost or
 * replaced by a gateway timeout. Server History may already hold the answer.
 * Never POST from recovery: the original request may have made changes.
 */
async function recoverSavedTurnOnce(args: {
  conversationId: string
  userText: string
  sentAtMs: number
  signal: AbortSignal
}): Promise<RecoveredAssistantTurn | null> {
  if (!args.conversationId || !args.userText || args.signal.aborted) return null
  try {
    const response = await fetch(`/api/assistant/chats?id=${encodeURIComponent(args.conversationId)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([args.signal, AbortSignal.timeout(COS_HISTORY_READ_DEADLINE_MS)]),
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    return findRecoveredAssistantTurn(
      Array.isArray(payload?.messages) ? payload.messages : [],
      args.userText,
      args.sentAtMs,
    )
  } catch { return null }
}

/** A turn recovered from History is shown exactly like a live answer, chart included. */
function historyRecoveryData(turn: RecoveredAssistantTurn) {
  return { reply: turn.reply, source: 'cos-transport-history-recovery', ...(turn.visual ? { visual: turn.visual } : {}) }
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

function transportFailureReply(body: unknown): string {
  const record = bodyRecord(body)
  const locale = String(record?.context?.language || 'en').toLowerCase() as keyof typeof ASSISTANT_TRANSPORT_TIMEOUT_COPY
  return ASSISTANT_TRANSPORT_TIMEOUT_COPY[locale] || ASSISTANT_TRANSPORT_TIMEOUT_COPY.en
}

function deliberateAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
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
  // Guide me never starts Builder: COS explains instead. Every other mode travels with the job (Production
  // 2026-10-22: this shortcut dropped the mode, so a Work with me job published without asking).
  const assistanceMode = typeof record.context?.assistanceMode === 'string' ? record.context.assistanceMode : ''
  if (assistanceMode === 'guide') return null

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
    // A from-scratch application specification has no source file yet. It must
    // create an empty Builder workspace, not silently fall through to COS chat; its fenced
    // examples (an expected JSON response, the test commands) are not source to stage.
    const specification = structuredApplicationBuild(objective)
    const pasted = specification ? null : pastedConciergeSourceFile(objective)
    if (!pasted && !specification) return null
    if (pasted) files.push(pasted)
  }

  const conversationId = typeof record.context?.conversationId === 'string' ? record.context.conversationId : ''
  if (!conversationId) return null
  return {
    endpoint: '/api/builder',
    body: { objective, conversationId, files,
      ...(assistanceMode ? { assistanceMode } : {}),
      ...(typeof record.context?.language === 'string' ? { language: record.context.language } : {}) },
  }
}

export async function postWithAgentProgress(args: {
  target: 'concierge' | 'cos'
  body: unknown
  signal: AbortSignal
  onProgress: (event: AgentProgressEvent) => void
  /** Called once the server has accepted a durable Builder job, before following it. A caller's own
   * response deadline belongs to the request, not to the job it started; Stop still aborts `signal`. */
  onJobAccepted?: () => void
}): Promise<{ ok: boolean; status: number; data: any }> {
  const startedAt = Date.now()
  let sequence = 0
  const report = (phase: AgentProgressEvent['phase'], message: string) => {
    args.onProgress({ phase, message, sequence: ++sequence, elapsedMs: Date.now() - startedAt })
  }

  const builderRequest = conciergeBuilderRequest(args.body)
  const requestBody = builderRequest?.body ?? args.body
  const repairRequest = isOperatorRepairRequest(requestBody)
  const progressTarget = args.target
  const builderActive = Boolean(builderRequest)
  const requestRecord = bodyRecord(requestBody)
  const researchRequest = requestRecord ? planResearchTask(latestUserText(requestRecord)) : null
  const boundedPublicTransport = args.target === 'concierge' && !builderRequest && !researchRequest
  const responseSignal = boundedPublicTransport
    ? AbortSignal.any([args.signal, AbortSignal.timeout(PUBLIC_CONCIERGE_TRANSPORT_DEADLINE_MS)])
    : args.signal

  report('accepted', repairRequest
    ? operatorProgressMessage({ stage: 'accepted', target: progressTarget, builder: builderActive })
    : args.target === 'cos' ? 'COS received the request' : 'Concierge received the request')
  report('running', repairRequest
    ? operatorProgressMessage({ stage: 'diagnosing', target: progressTarget, builder: builderActive })
    : builderRequest
      ? 'Request routed to COS Builder for executable verification'
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
  const conversationIdForTurn = typeof requestRecord?.context?.conversationId === 'string'
    ? String(requestRecord.context.conversationId)
    : ''
  const userTextForTurn = requestRecord ? latestUserText(requestRecord) : ''
  // RESUMABLE TURN (2026-10-15). The answer must not depend on one long HTTP response surviving.
  // The server saves every completed owner turn in History before it responds, so while the POST is
  // open the page also watches History (read-only GETs) and shows the saved answer as soon as it
  // exists — whether the response arrives, stalls, or the connection is dropped (tab backgrounded,
  // network change, proxy idle cut). Production 2026-10-15: COS answered and saved the edit, but the
  // page lost the response and showed the timeout copy.
  // Both surfaces: production 2026-10-15 the owner, signed in on the homepage Concierge, saw the
  // timeout copy twice although the server answered each edit in seconds and saved it to History.
  // For a visitor without History the first read is refused and the watch stops.
  const historyWatchEligible = !builderRequest && Boolean(conversationIdForTurn) && Boolean(userTextForTurn)
  const fetchAbort = new AbortController()
  const watchAbort = new AbortController()
  type TransportOutcome =
    | { kind: 'response'; response: Response }
    | { kind: 'error'; error: unknown }
    | { kind: 'history'; turn: RecoveredAssistantTurn }
  const posted: Promise<TransportOutcome> = fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-signalboost-surface': args.target,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.any([responseSignal, fetchAbort.signal]),
  }).then(
    (value): TransportOutcome => ({ kind: 'response', response: value }),
    (error): TransportOutcome => ({ kind: 'error', error }),
  )
  const watched: Promise<RecoveredAssistantTurn | null> = historyWatchEligible
    ? watchHistoryForCompletedTurn({
        conversationId: conversationIdForTurn,
        userText: userTextForTurn,
        sentAtMs: startedAt,
        signal: AbortSignal.any([args.signal, watchAbort.signal]),
      }).catch(() => null)
    : Promise.resolve(null)
  const historyFound: Promise<TransportOutcome> = watched.then(turn => turn
    ? { kind: 'history', turn }
    : new Promise<TransportOutcome>(() => undefined))

  let response: Response
  try {
    let outcome = await Promise.race([posted, historyFound])
    if (outcome.kind === 'error') {
      const error = outcome.error
      if (args.signal.aborted) throw error
      if (boundedPublicTransport && responseSignal.aborted) {
        // A dropped HTTP request is not proof of a failed model. The server
        // may already have persisted the response before the gateway timed out.
        const saved = historyWatchEligible ? await recoverSavedTurnOnce({
          conversationId: conversationIdForTurn,
          userText: userTextForTurn,
          sentAtMs: startedAt,
          signal: args.signal,
        }) : null
        if (saved) {
          report('complete', 'Recovered the completed COS answer from History')
          return { ok: true, status: 200, data: historyRecoveryData(saved) }
        }
        report('complete', 'Concierge stopped waiting for the unavailable response')
        return {
          ok: false,
          status: 504,
          data: {
            reply: transportFailureReply(requestBody),
            source: 'concierge-browser-deadline',
            execution_allowed: false,
            external_action_taken: false,
          },
        }
      }
      if (deliberateAbort(error, args.signal)) throw error
      // The POST may have completed on the server even though the browser lost its response.
      // Keep reading History until the turn's deadline; never replay a possible action.
      if (historyWatchEligible) {
        report('running', 'The connection to COS was interrupted — waiting for the saved answer in History (the request is not replayed)')
        const turn = await watched
        if (turn) outcome = { kind: 'history', turn }
      }
    }
    if (outcome.kind === 'history') {
      const late = await Promise.race([
        posted,
        new Promise<null>(resolve => window.setTimeout(() => resolve(null), COS_HISTORY_RESPONSE_GRACE_MS)),
      ])
      if (late?.kind === 'response') outcome = late
    }
    if (outcome.kind === 'history') {
      fetchAbort.abort()
      report('complete', 'Recovered the completed COS answer from History')
      return { ok: true, status: 200, data: historyRecoveryData(outcome.turn) }
    }
    if (outcome.kind === 'error') {
      report('complete', operatorProgressMessage({ stage: 'blocked', target: progressTarget, builder: builderActive }))
      return {
        ok: false,
        status: 503,
        data: {
          reply: transportFailureReply(requestBody),
          source: 'assistant-transport-unconfirmed',
          execution_allowed: false,
          external_action_taken: false,
        },
      }
    }
    response = outcome.response
  } finally {
    watchAbort.abort()
    window.clearInterval(heartbeat)
  }
  let data: any = await response.json().catch(() => ({ error: 'assistant_response_unavailable' }))
  // A gateway can deliver HTTP 504, a timeout envelope with status 200, or
  // malformed JSON AFTER the model has completed and persisted the actual
  // answer. Before displaying a transport error, check that exact saved turn.
  // Never replace an ordinary substantive response or replay a POST.
  const receivedReply = typeof data?.reply === 'string' ? data.reply.trim() : ''
  const transportFailed = !response.ok
    || (!receivedReply && !data?.turnId && !data?.jobId)
    || receivedReply === transportFailureReply(requestBody)
    || ['concierge-browser-deadline', 'assistant-transport-unconfirmed', 'cos-browser-turn-deadline'].includes(String(data?.source || ''))
  if (historyWatchEligible && transportFailed && !args.signal.aborted) {
    const saved = await recoverSavedTurnOnce({
      conversationId: conversationIdForTurn,
      userText: userTextForTurn,
      sentAtMs: startedAt,
      signal: args.signal,
    })
    if (saved) {
      report('complete', 'Recovered the completed COS answer from History')
      return { ok: true, status: 200, data: historyRecoveryData(saved) }
    }
  }
  const turnId = typeof data?.turnId === 'string' ? data.turnId : ''
  const conversationId = conversationIdForTurn

  if (turnId && data?.status === 'running' && conversationId) {
    const durablePollDeadlineMs = startedAt + COS_TURN_FOREGROUND_WAIT_MS
    while (Date.now() < durablePollDeadlineMs) {
      report('running', 'COS accepted the turn durably — checking History for the completed response')
      try {
        const remainingBeforeWaitMs = durablePollDeadlineMs - Date.now()
        if (remainingBeforeWaitMs <= 0) break
        await wait(Math.min(COS_TURN_POLL_DELAY_MS, remainingBeforeWaitMs), args.signal)

        const remainingBeforeReadMs = durablePollDeadlineMs - Date.now()
        if (remainingBeforeReadMs <= 0) break
        const historyReadBudgetMs = Math.max(1, Math.min(COS_HISTORY_READ_DEADLINE_MS, remainingBeforeReadMs))
        const history = await fetch(`/api/assistant/chats?id=${encodeURIComponent(conversationId)}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: AbortSignal.any([args.signal, AbortSignal.timeout(historyReadBudgetMs)]),
          headers: { accept: 'application/json' },
        })
        if (!history.ok) continue
        const historyPayload = await history.json().catch(() => null)
        const terminal = findDurableCosTurnReply(
          Array.isArray(historyPayload?.messages) ? historyPayload.messages : [],
          turnId,
        )
        if (!terminal) continue
        report('complete', terminal.status === 'succeeded' ? 'COS completed the durable turn' : 'COS durable turn stopped without a verified response')
        return {
          ok: terminal.status === 'succeeded',
          status: terminal.status === 'succeeded' ? 200 : 500,
          data: {
            reply: terminal.content,
            source: 'cos-durable-history',
            turnId,
            status: terminal.status,
            execution_allowed: false,
            external_action_taken: false,
          },
        }
      } catch (error) {
        if (deliberateAbort(error, args.signal)) throw error
        // Read-only History polling never replays the accepted POST.
      }
    }

    // The durable worker may still finish later, but a running transport receipt must never become
    // the visible assistant answer. Return an explicit timeout envelope instead of the original 202.
    report('complete', 'COS did not finish the durable turn inside the foreground response window')
    return {
      ok: false,
      status: 504,
      data: {
        reply: transportFailureReply(requestBody),
        source: 'cos-durable-history-deadline',
        turnId,
        status: 'running',
        execution_allowed: false,
        external_action_taken: false,
      },
    }
  }

  const jobId = typeof data?.jobId === 'string' ? data.jobId : ''

  if (!jobId || !['queued', 'running'].includes(String(data?.status || ''))) {
    report('complete', repairRequest
      ? operatorProgressMessage({ stage: response.ok ? 'complete' : 'blocked', target: progressTarget, builder: builderActive })
      : response.ok ? 'Response completed' : 'Request completed without a verified result')
    return { ok: response.ok, status: response.status, data }
  }

  // Once a POST has returned a durable job id, every later request is read-only status checking.
  // A transient GET/network loss must never throw away the accepted job or cause a second POST.
  // Follow the job for its whole lifetime, as the Developer page does (job-poll.ts). Production 2026-10-21: chat
  // stopped after 180 checks (~4.5 minutes) and left "Builder is running job …" as the final answer of a job
  // that kept running for several more minutes.
  args.onJobAccepted?.()
  const followUntil = Date.now() + BUILDER_JOB_FOLLOW_WINDOW_MS
  while (Date.now() < followUntil) {
    report('running', repairRequest
      ? operatorProgressMessage({ stage: 'fixing', target: progressTarget, builder: true })
      : `COS Builder job ${String(data.status || 'running')} — checking durable progress`)

    let poll: Response
    try {
      await wait(BUILDER_JOB_POLL_DELAY_MS, args.signal)
      poll = await fetch(`/api/builder?jobId=${encodeURIComponent(jobId)}`, {
        method: 'GET', credentials: 'include', cache: 'no-store', signal: args.signal,
        headers: { accept: 'application/json' },
      })
    } catch (error) {
      if (deliberateAbort(error, args.signal)) throw error
      report('running', 'Builder is still durable; a status check was lost, so COS is retrying the read-only status check without replaying the action.')
      continue
    }

    if (!poll.ok && poll.status >= 500) {
      report('running', 'Builder is still durable; the status endpoint was temporarily unavailable, so COS is retrying the read-only status check.')
      continue
    }

    data = await poll.json().catch(() => ({ error: 'builder_job_status_unavailable' }))
    if (data?.error === 'builder_job_status_unavailable') {
      report('running', 'Builder is still durable; the status response was incomplete, so COS is retrying the read-only status check.')
      continue
    }
    // A job paused for the user's approval is waiting on them, not on Builder: show it now (approval card).
    if (readPendingApproval(data)) break
    if (poll.status === 202 || ['queued', 'running', 'paused'].includes(String(data?.status || ''))) continue
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