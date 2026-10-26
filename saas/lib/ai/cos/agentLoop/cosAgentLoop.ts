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

import { compileCosInstructionContract, decideCosLoopContinuation } from '../instructionContract.ts'
import type { LocalModelChatMessage, LocalModelToolCall, LocalModelToolDefinition, LocalModelTurnResult } from '../../local-inference.ts'
import { CRITIC_SYSTEM_PROMPT, actionKey, criticMessages, detectStuck, observationIsError, parseCriticVerdict, refinementPrompt, shouldRefine, stuckNudge, type LoopStep } from './openhandsPatterns.ts'
import { agentToolDefinitions, answerReserveMs, emptyEvidence, executeAgentTool, searchObservation, type AgentEvidence, type AgentSearchResult, type AgentToolPolicy, type AgentToolPorts } from './cosAgentTools.ts'

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
  steps: AgentTraceStep[]
  unsupportedNumbers: string[]
  /** Why the last model round produced nothing, when it did not. */
  modelError: string
  /** Wall-clock of each model round, ms. */
  roundMs: number[]
  /** OpenHands-style stuck detection: the repeated pattern that ended tool use, if any. */
  stuck: string | null
  /** Completeness critic verdicts (counts only; no request or answer text). */
  critic: { parts: number; missing: number; refined: boolean }[]
}

/**
 * Sanitized metadata for one tool call. Raw observations can carry the user's request text, page
 * contents or URL query strings; the trace is logged and persisted in execution_provenance, so it
 * records only the tool, outcome, source host/path, size, exit code and error class.
 */
export type AgentTraceStep = {
  tool: string
  status: 'ok' | 'error'
  /** Short machine label for a failure (e.g. http_404, refused_credentials, NameError). */
  error?: string
  host?: string
  path?: string
  chars?: number
  results?: number
  exitCode?: number
  images?: number
}

const URL_IN_TEXT = /https?:\/\/[^\s)\]>"']+/

function urlParts(text: string): Pick<AgentTraceStep, 'host' | 'path'> {
  const match = text.match(URL_IN_TEXT)
  if (!match) return {}
  try {
    const url = new URL(match[0])
    return { host: url.hostname.toLowerCase(), path: url.pathname.slice(0, 120) }
  } catch {
    return {}
  }
}

