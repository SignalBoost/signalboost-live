// saas/tests/cosAgentToolLoop.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentTraceStep, cosAgentSystemPrompt, redactUrlQueries, keepFinalDraft, stripProcessNarration, stripSandboxPaths, newAgentLoopTrace, runCosAgentLoop, stripUnverifiedUrls, unsupportedAnswerNumbers, type AgentModelTurn } from '../lib/ai/cos/agentLoop/cosAgentLoop.ts'
import { agentToolDefinitions, htmlToText, imageBackedByStagedData, type AgentToolPorts } from '../lib/ai/cos/agentLoop/cosAgentTools.ts'
import { optionalPackagesFor, runnerSource, VercelPythonSession, type PythonSession } from '../lib/ai/cos/agentLoop/pythonSandbox.ts'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { requiresAgentTools } from '../lib/ai/cos/agentLoop/agentToolIntent.ts'
import type { LocalModelChatMessage, LocalModelTurnResult } from '../lib/ai/local-inference.ts'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('chart')])

function call(id: string, name: string, args: Record<string, unknown>): LocalModelTurnResult {
  return { content: null, toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }], finishReason: 'tool_calls', provider: 'test', model: 'agent' }
}
function answer(text: string): LocalModelTurnResult {
  return { content: text, toolCalls: [], finishReason: 'stop', provider: 'test', model: 'agent' }
}

function scriptedModel(turns: LocalModelTurnResult[], seen: LocalModelChatMessage[][] = []): AgentModelTurn {
  let index = 0
  return async input => {
    seen.push([...input.messages])
    return turns[index++] ?? null
  }
}

function fakePython(result: { stdout: string; images?: number }): PythonSession & { runs: { code: string; files: string[] }[]; closed: boolean } {
  const session = {
    runs: [] as { code: string; files: string[] }[],
    closed: false,
    async run(input: { code: string; files: readonly { path: string; content: string }[] }) {
      session.runs.push({ code: input.code, files: input.files.map(file => file.path) })
      const dataReads = input.files.map(file => file.path).filter(path => input.code.includes(`open("${path}")`) || input.code.includes(`open('${path}')`))
      return { dataReads, exitCode: 0, stdout: result.stdout, stderr: '', images: Array.from({ length: result.images ?? 1 }, (_, i) => ({ name: `chart${i}.png`, png: PNG })), timedOut: false }
    },
    async close() { session.closed = true },
  }
  return session
}

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/VNCE?range=6mo&interval=1d'
const STDOUT = 'first=2026-04-16 last=2026-10-15 count=127 min=3.05 max=13.36 latest=13.33'

function ports(python: PythonSession, extra: Partial<AgentToolPorts> = {}): AgentToolPorts {
  return {
    search: async () => [{ title: 'VNCE history', url: 'https://finance.yahoo.com/quote/VNCE/history', snippet: 'Historical prices' }],
    fetchPublic: async url => ({ status: 200, text: '{"chart":{"result":[{"timestamp":[1],"indicators":{"quote":[{"close":[13.33]}]}}]}}', finalUrl: url, contentType: 'application/json' }),
    python,
    ...extra,
  }
}

