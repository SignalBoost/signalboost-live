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
import { ANSWER_RESERVE_MS, agentToolDefinitions, emptyEvidence, executeAgentTool, type AgentEvidence, type AgentToolPolicy, type AgentToolPorts } from './cosAgentTools.ts'
import { humanSourceUrl, withHumanSourceLinks } from './humanSourceUrl.ts'

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

/** What the loop did, for provenance and diagnosis whether or not it produced an answer. */
export type AgentLoopTrace = {
  outcome: 'answered' | 'model_unavailable' | 'no_answer' | 'unsupported_numbers' | 'error' | 'running'
  rounds: number
  model: string
  steps: { tool: string; observation: string }[]
  unsupportedNumbers: string[]
  /** Why the last model round produced nothing, when it did not. */
  modelError: string
  /** Wall-clock of each model round, ms. */
  roundMs: number[]
}

export function newAgentLoopTrace(): AgentLoopTrace {
  return { outcome: 'running', rounds: 0, model: '', steps: [], unsupportedNumbers: [], modelError: '', roundMs: [] }
}

// Rounds are fast on the round models (1-7 s each in production); the time budget, not the round
// count, is the real limit. 8 rounds ended a turn that had data and a fixable code error.
const MAX_ROUNDS = 14
// Host-owned tool budget: a model that emits many parallel calls cannot fan out past these.
const MAX_CALLS_PER_ROUND = 4
const MAX_TOOL_CALLS = 20
const ROUND_TIMEOUT_MS = 60_000
const MIN_ROUND_MS = 8_000

