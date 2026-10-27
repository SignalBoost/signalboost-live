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

export async function classifyPublicSelfDisclosure(
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

/**
 * A quoted service-identity question inside an investigation is evidence, not a
 * request to disclose the service's own implementation. If an intent judge says
 * "only" anyway, preserve the substantive task while retaining the stricter
 * disclosure gate ("part") for the eventual answer.
 */
export function isSubstantiveInvestigationRequest(request: string): boolean {
  const value = String(request ?? '')
  const asksForAnalysis = /\b(?:investigat(?:e|ion)|analy[sz](?:e|is)|diagnos(?:e|is)|forensic|root[ -]?cause|causal|hypothes(?:is|es)|rank(?:ed)?\s+(?:causes|hypotheses)|propose\s+experiments|design\s+experiments|engineering\s+uncertainty|database\s+incident|incident\s+report)\b/i.test(value)
  const requestsDeliverables = /\b(?:distinguish|compare|explain|identify|propose|design|rank|evaluate)\b[\s\S]{0,140}\b(?:causes|hypotheses|evidence|experiments|correlation|causation|measurements)\b/i.test(value)
  return asksForAnalysis || requestsDeliverables
}
