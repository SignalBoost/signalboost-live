// saas/tests/builderRepositoryRepairV2.node.test.ts
//
// The repository repair lane on Builder V2: a repair that pauses at the end of a slice resumes in a rebuilt checkout
// with the same V2 workspace digest, so the agent's own checkpoint is accepted and the repair continues instead of
// failing (production 2026-10-21..28: 70 turn timeouts and 39 spent slice budgets ended repairs outright).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuilderV2Agent, builderV2Acceptance } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle } from '../lib/builder/agent-v2-job-cycle.ts'
import { workspaceDigest } from '../lib/builder/checkpoint.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { createRepositoryRepairProofController } from '../lib/builder/repository-repair-proof-controller.ts'
import {
  isRepositoryRepairCheckpoint, repositoryEditCopyPath, repositoryRepairLeaseStore, repositoryRepairTraceFromReceipts,
  repositoryRepairV2Objective, restoreRepositoryRepairCheckout, type RepositoryRepairCheckpoint,
} from '../lib/builder/repository-repair-v2.ts'
import type { BuilderAiPort, BuilderFile, BuilderRunnerPort, BuilderWorkspacePort } from '../lib/builder/contracts.ts'

const PINNED: Record<string, string> = {
  'package.json': '{"name":"saas"}',
  'lib/app.ts': 'export const state = "broken"',
  'lib/other.ts': 'export const other = 1',
  'tests/app.test.ts': 'test("app", () => {})',
}

/** A repository checkout like the sandbox session: pinned files, a growing visible set, commands on its live tree. */
class FakeCheckout implements BuilderWorkspacePort, BuilderRunnerPort {
  readonly stagesWorkspaceFiles = false
  readonly files = new Map(Object.entries(PINNED))
  private readonly visible = new Set(['package.json', 'lib/app.ts'])
  commands: string[] = []
  visibleFiles() { return [...this.visible].sort() }
  async listFiles() { return this.visibleFiles().map(path => ({ path, updatedAt: 0 })) }
  async searchFiles(_: string, query: string) {
    const found = [...this.files].filter(([, content]) => content.includes(query)).map(([path]) => path)
    for (const path of found) this.visible.add(path)
    return found
  }
  async readFile(_: string, path: string): Promise<BuilderFile | null> {
    const content = this.files.get(path)
    if (content === undefined) return null
    this.visible.add(path)
    return { path, content, updatedAt: 0 }
  }
  async writeFile(_: string, path: string, content: string): Promise<BuilderFile> {
    this.files.set(path, content)
    this.visible.add(path)
    return { path, content, updatedAt: 0 }
  }
  async editFile(workspaceId: string, path: string, search: string, replace: string): Promise<BuilderFile> {
    const current = this.files.get(path)
    if (current === undefined || !current.includes(search)) throw new Error('builder_edit_search_not_found')
    return this.writeFile(workspaceId, path, current.replace(search, replace))
  }
  async run(input: { command: string; files: readonly BuilderFile[] }) {
    assert.equal(input.files.length, 0, 'the checkout runs its own tree; nothing is staged')
    this.commands.push(input.command)
    const fixed = this.files.get('lib/app.ts')?.includes('fixed')
    return fixed
      ? { exitCode: 0, stdout: '# pass 1\n# fail 0\n', stderr: '', timedOut: false }
      : { exitCode: 1, stdout: '# pass 0\n# fail 1\n', stderr: 'AssertionError: expected fixed', timedOut: false }
  }
}

class ScriptedAi implements BuilderAiPort {
  calls = 0
  constructor(private readonly controls: readonly string[]) {}
  async generate() { return this.controls[this.calls++] ?? null }
}
const tool = (action: Record<string, unknown>) => JSON.stringify({ type: 'tool', action })
const PROOF = 'node --experimental-transform-types --test tests/app.test.ts'

