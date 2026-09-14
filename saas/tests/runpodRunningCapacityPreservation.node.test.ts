import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync(new URL('../lib/ai/cos/runpodLifecycle.ts', import.meta.url), 'utf8')

test('running pod contract mismatch preserves scarce GPU allocation instead of stopping it', () => {
  const guard = lifecycle.indexOf('if (before.running && !contractMatches)')
  const deferred = lifecycle.indexOf('startup_contract_repair_deferred_running_capacity_preserved', guard)
  const configure = lifecycle.indexOf('const configured = await configurePodStartupContract(options)', guard)
  assert.ok(guard >= 0, 'running mismatch guard must exist')
  assert.ok(deferred > guard, 'running mismatch must record deferred repair')
  assert.ok(configure > deferred, 'startup contract mutation must occur only after the running guard returns')

  const runningGuardBlock = lifecycle.slice(guard, configure)
  assert.doesNotMatch(runningGuardBlock, /await stopPod\(/)
  assert.match(runningGuardBlock, /started:\s*true/)
  assert.match(runningGuardBlock, /startupContractRepaired:\s*false/)
})

test('explicit stop API remains available for owner-controlled shutdowns', () => {
  const explicitStop = lifecycle.indexOf('export async function stopRunpodReasoner')
  assert.ok(explicitStop >= 0)
  assert.match(lifecycle.slice(explicitStop), /await stopPod\(\)/)
})
