// saas/tests/builderV2ModelCheck.harness.ts
// Bounded model checking of the Builder V2 loop: every model reply sequence up to a depth, from an alphabet of
// good, broken and adversarial replies, with invariants asserted after every run and every resume.
import { BuilderV2Agent, builderV2Acceptance, validateBuilderV2ReceiptHistory, type BuilderV2Checkpoint, type BuilderV2Outcome } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

export const objective = 'Build app.\nCreate all 2 files:\n```text\napp/\n├── index.js\n└── src/\n    └── a.js\n```\n## Mandatory verification\nExecute all one commands:\n```bash\nnode index.js\n```'
const GOOD = 'module.exports = 1\n'
const WRONG = 'module.exports = 2\n'
const BROKEN = 'module.exports = (1\n'
const IDX = "require('./src/a.js')\n"
const tool = (action: object) => JSON.stringify({ type: 'tool', action })
const tools = (...actions: object[]) => JSON.stringify({ type: 'tools', actions })

export const ALPHABET: Record<string, string | Error> = {
  wGood: tool({ tool: 'write_file', path: 'src/a.js', content: GOOD }),
  wWrong: tool({ tool: 'write_file', path: 'src/a.js', content: WRONG }),
  wBroken: tool({ tool: 'write_file', path: 'src/a.js', content: BROKEN }),
  wIdx: tool({ tool: 'write_file', path: 'index.js', content: IDX }),
  fixBroken: tool({ tool: 'edit_file', path: 'src/a.js', search: '(1\n', replace: '1\n' }),
  fixWrong: tool({ tool: 'edit_file', path: 'src/a.js', search: '= 2', replace: '= 1' }),
  readA: tool({ tool: 'read_file', path: 'src/a.js' }),
  run: tool({ tool: 'run_tests', command: 'node index.js' }),
  finish: JSON.stringify({ type: 'finish', summary: 'done' }),
  junk: 'I will now write the files.',
  batch: tools({ tool: 'write_file', path: 'src/a.js', content: GOOD }, { tool: 'write_file', path: 'index.js', content: IDX }),
  cut: tools({ tool: 'write_file', path: 'index.js', content: IDX }, { tool: 'write_file', path: 'src/a.js', content: GOOD }).slice(0, 90),
  timeout: new Error('builder_turn_timeout'),
}

/** The real app passes iff index.js exists and src/a.js is exactly the good module. */
function runnerFor(workspace: InMemoryBuilderWorkspace, id: string, log: string[]): BuilderRunnerPort {
  return { async run({ files }) {
    const a = files.find(f => f.path === 'src/a.js')?.content
    const ok = a === GOOD && files.some(f => f.path === 'index.js')
    log.push(ok ? 'pass' : 'fail')
    return { exitCode: ok ? 0 : 1, stdout: '', stderr: ok ? '' : 'Error', timedOut: false }
  } }
}

export type Violation = { sequence: string[]; split?: number; invariant: string; detail: string }

/** A write that changed src/a.js before the model saw its existing content (read or conflict receipt). */
function blindOverwrite(outcome: BuilderV2Outcome, prefilled: boolean): string | null {
  if (!prefilled) return null
  let seen = false
  for (const r of outcome.steps) {
    const out = r.output as { path?: unknown; currentContent?: unknown } | undefined
    if (r.tool === 'read_file' && r.ok && out?.path === 'src/a.js') seen = true
    if (r.tool === 'write_file' && typeof out?.currentContent === 'string' && out.path === 'src/a.js') seen = true
    // The agent forgets observed content after an edit, so a later full write needs a fresh read (Codex on #4625).
    if (r.tool === 'edit_file' && r.changed && out?.path === 'src/a.js') seen = false
    if (r.tool === 'write_file' && r.changed && out?.path === 'src/a.js' && !seen) return JSON.stringify(r)
  }
  return null
}