/** The lane's slice: the durable edit copies, the proof controller and a V2 cycle over the lease store. */
async function slice(input: {
  checkout: FakeCheckout
  copies: InMemoryBuilderWorkspace
  ai: BuilderAiPort
  claimGeneration: number
  saved: RepositoryRepairCheckpoint | null
  stored: RepositoryRepairCheckpoint[]
}) {
  const resume = input.saved?.repositoryRepair ?? null
  const edited = new Set(resume?.editedPaths ?? [])
  if (resume) await restoreRepositoryRepairCheckout({ checkout: input.checkout, copies: input.copies, workspaceId: 'ws', state: resume })
  const durable: BuilderWorkspacePort = {
    listFiles: id => input.checkout.listFiles(id),
    readFile: (id, path) => input.checkout.readFile(id, path),
    searchFiles: (id, query) => input.checkout.searchFiles(id, query),
    async writeFile(id, path, content) {
      const file = await input.checkout.writeFile(id, path, content)
      await input.copies.writeFile(id, repositoryEditCopyPath(file.path), file.content)
      edited.add(file.path)
      return file
    },
    async editFile(id, path, search, replace) {
      const file = await input.checkout.editFile(id, path, search, replace)
      await input.copies.writeFile(id, repositoryEditCopyPath(file.path), file.content)
      edited.add(file.path)
      return file
    },
  }
  const controller = createRepositoryRepairProofController({ workspace: durable, runner: input.checkout, proofCommand: PROOF, state: resume?.proof ?? null })
  if (!resume) assert.equal((await controller.baseline('ws')).state, 'failed')
  const objective = resume?.objective ?? repositoryRepairV2Objective('Fix the failing app test.', controller.proofCommand)
  const store = repositoryRepairLeaseStore({
    jobId: 'job-1', claimGeneration: input.claimGeneration, workspaceId: 'ws', objective, checkpoint: input.saved,
    repositoryState: () => ({ objective, visiblePaths: input.checkout.visibleFiles(), editedPaths: [...edited], proof: controller.state() }),
    persist: async checkpoint => { input.stored.push(JSON.parse(JSON.stringify(checkpoint))); return true },
  })
  const agent = new BuilderV2Agent(input.ai, new BuilderV2Dispatcher(controller.workspace, controller.runner), controller.workspace)
  const cycle = await runBuilderV2JobCycle({ jobId: 'job-1', claimGeneration: input.claimGeneration, store, agent, maxSteps: 2 })
  return { cycle, store, controller }
}

test('a repair paused at its slice budget resumes in a rebuilt checkout and finishes the fail, edit, pass cycle', async () => {
  const copies = new InMemoryBuilderWorkspace()
  const stored: RepositoryRepairCheckpoint[] = []
  const first = new FakeCheckout()
  const firstAi = new ScriptedAi([
    tool({ tool: 'read_file', path: 'lib/other.ts' }),
    tool({ tool: 'edit_file', path: 'lib/app.ts', search: 'broken', replace: 'half-fixed' }),
  ])
  const one = await slice({ checkout: first, copies, ai: firstAi, claimGeneration: 1, saved: null, stored })
  assert.equal(one.cycle.status, 'paused', one.cycle.reason)
  const saved = one.store.lastSaved()!
  assert.ok(isRepositoryRepairCheckpoint(saved))
  assert.deepEqual(saved.repositoryRepair.editedPaths, ['lib/app.ts'])
  assert.deepEqual(saved.repositoryRepair.visiblePaths, ['lib/app.ts', 'lib/other.ts', 'package.json'])
  assert.equal(saved.repositoryRepair.proof?.baseline, 'failed')

  // The next slice gets a brand-new checkout at the pinned commit: the edit and the extra visible file are gone.
  const second = new FakeCheckout()
  assert.equal(second.files.get('lib/app.ts'), 'export const state = "broken"')
  const persisted = JSON.parse(JSON.stringify(saved)) as RepositoryRepairCheckpoint
  const secondAi = new ScriptedAi([
    tool({ tool: 'edit_file', path: 'lib/app.ts', search: 'half-fixed', replace: 'fixed' }),
    tool({ tool: 'run_tests', command: PROOF }),
    JSON.stringify({ type: 'finish', summary: 'Repaired lib/app.ts; the failing test passes.' }),
  ])
  const two = await slice({ checkout: second, copies, ai: secondAi, claimGeneration: 2, saved: persisted, stored })
  // Before any new work the rebuilt checkout matched the paused one, so V2 accepted its checkpoint instead of
  // failing with builder_v2_checkpoint_workspace_changed.
  assert.notEqual(two.cycle.reason, 'builder_v2_checkpoint_workspace_changed')
  if (two.cycle.status === 'paused') {
    const three = await slice({ checkout: new FakeCheckout(), copies, ai: secondAi, claimGeneration: 3, saved: JSON.parse(JSON.stringify(two.store.lastSaved())), stored })
    assert.equal(three.cycle.status, 'verified', three.cycle.reason)
  } else {
    assert.equal(two.cycle.status, 'verified', two.cycle.reason)
  }
  // Host proof on the final source.
  const finalCheckout = new FakeCheckout()
  await restoreRepositoryRepairCheckout({ checkout: finalCheckout, copies, workspaceId: 'ws', state: stored.at(-1)!.repositoryRepair })
  assert.equal(finalCheckout.files.get('lib/app.ts'), 'export const state = "fixed"')
  const finalProof = await createRepositoryRepairProofController({ workspace: finalCheckout, runner: finalCheckout, proofCommand: null, state: stored.at(-1)!.repositoryRepair.proof }).finalProof('ws')
  assert.equal(finalProof.passed, true)
})

