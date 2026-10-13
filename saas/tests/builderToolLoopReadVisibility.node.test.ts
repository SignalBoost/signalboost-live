// saas/tests/builderToolLoopReadVisibility.node.test.ts
//
// Production 2026-10-12, 9 of the latest 20 Builder jobs ended builder_stalled_repeated_inspection with the same trace:
// `read_file:ok > read_file:builder_repeated_tool_call ...`. Two defects in what the resident could see:
//   1. read_file reported lines 1-200 but the prompt cut the content at 8,000 characters (~line 90 on a typical file),
//      so the resident knew of lines it never saw and could only ask for the same read again, which was rejected.
//   2. After about three more steps, the oldest RESULTS were dropped to fit the prompt, so the read content vanished
//      while the read stayed "already inspected", and re-reading was still rejected.
// Builder now returns only whole lines the prompt can show (with nextStartLine), keeps source read since the last
// change in its own prompt section, and allows a re-read only when that content is no longer shown.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const LINES = Array.from({ length: 400 }, (_, i) => `export const value${i} = "line-${i}-marker" // ${'x'.repeat(40)}`)
const READ = { type: 'tool', toolId: 'read_file', input: { path: 'app/api/route.ts' } }

async function residency(script: readonly unknown[], stderr = 'E'.repeat(16_000)) {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'app/api/route.ts', LINES.join('\n'))
  await workspace.writeFile('w', 'tests/route.node.test.ts', "import test from 'node:test'\ntest('a', () => {})\n")
  const prompts: string[] = []
  const ai = { async generate(input: { prompt: string }) {
    prompts.push(input.prompt)
    return JSON.stringify(script[prompts.length - 1] ?? { type: 'answer', answer: 'stop' })
  } }
  const runner = { async run() { return { exitCode: 1, stdout: '', stderr, timedOut: false } } }
  const result = await new BuilderToolLoop(ai as any, workspace, runner as any).run({
    objective: 'Fix the bug in app/api/route.ts', workspaceId: 'w', maxRounds: 12, deadlineAtMs: Date.now() + 10_000_000, minimumStepMs: 1,
  })
  return { result, prompts }
}

// The CURRENT WORKSPACE FILES snapshot holds only the first 8 workspace files; in a repository workspace with
// hundreds of files the file being repaired is almost never one of them, so it is excluded here.
const withoutSnapshot = (prompt: string) => {
  const start = prompt.indexOf('CURRENT WORKSPACE FILES')
  const end = prompt.indexOf('INTERFACE CONSISTENCY', start)
  return start < 0 || end < 0 ? prompt : prompt.slice(0, start) + prompt.slice(end)
}
const shown = (prompt: string, line: number) => withoutSnapshot(prompt).includes(`line-${line}-marker`)

test('every line a read reports is shown to the resident, and the next range is named', async () => {
  const { result, prompts } = await residency([READ])
  const output = result.trace[0].output as { startLine: number; endLine: number; nextStartLine?: number; content: string }
  assert.ok(output.endLine < 200, `a 400-line file of long lines cannot fit 200 lines, got endLine ${output.endLine}`)
  assert.equal(output.nextStartLine, output.endLine + 1)
  for (let line = 0; line < output.endLine; line += 1) assert.ok(shown(prompts[1], line), `line ${line + 1} reported read but not shown`)
  assert.ok(!output.content.includes('[truncated]'))
})

test('reading the next range is progress, not a repeat', async () => {
  const first = await residency([READ])
  const next = (first.result.trace[0].output as { nextStartLine: number }).nextStartLine
  const { result, prompts } = await residency([READ, { type: 'tool', toolId: 'read_file', input: { path: 'app/api/route.ts', startLine: next } }])
  assert.equal(result.trace[1].ok, true, String(result.trace[1].error))
  const endLine = (result.trace[1].output as { endLine: number }).endLine
  assert.ok(shown(prompts[2], 0) && shown(prompts[2], endLine - 1), 'both ranges stay visible together')
})

test('source read stays visible after later runs and listings', async () => {
  const script = [READ,
    { type: 'tool', toolId: 'run', input: { command: 'node --test tests/route.node.test.ts' } },
    { type: 'tool', toolId: 'list_files', input: {} },
    { type: 'tool', toolId: 'run', input: { command: 'node --test' } },
  ]
  const { prompts } = await residency(script)
  assert.ok(shown(prompts[4], 0) && shown(prompts[4], 50), 'the read source is still in the prompt four steps later')
})

test('a read whose content is still shown is rejected as a repeat; it is not re-read', async () => {
  const { result } = await residency([READ, READ])
  assert.equal(result.trace[1].ok, false)
  assert.ok(String(result.trace[1].error).startsWith('builder_repeated_tool_call:read_file'))
})

test('a read whose content is no longer shown may be read again', async () => {
  // Fill the read-source budget with later ranges so the first range drops out of the prompt.
  const script: unknown[] = [READ]
  const first = await residency([READ])
  let start = (first.result.trace[0].output as { nextStartLine: number }).nextStartLine
  for (let i = 0; i < 3; i += 1) {
    script.push({ type: 'tool', toolId: 'read_file', input: { path: 'app/api/route.ts', startLine: start } })
    start += 90
  }
  script.push(READ)
  const { result, prompts } = await residency(script)
  const reread = result.trace[4]
  assert.ok(!shown(prompts[4], 0), 'precondition: the first range has dropped out of the prompt')
  assert.equal(reread.ok, true, String(reread.error))
})
// end of saas/tests/builderToolLoopReadVisibility.node.test.ts (if this line is missing, the paste was cut short)