// Production 2026-10-15: "place in a graphic VNCE stock price for the past six months" got only the
// current quote, then "draw a graphic" went to image generation. The agent loop retrieves the data,
// runs code on it, verifies it and returns the chart it drew.
test('the agent loop fetches data, runs code on the staged file and returns a verified chart', async () => {
  const python = fakePython({ stdout: STDOUT })
  const seen: LocalModelChatMessage[][] = []
  const result = await runCosAgentLoop({
    request: 'place in a graphic VNCE stock price for the past six months',
    language: 'en',
    model: scriptedModel([
      call('c1', 'fetch_url', { url: YAHOO_URL }),
      call('c2', 'run_python', { code: 'import json\nd=json.load(open("data/source_1.json"))\nplt.savefig("out/chart.png")' }),
      answer(`VNCE closed at $13.33 on 2026-10-15, up from $3.05 on 2026-04-16 (127 trading days; high $13.36). The chart is attached.\n\nSources: [Yahoo Finance](${YAHOO_URL}), [Fake](https://invented.example.com/x)`),
    ], seen),
    ports: ports(python),
    policy: { maxPythonRuns: 2, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.ok(result)
  assert.equal(result.images.length, 1)
  assert.deepEqual(result.toolCalls, ['fetch_url', 'run_python'])
  // The fetched body was staged for the code; the user's own text is staged too.
  assert.deepEqual(python.runs[0].files, ['data/user_request.txt', 'data/source_1.json'])
  assert.ok(python.closed, 'the sandbox is always stopped')
  // Native tool protocol: the assistant tool_calls precede their tool results in the history.
  const last = seen.at(-1)!
  assert.equal(last[1].role, 'assistant')
  assert.equal(last[1].tool_calls?.[0].id, 'c1')
  assert.equal(last[2].role, 'tool')
  assert.equal(last[2].tool_call_id, 'c1')
  // Cited URLs the turn never retrieved are removed; retrieved ones stay.
  assert.match(result.reply, /\[Yahoo Finance\]\(https:\/\/query1\.finance\.yahoo\.com/)
  assert.doesNotMatch(result.reply, /invented\.example\.com/)
  assert.equal(result.verification.droppedUrls, 1)
})

test('numbers that no tool printed are repaired, and withheld when they cannot be', async () => {
  const run = (turns: LocalModelTurnResult[]) => runCosAgentLoop({
    request: 'chart VNCE stock price for the past six months',
    language: 'en',
    model: scriptedModel(turns),
    ports: ports(fakePython({ stdout: STDOUT })),
    policy: { maxPythonRuns: 2, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  const fetchAndRun = [call('c1', 'fetch_url', { url: YAHOO_URL }), call('c2', 'run_python', { code: 'open("data/source_1.json")' })]
  const repaired = await run([...fetchAndRun, answer('VNCE rose 412% to $13.33.'), answer('VNCE closed at $13.33 (latest), from $3.05.')])
  assert.equal(repaired?.verification.repaired, true)
  assert.equal(repaired?.reply, 'VNCE closed at $13.33 (latest), from $3.05.')
  const withheld = await run([...fetchAndRun, answer('VNCE rose 412% to $13.33.'), answer('VNCE rose 412%.')])
  assert.equal(withheld, null)
  assert.deepEqual(unsupportedAnswerNumbers('Up 412% to $13.33 on 2026-10-15', [STDOUT]), ['412'])
  // Production 2026-10-16: a correct chart was withheld because "13.36" (printed 13.359999656677246)
  // and "over 300%" (printed 337.0) were not exact digit matches. Roundings and round figures pass.
  const printed = 'Max: 13.359999656677246 on 2026-10-07\nFirst: 3.049999952316284\nChange: 337.0'
  assert.deepEqual(unsupportedAnswerNumbers('High $13.36, start $3.05, up over 300% (337.0%).', [printed]), [])
  assert.deepEqual(unsupportedAnswerNumbers('High $13.4 and $14.36.', [printed]), ['14.36'])
  assert.deepEqual(unsupportedAnswerNumbers('Up over 500%.', [printed]), ['500'])
  // Production 2026-10-16: a verified unemployment chart was withheld for "2021", "2022" (inside the
  // 2020-2025 data) and the "19" of COVID-19. Years outside the data and invented figures still fail.
  const bls = 'First: 2020-01-01 3.6\nLast: 2025-12-01 4.4\nMax: 14.8 at 2020-04-01'
  assert.deepEqual(unsupportedAnswerNumbers('After the COVID-19 peak of 14.8% the rate fell through 2021 and 2022 to 4.4%.', [bls]), [])
  assert.deepEqual(unsupportedAnswerNumbers('It was 6.1% in 2018.', [bls]), ['6.1', '2018'])
})

test('a chart drawn from values typed into the code is rejected', async () => {
  const result = await runCosAgentLoop({
    request: 'graph the price of VNCE',
    language: 'en',
    // A data/ path in a comment is not a read: acceptance comes from instrumented file opens.
    model: scriptedModel([call('c1', 'run_python', { code: 'plt.plot([1,2,3])  # data/source_1.csv\nplt.savefig("out/chart.png")' }), answer('Here is the chart.')]),
    ports: ports(fakePython({ stdout: '' })),
    policy: { maxPythonRuns: 2, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.equal(result?.images.length, 0)
  assert.equal(result?.verification.droppedImages, 1)
  assert.equal(imageBackedByStagedData(['data/source_1.csv']), true)
  assert.equal(imageBackedByStagedData([]), false)
})

test('host policy owns the tool set and the code-run budget', async () => {
  assert.deepEqual(agentToolDefinitions({ maxPythonRuns: 2, browserAllowed: false }).map(tool => tool.function.name), ['web_search', 'fetch_url', 'run_python'])
  assert.ok(agentToolDefinitions({ maxPythonRuns: 2, browserAllowed: true }).some(tool => tool.function.name === 'browse_page'))
  const python = fakePython({ stdout: 'ok', images: 0 })
  const seen: LocalModelChatMessage[][] = []
  await runCosAgentLoop({
    request: 'compute',
    language: 'en',
    model: scriptedModel([
      call('a', 'run_python', { code: 'print(1)' }),
      call('b', 'run_python', { code: 'print(1)' }),
      call('c', 'browse_page', { url: 'https://example.com' }),
      answer('done'),
    ], seen),
    ports: ports(python),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.equal(python.runs.length, 1)
  const toolResults = seen.at(-1)!.filter(message => message.role === 'tool').map(message => String(message.content))
  assert.match(toolResults[1], /run limit/)
  assert.match(toolResults[2], /not available/)
})

test('HTML pages keep table rows readable for the model and the code', () => {
  assert.equal(htmlToText('<table><tr><td>Oct 15</td><td>13.33</td></tr><tr><td>Oct 14</td><td>13.10</td></tr></table><script>x()</script>'), 'Oct 15\t13.33\t\nOct 14\t13.10')
  assert.deepEqual(stripUnverifiedUrls('See https://finance.yahoo.com/quote/VNCE and https://evil.example.org/', new Set([YAHOO_URL])), { text: 'See https://finance.yahoo.com/quote/VNCE and', dropped: 1 })
  // Codex review on #4501: a sibling under a shared public suffix is not the fetched site.
  assert.equal(stripUnverifiedUrls('[x](https://phishing.co.uk/a)', new Set(['https://www.bbc.co.uk/news'])).dropped, 1)
  assert.equal(stripUnverifiedUrls('[x](https://bbc.co.uk/sport)', new Set(['https://www.bbc.co.uk/news'])).dropped, 0)
})

test('the Python sandbox opens the package index only to install, never while model code runs', async () => {
  const events: string[] = []
  const fakeSandbox = {
    async runCommand(command: { cmd: string; args: string[] }) {
      events.push(`${command.cmd} ${command.args.join(' ')}`.slice(0, 60))
      const isList = command.cmd === 'sh' && command.args[1].startsWith('ls')
      return { exitCode: 0, stdout: async () => (isList ? 'chart.png\n' : 'printed'), stderr: async () => '' }
    },
    async updateNetworkPolicy(policy: unknown) { events.push(`network ${JSON.stringify(policy)}`) },
    async writeFiles(files: { path: string }[]) { events.push(`write ${files.map(file => file.path).join(',')}`) },
    async readFileToBuffer(file: { path: string }) { return file.path.includes('.cos-reads-') ? Buffer.from('data/source_1.csv\n') : PNG },
    async stop() { events.push('stop') },
  }
  let created: any
  const session = new VercelPythonSession((async (options: any) => { created = options; return fakeSandbox }) as any)
  const result = await session.run({ code: 'import pandas as pd\nprint(1)', files: [{ path: 'data/source_1.csv', content: 'a,b' }] })
  await session.close()
  assert.equal(created.networkPolicy, 'deny-all')
  assert.equal(created.runtime, 'python3.13')
  assert.equal(result.images.length, 1)
  assert.deepEqual(result.dataReads, ['data/source_1.csv'])
  const install = events.findIndex(event => event.startsWith('python3 -m pip install'))
  const run = events.findIndex(event => event === 'python3 .cos_runner.py')
  assert.ok(events[install - 1].startsWith('network {"allow"'))
  assert.equal(events[install + 1], 'network "deny-all"')
  assert.ok(run > install + 1)
  assert.equal(events.at(-1), 'stop')
  assert.deepEqual(optionalPackagesFor('import pandas as pd'), ['pandas==2.3.3'])
  assert.deepEqual(optionalPackagesFor('import json'), [])
})

test('chart-of-data requests reach the agent loop; pictures do not', () => {
  const prior = 'The current real-time price of VNCE stock is $13.33 USD on NASDAQ as of October 15, 2026'
  assert.equal(requiresAgentTools('place in a graphic VNCE stock price for the past six months'), true)
  assert.equal(requiresAgentTools('based on the info your provided you can draw a graphic', prior), true)
  assert.equal(requiresAgentTools('haz un gráfico de la inflación en Paraguay'), true)
  assert.equal(requiresAgentTools('построй график цены акций AAPL'), true)
  assert.equal(requiresAgentTools('draw a graphic of a cat playing football'), false)
  assert.equal(requiresAgentTools('draw a graphic', ''), false)
})

test('compute turns run behind the COS ingress, before image generation can take them', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const guard = browser.indexOf('const agentToolsRequired = !hasAttachments && requiresAgentTools(prompt, priorAnswer)')
  assert.ok(guard > 0 && guard < browser.indexOf('isConciergeVisualObjective(prompt)'))
  assert.match(browser, /if \(!operationalEvidence && !agentToolsRequired\) \{\n\s*if \(isConciergeArtifactObjective\(prompt\)\)/)
  assert.match(browser, /capabilities: \['compute'\], searchQueries: \[\], reason: 'host_compute_guard'/)
  // The loop itself runs only in cos-primary, with provenance written like every other answer.
  assert.doesNotMatch(browser, /runCosAgentLoop/)
  assert.match(primary, /if\(agentCapabilities\.has\('compute'\)\)\{\n\s*const computed=await agentComputeResponse/)
  assert.match(primary, /writeCosPrimaryProvenance\(turn\.userId,result\.reply,built\.executionProvenance,'cos-agent-tool-loop'/)
  // A chart request is released only with a verified chart.
  assert.match(primary, /if\(result&&\(!chartRequested\|\|result\.images\.length\)\)/)
  // A chart request the loop could not build fails closed rather than reaching a one-pass answer.
  assert.match(primary, /const reply=freshEvidenceUnavailableReply\(turn\.language,turn\.input\)\n\s*const built=agentChartJson\(turn\.startedAt,turn\.input,\{reply,source:'cos-agent-tool-loop-unavailable'/)
})

test('a model cannot fan out past the host tool budget in one round', async () => {
  const fetched: string[] = []
  const many: LocalModelTurnResult = { content: null, toolCalls: Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, type: 'function' as const, function: { name: 'fetch_url', arguments: JSON.stringify({ url: `https://example.com/${i}` }) } })), finishReason: 'tool_calls', provider: 'test', model: 'agent' }
  const seen: LocalModelChatMessage[][] = []
  await runCosAgentLoop({
    request: 'compare these pages',
    language: 'en',
    model: scriptedModel([many, answer('done')], seen),
    ports: ports(fakePython({ stdout: '' }), { fetchPublic: async url => { fetched.push(url); return { status: 200, text: 'ok', finalUrl: url, contentType: 'text/plain' } } }),
    policy: { maxPythonRuns: 2, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.equal(fetched.length, 4)
  // Every issued call still receives a tool result, as the native protocol requires.
  assert.equal(seen.at(-1)!.filter(message => message.role === 'tool').length, 9)
})

test('the sandbox runner records only files the program really opens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-runner-'))
  const work = '/tmp/work'
  execFileSync('mkdir', ['-p', `${work}/data`])
  writeFileSync(`${work}/data/source_1.csv`, 'a,b\n1,2\n')
  const log = join(dir, 'reads')
  writeFileSync(`${work}/.cos_runner_test.py`, runnerSource(log).replace('"main.py"', JSON.stringify(join(dir, 'main.py'))))
  writeFileSync(join(dir, 'main.py'), 'import csv\nrows = list(csv.reader(open("data/source_1.csv")))\nprint(len(rows))  # data/other.csv only in a comment\n')
  assert.equal(execFileSync('python3', ['.cos_runner_test.py'], { cwd: work }).toString().trim(), '2')
  assert.equal(readFileSync(log, 'utf8').trim(), 'data/source_1.csv')
  assert.ok(existsSync(log))
})


test('the loop trace records why a turn produced no answer', async () => {
  const run = async (turns: LocalModelTurnResult[]) => {
    const trace = newAgentLoopTrace()
    await runCosAgentLoop({ trace, request: 'chart VNCE stock price', language: 'en', model: scriptedModel(turns), ports: ports(fakePython({ stdout: STDOUT })), policy: { maxPythonRuns: 2, browserAllowed: false }, deadlineAt: Date.now() + 100_000 })
    return trace
  }
  assert.equal((await run([])).outcome, 'model_unavailable')
  // A provider rejection is recorded, not swallowed.
  const rejected = newAgentLoopTrace()
  await runCosAgentLoop({ trace: rejected, request: 'chart VNCE stock price', language: 'en', model: async () => { throw new Error('deepinfra:m: HTTP 400: bad tool message') }, ports: ports(fakePython({ stdout: '' })), policy: { maxPythonRuns: 1, browserAllowed: false }, deadlineAt: Date.now() + 100_000 })
  assert.equal(rejected.outcome, 'model_unavailable')
  assert.equal(rejected.modelError, 'deepinfra:m: HTTP 400: bad tool message')
  const unsupported = await run([call('c1', 'fetch_url', { url: YAHOO_URL }), answer('Up 412%.'), answer('Up 412%.')])
  assert.equal(unsupported.outcome, 'unsupported_numbers')
  assert.deepEqual(unsupported.unsupportedNumbers, ['412'])
  assert.equal(unsupported.steps[0].tool, 'fetch_url')
  assert.equal(unsupported.steps[0].status, 'ok')
  assert.equal(unsupported.steps[0].host, 'query1.finance.yahoo.com')
  assert.ok(!('observation' in unsupported.steps[0]), 'raw observation text is never kept in the trace')
  assert.equal((await run([call('c1', 'fetch_url', { url: YAHOO_URL }), answer('VNCE closed at $13.33.')])).outcome, 'answered')
})

// Production 2026-10-16: the agent loop's code-writing round was cut by the 20 s one-pass clamp
// ("Inference transport deadline exceeded") and every chart fell back. Loop rounds use the loop's bound.
test('agent-loop model rounds are not clamped to the one-pass interactive timeout', () => {
  const inference = readFileSync(join(process.cwd(), 'lib/ai/local-inference.ts'), 'utf8')
  const clamp = inference.slice(inference.indexOf('function interactiveModelTimeoutMs'), inference.indexOf('function modelForRequest'))
  assert.match(clamp, /if \(agentToolLoopRound\(args\)\) return Math\.min\(configTimeoutMs, 60_000\)/)
  assert.ok(clamp.indexOf('agentToolLoopRound(args)') < clamp.indexOf('COS_INTERACTIVE_MODEL_TIMEOUT_MS'))
  const seam = readFileSync(join(process.cwd(), 'lib/ai/cos/cosAgentDecision.ts'), 'utf8')
  assert.match(seam, /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'agent_tool_loop' \}/)
  // Production 2026-10-16: the configured reasoner never finished a code round in 60 s; rounds on
  // DeepInfra use the fast models the edit lane already runs, the second only when the first fails.
  assert.match(seam, /process\.env\.COS_FAST_TEXT_MODEL\?\.trim\(\) \|\| 'deepseek-ai\/DeepSeek-V4-Flash-0731'/)
  assert.match(seam, /\{ \.\.\.config, model, timeoutMs: attemptMs \}/)
})

test('JSON downloads are shown to the model as structure, not raw values', async () => {
  const yahoo = JSON.stringify({ chart: { result: [{ meta: { currency: 'USD', symbol: 'VNCE' }, timestamp: Array.from({ length: 127 }, (_, i) => 1776000000 + i * 86400), indicators: { quote: [{ close: Array.from({ length: 127 }, (_, i) => 3 + i / 10) }] } }] } })
  const seen: LocalModelChatMessage[][] = []
  await runCosAgentLoop({
    request: 'chart VNCE stock price',
    language: 'en',
    model: scriptedModel([call('c1', 'fetch_url', { url: YAHOO_URL }), answer('done')], seen),
    ports: ports(fakePython({ stdout: '' }), { fetchPublic: async url => ({ status: 200, text: yahoo, finalUrl: url, contentType: 'application/json' }) }),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  const observation = String(seen.at(-1)!.find(message => message.role === 'tool')?.content)
  assert.match(observation, /chart\.result: array\(1\)/)
  assert.match(observation, /chart\.result\[0\]\.timestamp: array\(127\)/)
  assert.match(observation, /chart\.result\[0\]\.indicators\.quote\[0\]\.close: array\(127\)/)
  assert.ok(observation.length < 3_000, `observation stays small (${observation.length})`)
})

// Production 2026-10-16: slow sources used the whole budget and the unemployment turn ended with no
// answer even though its code had already run. Tools never spend the answer reserve, and the last
// round runs with tools off so the turn still answers from what it gathered.
test('tools never spend the answer reserve, and the last round answers', async () => {
  let clock = 0
  const choices: string[] = []
  const budgets: number[] = []
  const result = await runCosAgentLoop({
    request: 'chart VNCE stock price',
    language: 'en',
    now: () => clock,
    deadlineAt: 38_000,
    model: async input => {
      choices.push(input.toolChoice)
      return choices.length === 1 ? call('c1', 'fetch_url', { url: YAHOO_URL }) : answer('VNCE closed at $13.33.')
    },
    ports: ports(fakePython({ stdout: '' }), { fetchPublic: async (url, timeoutMs) => { budgets.push(timeoutMs); clock += timeoutMs; return { status: 200, text: '13.33', finalUrl: url, contentType: 'text/plain' } } }),
    policy: { maxPythonRuns: 1, browserAllowed: false },
  })
  assert.deepEqual(budgets, [10_000])
  assert.deepEqual(choices, ['auto', 'none'])
  assert.equal(result?.reply, 'VNCE closed at $13.33.')
})

// Production 2026-10-16: the unemployment turn already had World Bank data, then spent its budget
// retrying a host that timed out on every attempt. A failed host is not retried in the same turn.
test('a host that failed is not retried in the same turn', async () => {
  const attempts: string[] = []
  const seen: LocalModelChatMessage[][] = []
  await runCosAgentLoop({
    request: 'chart the US unemployment rate',
    language: 'en',
    model: scriptedModel([
      call('a', 'fetch_url', { url: 'https://slow.example.org/series.csv' }),
      call('b', 'fetch_url', { url: 'https://slow.example.org/series.csv?x=1' }),
      answer('done'),
    ], seen),
    ports: ports(fakePython({ stdout: '' }), { fetchPublic: async url => { attempts.push(url); throw new Error('public_fetch_timeout') } }),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.equal(attempts.length, 1)
  const results = seen.at(-1)!.filter(message => message.role === 'tool').map(message => String(message.content))
  assert.match(results[1], /^Skipped https:\/\/slow\.example\.org\/series\.csv\?x=1: slow\.example\.org already failed/)
})

test('URLs carrying API keys are refused without a request', async () => {
  const attempts: string[] = []
  const seen: LocalModelChatMessage[][] = []
  await runCosAgentLoop({
    request: 'chart the US unemployment rate',
    language: 'en',
    model: scriptedModel([call('a', 'fetch_url', { url: 'https://api.example.org/obs?series_id=X&api_key=abcdef123456&file_type=json' }), answer('done')], seen),
    ports: ports(fakePython({ stdout: '' }), { fetchPublic: async url => { attempts.push(url); return { status: 200, text: 'ok', finalUrl: url, contentType: 'text/plain' } } }),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.equal(attempts.length, 0)
  const result = String(seen.at(-1)!.find(message => message.role === 'tool')?.content)
  assert.match(result, /^Refused https:\/\/api\.example\.org\/obs\?series_id=…&api_key=…&file_type=…: URLs carrying API keys/)
  assert.doesNotMatch(result, /abcdef123456/)
})

// Production 2026-10-16: the unemployment turn found BLS monthly data, hit one Python error, and
// ran out of rounds (8) with time left. A code error gets a retry within the step budget.
test('the step budget leaves room to fix a failed program', () => {
  const loop = readFileSync(join(process.cwd(), 'lib/ai/cos/agentLoop/cosAgentLoop.ts'), 'utf8')
  const runtime = readFileSync(join(process.cwd(), 'lib/ai/cos/agentLoop/cosAgentRuntime.ts'), 'utf8')
  assert.match(runtime, /maxPythonRuns: input\.signedIn \|\| input\.ownerAuthenticated \? 6 : 4/)
  // Production 2026-10-16: the unemployment turn verified 60 monthly points in one run and hit the
  // run limit before plotting. Verification and plotting happen in one program.
  assert.match(loop, /Verify and plot in the SAME program/)
  assert.match(loop, /try at most three sources/)
  assert.match(loop, /const MAX_ROUNDS = 14/)
  assert.match(loop, /const MAX_TOOL_CALLS = 20/)
})

test('the agent knows today to resolve relative periods', () => {
  assert.match(cosAgentSystemPrompt('en', new Date('2026-10-16T03:00:00Z')), /^Today is 2026-10-16 \(UTC\)\. Resolve relative periods/)
})


// Codex P1 on #4513: the trace is logged and persisted in execution_provenance, so it must hold
// sanitized metadata only, never request text, page contents or URL query strings.
test('loop trace steps carry sanitized metadata, never raw observations', () => {
  const fetched = agentTraceStep('fetch_url', 'Fetched https://api.example.com/v1/series?token=SECRET&q=me (json, 5120 chars). Saved as data/source_1.json.\nJSON structure: private user text')
  assert.deepEqual(fetched, { tool: 'fetch_url', status: 'ok', host: 'api.example.com', path: '/v1/series', chars: 5120 })
  const python = agentTraceStep('run_python', 'exit_code=1\nstdout:\nmy secret request text\nstderr:\nTraceback (most recent call last):\nKeyError: \'close\'\nimages saved: none (if the user asked for a chart, your next run must save it to out/)')
  assert.deepEqual(python, { tool: 'run_python', status: 'error', exitCode: 1, images: 0, error: 'KeyError' })
  assert.deepEqual(agentTraceStep('run_python', 'exit_code=0\nstdout:\nrows 127\nimages saved: out/chart.png (they will be shown to the user with your answer)'), { tool: 'run_python', status: 'ok', exitCode: 0, images: 1 })
  assert.deepEqual(agentTraceStep('web_search', '[1] A\nhttps://a.com\nsnippet\n\n[2] B\nhttps://b.com\nsnippet'), { tool: 'web_search', status: 'ok', results: 2 })
  assert.deepEqual(agentTraceStep('fetch_url', 'HTTP 404 from https://stooq.com/q/d/l/?s=vnce.us&i=d. Try another source or endpoint.'), { tool: 'fetch_url', status: 'error', error: 'http_404', host: 'stooq.com', path: '/q/d/l/' })
  assert.equal(agentTraceStep('fetch_url', 'Refused https://api.stlouisfed.org/fred?api_key=…: URLs carrying API keys').error, 'refused_credentials')
  assert.equal(agentTraceStep('fetch_url', 'Error: tool budget for this turn is spent; this call was not executed.').error, 'budget')
  for (const step of [fetched, python]) assert.doesNotMatch(JSON.stringify(step), /SECRET|secret request|private user/)
  assert.equal(redactUrlQueries('deepinfra: HTTP 400 at https://x.io/v1/chat?key=abc#f failed'), 'deepinfra: HTTP 400 at https://x.io/v1/chat failed')
})


// Production 2026-10-16: the VNCE answer ended "The chart is attached as `out/vnce_6mo.png`."
test('answers never expose sandbox file paths', () => {
  assert.equal(stripSandboxPaths('The chart is attached as `out/vnce_6mo.png`.'), 'The chart is attached.')
  assert.equal(stripSandboxPaths('I read data/source_1.json and saved the chart to out/chart.png.'), 'I read and saved the chart.')
  assert.equal(stripSandboxPaths('Daily closes (from `data/source_2.csv`), latest $13.33.'), 'Daily closes, latest $13.33.')
  assert.equal(stripSandboxPaths('**Sources:**\n- [Yahoo](https://query1.finance.yahoo.com/v8/finance/chart/VNCE)'), '**Sources:**\n- [Yahoo](https://query1.finance.yahoo.com/v8/finance/chart/VNCE)')
  assert.equal(stripSandboxPaths('Revenue grew in the outdoor/data segment.'), 'Revenue grew in the outdoor/data segment.')
  assert.equal(stripSandboxPaths('See https://shop.example.com/checkout/out/page.html for details.'), 'See https://shop.example.com/checkout/out/page.html for details.')
})


test('answers start with the result, not the agent narrating its process', () => {
  assert.equal(stripProcessNarration('The data is verified and the chart is created. Let me present the results.\n\nHere\'s the chart of gold.'), 'Here\'s the chart of gold.')
  assert.equal(stripProcessNarration('The data is verified and the chart is created. Here\'s the summary:\n\n## VNCE'), '## VNCE')
  assert.equal(stripProcessNarration('Here are the results.\n\n**VNCE** rose 338.4% over six months.'), '**VNCE** rose 338.4% over six months.')
  // Codex #4565 P2: a note separated by a single newline, or by nothing, is still a note.
  assert.equal(stripProcessNarration('The data is verified and the chart is created.\nHere\'s the chart of gold.'), 'Here\'s the chart of gold.')
  // Production 2026-10-16 (Microsoft CEO): every note sentence goes; every fact stays.
  assert.equal(stripProcessNarration('The search results clearly confirm the answer. Satya Nadella is the current CEO.\n\nThe user asked a simple factual question. No data computation or chart is needed. Let me provide the answer directly.\n\nThe current CEO of Microsoft is **Satya Nadella**, since February 2014.\n\nSources:\n- [Microsoft](https://news.microsoft.com/source/leadership/)'), 'Satya Nadella is the current CEO.\n\nThe current CEO of Microsoft is **Satya Nadella**, since February 2014.\n\nSources:\n- [Microsoft](https://news.microsoft.com/source/leadership/)')
  // Production 2026-10-16 (Canberra): an explicit "## Answer" heading ends the preamble.
  assert.equal(stripProcessNarration('I have the authoritative figure from the ABS. Canberra 484,630.\n\nLet me confirm the figure is clearly stated in the data.\n\nThe ABS table shows 484,630.\n\nThis is a simple factual question, so no chart is needed. Let me provide the answer.\n\n## Answer\n\n**The capital of Australia is Canberra.** Population 484,630 (ABS, 30 June 2025).'), '**The capital of Australia is Canberra.** Population 484,630 (ABS, 30 June 2025).')
  // Codex #4565 P1: a substantive sentence that mentions sources is an answer, not a note.
  assert.equal(stripProcessNarration('The search results show that Canberra is the capital of Australia.\n\nSources:\n- [Britannica](https://www.britannica.com/place/Canberra)'), 'The search results show that Canberra is the capital of Australia.\n\nSources:\n- [Britannica](https://www.britannica.com/place/Canberra)')
  assert.equal(stripProcessNarration('Gold fell 3.12%. The chart is attached.'), 'Gold fell 3.12%. The chart is attached.')
  // Production 2026-10-16 (Microsoft CEO, after #4574).
  assert.equal(stripProcessNarration('The official Microsoft source confirms: Satya Nadella is Chairman and CEO.\n\nThe answer is clear and verified from the official Microsoft leadership page.\n\nThe current CEO of Microsoft is **Satya Nadella**.'), 'The official Microsoft source confirms: Satya Nadella is Chairman and CEO.\n\nThe current CEO of Microsoft is **Satya Nadella**.')
  assert.equal(stripProcessNarration('Ottawa is the capital of Canada.\n\nLet me know if you want the metro population too.'), 'Ottawa is the capital of Canada.\n\nLet me know if you want the metro population too.')
  assert.equal(stripProcessNarration('Let me present the results.'), 'Let me present the results.')
})

// Production 2026-10-16: "capital of Australia and its population" answered only the capital from
// one search pass. Live facts now run in the agent loop, seeded with the search COS already ran,
// and the model searches again for the part those results do not cover.
test('a seeded search starts the loop and a second search covers the missing part', async () => {
  const seen: LocalModelChatMessage[][] = []
  const searched: string[] = []
  const trace = newAgentLoopTrace()
  const result = await runCosAgentLoop({
    trace,
    request: 'what is the capital of Australia and its population?',
    language: 'en',
    model: scriptedModel([
      call('c1', 'web_search', { query: 'Canberra population' }),
      answer('The capital of Australia is Canberra, with a population of about 478,000.\n\nSources:\n- [Britannica](https://www.britannica.com/place/Canberra)\n- [ABS](https://www.abs.gov.au/canberra)'),
    ], seen),
    ports: ports(fakePython({ stdout: '' }), { search: async query => { searched.push(query); return [{ title: 'Canberra population', url: 'https://www.abs.gov.au/canberra', snippet: 'Canberra population 478,000 (2025)' }] } }),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
    seedSearch: { query: 'capital of Australia', results: [{ title: 'Canberra', url: 'https://www.britannica.com/place/Canberra', snippet: 'Canberra, capital of Australia' }] },
  })
  const first = seen[0]
  assert.equal(first.at(-2)?.role, 'assistant')
  assert.equal(first.at(-2)?.tool_calls?.[0]?.function.name, 'web_search')
  assert.equal(first.at(-1)?.role, 'tool')
  assert.match(String(first.at(-1)?.content), /britannica\.com\/place\/Canberra/)
  assert.deepEqual(searched, ['Canberra population'], 'the seeded search is not repeated')
  assert.ok(result, 'answered')
  assert.match(result!.reply, /478,000/)
  assert.match(result!.reply, /britannica\.com/, 'seeded source URLs are verified sources')
  assert.equal(result!.verification.droppedUrls, 0)
  assert.deepEqual(trace.steps.map(step => step.tool), ['web_search', 'web_search'])
})

test('the agent prompt requires every part of a multi-part request', () => {
  assert.match(cosAgentSystemPrompt('en'), /Cover every part/)
})

test('cos-primary answers live facts through the seeded agent loop before one-pass synthesis', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const loop = route.indexOf('const agentAnswered=await agentComputeResponse(')
  const synthesis = route.indexOf('let localSynthesis=await synthesizeFreshEvidenceLocally(')
  assert.ok(loop > 0 && synthesis > loop, 'agent loop runs first; one-pass synthesis is the fallback')
  assert.match(route.slice(loop, synthesis), /seedSearch:\{query:lookupInput,results:freshSources\}/)
})


// Production 2026-10-16 (Microsoft CEO): one model reply held two full drafts, the second glued onto
// the first draft's last source URL; and the Canberra answer opened with "The data is confirmed...".
test('only the final draft of a multi-draft reply is kept', () => {
  const production = 'The current CEO of Microsoft is **Satya Nadella**. He became CEO in **February 2014**.\n\nSources:\n- https://news.microsoft.com/source/leadership/\n- https://news.microsoft.com/source/exec/satya-nadella/The current CEO of Microsoft is **Satya Nadella**. He took on the role in **February 2014**, succeeding Steve Ballmer.\n\nSources:\n- [Microsoft Leadership](https://news.microsoft.com/source/leadership/)'
  assert.equal(keepFinalDraft(production), 'The current CEO of Microsoft is **Satya Nadella**. He took on the role in **February 2014**, succeeding Steve Ballmer.\n\nSources:\n- [Microsoft Leadership](https://news.microsoft.com/source/leadership/)')
  const separated = 'Draft one.\n\nSources:\n- [A](https://a.com/x)\n\nFinal answer here.\n\n**Sources:**\n- [B](https://b.com/y)'
  assert.equal(keepFinalDraft(separated), 'Final answer here.\n\n**Sources:**\n- [B](https://b.com/y)')
  const single = 'Tokyo is the capital.\n\nSources:\n- [World Bank](https://data.worldbank.org/indicator/SP.POP.TOTL?locations=JP)'
  assert.equal(keepFinalDraft(single), single)
  assert.equal(stripProcessNarration('The data is confirmed from the official ABS source.\n\nThe capital of Australia is **Canberra**.'), 'The capital of Australia is **Canberra**.')
})

// OpenHands StuckDetector + critic/iterative refinement (MIT), ported in agentLoop/openhandsPatterns.ts.
import { actionKey, detectStuck, parseCriticVerdict, shouldRefine } from '../lib/ai/cos/agentLoop/openhandsPatterns.ts'

test('stuck detector: OpenHands patterns and thresholds', () => {
  const step = (action: string, observation: string, error = false) => ({ action, observation, error })
  assert.equal(detectStuck([step('a', 'x'), step('a', 'x'), step('a', 'x')]), null, 'below threshold')
  assert.deepEqual(detectStuck([step('a', 'x'), step('a', 'x'), step('a', 'x'), step('a', 'x')]), { pattern: 'action_observation_loop', repetitions: 4 })
  assert.deepEqual(detectStuck([step('a', 'e1', true), step('a', 'e2', true), step('a', 'e3', true), step('a', 'e4', true)]), { pattern: 'action_error_loop', repetitions: 4 })
  assert.deepEqual(detectStuck(['a', 'b', 'a', 'b', 'a', 'b'].map(name => step(name, `obs-${name}`))), { pattern: 'alternating_pattern', repetitions: 6 })
  assert.equal(detectStuck([step('a', 'x'), step('b', 'y'), step('a', 'x'), step('c', 'z')]), null)
  assert.equal(actionKey('fetch_url', '{"url":"u","b":1}'), actionKey('fetch_url', '{"b":1,"url":"u"}'), 'argument order does not matter')
})

test('a stuck loop stops calling tools and answers with what it has', async () => {
  const seen: { toolChoice: unknown }[] = []
  const trace = newAgentLoopTrace()
  const failing = call('c', 'fetch_url', { url: 'https://example.com/data.json' })
  const model: AgentModelTurn = async request => {
    seen.push({ toolChoice: request.toolChoice })
    return seen.length <= 4 ? { ...failing, toolCalls: [{ ...failing.toolCalls[0], id: `c${seen.length}` }] } : answer('The source could not be reached.')
  }
  const result = await runCosAgentLoop({ trace, request: 'what does the data say?', language: 'en', model, ports: ports(fakePython({ stdout: '' }), { fetchPublic: async url => ({ status: 503, text: '', finalUrl: url, contentType: 'text/plain' }) }), policy: { maxPythonRuns: 1, browserAllowed: false }, deadlineAt: Date.now() + 100_000 })
  assert.equal(trace.stuck, 'action_observation_loop', 'identical failing results match scenario 1 first, as in OpenHands')
  assert.equal(seen.length, 5)
  assert.equal(seen[4].toolChoice, 'none', 'the round after a stuck pattern has tools off')
  assert.equal(result?.reply, 'The source could not be reached.')
})

test('critic refinement: an incomplete answer continues until the missing part is covered', async () => {
  const seen: LocalModelChatMessage[][] = []
  const searched: string[] = []
  const reviews: string[] = []
  const trace = newAgentLoopTrace()
  const critic: AgentModelTurn = async request => {
    reviews.push(String(request.messages.at(-1)?.content))
    return answer(reviews.length === 1
      ? '{"parts":[{"ask":"capital of Australia","answered":true},{"ask":"its population","answered":false}]}'
      : '{"parts":[{"ask":"capital of Australia","answered":true},{"ask":"its population","answered":true}]}')
  }
  const result = await runCosAgentLoop({
    trace,
    request: 'what is the capital of Australia and its population?',
    language: 'en',
    model: scriptedModel([
      answer('The capital of Australia is Canberra.'),
      call('c1', 'web_search', { query: 'Canberra population' }),
      answer('The capital of Australia is Canberra; its population is 484,630.'),
    ], seen),
    critic,
    ports: ports(fakePython({ stdout: '' }), { search: async query => { searched.push(query); return [{ title: 'ABS', url: 'https://www.abs.gov.au/canberra', snippet: 'Canberra 484,630' }] } }),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.match(String(seen[1].at(-1)?.content), /HARNESS REVIEW \(iteration 1\)[\s\S]*Not covered: its population/)
  assert.deepEqual(searched, ['Canberra population'])
  assert.equal(result?.reply, 'The capital of Australia is Canberra; its population is 484,630.')
  assert.deepEqual(trace.critic, [{ parts: 2, missing: 1, refined: true }, { parts: 2, missing: 0, refined: false }])
  assert.ok(!JSON.stringify(trace.critic).includes('population'), 'the trace keeps counts, not request text')
})

test('critic: an unusable verdict or a failed refinement never loses the answer', async () => {
  assert.equal(parseCriticVerdict('looks fine to me'), null)
  assert.deepEqual(parseCriticVerdict('```json\n{"parts":[{"ask":"a","answered":true},{"ask":"b","answered":false}]}\n```'), { score: 0.5, parts: 2, missing: ['b'] })
  assert.equal(shouldRefine({ score: 0.5, parts: 2, missing: ['b'] }, 1), false, 'max one refinement iteration')
  const unusable = await runCosAgentLoop({ request: 'q', language: 'en', model: scriptedModel([answer('Paris.')]), critic: async () => answer('no json'), ports: ports(fakePython({ stdout: '' })), policy: { maxPythonRuns: 1, browserAllowed: false }, deadlineAt: Date.now() + 100_000 })
  assert.equal(unusable?.reply, 'Paris.')
  const failedRefine = await runCosAgentLoop({ request: 'q and r', language: 'en', model: scriptedModel([answer('Only q.')]), critic: async () => answer('{"parts":[{"ask":"q","answered":true},{"ask":"r","answered":false}]}'), ports: ports(fakePython({ stdout: '' })), policy: { maxPythonRuns: 1, browserAllowed: false }, deadlineAt: Date.now() + 100_000 })
  assert.equal(failedRefine?.reply, 'Only q.', 'the reviewed draft is kept when the refinement round returns nothing')
})

test('cos-primary runs the completeness critic and credits OpenHands', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(route, /critic:runCosAgentToolTurn/)
  const notice = readFileSync(join(process.cwd(), 'lib/ai/cos/agentLoop/THIRD_PARTY_NOTICES.md'), 'utf8')
  assert.match(notice, /MIT License[\s\S]*OpenHands contributors/)
})


// Codex #4567: the critic reviews what will be delivered, and a regressing refinement never wins.
test('critic reviews the delivered draft and keeps the better-covered answer', async () => {
  const reviewedTexts: string[] = []
  const critic: AgentModelTurn = async request => {
    const text = String(request.messages.at(-1)?.content)
    reviewedTexts.push(text)
    return answer(reviewedTexts.length === 1
      ? '{"parts":[{"ask":"a","answered":true},{"ask":"b","answered":false}]}'
      : '{"parts":[{"ask":"a","answered":false},{"ask":"b","answered":false}]}')
  }
  const trace = newAgentLoopTrace()
  const result = await runCosAgentLoop({
    trace,
    request: 'a and b',
    language: 'en',
    model: scriptedModel([answer('Let me present the results.\n\nA is alpha.'), answer('Nothing useful.')]),
    critic,
    ports: ports(fakePython({ stdout: '' })),
    policy: { maxPythonRuns: 1, browserAllowed: false },
    deadlineAt: Date.now() + 100_000,
  })
  assert.doesNotMatch(reviewedTexts[0], /Let me present/, 'the critic sees the normalized answer')
  assert.equal(result?.reply, 'A is alpha.', 'the refinement covered less, so the reviewed draft is delivered')
  assert.deepEqual(trace.critic.map(entry => entry.missing), [1, 2])
})

// Codex #4564: agent live-fact answers meet the same release gate as one-pass fresh synthesis,
// carry structured source records, and leave the one-pass fallback time to answer.
import { agentEvidenceSources, agentLiveFactReleasable } from '../lib/ai/cos/agentLoop/agentLiveFactRelease.ts'

test('agent live-fact answers must cite qualifying retrieved evidence', () => {
  const canberra = agentEvidenceSources(['https://www.abs.gov.au/statistics/people/population/regional-population/latest-release', 'https://www.britannica.com/place/Canberra'])
  assert.deepEqual(canberra.map(source => source.id), ['LIVE1', 'LIVE2'])
  assert.equal(canberra[1].title, 'britannica.com')
  assert.equal(agentLiveFactReleasable('Canberra; population 484,630.\n\nSources:\n- [ABS](https://www.abs.gov.au/statistics/people/population/regional-population/latest-release)', 'what is the capital of Australia and its population?', canberra), true)
  assert.equal(agentLiveFactReleasable('Canberra; population 484,630.', 'what is the capital of Australia and its population?', canberra), false, 'an answer citing nothing retrieved is not released as grounded')
  assert.equal(agentLiveFactReleasable('See https://example.com/other', 'what is the capital of Australia?', canberra), false, 'a cited URL that was not retrieved does not count')
  // Office-holder authority: the existing policy decides, unchanged.
  assert.equal(agentLiveFactReleasable('Keir Starmer.\n\nSources:\n- [BBC](https://www.bbc.com/news/x)', 'who is the current prime minister of the UK?', agentEvidenceSources(['https://www.bbc.com/news/x'])), false)
  assert.equal(agentLiveFactReleasable('Keir Starmer.\n\nSources:\n- [Gov](https://www.gov.uk/government/people/keir-starmer)', 'who is the current prime minister of the UK?', agentEvidenceSources(['https://www.gov.uk/government/people/keir-starmer'])), true)
  // A source already retrieved by the host keeps its record.
  const known = agentEvidenceSources(['https://www.britannica.com/place/Canberra'], [{ id: 'LIVE7', title: 'Canberra | Britannica', url: 'https://britannica.com/place/Canberra/', snippet: 'capital' }])
  assert.deepEqual([known[0].id, known[0].title], ['LIVE1', 'Canberra | Britannica'])
})

test('cos-primary gates, records and bounds agent live-fact answers', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(route, /liveFact:\{sources:freshSources\}/)
  assert.match(route, /turn\.liveFact&&!chartRequested&&!agentLiveFactReleasable\(result\.reply,turn\.input,evidenceSources\)/)
  assert.match(route, /LIVE_FACT_LOOP_BUDGET_MS=30_000/)
  assert.match(route, /remaining-LIVE_FACT_FALLBACK_RESERVE_MS/)
  assert.match(route, /if\(turn\.liveFact&&loopBudgetMs<LIVE_FACT_MIN_LOOP_MS\)return null/)
  assert.match(route, /attachFreshEvidenceProvenance\(authoritativeProvenance\(null,\{invoked:false\}\),\{sources:payload\.sources/)
  assert.match(route, /live_evidence_sources:payload\.sources\.map\(source=>\(\{id:source\.id,title:source\.title,url:source\.url\}\)\)/)
})

// Codex #4574: a 30 s live-fact loop with the 25 s chart reserve could never call a tool.
test('a short live-fact loop with its own answer reserve still searches', async () => {
  const choices: unknown[] = []
  const searched: string[] = []
  const model: AgentModelTurn = async request => {
    choices.push(request.toolChoice)
    return choices.length === 1 ? call('c1', 'web_search', { query: 'Canberra population' }) : answer('Canberra.')
  }
  const run = (answerReserveMs?: number) => runCosAgentLoop({ request: 'capital of Australia and its population?', language: 'en', model, ports: ports(fakePython({ stdout: '' }), { search: async query => { searched.push(query); return [] } }), policy: { maxPythonRuns: 1, browserAllowed: false, answerReserveMs }, deadlineAt: Date.now() + 25_000 })
  await run(8_000)
  assert.equal(choices[0], 'auto')
  assert.deepEqual(searched, ['Canberra population'])
  choices.length = 0
  searched.length = 0
  await run(undefined)
  assert.equal(choices[0], 'none', 'with the default 25 s reserve, a short loop goes straight to the answer')
  const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(route, /turn\.liveFact\?\{\.\.\.basePolicy,answerReserveMs:LIVE_FACT_ANSWER_RESERVE_MS\}:basePolicy/)
})
