// saas/lib/ai/cos/agentLoop/cosAgentTools.ts
//
// The tools COS can call inside its agent loop, modelled on the general tool set frontier
// assistants expose (search, open a URL, run code, browse). Each tool is a port so the loop is
// testable and a buyer can swap any implementation. Every observation the model sees is also
// recorded as evidence: the harness later accepts only numbers, URLs and images that came from
// these observations.

import type { LocalModelToolDefinition } from '../../local-inference.ts'
import { stagedDataPath, type PythonImage, type PythonSession, type StagedFile } from './pythonSandbox.ts'

export type AgentSearchResult = Readonly<{ title: string; url: string; snippet: string }>
export type AgentFetchResult = Readonly<{ status: number; text: string; finalUrl: string; contentType: string }>
export type AgentBrowseResult = Readonly<{ ok: boolean; text: string; error?: string }>

export type AgentToolPorts = Readonly<{
  search(query: string): Promise<readonly AgentSearchResult[]>
  fetchPublic(url: string, timeoutMs: number): Promise<AgentFetchResult>
  python: PythonSession
  /** Governed real-browser fallback; absent when host policy does not grant it for this requester. */
  browse?: (url: string, budgetMs: number) => Promise<AgentBrowseResult>
}>

export type AgentToolPolicy = Readonly<{ maxPythonRuns: number; browserAllowed: boolean }>

export type AgentEvidence = {
  observations: string[]
  sourceUrls: Set<string>
  files: StagedFile[]
  images: PythonImage[]
  /** Images withheld because the code that drew them read no staged data file. */
  droppedImages: number
  pythonRuns: number
  /** Hosts that already timed out or refused this turn; they are not retried. */
  failedHosts: Set<string>
}

export function emptyEvidence(userText: string): AgentEvidence {
  return {
    observations: [],
    sourceUrls: new Set(),
    files: userText.trim() ? [{ path: stagedDataPath('user_request.txt'), content: userText }] : [],
    images: [],
    droppedImages: 0,
    pythonRuns: 0,
    failedHosts: new Set(),
  }
}

// Short previews keep each round's context small (the full body is in data/ for the code to read).
const OBSERVATION_LIMIT = 3_000
// Time kept back for the final answer round: tools never spend it.
export const ANSWER_RESERVE_MS = 25_000
// A responsive public endpoint answers in a few seconds; a slow one costs the turn its answer.
const FETCH_TIMEOUT_MS = 10_000
const CREDENTIAL_PARAM = /[?&](?:api[_-]?key|apikey|access[_-]?token|token|key|secret|password|client[_-]?secret)=/i
const PYTHON_TIMEOUT_MS = 40_000

/**
 * An image is evidence-backed only when the program that drew it actually opened a staged data
 * file (retrieved this turn, or the user's own text in data/user_request.txt). The sandbox
 * instruments file opens; a path mentioned in a comment or an unused string does not count.
 */
export function imageBackedByStagedData(dataReads: readonly string[]): boolean {
  return dataReads.some(path => path.startsWith('data/'))
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]): LocalModelToolDefinition {
  return Object.freeze({ type: 'function' as const, function: Object.freeze({ name, description, parameters: Object.freeze({ type: 'object', properties, required, additionalProperties: false }) }) })
}

export function agentToolDefinitions(policy: AgentToolPolicy): readonly LocalModelToolDefinition[] {
  const tools = [
    tool('web_search', 'Search the public web. Returns titles, URLs and snippets. Use it to find sources or data endpoints.', { query: { type: 'string', description: 'A self-contained search query.' } }, ['query']),
    tool('fetch_url', 'Download a public URL (web page, JSON API, CSV). The full body is saved as a data file the Python tool can read; you see a text preview. Prefer machine-readable endpoints (JSON/CSV APIs) for data.', { url: { type: 'string', description: 'Absolute http(s) URL.' } }, ['url']),
    tool('run_python', 'Run Python 3.13 (matplotlib, numpy, pandas available; no network). Files from fetch_url are in data/. Print results to stdout. Save charts as PNG files in out/ (e.g. plt.savefig("out/chart.png", dpi=150, bbox_inches="tight")). Returns stdout, stderr and the saved images.', { code: { type: 'string', description: 'Complete Python program.' } }, ['code']),
  ]
  if (policy.browserAllowed) {
    tools.push(tool('browse_page', 'Open a page in a real headless browser (Playwright) and return its rendered text. Slow: use ONLY when fetch_url failed or returned a page whose data is rendered by JavaScript.', { url: { type: 'string', description: 'Absolute https URL.' } }, ['url']))
  }
  return Object.freeze(tools)
}