export function cosAgentSystemPrompt(language: string, today: Date = new Date()): string {
  return [
    // Production 2026-10-16: "the past 5 years" was fetched as 2020-2025 in October 2026; relative
    // periods need the real date.
    `Today is ${today.toISOString().slice(0, 10)} (UTC). Resolve relative periods ("past 6 months", "last 5 years") from this date and request data through today.`,
    'You are COS, an AI agent with tools. Solve the user\'s request completely, the way a careful analyst would: plan, gather real data with tools, compute with code, check the results, then answer.',
    'Tools: web_search finds sources; fetch_url downloads a page, JSON API or CSV and saves it to data/; run_python runs Python on those files and saves charts to out/; browse_page (when offered) opens a JavaScript page in a real browser and is the last resort.',
    'Data rules: never type data values into code from memory. Every number you plot or report must come from a file you fetched this turn (read it from data/) or from the user\'s own text (data/user_request.txt). If you cannot retrieve the data, say so plainly instead of estimating.',
    'Prefer machine-readable public endpoints over HTML. Well-known keyless endpoints: Yahoo Finance daily prices https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>?range=6mo&interval=1d (also range=1mo,3mo,1y,5y); Stooq daily CSV https://stooq.com/q/d/l/?s=<ticker>.us&i=d; US BLS monthly series (keyless, up to 10 years per call) https://api.bls.gov/publicAPI/v2/timeseries/data/<SERIES>?startyear=<YYYY>&endyear=<YYYY> (e.g. LNS14000000 unemployment rate, CUUR0000SA0 CPI); World Bank annual indicators https://api.worldbank.org/v2/country/<ISO3>/indicator/<CODE>?format=json&per_page=200 (e.g. SL.UEM.TOTL.ZS unemployment, NY.GDP.MKTP.CD GDP, FP.CPI.TOTL.ZG inflation). Use web_search to find others. Never invent API keys or credentials: use only keyless endpoints, and if one fails or times out, try another source.',
    'Verification is part of the job: in your Python, parse dates, sort them, drop duplicates and empty values, assert the series is non-empty and covers the requested period, and print the first and last dates, count, min, max, latest value and the percent change over the period. Use only those printed values in your answer. If the check fails, fix the parsing or fetch another source.',
    'Source discipline: try at most three sources. After two failed downloads, use the best data you already have.',
    'Use what you have: once a fetched dataset answers the request, draw the chart from it in the next step instead of searching for a better one, and state its granularity and source (for example annual World Bank figures instead of monthly ones).',
    'Verify and plot in the SAME program: one run that loads the data, checks it, prints the figures and saves the chart. Exploring a file is fine, but never spend a separate run only to print what the chart run will print.',
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

const NUMERIC_VALUE = /\d+(?:,\d{3})*(?:\.\d+)?/g

function numericValues(texts: readonly string[]): number[] {
  const values: number[] = []
  for (const text of texts) for (const match of String(text).match(NUMERIC_VALUE) || []) {
    const value = Number(match.replace(/,/g, ''))
    if (Number.isFinite(value)) values.push(value)
  }
  return values
}

/**
 * A plain number in the answer is supported when it is a rounding of a value a tool printed
 * ("13.36" for 13.359999656677246, "$3.05" for 3.049999952316284), or, for a round figure such as
 * "over 300%", within 15% of one. Dates, times and ranges keep the exact digit-group check.
 */
function supportedByValue(span: string, values: readonly number[]): boolean {
  if (!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(span)) return false
  const value = Number(span.replace(/,/g, ''))
  const decimals = span.includes('.') ? span.split('.')[1].length : 0
  const tolerance = 0.5 * 10 ** -decimals + 1e-9
  if (values.some(candidate => Math.abs(candidate - value) <= tolerance)) return true
  const roundFigure = decimals === 0 && value >= 10 && value % 10 === 0
  return roundFigure && values.some(candidate => candidate !== 0 && Math.abs(candidate - value) / Math.abs(candidate) <= 0.15)
}

/** Number spans in the answer that no request text or tool observation supports. */
export function unsupportedAnswerNumbers(answer: string, grounded: readonly string[]): string[] {
  const allowed = digitGroupsOf(grounded)
  const values = numericValues(grounded)
  // Years inside the period the retrieved data covers ("the 2021-2022 recovery" over 2020-2025
  // data) describe that data; they are not new figures.
  const years = [...allowed].map(Number).filter(value => value >= 1900 && value <= 2100)
  const firstYear = years.length ? Math.min(...years) : null
  const lastYear = years.length ? Math.max(...years) : null
  // Names that carry digits ("COVID-19", "Q3", "PM2.5", "S&P 500" stays checked) are words, not figures.
  const answerWithoutUrls = String(answer || '').replace(URL_RE, ' ').replace(/\b[A-Za-z]+-?\d+(?:\.\d+)?\b/g, ' ')
  const spans: string[] = answerWithoutUrls.match(NUMBER_SPAN) ?? []
  return [...new Set(spans.filter(span => {
    if (/^\d{4}$/.test(span) && firstYear !== null && lastYear !== null && Number(span) >= firstYear && Number(span) <= lastYear) return false
    const plain = span.replace(/[.,]+$/, '')
    // A plain figure must match a printed value (rounding allowed); digit groups alone would let
    // "6.1" pass because a 6 and a 1 appear somewhere. Dates, times and ranges use the digit groups.
    if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(plain)) return !supportedByValue(plain, values)
    return !(span.match(DIGIT_GROUP) ?? [] as string[]).every((group: string) => allowed.has(String(Number(group))))
  }))]
}

function urlKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Remove markdown links / bare URLs the turn never searched or fetched. A cited URL is verified
 * when its host is a retrieved host, or a parent/child of one (finance.yahoo.com for a
 * query1.finance.yahoo.com API call). Siblings under a shared suffix (phishing.co.uk after
 * bbc.co.uk) are not related and are removed.
 */
export function stripUnverifiedUrls(answer: string, sourceUrls: ReadonlySet<string>): { text: string; dropped: number } {
  const known = new Set([...sourceUrls].map(urlKey))
  const knownHosts = [...new Set([...sourceUrls].map(hostOf).filter(Boolean))]
  let dropped = 0
  const verified = (url: string) => {
    if (known.has(urlKey(url))) return true
    const host = hostOf(url)
    return Boolean(host) && knownHosts.some(candidate => candidate === host || candidate.endsWith(`.${host}`) || host.endsWith(`.${candidate}`))
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
  trace?: AgentLoopTrace
}): Promise<CosAgentLoopResult | null> {
  const trace = input.trace ?? newAgentLoopTrace()
  const now = input.now ?? Date.now
  const remainingMs = () => input.deadlineAt - now()
  const tools = agentToolDefinitions(input.policy)
  const systemPrompt = cosAgentSystemPrompt(input.language, new Date(now()))
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
      // The last round always happens with tools off while the answer reserve remains, so a turn
      // whose tools ran long still answers from what it gathered instead of ending with nothing.
      const finalRound = rounds === MAX_ROUNDS || remainingMs() < ANSWER_RESERVE_MS + 5_000
      const roundStartedAt = now()
      const turn = await input.model({
        systemPrompt,
        messages,
        tools,
        toolChoice: finalRound ? 'none' : 'auto',
        timeoutMs: Math.min(ROUND_TIMEOUT_MS, remainingMs() - 2_000),
      }).catch((error: unknown) => {
        trace.modelError = (error instanceof Error ? error.message : String(error)).slice(0, 600)
        return null
      })
      trace.rounds = rounds
      trace.roundMs.push(now() - roundStartedAt)
      if (!turn) {
        trace.outcome = 'model_unavailable'
        break
      }
      model = `${turn.provider}:${turn.model}`
      trace.model = model
      const calls: readonly LocalModelToolCall[] = finalRound ? [] : turn.toolCalls
      if (!calls.length) {
        answer = String(turn.content || '').trim()
        break
      }
      messages.push(assistantMessage(turn))
      for (const [index, call] of calls.entries()) {
        // Every call the model issued gets a tool result (the protocol requires it); only calls
        // within the host budget and deadline execute.
        const allowed = index < MAX_CALLS_PER_ROUND && toolCalls.length < MAX_TOOL_CALLS && remainingMs() > MIN_ROUND_MS
        if (allowed) toolCalls.push(call.function.name)
        const observation = allowed
          ? await executeAgentTool({ name: call.function.name, argumentsJson: call.function.arguments, ports: input.ports, policy: input.policy, evidence, remainingMs })
          : 'Error: tool budget for this turn is spent; this call was not executed. Answer with what you have.'
        messages.push({ role: 'tool', tool_call_id: call.id, content: observation })
        trace.steps.push({ tool: call.function.name, observation: observation.slice(0, 400) })
      }
    }

    if (!answer) {
      if (trace.outcome === 'running') trace.outcome = 'no_answer'
      return null
    }

    const grounded = [input.request, ...history.filter(message => message.role === 'user').map(message => message.content), ...evidence.observations]
    let unsupported = unsupportedAnswerNumbers(answer, grounded)
    let repaired = false
    if (unsupported.length && remainingMs() > MIN_ROUND_MS) {
      messages.push({ role: 'assistant', content: answer })
      messages.push({ role: 'user', content: `HARNESS VERIFICATION: these numbers in your answer do not appear in any tool output or in my request: ${unsupported.join(', ')}. Rewrite the answer using only figures that your tool outputs printed; remove any figure you cannot support. Do not call tools.` })
      const repair = await input.model({ systemPrompt, messages, tools, toolChoice: 'none', timeoutMs: Math.min(ROUND_TIMEOUT_MS, remainingMs() - 2_000) }).catch((error: unknown) => {
        trace.modelError = (error instanceof Error ? error.message : String(error)).slice(0, 600)
        return null
      })
      const repairedText = String(repair?.content || '').trim()
      if (repairedText) {
        answer = repairedText
        repaired = true
        unsupported = unsupportedAnswerNumbers(answer, grounded)
      }
    }
    if (unsupported.length) {
      trace.outcome = 'unsupported_numbers'
      trace.unsupportedNumbers = unsupported.slice(0, 20)
      return null
    }
    trace.outcome = 'answered'

    const { text, dropped } = stripUnverifiedUrls(answer, evidence.sourceUrls)
    return {
      // Verified against the URLs actually fetched, then shown as the public page for that data.
      reply: withHumanSourceLinks(text),
      images: evidence.images.slice(0, 3),
      sources: [...new Set([...evidence.sourceUrls].map(humanSourceUrl))],
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
