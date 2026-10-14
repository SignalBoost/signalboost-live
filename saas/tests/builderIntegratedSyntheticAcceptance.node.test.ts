import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { acceptBuilderProductionRepair } from '../lib/builder/repository-production-acceptance.ts'

const action = (toolId: string, input: Record<string, unknown>) => JSON.stringify({ type: 'tool', toolId, input })
const checkNames = ['owner_builder_cli_capability', 'itmounts_open', 'live_snapshot', 'console_diagnostics', 'network_diagnostics', 'browser_close']
const browserResult = (failure?: string) => ({
  ok: !failure,
  schemaVersion: 'builder-playwright-cli-live-acceptance-v2' as const,
  checks: checkNames.map(name => ({ name, passed: name !== failure, detail: 'synthetic proof' })),
  privacy: { pageBodiesStored: false as const, credentialsStored: false as const, browserEvidenceStored: false as const, sandboxDestroyed: true as const },
})

test('synthetic end-to-end Builder contract: fail, checkpoint, repair, pass, verify and preserve rollback safety', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'synthetic-owner'
  const objective = 'Fix the existing add.js function: it must add both numbers. Preserve the regression test. Run:\\nnode --test add.test.js'
  await workspace.writeFile(workspaceId, 'add.js', 'module.exports = (a, b) => a - b;')
  await workspace.writeFile(workspaceId, 'add.test.js', "const test = require('node:test'); const assert = require('node:assert/strict'); test('adds both numbers', () => assert.equal(require('./add.js')(2, 3), 5));")
  const dir = await mkdtemp(join(tmpdir(), 'builder-integrated-acceptance-'))
  const commands: string[] = []
  let pause = false
  const runner = { async run(input: { command: string; files: readonly { path: string; content: string }[] }) {
    commands.push(input.command)
    for (const file of input.files) await writeFile(join(dir, file.path), file.content)
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, ['--test', 'add.test.js'], { cwd: dir, env, encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.error, undefined)
    if (commands.length === 1) pause = true
    return { exitCode: result.status!, stdout: result.stdout, stderr: result.stderr, timedOut: false }
  } }
  const actions = [
    action('read_file', { path: 'add.js' }),
    action('run', { command: 'node --test add.test.js' }),
    action('edit_file', { path: 'add.js', search: 'a - b', replace: 'a + b' }),
    action('run', { command: 'node --test add.test.js' }),
  ]
  const ai = { async generate() { assert.ok(actions.length); return actions.shift()! } }
  try {
    const initial = await new BuilderToolLoop(ai, workspace, runner).run({ objective, workspaceId, shouldPause: () => pause })
    assert.equal(initial.ok, false)
    if (initial.ok || !initial.checkpoint) assert.fail('expected durable checkpoint')
    assert.equal(initial.error, 'builder_job_paused')
    const saved = JSON.parse(JSON.stringify(initial.checkpoint))
    const resumed = await new BuilderToolLoop(ai, workspace, runner).run({ objective, workspaceId, checkpoint: saved })
    assert.equal(resumed.ok, true, JSON.stringify(resumed))
    assert.deepEqual(resumed.trace.filter(item => item.toolId === 'run').map(item => item.ok), [false, true])
    assert.equal(resumed.trace.filter(item => item.toolId === 'edit_file' && item.ok).length, 1)
    assert.equal((await workspace.readFile(workspaceId, 'add.js'))?.content, 'module.exports = (a, b) => a + b;')
    let restores = 0
    const snapshotPort = { restore: async () => { restores++; return { ok: true } } } as any
    const accepted = await acceptBuilderProductionRepair({
      preMergeSnapshotId: 'safe-baseline',
      snapshotPort,
      runAcceptance: async () => browserResult(),
    })
    assert.equal(accepted.outcome, 'accepted')
    assert.equal(restores, 0)
    const infrastructureFailure = await acceptBuilderProductionRepair({
      preMergeSnapshotId: 'safe-baseline',
      snapshotPort,
      runAcceptance: async () => browserResult('network_diagnostics'),
    })
    assert.equal(infrastructureFailure.outcome, 'unresolved')
    assert.equal(restores, 0)
    const regression = await acceptBuilderProductionRepair({
      preMergeSnapshotId: 'safe-baseline',
      snapshotPort,
      runAcceptance: async () => browserResult('live_snapshot'),
    })
    assert.equal(regression.outcome, 'rolled_back')
    assert.equal(restores, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
