// saas/tests/cosAgentToolLoop.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCosAgentLoop, stripUnverifiedUrls, unsupportedAnswerNumbers, type AgentModelTurn } from '../lib/ai/cos/agentLoop/cosAgentLoop.ts'
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

