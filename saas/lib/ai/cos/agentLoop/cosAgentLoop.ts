// saas/lib/ai/cos/agentLoop/cosAgentLoop.ts
//
// COS agent loop — the orchestration pattern frontier assistants use, rebuilt for COS:
//   plan → call a tool → read the observation → call another tool or answer.
// The model decides which tools to use and in what order. The harness owns everything else:
// which tools exist for this requester, step/time/run budgets, staging retrieved data into the
// sandbox, and VERIFYING the final answer before release:
//   - an image is delivered only if this turn's code produced it from staged data files;
//   - every number in the answer must appear in the user's request or a tool observation
//     (one repair round, then unsupported answers are withheld);
//   - cited URLs must be URLs this turn actually searched or fetched.

import type { LocalModelChatMessage, LocalModelToolCall, LocalModelToolDefinition, LocalModelTurnResult } from '../../local-inference.ts'
import { agentToolDefinitions, emptyEvidence, executeAgentTool, type AgentEvidence, type AgentToolPolicy, type AgentToolPorts } from './cosAgentTools.ts'

export type AgentModelTurn = (input: {
  systemPrompt: string
  messages: readonly LocalModelChatMessage[]
  tools: readonly LocalModelToolDefinition[]
  toolChoice: 'auto' | 'none'
  timeoutMs: number
}) => Promise<LocalModelTurnResult | null>

export type CosAgentLoopResult = Readonly<{
  reply: string
  images: readonly Readonly<{ name: string; png: Buffer }>[]
  sources: readonly string[]
  rounds: number
  toolCalls: readonly string[]
  pythonRuns: number
  verification: Readonly<{ unsupportedNumbers: readonly string[]; repaired: boolean; droppedImages: number; droppedUrls: number }>
  model: string
}>

const MAX_ROUNDS = 8
const ROUND_TIMEOUT_MS = 45_000
const MIN_ROUND_MS = 8_000

export function cosAgentSystemPrompt(language: string): string {
  return [
    'You are COS, an AI agent with tools. Solve the user\'s request completely, the way a careful analyst would: plan, gather real data with tools, compute with code, check the results, then answer.',
    'Tools: web_search finds sources; fetch_url downloads a page, JSON API or CSV and saves it to data/; run_python runs Python on those files and saves charts to out/; browse_page (when offered) opens a JavaScript page in a real browser and is the last resort.',
    'Data rules: never type data values into code from memory. Every number you plot or report must come from a file you fetched this turn (read it from data/) or from the user\'s own text (data/user_request.txt). If you cannot retrieve the data, say so plainly instead of estimating.',
    'Prefer machine-readable public endpoints over HTML. Well-known keyless endpoints: Yahoo Finance daily prices https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>?range=6mo&interval=1d (also range=1mo,3mo,1y,5y); Stooq daily CSV https://stooq.com/q/d/l/?s=<ticker>.us&i=d; FRED series CSV https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>; World Bank https://api.worldbank.org/v2/country/<ISO3>/indicator/<CODE>?format=json&per_page=200. Use web_search to find others.',
    'Verification is part of the job: in your Python, parse dates, sort them, drop duplicates and empty values, assert the series is non-empty and covers the requested period, and print the first and last dates, count, min, max and latest values. Use those printed values in your answer. If the check fails, fix the parsing or fetch another source.',
    'Charts: design them yourself with matplotlib — clear title with the subject and period, labelled axes with units, readable date ticks, a grid, the source named in a footnote. Save PNG to out/ with dpi=150. One chart unless more were asked for.',
    'Answer: when finished, reply WITHOUT calling tools. Lead with the result, give the key figures you printed, mention that the chart is attached when you made one, and end with "Sources:" listing the URLs you actually used as markdown links. Never paste code or raw data dumps into the answer. Do not give investment, legal or medical advice.',
    `Write the answer in the language of the user's request (interface language code: ${language || 'en'}).`,
  ].join('\n')
}

const DIGIT_GROUP = /\d+/g
const NUMBER_SPAN = /\d[\d,.:/-]*\d|\d/g
const URL_RE = /https?:\/\/[^\s)\]>"']+/g

function digitGroupsOf(texts: readonly string[]): Set<string> {
  const groups = new Set<string>()
  for (const text of texts) for (const group of String(text).match(DIGIT_GROUP) || []) {
    groups.add(String(Number(group)))
    // "13.33" may be reported as "13.3": keep shorter leading prefixes of long fractional groups.
    if (group.length > 1) for (let size = 1; size < group.length; size += 1) groups.add(String(Number(group.slice(0, size))))
  }
  return groups
}

/** Number spans in the answer whose digits never appeared in the request or any observation. */
export function unsupportedAnswerNumbers(answer: string, grounded: readonly string[]): string[] {
  const allowed = digitGroupsOf(grounded)
  const answerWithoutUrls = String(answer || '').replace(URL_RE, ' ')
  const spans: string[] = answerWithoutUrls.match(NUMBER_SPAN) ?? []
  return [...new Set(spans.filter(span => (span.match(DIGIT_GROUP) ?? [] as string[]).some((group: string) => !allowed.has(String(Number(group))))))]
}

function urlKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

/** Remove markdown links / bare URLs the turn never searched or fetched. */
export function stripUnverifiedUrls(answer: string, sourceUrls: ReadonlySet<string>): { text: string; dropped: number } {
  const known = new Set([...sourceUrls].map(urlKey))
  const knownHosts = new Set([...sourceUrls].map(url => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }))
  let dropped = 0
  const verified = (url: string) => {
    const key = urlKey(url)
    if (known.has(key)) return true
    // A human-facing page on a host the turn fetched (e.g. finance.yahoo.com for a query1 API call) is allowed.
    try {
      const host = new URL(url).hostname.replace(/^www\./, '')
      const root = host.split('.').slice(-2).join('.')
      return [...knownHosts].some(candidate => candidate === host || candidate.endsWith(`.${root}`) || candidate === root)
    } catch {
      return false
    }
  }
  const text = String(answer || '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (whole, label, url) => {
      if (verified(url)) return whole
      dropped += 1
      return label
    })
    .replace(/(^|[\s(])(https?:\/\/[^\s)\]>"']+)/g, (whole, lead, url) => {
      if (verified(url)) return whole
      dropped += 1
      return lead
    })
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), dropped }
}

function assistantMessage(turn: LocalModelTurnResult): LocalModelChatMessage {
  return { role: 'assistant', content: turn.content ?? '', tool_calls: turn.toolCalls }
}

export async function runCosAgentLoop(input: {
  request: string
  conversation?: readonly Readonly<{ role: 'user' | 'assistant'; content: string }>[]
  language: string
  model: AgentModelTurn
  ports: AgentToolPorts
  policy: AgentToolPolicy
  deadlineAt: number
  now?: () => number
}): Promise<CosAgentLoopResult | null> {
  const now = input.now ?? Date.now
  const remainingMs = () => input.deadlineAt - now()
  const tools = agentToolDefinitions(input.policy)
  const systemPrompt = cosAgentSystemPrompt(input.language)
  const evidence: AgentEvidence = emptyEvidence(input.request)
  const history = (input.conversation || []).slice(-6).map(message => ({ role: message.role, content: String(message.content || '').slice(0, 4_000) }))
  const messages: LocalModelChatMessage[] = [...history, { role: 'user', content: input.request }]
  const toolCalls: string[] = []
  let model = ''
  let answer = ''
  let rounds = 0

  try {
    while (rounds < MAX_ROUNDS && remainingMs() > MIN_ROUND_MS) {
      rounds += 1
      const finalRound = rounds === MAX_ROUNDS || remainingMs() < 30_000
      const turn = await input.model({
        systemPrompt,
        messages,
        tools,
        toolChoice: finalRound ? 'none' : 'auto',
        timeoutMs: Math.min(ROUND_TIMEOUT_MS, remainingMs() - 2_000),
      })
      if (!turn) break
      model = `${turn.provider}:${turn.model}`
      const calls: readonly LocalModelToolCall[] = finalRound ? [] : turn.toolCalls
      if (!calls.length) {
        answer = String(turn.content || '').trim()
        break
      }
      messages.push(assistantMessage(turn))
      for (const call of calls) {
        toolCalls.push(call.function.name)
        const observation = await executeAgentTool({ name: call.function.name, argumentsJson: call.function.arguments, ports: input.ports, policy: input.policy, evidence, remainingMs })
        messages.push({ role: 'tool', tool_call_id: call.id, content: observation })
      }
    }

    if (!answer) return null

    const grounded = [input.request, ...history.filter(message => message.role === 'user').map(message => message.content), ...evidence.observations]
    let unsupported = unsupportedAnswerNumbers(answer, grounded)
    let repaired = false
    if (unsupported.length && remainingMs() > MIN_ROUND_MS) {
      messages.push({ role: 'assistant', content: answer })
      messages.push({ role: 'user', content: `HARNESS VERIFICATION: these numbers in your answer do not appear in any tool output or in my request: ${unsupported.join(', ')}. Rewrite the answer using only figures that your tool outputs printed; remove any figure you cannot support. Do not call tools.` })
      const repair = await input.model({ systemPrompt, messages, tools, toolChoice: 'none', timeoutMs: Math.min(ROUND_TIMEOUT_MS, remainingMs() - 2_000) })
      const repairedText = String(repair?.content || '').trim()
      if (repairedText) {
        answer = repairedText
        repaired = true
        unsupported = unsupportedAnswerNumbers(answer, grounded)
      }
    }
    if (unsupported.length) return null

    const { text, dropped } = stripUnverifiedUrls(answer, evidence.sourceUrls)
    return {
      reply: text,
      images: evidence.images.slice(0, 3),
      sources: [...evidence.sourceUrls],
      rounds,
      toolCalls,
      pythonRuns: evidence.pythonRuns,
      verification: { unsupportedNumbers: [], repaired, droppedImages: evidence.droppedImages, droppedUrls: dropped },
      model,
    }
  } finally {
    await input.ports.python.close().catch(() => undefined)
  }
}
