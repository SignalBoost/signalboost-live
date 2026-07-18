import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const navbar = () => readFileSync(new URL('../components/PremiumCustomerNavbarV2.tsx', import.meta.url), 'utf8')

test('Supervisor SOC emergency navigation is persistent and owner/admin gated', () => {
  const source = navbar()

  assert.match(source, /const supervisorSocLabel = 'Supervisor SOC \(Kill Switch\)'/)
  assert.match(source, /ownerAccess \? <Link href="\/dashboard\/supervisor"/)
  assert.match(source, /🛑/)
  assert.match(source, /setMobileOpen\(false\)/)
})