/** Removes query strings and fragments from any URL in a diagnostic message. */
export function redactUrlQueries(text: string): string {
  return String(text || '').replace(/(https?:\/\/[^\s?#)\]>"']+)[?#][^\s)\]>"']*/g, '$1')
}

export function agentTraceStep(tool: string, observation: string): AgentTraceStep {
  const text = String(observation || '')
  const first = text.split('\n', 1)[0]
  const fetched = first.match(/^Fetched (\S+) \((\w+), (\d+) chars\)/)
  if (fetched) return { tool, status: 'ok', ...urlParts(fetched[1]), chars: Number(fetched[3]) }
  const exit = first.match(/^exit_code=(-?\d+)/)
  if (exit) {
    const exitCode = Number(exit[1])
    const errorClass = exitCode === 0 ? null : (text.match(/^(\w+(?:Error|Exception|Exit|Interrupt))\b/m)?.[1] || (/\(timed out\)/.test(first) ? 'timed_out' : 'nonzero_exit'))
    const saved = text.match(/^images saved: (.+?) \(/m)?.[1]
    const images = saved && saved !== 'none' ? saved.split(', ').length : 0
    const rejected = /^images REJECTED/m.test(text)
    return { tool, status: exitCode === 0 && !rejected ? 'ok' : 'error', exitCode, images, ...(errorClass ? { error: errorClass } : rejected ? { error: 'images_rejected' } : {}) }
  }
  if (tool === 'web_search') {
    if (/^No results for /.test(first)) return { tool, status: 'ok', results: 0 }
    if (!/^Error:/.test(first)) return { tool, status: 'ok', results: (text.match(/^\[\d+\] /gm) || []).length }
  }
  const http = first.match(/^HTTP (\d{3}) from (\S+)/)
  if (http) return { tool, status: 'error', error: `http_${http[1]}`, ...urlParts(http[2]) }
  if (/^Refused /.test(first)) return { tool, status: 'error', error: 'refused_credentials', ...urlParts(first) }
  if (/^Skipped /.test(first)) return { tool, status: 'error', error: 'skipped_failed_host', ...urlParts(first) }
  const failed = first.match(/^(?:Could not fetch|Browser could not load) (\S+): ([\w.-]{1,60})/)
  if (failed) return { tool, status: 'error', error: failed[2].replace(/\.$/, ''), ...urlParts(failed[1]) }
  if (/^Error: .*budget|limit .* reached|no time left|not enough time/i.test(first)) return { tool, status: 'error', error: 'budget' }
  if (/^Error: /.test(first)) return { tool, status: 'error', error: 'invalid_call' }
  return { tool, status: 'error', error: 'unrecognized' }
}

export function newAgentLoopTrace(): AgentLoopTrace {
  return { outcome: 'running', rounds: 0, model: '', steps: [], unsupportedNumbers: [], modelError: '', roundMs: [], stuck: null, critic: [] }
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
    'Cover every part: when the request asks for several things (for example a capital AND its population), answer each one. If the results you have do not support a part, search or fetch again for that part; if it still cannot be found, say which part is missing instead of dropping it.',
    'Tools: web_search finds sources; fetch_url downloads a page, JSON API or CSV and saves it to data/; run_python runs Python on those files and saves charts to out/; browse_page (when offered) opens a JavaScript page in a real browser and is the last resort.',
    'Data rules: never type data values into code from memory. Every number you plot or report must come from a file you fetched this turn (read it from data/) or from the user\'s own text (data/user_request.txt). If you cannot retrieve the data, say so plainly instead of estimating.',
    'Prefer machine-readable public endpoints over HTML. Well-known keyless endpoints: Yahoo Finance daily prices https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>?range=6mo&interval=1d (also range=1mo,3mo,1y,5y); Stooq daily CSV https://stooq.com/q/d/l/?s=<ticker>.us&i=d; US BLS monthly series (keyless, up to 10 years per call) https://api.bls.gov/publicAPI/v2/timeseries/data/<SERIES>?startyear=<YYYY>&endyear=<YYYY> (e.g. LNS14000000 unemployment rate, CUUR0000SA0 CPI); World Bank annual indicators https://api.worldbank.org/v2/country/<ISO3>/indicator/<CODE>?format=json&per_page=200 (e.g. SL.UEM.TOTL.ZS unemployment, NY.GDP.MKTP.CD GDP, FP.CPI.TOTL.ZG inflation). Use web_search to find others. Never invent API keys or credentials: use only keyless endpoints, and if one fails or times out, try another source.',
    'Verification is part of the job: in your Python, parse dates, sort them, drop duplicates and empty values, assert the series is non-empty and covers the requested period, and print the first and last dates, count, min, max, latest value and the percent change over the period. Use only those printed values in your answer. If the check fails, fix the parsing or fetch another source.',
    'Source discipline: try at most three sources. After two failed downloads, use the best data you already have.',
    'Use what you have: once a fetched dataset answers the request, draw the chart from it in the next step instead of searching for a better one, and state its granularity and source (for example annual World Bank figures instead of monthly ones).',
    'Verify and plot in the SAME program: one run that loads the data, checks it, prints the figures and saves the chart. Exploring a file is fine, but never spend a separate run only to print what the chart run will print.',
    'Charts: design them yourself with matplotlib — clear title with the subject and period, labelled axes with units, readable date ticks, a grid, the source named in a footnote. Save PNG to out/ with dpi=150. One chart unless more were asked for.',
    'Answer: when finished, reply WITHOUT calling tools, with the final answer only — never your reasoning, checks or notes about the request. Start directly with the result (no sentences about your own process such as "The data is verified" or "Let me present the results"), give the key figures you printed, mention that the chart is attached when you made one (never name its file or any data/ or out/ path), and end with "Sources:" listing the URLs you actually used as markdown links. Never paste code or raw data dumps into the answer. Do not give investment, legal or medical advice.',
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
const SANDBOX_PATH = /(?<![\w/.-])`?(?:\/tmp\/work\/)?(?:out|data)\/[\w.-]+\.[a-z0-9]+`?/gi

/**
 * Removes sandbox file paths (out/chart.png, data/source_1.json) from the answer: they are internal
 * to the turn and meaningless to the user, who sees the chart itself. Production 2026-10-16: "The
 * chart is attached as `out/vnce_6mo.png`."
 */
export function stripSandboxPaths(answer: string): string {
  return String(answer || '')
    .replace(SANDBOX_PATH, '')
    .replace(/(^|[ \t(])(?:saved\s+)?(?:as|at|in|to|from)[ \t]*(?=[.,;:)]|$)/gim, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

// Production 2026-10-16: answers carried the model's working notes ahead of the answer — "The data
// is verified and the chart is created. Let me present the results.", "The user asked a simple
// factual question. No data computation or chart is needed. Let me provide the answer directly."
// A sentence is a note only when it OPENS with process wording; a substantive sentence that merely
// mentions sources ("The search results show that Canberra is the capital") is kept.
const PROCESS_NOTE = /^(?:let me (?!know\b)\w+|the user (?:asked|wants|is asking)\b|no (?:data computation|computation|chart)\b[^.!?]*\bneeded\b|this is a simple\b|i (?:have|now have|found|will|'ll)\b|(?:the )?data (?:is|has been) (?:verified|confirmed)\b|(?:the )?chart (?:is|has been) (?:created|generated|saved|ready)\b|here(?:'s| is| are) (?:the|a) (?:summary|results?)\b|multiple sources confirm\b|the answer is (?:clear|verified|confirmed)(?: and (?:clear|verified|confirmed))?(?: (?:from|based on|according to|per)\b[^:]*)?[.!]$|(?:the )?search results (?:clearly )?(?:confirm|show)(?: the answer| this| it)?\s*[.!:]?$)/i
const ANSWER_HEADING = /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?(?:final )?answer(?:\*\*)?[ \t]*:?[ \t]*(?:\*\*)?[ \t]*\n/gi
const LIST_LINE = /^\s*(?:[-*•]|\d+[.)]|\[\d+\])\s+/

/**
 * Drops the model's working notes from the answer, sentence by sentence and line by line (a note may
 * be separated by a blank line, a single newline or nothing). An explicit "Answer" heading ends the
 * preamble. List items and a closing "let me know" are never notes; an answer that would be left
 * empty is returned unchanged.
 */
export function stripProcessNarration(answer: string): string {
  const original = String(answer || '').trim()
  const heading = [...original.matchAll(ANSWER_HEADING)].at(-1)
  const body = heading ? original.slice(heading.index! + heading[0].length) : original
  const lines = body.split('\n').map(line => {
    if (!line.trim() || LIST_LINE.test(line)) return line
    const sentences = line.trim().split(/(?<=[.!?:])\s+(?=\S)/)
    return sentences.filter(sentence => !PROCESS_NOTE.test(sentence.trim())).join(' ')
  })
  const rest = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return rest || original
}

const SOURCES_HEADING = /^[ \t]*(?:\*\*)?(?:sources?|fuentes|fontes|quellen|źródła|источники|sorgenti|出典|출처|المصادر)(?:\*\*)?[ \t]*:?[ \t]*(?:\*\*)?[ \t]*$/gim
const SOURCE_ITEM = /^\s*(?:[-*•]|\d+[.)]|\[\d+\])\s+/

/**
 * Keeps only the final draft when one model reply holds several complete drafts, each closing with
 * its own Sources list. Production 2026-10-16 (Microsoft CEO): two full answers back to back, the
 * second glued onto the first draft's last source URL.
 */
export function keepFinalDraft(answer: string): string {
  const text = String(answer || '')
  const headings = [...text.matchAll(SOURCES_HEADING)]
  if (headings.length < 2) return text
  const previous = headings[headings.length - 2]
  const lines = text.slice(previous.index! + previous[0].length).split('\n')
  let index = 0
  while (index < lines.length && (!lines[index].trim() || SOURCE_ITEM.test(lines[index]) || /^\s*https?:\/\//.test(lines[index]))) {
    // A draft that starts on the same line as the previous draft's last URL.
    const glued = lines[index].match(/https?:\/\/[^\s)\]]*?[\/\d](?=\p{Lu}\p{Ll}+\s)/u)
    if (glued) return [lines[index].slice(glued.index! + glued[0].length), ...lines.slice(index + 1)].join('\n').trim() || text
    index += 1
  }
  const rest = lines.slice(index).join('\n').trim()
  return rest || text
}

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

/** The answer text as the user would receive it, before URL verification. */
function deliverableAnswer(answer: string): string {
  return stripProcessNarration(keepFinalDraft(stripSandboxPaths(answer)))
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
  /**
   * A web search the host already ran for this request. It enters the conversation as the loop's
   * first web_search call and result, so the model starts from that evidence instead of repeating it
   * and can search again for any part of the request the results do not cover.
   */
  seedSearch?: Readonly<{ query: string; results: readonly AgentSearchResult[] }>
  /** Completeness critic (OpenHands critic + iterative refinement). Omitted: no critic review. */
  critic?: AgentModelTurn
}): Promise<CosAgentLoopResult | null> {
  const trace = input.trace ?? newAgentLoopTrace()
  const now = input.now ?? Date.now
  const remainingMs = () => input.deadlineAt - now()
  // Carry the shared admission contract into the actual execution loop, not merely
  // the initial router. The original request remains intact in the user message.
  const contract = compileCosInstructionContract(input.request)
  const policy: AgentToolPolicy = contract.prohibitsExecution
    ? { ...input.policy, maxPythonRuns: 0 }
    : input.policy
  const tools = agentToolDefinitions(policy).filter(tool =>
    !contract.prohibitsExecution || tool.function.name !== 'run_python')
  const contractInstructions = contract.prohibitsExecution
    ? 'The user requested analysis only. Do not execute code, generate project files, or use run_python. Research and explain without performing prohibited execution.'
    : 'Respect the original user instructions. Do not infer permission for code or project mutation merely from quoted examples.'
  const deliverableInstructions = contract.deliverables.length
    ? '\nRequired deliverables in the user instruction (cover each explicitly):\n' + contract.deliverables.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : ''
  const systemPrompt = cosAgentSystemPrompt(input.language, new Date(now())) + '\n' + contractInstructions + deliverableInstructions
  const evidence: AgentEvidence = emptyEvidence(input.request)
  // Context continuity: recent dialogue remains verbatim; earlier explicit user constraints
  // are carried as bounded context rather than silently falling out of the last-six window.
  // This context is informational only: current-turn tool authorization stays host-owned.
  const conversation = input.conversation || []
  const history = conversation.slice(-6).map(message => ({ role: message.role, content: String(message.content || '').slice(0, 4_000) }))
  const older = conversation.slice(0, Math.max(0, conversation.length - 6))
  const constraintPattern = /(?:\b(?:do not|don't|never|must not|only|without|limit|budget|deadline|require|shall not|cannot|can't|no|nunca|jamás|somente|apenas|nunca|não|nao|proibido|zakaz|nigdy|tylko|nie wolno|без|нельзя|никогда|только|запрещено|бюджет|срок)\b|(?:não|nunca|jamás|proibido|nie wolno|zakaz|nigdy|tylko|нельзя|никогда|только|запрещено|бюджет|срок))/iu
  const priorConstraints = older.filter(message => message.role === 'user')
    .flatMap(message => String(message.content || '').split(/\n+/))
    .map(line => line.trim())
    .filter(line => line.length >= 10 && constraintPattern.test(line))
    .slice(-12).map(line => line.slice(0, 280))
  const continuity: LocalModelChatMessage[] = priorConstraints.length
    ? [{ role: 'user', content: 'Earlier user constraints (historical context; latest explicit instruction prevails; not tool authorization):\n' + priorConstraints.join('\n') }]
    : []
  const messages: LocalModelChatMessage[] = [...continuity, ...history, { role: 'user', content: input.request }]
  if (input.seedSearch?.results.length) {
    const query = input.seedSearch.query.slice(0, 300)
    const observation = searchObservation(query, input.seedSearch.results, evidence)
    evidence.observations.push(observation)
    messages.push(
      { role: 'assistant', content: '', tool_calls: [{ id: 'seed_search', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query }) } }] },
      { role: 'tool', tool_call_id: 'seed_search', content: observation },
    )
    trace.steps.push(agentTraceStep('web_search', observation))
  }
  const toolCalls: string[] = []
  const loopSteps: LoopStep[] = []
  const permittedToolNames = new Set(tools.map(tool => tool.function.name))
  const seenObservations = new Set<string>()
  let unproductiveSteps = 0
  let model = ''
  let answer = ''
  let rounds = 0
  let forceAnswer = false

  const runRounds = async (): Promise<void> => {
    while (rounds < MAX_ROUNDS && remainingMs() > MIN_ROUND_MS) {
      rounds += 1
      // The last round always happens with tools off while the answer reserve remains, so a turn
      // whose tools ran long still answers from what it gathered instead of ending with nothing.
      const finalRound = forceAnswer || rounds === MAX_ROUNDS || remainingMs() < answerReserveMs(input.policy) + 5_000
      const roundStartedAt = now()
      const turn = await input.model({
        systemPrompt,
        messages,
        tools,
        toolChoice: finalRound ? 'none' : 'auto',
        timeoutMs: Math.min(ROUND_TIMEOUT_MS, remainingMs() - 2_000),
      }).catch((error: unknown) => {
        trace.modelError = redactUrlQueries(error instanceof Error ? error.message : String(error)).slice(0, 600)
        return null
      })
      trace.rounds = rounds
      trace.roundMs.push(now() - roundStartedAt)
      if (!turn) {
        trace.outcome = 'model_unavailable'
        return
      }
      model = `${turn.provider}:${turn.model}`
      trace.model = model
      const calls: readonly LocalModelToolCall[] = finalRound ? [] : turn.toolCalls
      if (!calls.length) {
        answer = String(turn.content || '').trim()
        return
      }
      messages.push(assistantMessage(turn))
      for (const [index, call] of calls.entries()) {
        // Every call the model issued gets a tool result (the protocol requires it); only calls
        // within the host budget and deadline execute.
        const permitted = permittedToolNames.has(call.function.name)
        const allowed = permitted && !forceAnswer && index < MAX_CALLS_PER_ROUND && toolCalls.length < MAX_TOOL_CALLS && remainingMs() > MIN_ROUND_MS
        if (allowed) toolCalls.push(call.function.name)
        const observation = !permitted
          ? 'Error: tool is not authorized for this request; this call was not executed.'
          : allowed
            ? await executeAgentTool({ name: call.function.name, argumentsJson: call.function.arguments, ports: input.ports, policy, evidence, remainingMs })
            : 'Error: tool budget for this turn is spent; this call was not executed. Answer with what you have.'
        messages.push({ role: 'tool', tool_call_id: call.id, content: observation })
        trace.steps.push(agentTraceStep(call.function.name, observation))
        loopSteps.push({ action: actionKey(call.function.name, call.function.arguments), observation, error: observationIsError(observation) })
        const addedEvidence = allowed && !observationIsError(observation) && !seenObservations.has(observation)
        if (allowed) seenObservations.add(observation)
        unproductiveSteps = addedEvidence ? 0 : unproductiveSteps + 1
        const progress = decideCosLoopContinuation({
          repeatedUnproductiveSteps: unproductiveSteps,
          latestStepChangedArtifact: false,
          latestStepAddedEvidence: addedEvidence,
          budgetRemaining: remainingMs() > answerReserveMs(policy) + MIN_ROUND_MS && toolCalls.length < MAX_TOOL_CALLS,
        })
        if (progress !== 'continue') {
          forceAnswer = true
          messages.push({ role: 'user', content: progress === 'stop-budget'
            ? 'HARNESS: tool execution budget is exhausted. Answer from verified evidence and identify remaining gaps.'
            : 'HARNESS: recent tool calls added no new evidence. Do not repeat tool calls; answer from verified evidence and identify remaining gaps.' })
        }
      }
      const stuck = detectStuck(loopSteps)
      if (stuck) {
        // OpenHands stops a stuck agent; COS keeps the answer reserve, so it answers from what it has.
        trace.stuck = stuck.pattern
        forceAnswer = true
        messages.push({ role: 'user', content: stuckNudge(stuck) })
      }
    }
  }

  try {
    // The critic reviews exactly what would be delivered, and the best-scored draft is kept: a
    // refinement that covers less than the draft it replaced never wins.
    let best: { answer: string; score: number } | null = null
    let reviewed: { answer: string; score: number } | null = null
    for (let iteration = 0; ; iteration += 1) {
      await runRounds()
      if (!answer || !input.critic || forceAnswer || remainingMs() < MIN_ROUND_MS + 5_000) break
      const review = await input.critic({
        systemPrompt: CRITIC_SYSTEM_PROMPT,
        messages: criticMessages(input.request, deliverableAnswer(answer)),
        tools,
        toolChoice: 'none',
        timeoutMs: Math.min(15_000, remainingMs() - 2_000),
      }).catch(() => null)
      const verdict = parseCriticVerdict(String(review?.content || ''))
      if (!verdict) break
      reviewed = { answer, score: verdict.score }
      if (!best || verdict.score >= best.score) best = reviewed
      const refine = shouldRefine(verdict, iteration) && remainingMs() > answerReserveMs(input.policy) + 15_000
      trace.critic.push({ parts: verdict.parts, missing: verdict.missing.length, refined: refine })
      if (!refine) break
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: refinementPrompt(verdict, iteration + 1) })
      answer = ''
    }
    // A refinement that produced nothing, or covered less, keeps the best-reviewed draft.
    if (best && (!answer || (reviewed?.answer === answer && reviewed.score < best.score))) answer = best.answer

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

    const { text, dropped } = stripUnverifiedUrls(deliverableAnswer(answer), evidence.sourceUrls)
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
