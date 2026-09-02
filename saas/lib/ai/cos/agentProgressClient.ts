export type AgentProgressEvent = {
  phase: 'accepted' | 'running' | 'complete'
  message: string
  sequence: number
  elapsedMs: number
}

const JOB_POLL_DELAY_MS = 1_500
const JOB_POLL_ATTEMPTS = 180

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

  report('accepted', args.target === 'cos' ? 'COS received the request' : 'Concierge received the request')
  report('running', args.target === 'cos' ? 'COS is processing the request' : 'Concierge is consulting COS')
  const heartbeat = window.setInterval(() => report('running', 'Waiting for the COS response — connection active'), 2_000)

  let response: Response
  try {
    // Concierge and the owner Assistant must share one server routing authority. Concierge no
    // longer posts into a parallel /api/concierge classifier first; canonical browser ingress owns
    // intent, operational evidence, artifact/visual/provenance exclusions, and Builder handoff.
    response = await fetch(args.target === 'cos' ? '/api/cos-primary' : '/api/cos-browser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(args.body),
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
