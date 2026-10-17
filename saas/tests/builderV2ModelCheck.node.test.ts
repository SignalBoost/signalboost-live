// saas/tests/builderV2ModelCheck.node.test.ts
// Bounded model checking of the Builder V2 loop (see builderV2ModelCheck.harness.ts). Every model reply sequence
// up to depth 3 from 13 behaviours (good/wrong/broken writes, edits, reads, runs, early finish, junk, batches,
// cut-off batches, timeouts), on an empty and a prefilled workspace, and resumed at every slice boundary.
// Locally verified to depth 5 (1,945,112 runs, 0 violations); CI runs depth 3 (8,281 runs, about 2 s).
import test from 'node:test'
import assert from 'node:assert/strict'
import { explore, ALPHABET, objective } from './builderV2ModelCheck.harness.ts'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('no reply sequence produces a false pass, an invalid checkpoint, a rejected resume, a blind overwrite or a crash', async () => {
  const { runs, violations } = await explore(3)
  assert.ok(runs > 8000, `explored ${runs} runs`)
  assert.deepEqual(violations.slice(0, 5), [])
})

test('liveness: a correct batch and a repaired broken file both complete', async () => {
  const run = async (keys: string[]) => {
    const workspace = new InMemoryBuilderWorkspace()
    const replies = keys.map(key => ALPHABET[key])
    let at = 0
    const runner = { async run({ files }: { files: readonly { path: string; content: string }[] }) {
      const ok = files.find(f => f.path === 'src/a.js')?.content === 'module.exports = 1\n' && files.some(f => f.path === 'index.js')
      return { exitCode: ok ? 0 : 1, stdout: '', stderr: '', timedOut: false }
    } }
    return new BuilderV2Agent({ async generate() { const r = replies[at++]; if (r instanceof Error) throw r; return r ?? null } },
      new BuilderV2Dispatcher(workspace, runner), workspace).run({ workspaceId: 'l', objective, maxSteps: 8 })
  }
  assert.equal((await run(['batch'])).ok, true)
  assert.equal((await run(['wBroken', 'wIdx', 'fixBroken'])).ok, true)
  assert.equal((await run(['wWrong', 'wIdx', 'fixWrong'])).ok, true)
})