function preview(text: string): string {
  const value = String(text || '')
  return value.length > OBSERVATION_LIMIT ? `${value.slice(0, OBSERVATION_LIMIT)}\n…[preview truncated; full ${value.length} chars saved to the data file]` : value
}

/**
 * Structure of a JSON body (keys, types, array lengths, a sample element) so the model can write
 * code against it without reading the raw values into its context.
 */
export function jsonOutline(text: string): string | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  const lines: string[] = []
  const walk = (node: unknown, path: string, depth: number) => {
    if (lines.length >= 60) return
    if (Array.isArray(node)) {
      const sample = node.slice(0, 3).map(item => (item !== null && typeof item === 'object' ? (Array.isArray(item) ? `array(${item.length})` : 'object') : JSON.stringify(item))).join(', ')
      lines.push(`${path}: array(${node.length}) [${sample}${node.length > 3 ? ', …' : ''}]`)
      if (depth < 6 && node.length && node[0] !== null && typeof node[0] === 'object') walk(node[0], `${path}[0]`, depth + 1)
      return
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (child !== null && typeof child === 'object') walk(child, path ? `${path}.${key}` : key, depth + 1)
        else lines.push(`${path ? `${path}.` : ''}${key}: ${JSON.stringify(child)?.slice(0, 80)}`)
        if (lines.length >= 60) return
      }
      return
    }
    lines.push(`${path || '(root)'}: ${JSON.stringify(node)?.slice(0, 80)}`)
  }
  walk(value, '', 0)
  return lines.join('\n')
}

