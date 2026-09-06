// saas/tests/builderRepositorySearch.node.test.ts
//
// search_files is the discovery capability the seeded file listing cannot provide. Seeding greps
// the symbols named in the failed build; it cannot anticipate a symbol the model only realises it
// needs three rounds in, nor an implementation committed to the wrong directory. These tests pin
// the two halves that matter: the model is offered the tool ONLY when the workspace can serve it,
// and the repository implementation widens no path boundary to serve it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { normalizeBuilderControlOutput } from '../lib/builder/control-adapter.ts'
import type { BuilderAiPort, BuilderRunnerPort, BuilderWorkspacePort } from '../lib/builder/contracts.ts'

class ScriptedBuilderAi implements BuilderAiPort {
  private cursor = 0
  readonly prompts: string[] = []
  private readonly actions: readonly string[]
  constructor(actions: readonly string[]) { this.actions = actions }
  async generate(input: { prompt: string }) {
    this.prompts.push(input.prompt)
    return this.actions[this.cursor++] ?? null
  }
}

const idleRunner: BuilderRunnerPort = {
  async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
}

/** An InMemory workspace that can answer search, standing in for the repository session. */
class SearchableWorkspace extends InMemoryBuilderWorkspace {
  readonly queries: string[] = []
  async searchFiles(workspaceId: string, query: string): Promise<readonly string[]> {
    this.queries.push(query)
    const listing = await this.listFiles(workspaceId)
    const hits: string[] = []
    for (const entry of listing) {
      const file = await this.readFile(workspaceId, entry.path)
      if (file?.content.includes(query)) hits.push(file.path)
    }
    return Object.freeze(hits)
  }
}

test('the model finds a symbol in a file the listing never surfaced, then reads it', async () => {
  const workspace = new SearchableWorkspace()
  await workspace.writeFile('user:search', 'wrong/place/module.ts', 'export function evaluateThing() { return true }')
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"search_files","input":{"query":"evaluateThing"}}',
    '{"type":"tool","toolId":"read_file","input":{"path":"wrong/place/module.ts"}}',
    '{"type":"answer","answer":"Located the symbol in wrong/place/module.ts."}',
  ])

  const result = await new BuilderToolLoop(ai, workspace, idleRunner).run({ objective: 'find evaluateThing', workspaceId: 'user:search' })

  assert.equal(result.ok, true)
  assert.deepEqual(result.trace.map(item => item.toolId), ['search_files', 'read_file'])
  assert.equal(result.trace[0]?.ok, true)
  assert.deepEqual(result.trace[0]?.output, ['wrong/place/module.ts'])
  assert.deepEqual(workspace.queries, ['evaluateThing'])
})

test('search_files is offered only when the workspace implements it', async () => {
  const searchable = new ScriptedBuilderAi(['{"type":"answer","answer":"done"}'])
  await new BuilderToolLoop(searchable, new SearchableWorkspace(), idleRunner)
    .run({ objective: 'inspect', workspaceId: 'user:offered' })
  assert.match(searchable.prompts[0] || '', /search_files/)

  const plain = new ScriptedBuilderAi(['{"type":"answer","answer":"done"}'])
  await new BuilderToolLoop(plain, new InMemoryBuilderWorkspace(), idleRunner)
    .run({ objective: 'inspect', workspaceId: 'user:withheld' })
  const tools = /TOOLS: (\[[^\]]*\])/.exec(plain.prompts[0] || '')?.[1] || ''
  assert.equal(tools.includes('search_files'), false)
})

test('a workspace without search refuses the call rather than silently answering nothing', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"search_files","input":{"query":"anything"}}',
    '{"type":"answer","answer":"stopped"}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, idleRunner).run({ objective: 'search', workspaceId: 'user:unavailable', maxRounds: 2 })

  // The tool was never offered, so the request is rejected by the loop before dispatch. What
  // matters is that it can never quietly succeed and return an empty result the model would
  // read as "this symbol does not exist anywhere".
  const searched = result.trace.filter(item => item.toolId === 'search_files')
  assert.equal(searched.length > 0, true)
  assert.equal(searched.every(item => item.ok === false), true)

  // Defense in depth: dispatch refuses outright even if the tool were ever offered by mistake.
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(source, /builder_search_unavailable/)
  assert.match(source, /toolId !== 'search_files' \|\| typeof this\.workspace\.searchFiles === 'function'/)
})

test('an empty or missing query is rejected before it reaches the workspace', async () => {
  const workspace = new SearchableWorkspace()
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"search_files","input":{"query":"   "}}',
    '{"type":"answer","answer":"stopped"}',
  ])
  await new BuilderToolLoop(ai, workspace, idleRunner).run({ objective: 'search', workspaceId: 'user:empty', maxRounds: 2 })
  assert.deepEqual(workspace.queries, [])
})

test('search_files survives the control envelopes real models emit', () => {
  const xml = normalizeBuilderControlOutput('<search_files query="evaluateThing" />')
  assert.deepEqual(JSON.parse(String(xml)), { type: 'tool', toolId: 'search_files', input: { query: 'evaluateThing' } })

  const prefixed = normalizeBuilderControlOutput('search_files {"query":"evaluateThing"}')
  assert.deepEqual(JSON.parse(String(prefixed)), { type: 'tool', toolId: 'search_files', input: { query: 'evaluateThing' } })
})

test('repository search greps the staged project and widens no path boundary', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('async searchFiles('), source.indexOf('async readFile('))

  // Same mechanism and same scope as seeding: git grep, literal, restricted to saas.
  assert.match(body, /'git', \['-C', REPOSITORY_ROOT, 'grep', '-l', '-F', '-e', query, '--', 'saas'\]/)
  // Every hit passes the shared path rules, and non-regular files (symlinks) are dropped.
  assert.match(body, /stripProjectPrefix\(line\)/)
  assert.match(body, /isRegularProjectFile\(path\)/)
  // Paths only. A search result must never carry file bodies.
  assert.equal(/base64|readFile\(/.test(body), false)
  // Bounded, so one broad query cannot flood the visible set or the prompt.
  assert.match(body, /found\.length >= MAX_SEARCH_RESULTS/)
  assert.match(source, /const MAX_SEARCH_RESULTS = \d+/)
})

test('the search regression is mandatory in the deployment gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/builderRepositorySearch\.node\.test\.ts/)
})
