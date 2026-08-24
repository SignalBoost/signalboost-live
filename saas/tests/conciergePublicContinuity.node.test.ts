import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const conciergeRoute = readFileSync(join(process.cwd(), 'app/api/concierge/route.ts'), 'utf8')
const backupRuntime = readFileSync(join(process.cwd(), 'lib/cos-backup/runtime.ts'), 'utf8')

function position(source: string, token: string): number {
  const index = source.indexOf(token)
  assert.ok(index >= 0, `expected source to contain ${token}`)
  return index
}

test('public Concierge fails safe before internal Backup COS can run', () => {
  const failSafe = position(conciergeRoute, "public_delivery_internal_backup_forbidden")
  const backupCall = position(conciergeRoute, 'const backup = await runBackupCos(input, language)')
  assert.ok(failSafe < backupCall)
  assert.match(conciergeRoute, /source: 'cos-public-safe-fallback'/)
  assert.match(conciergeRoute, /continuity_mode: 'public_fail_safe'/)
})

test('healthy public Primary returns without the internal shadow-backup comparison', () => {
  const healthyReturn = position(conciergeRoute, 'if (primary && immediateReasons.length === 0) return primary')
  const backupCall = position(conciergeRoute, 'const backup = await runBackupCos(input, language)')
  assert.ok(healthyReturn < backupCall)
})

test('the forbidden backup path really is internal-brain-backed', () => {
  assert.match(backupRuntime, /export async function loadApprovedBrain/)
  assert.match(backupRuntime, /cos-core\/brain\.md/)
  assert.match(backupRuntime, /const brain = await loadApprovedBrain\(\)/)
})