test('a rebuilt checkout has the paused checkout\'s V2 digest only when every edit copy is replayed', async () => {
  const copies = new InMemoryBuilderWorkspace()
  const paused = new FakeCheckout()
  await paused.readFile('ws', 'lib/other.ts')
  await paused.writeFile('ws', 'lib/app.ts', 'export const state = "fixed"')
  await copies.writeFile('ws', repositoryEditCopyPath('lib/app.ts'), 'export const state = "fixed"')
  await paused.writeFile('ws', 'tests/new.test.ts', 'test("new", () => {})')
  await copies.writeFile('ws', repositoryEditCopyPath('tests/new.test.ts'), 'test("new", () => {})')
  const state = { objective: 'o', visiblePaths: paused.visibleFiles(), editedPaths: ['lib/app.ts', 'tests/new.test.ts'], proof: null }

  const rebuilt = new FakeCheckout()
  await restoreRepositoryRepairCheckout({ checkout: rebuilt, copies, workspaceId: 'ws', state })
  assert.equal(await workspaceDigest(rebuilt, 'ws'), await workspaceDigest(paused, 'ws'))

  const missing = new InMemoryBuilderWorkspace()
  await assert.rejects(restoreRepositoryRepairCheckout({ checkout: new FakeCheckout(), copies: missing, workspaceId: 'ws', state }), /builder_repository_repair_edit_copy_missing/)
})

test('the lease store refuses a stale claim and stamps every checkpoint with the repository state', async () => {
  const persisted: RepositoryRepairCheckpoint[] = []
  let visible = ['a.ts']
  const store = repositoryRepairLeaseStore({
    jobId: 'job', claimGeneration: 4, workspaceId: 'ws', objective: 'obj', checkpoint: null,
    repositoryState: () => ({ objective: 'obj', visiblePaths: visible, editedPaths: [], proof: null }),
    persist: async checkpoint => { persisted.push(checkpoint); return true },
  })
  const checkpoint = { version: 2, workspaceId: 'ws', objectiveDigest: 'd', workspaceDigest: 'w', steps: [], revision: 0, verifiedRevision: -1, unproductive: 0, lastReceipt: null } as never
  assert.equal(await store.save('job', 3, checkpoint), false)
  assert.equal(await store.save('other', 4, checkpoint), false)
  visible = ['a.ts', 'b.ts']
  assert.equal(await store.save('job', 4, checkpoint), true)
  assert.deepEqual(persisted[0].repositoryRepair.visiblePaths, ['a.ts', 'b.ts'])
  assert.equal(store.lastSaved(), persisted[0])
  assert.deepEqual(await store.load('job'), { workspaceId: 'ws', objective: 'obj', claimGeneration: 4, checkpoint: null })
})

