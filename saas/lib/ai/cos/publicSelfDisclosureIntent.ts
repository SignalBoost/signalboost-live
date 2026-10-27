// saas/lib/ai/cos/publicSelfDisclosureIntent.ts
//
// Decides, by meaning and in any language, whether a PUBLIC request asks about this service's own model, provider,
// infrastructure, creator or trainer. Owner decision 2026-10-26: a word rule on the request used to make that call and
// replaced whole answers to requests that merely mentioned models or providers ("write a post about which AI models
// power chatbots"). The verdict only decides how the answer is released; it grants nothing.
//
//   only  the request asks nothing else: it gets the fixed public boundary reply.
//   part  the request asks this AND something else: COS answers the whole request and the release gate treats any
//         model or vendor name in the answer as a disclosure.
//   none  the request is not about this service's implementation: ordinary public release.
//
// When the judge cannot give a verdict (no reply, timeout, unparseable), the caller falls back to the conservative
// word rule, so a classifier outage can never open the boundary.

type SelfDisclosureReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

export type PublicSelfDisclosureIntent = 'only' | 'part' | 'none'

// Same budget as the other public routing classifier: a compact, no-thinking verdict that cannot consume the
// response budget that belongs to the user's answer.
export const SELF_DISCLOSURE_JUDGE_MS = 2_500
/** The judge sees at most this much of the request; the caller re-checks anything longer (Codex on #4955). */
export const PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS = 4_000

// Labeled as an interactive call (like the public scope repair and redaction calls) so it takes the bounded
// interactive transport, never the background primary-GPU readiness wait that can hold a call for up to 120s before
// its transport timeout starts (Codex on #4955).
async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('./cosReasoner.ts')
  return callCosReasoner({
    ...args,
    usageContext: { feature: 'cos_interactive_answer', purpose: 'public_self_disclosure' },
    disableThinking: true,
    timeoutMs: SELF_DISCLOSURE_JUDGE_MS,
    allowConfiguredFallback: false,
  } as never).catch(() => null)
}

/**
 * The whole judge is bounded by its own deadline, and at the deadline its model call is aborted rather than left
 * running: a late judge yields no verdict, consumes no further compute, and the caller's conservative fallback decides.
 */
async function withinDeadline<T>(work: (signal: AbortSignal) => Promise<T>, deadlineMs: number): Promise<T | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>(resolve => {
    timer = setTimeout(() => {
      controller.abort(new Error('public_self_disclosure_judge_deadline'))
      resolve(null)
    }, deadlineMs)
  })
  try {
    return await Promise.race([work(controller.signal).catch(() => null), deadline])
  } finally {
    clearTimeout(timer)
  }
}

const SYSTEM_PROMPT = [
  'You classify one request sent to the public website assistant. Classify meaning, in any language, never keywords.',
  'Decide whether the request asks about THIS assistant or service itself: which AI model, model family, provider, vendor, hosting, infrastructure or technology runs it, or who created, trained, built or owns the AI.',
  'Questions about AI models, providers or vendors in general, or about the user\'s own systems, are NOT about this assistant.',
  'Return only strict JSON: {"self_disclosure":"only"|"part"|"none"}.',
  '"only": the request asks about this assistant\'s implementation or creator and nothing else.',
  '"part": the request asks about this assistant\'s implementation or creator AND asks for other work.',
  '"none": the request does not ask about this assistant\'s implementation or creator.',
].join(' ')

async function classifyWindow(
  request: string,
  callImpl: SelfDisclosureReasoner = defaultReasoner,
  deadlineMs = SELF_DISCLOSURE_JUDGE_MS,
): Promise<PublicSelfDisclosureIntent | null> {
  const value = String(request || '').trim()
  if (!value) return 'none'
  const result = await withinDeadline(signal => callImpl({
    temperature: 0,
    maxTokens: 24,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: value.slice(0, PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS),
    signal,
  }), deadlineMs)
  if (!result?.text) return null
  try {
    const verdict = (JSON.parse(result.text) as { self_disclosure?: unknown }).self_disclosure
    return verdict === 'only' || verdict === 'part' || verdict === 'none' ? verdict : null
  } catch {
    return null
  }
}

/** A request longer than this many windows is not judged; the caller's conservative fallback decides. */
export const PUBLIC_SELF_DISCLOSURE_MAX_WINDOWS = 8

/**
 * The judge reads the WHOLE request, one window at a time, in parallel (each window has its own deadline). A request
 * that fits one window gets that window's verdict. A longer request is "only" never (it holds more than one ask) and
 * is "part" when any window asks about this service, otherwise "none". If any window gets no verdict, or the request
 * exceeds the window cap, there is no verdict and the caller's conservative fallback decides.
 * Production 2026-10-27: the judge saw only the first window of an 11,600-character brief, so the rest could never
 * clear it and the brief was forced through the strict disclosure gate, which cannot pass an answer that names a
 * vendor the brief itself names.
 */
export async function classifyPublicSelfDisclosure(
  request: string,
  callImpl: SelfDisclosureReasoner = defaultReasoner,
  deadlineMs = SELF_DISCLOSURE_JUDGE_MS,
): Promise<PublicSelfDisclosureIntent | null> {
  const value = String(request || '').trim()
  if (value.length <= PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS) return classifyWindow(value, callImpl, deadlineMs)
  const windows: string[] = []
  for (let at = 0; at < value.length; at += PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS) windows.push(value.slice(at, at + PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS))
  if (windows.length > PUBLIC_SELF_DISCLOSURE_MAX_WINDOWS) return null
  const verdicts = await Promise.all(windows.map(window => classifyWindow(window, callImpl, deadlineMs)))
  if (verdicts.some(verdict => verdict === null)) return null
  return verdicts.some(verdict => verdict !== 'none') ? 'part' : 'none'
}

/**
 * Settles the final verdict from the judge's verdict and the word rules (the safety net). A fixed boundary reply
 * replaces the WHOLE answer, so without a judge verdict it is granted only to a single short line. A longer or
 * multi-line request with no verdict is answered whole under the normal public gate, which already blocks any
 * self-attributed model or vendor and any vendor the request did not name; the strict gate is reserved for a judge
 * verdict of "part". Production 2026-10-27: the judge is skipped when the turn has no time to spare for helpers, and
 * forcing such a request through the strict gate discarded every answer that named a vendor the request itself named.
 */
export function settlePublicSelfDisclosure(
  judged: PublicSelfDisclosureIntent | null,
  wordRule: boolean,
  request: string,
): PublicSelfDisclosureIntent {
  if (judged !== null) return judged
  if (!wordRule) return 'none'
  return request.length <= PUBLIC_SELF_DISCLOSURE_JUDGED_CHARS && !/[\r\n]/.test(request) ? 'only' : 'none'
}
