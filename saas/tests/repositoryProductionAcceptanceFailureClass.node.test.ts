import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptBuilderProductionRepair } from '../lib/builder/repository-production-acceptance.ts'

const names = ['owner_builder_cli_capability', 'itmounts_open', 'live_snapshot', 'console_diagnostics', 'network_diagnostics', 'browser_close']
const acceptance = (failed: string[] = [], omitted: string[] = []) => ({
  ok: failed.length === 0 && omitted.length === 0,
  schemaVersion: 'builder-playwright-cli-live-acceptance-v2' as const,
  checks: names.filter(name => !omitted.includes(name)).map(name => ({ name, passed: !failed.includes(name), detail: 'test' })),
  privacy: { pageBodiesStored: false as const, credentialsStored: false as const, browserEvidenceStored: false as const, sandboxDestroyed: true as const },
})

test('browser infrastructure failure never triggers production rollback', async () => {
  for (const failed of ['itmounts_open', 'console_diagnostics', 'network_diagnostics', 'browser_close']) {
    let restores = 0
    const result = await acceptBuilderProductionRepair({
      preMergeSnapshotId: 'deployment-previous',
      snapshotPort: { restore: async () => { restores++; return { ok: true } } } as any,
      runAcceptance: async () => acceptance([failed]),
    })
    assert.equal(result.outcome, 'unresolved', failed)
    assert.equal(restores, 0, failed)
  }
})

test('missing diagnostic evidence never triggers rollback', async () => {
  let restores = 0
  const result = await acceptBuilderProductionRepair({
    preMergeSnapshotId: 'deployment-previous',
    snapshotPort: { restore: async () => { restores++; return { ok: true } } } as any,
    runAcceptance: async () => acceptance([], ['network_diagnostics']),
  })
  assert.equal(result.outcome, 'unresolved')
  assert.equal(restores, 0)
})

test('completed browser page assertion failure retains rollback behavior', async () => {
  let restores = 0
  const result = await acceptBuilderProductionRepair({
    preMergeSnapshotId: 'deployment-previous',
    snapshotPort: { restore: async () => { restores++; return { ok: true } } } as any,
    runAcceptance: async () => acceptance(['live_snapshot']),
  })
  assert.equal(result.outcome, 'rolled_back')
  assert.equal(restores, 1)
})