/** HTML → readable text that keeps table rows on separate lines with tab-separated cells. */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]*\t[ \t]*/g, '\t')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function extensionFor(contentType: string, url: string): string {
  if (/json/.test(contentType) || /\.json(?:$|\?)/i.test(url)) return 'json'
  if (/csv/.test(contentType) || /\.csv(?:$|\?)/i.test(url) || /[?&](?:f|format)=csv/i.test(url)) return 'csv'
  if (/html/.test(contentType)) return 'html'
  return 'txt'
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(String(raw || '{}'))
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function executeAgentTool(input: {
  name: string
  argumentsJson: string
  ports: AgentToolPorts
  policy: AgentToolPolicy
  evidence: AgentEvidence
  remainingMs: () => number
}): Promise<string> {
  const args = parseArguments(input.argumentsJson)
  const { evidence } = input
  const record = (text: string): string => {
    evidence.observations.push(text)
    return text
  }

  switch (input.name) {
    case 'web_search': {
      if (input.remainingMs() - ANSWER_RESERVE_MS < 5_000) return 'Error: no time left in this turn for more searches. Answer with what you have.'
      const query = String(args.query || '').trim().slice(0, 300)
      if (!query) return 'Error: query is required.'
      const results = await input.ports.search(query).catch(() => [] as AgentSearchResult[])
      if (!results.length) return record(`No results for "${query}".`)
      for (const result of results) evidence.sourceUrls.add(result.url)
      return record(results.slice(0, 8).map((result, index) => `[${index + 1}] ${result.title}\n${result.url}\n${result.snippet}`).join('\n\n'))
    }

    case 'fetch_url':
    case 'browse_page': {
      const url = String(args.url || '').trim()
      if (!/^https?:\/\//i.test(url)) return 'Error: an absolute http(s) URL is required.'
      const fetchBudgetMs = Math.min(FETCH_TIMEOUT_MS, input.remainingMs() - ANSWER_RESERVE_MS)
      if (fetchBudgetMs < 5_000) return 'Error: no time left in this turn for more downloads. Answer with what you have.'
      let body: string
      let finalUrl = url
      let extension: string
      if (input.name === 'browse_page') {
        if (!input.policy.browserAllowed || !input.ports.browse) return 'Error: the browser tool is not available for this request.'
        const budget = input.remainingMs() - 20_000
        if (budget < 20_000) return 'Error: not enough time left in this turn to start a browser.'
        const browsed = await input.ports.browse(url, budget)
        if (!browsed.ok) return record(`Browser could not load ${url}: ${browsed.error || 'failed'}`)
        body = browsed.text
        extension = 'txt'
      } else {
        // COS never sends credentials it was not given: a model-written key is invented, and a real one
        // would leak into logs and provenance. Production 2026-10-16: the loop made up a FRED api_key.
        if (CREDENTIAL_PARAM.test(url)) return record(`Refused ${url.replace(/([?&][^=]+=)[^&]*/g, '$1…')}: URLs carrying API keys or tokens are not allowed. Use a keyless public endpoint.`)
        let host = ''
        try { host = new URL(url).hostname.toLowerCase() } catch {}
        if (host && evidence.failedHosts.has(host)) {
          return record(`Skipped ${url}: ${host} already failed in this turn. Use the data you already fetched, or a different source.`)
        }
        try {
          const fetched = await input.ports.fetchPublic(url, fetchBudgetMs)
          if (fetched.status >= 400) return record(`HTTP ${fetched.status} from ${fetched.finalUrl}. Try another source or endpoint.`)
          finalUrl = fetched.finalUrl
          extension = extensionFor(fetched.contentType, finalUrl)
          body = fetched.text
        } catch (error) {
          const code = error instanceof Error ? error.message : 'fetch_failed'
          if (host) evidence.failedHosts.add(host)
          return record(`Could not fetch ${url}: ${code}.`)
        }
      }
      const index = new Set(evidence.files.filter(file => file.path.startsWith('data/source_')).map(file => file.path.replace(/\.[a-z]+$/, ''))).size + 1
      const path = stagedDataPath(`source_${index}.${extension}`)
      evidence.files.push({ path, content: body })
      evidence.sourceUrls.add(finalUrl)
      const outline = extension === 'json' ? jsonOutline(body) : null
      const readable = extension === 'html' ? htmlToText(body) : body
      if (extension === 'html') evidence.files.push({ path: stagedDataPath(`source_${index}.txt`), content: readable })
      return record([
        `Fetched ${finalUrl} (${extension}, ${body.length} chars). Saved as ${path}${extension === 'html' ? ` and readable text as data/source_${index}.txt` : ''}.`,
        outline ? `JSON structure (read the file in Python for the values):\n${outline}` : preview(readable),
      ].join('\n'))
    }

    case 'run_python': {
      if (evidence.pythonRuns >= input.policy.maxPythonRuns) return 'Error: the Python run limit for this turn is reached. Answer with what you have.'
      const pythonBudgetMs = Math.min(PYTHON_TIMEOUT_MS, input.remainingMs() - ANSWER_RESERVE_MS)
      if (pythonBudgetMs < 15_000) return 'Error: not enough time left in this turn to run code. Answer with what you have.'
      const code = String(args.code || '')
      evidence.pythonRuns += 1
      const result = await input.ports.python.run({ code, files: evidence.files, timeoutMs: pythonBudgetMs })
      const accepted = result.exitCode === 0 && imageBackedByStagedData(result.dataReads)
      if (accepted) evidence.images.push(...result.images)
      else evidence.droppedImages += result.images.length
      return record([
        `exit_code=${result.exitCode}${result.timedOut ? ' (timed out)' : ''}`,
        result.stdout ? `stdout:\n${result.stdout}` : 'stdout: (empty)',
        result.stderr ? `stderr:\n${result.stderr}` : '',
        !result.images.length
          ? 'images saved: none'
          : accepted
            ? `images saved: ${result.images.map(image => `out/${image.name}`).join(', ')} (they will be shown to the user with your answer)`
            : 'images REJECTED by the harness: the program did not open any data/ file. Plot only data loaded from data/.',
      ].filter(Boolean).join('\n'))
    }

    default:
      return `Error: unknown tool ${input.name}.`
  }
}