async function runOnce(workspace: InMemoryBuilderWorkspace, id: string, replies: (string | Error)[], maxSteps: number, checkpoint?: BuilderV2Checkpoint) {
  const log: string[] = []
  let at = 0
  const ai = { async generate() {
    const reply = replies[at++]
    if (reply instanceof Error) throw reply
    return reply ?? null
  } }
  const agent = new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runnerFor(workspace, id, log)), workspace)
  const outcome = await agent.run({ workspaceId: id, objective, maxSteps, checkpoint })
  return { outcome, consumed: at }
}

async function check(sequence: string[], outcome: BuilderV2Outcome, workspace: InMemoryBuilderWorkspace, id: string, violations: Violation[], split?: number, prefilled = false) {
  const blind = blindOverwrite(outcome, prefilled)
  if (blind) violations.push({ sequence, split, invariant: 'no-blind-overwrite', detail: blind })
  const files = (await workspace.listFiles(id)).map(f => f.path)
  const a = (await workspace.readFile(id, 'src/a.js'))?.content
  if (outcome.ok) {
    const acceptance = builderV2Acceptance(objective, files, outcome.steps)
    if (!acceptance.satisfied) violations.push({ sequence, split, invariant: 'no-false-pass', detail: JSON.stringify(acceptance) })
    if (a !== GOOD || !files.includes('index.js')) violations.push({ sequence, split, invariant: 'no-false-pass', detail: `a=${JSON.stringify(a)} files=${files}` })
  }
  if (outcome.checkpoint && !validateBuilderV2ReceiptHistory(outcome.checkpoint)) {
    violations.push({ sequence, split, invariant: 'checkpoint-valid', detail: outcome.reason })
  }
  for (const r of outcome.steps) if (r.changed && !r.ok) violations.push({ sequence, split, invariant: 'receipt-consistent', detail: JSON.stringify(r) })
}

export async function explore(depth: number, maxSteps = 8): Promise<{ runs: number; violations: Violation[] }> {
  const keys = Object.keys(ALPHABET)
  const violations: Violation[] = []
  let runs = 0
  const total = keys.length ** depth
  for (let n = 0; n < total; n++) {
    const sequence: string[] = []
    for (let d = 0, v = n; d < depth; d++, v = Math.floor(v / keys.length)) sequence.push(keys[v % keys.length])
    const replies = sequence.map(k => ALPHABET[k])
    // Single run, on an empty workspace and on one whose src/a.js already exists unseen.
    try {
      const ws = new InMemoryBuilderWorkspace()
      const { outcome } = await runOnce(ws, 'w', replies, maxSteps)
      await check(sequence, outcome, ws, 'w', violations)
      runs++
      const pre = new InMemoryBuilderWorkspace()
      await pre.writeFile('w', 'src/a.js', WRONG)
      const prefilled = await runOnce(pre, 'w', replies, maxSteps)
      await check(sequence, prefilled.outcome, pre, 'w', violations, undefined, true)
      runs++
      // Resume after every possible slice boundary with the saved checkpoint, on the same workspace.
      for (let split = 1; split < depth; split++) {
        const ws2 = new InMemoryBuilderWorkspace()
        const first = await runOnce(ws2, 'w', replies, split)
        if (first.outcome.ok || !first.outcome.checkpoint) continue
        if (!['builder_v2_step_budget', 'builder_v2_model_unavailable', 'builder_v2_cancelled'].includes(first.outcome.reason)) continue
        const second = await runOnce(ws2, 'w', replies.slice(first.consumed), maxSteps, first.outcome.checkpoint)
        if (['builder_v2_checkpoint_invalid', 'builder_v2_checkpoint_workspace_changed', 'builder_v2_checkpoint_scope_mismatch'].includes(second.outcome.reason)) {
          violations.push({ sequence, split, invariant: 'resume-accepted', detail: second.outcome.reason })
        }
        await check(sequence, second.outcome, ws2, 'w', violations, split)
        runs++
      }
    } catch (error) {
      violations.push({ sequence, invariant: 'no-crash', detail: error instanceof Error ? error.stack ?? error.message : String(error) })
    }
  }
  return { runs, violations }
}