test('V2 receipts become the trace the repair evidence reads, adding nothing a receipt does not record', () => {
  const trace = repositoryRepairTraceFromReceipts([
    { tool: 'run_tests', ok: false, changed: false, output: { exitCode: 1, timedOut: false, requestedCommand: PROOF, stdout: '', stderr: 'boom' }, error: 'builder_tests_failed' },
    { tool: 'edit_file', ok: true, changed: true, output: { path: 'lib/app.ts' } },
    { tool: 'run_tests', ok: false, changed: false, output: { exitCode: 124, timedOut: true, requestedCommand: PROOF }, error: 'builder_test_timeout' },
    { tool: 'run_tests', ok: true, changed: false, output: { exitCode: 0, timedOut: false, requestedCommand: PROOF } },
  ])
  assert.deepEqual(trace.map(item => [item.toolId, item.ok, item.input.command ?? item.input.path, item.failureClass ?? null]), [
    ['run', false, PROOF, 'test'],
    ['edit_file', true, 'lib/app.ts', null],
    ['run', false, PROOF, null],
    ['run', true, PROOF, null],
  ])
})

test('the dispatcher stages no files for a runner that executes its own checkout', async () => {
  const checkout = new FakeCheckout()
  let reads = 0
  const counting: BuilderWorkspacePort = { ...checkout, listFiles: id => checkout.listFiles(id), readFile: (id, path) => { reads++; return checkout.readFile(id, path) },
    writeFile: (id, path, content) => checkout.writeFile(id, path, content), editFile: (id, path, s, r) => checkout.editFile(id, path, s, r) }
  const receipt = await new BuilderV2Dispatcher(counting, checkout).dispatch('ws', { tool: 'run_tests', command: PROOF })
  assert.equal(reads, 0)
  assert.equal(receipt.ok, false)
  assert.deepEqual(checkout.commands, [PROOF])
})

test('the repair lane is V2 only: no V1 tool loop, a host baseline before any model call, a host proof after', () => {
  const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(repair, /BuilderToolLoop|tool-loop\.ts/)
  const baseline = repair.indexOf('await proofController.baseline(input.workspaceId)')
  const agent = repair.indexOf('new BuilderV2Agent(')
  const finalProof = repair.indexOf('await proofController.finalProof(input.workspaceId)')
  const publish = repair.indexOf('await publishSignalBoostRepositoryRepair(')
  assert.ok(baseline > 0 && agent > baseline && finalProof > agent && publish > finalProof)
})

test('a node test run with node options before --test is behavioral repair proof', () => {
  const objective = repositoryRepairV2Objective('Fix the failing app test.', PROOF)
  const steps = [
    { tool: 'edit_file' as const, ok: true, changed: true, output: { path: 'lib/app.ts' } },
    { tool: 'run_tests' as const, ok: true, changed: false, output: { exitCode: 0, timedOut: false, requestedCommand: PROOF, stdout: '# pass 1\n# fail 0\n' } },
  ]
  assert.equal(builderV2Acceptance(objective, ['lib/app.ts'], steps).satisfied, true)
  const syntaxOnly = [steps[0], { ...steps[1], output: { ...steps[1].output, requestedCommand: 'node --check lib/app.js' } }]
  assert.equal(builderV2Acceptance('Fix the failing app test.', ['lib/app.ts'], syntaxOnly).satisfied, false)
})

test('the continuation migration admits only repair checkpoints and runs through the Hub (no BEGIN/COMMIT)', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261028130000_builder_repository_repair_v2_continuation.sql', import.meta.url), 'utf8')
  assert.match(migration, /jsonb_typeof\(p_checkpoint->'repositoryRepair'\) = 'object'/)
  assert.match(migration, /jsonb_typeof\(checkpoint->'repositoryRepair'\) = 'object'/)
  assert.doesNotMatch(migration, /^\s*(?:begin|commit)\s*;\s*$/im)
})
