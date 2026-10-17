import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { inspectCommercialLot } from '../../saas/lib/billing/phase4CommercialWalletAudit.mjs'

const result = spawnSync('python3', ['verification/university/commercial_wallet_smt.py'], { encoding: 'utf8' })
if (result.status !== 0) throw Error(result.stderr || 'SMT generator failed')
const findings = JSON.parse(result.stdout)
const lot = { lotId: 'test-lot', organizationId: 'test-org', grantedCredits: 100 }
function journal([reserved, captured, released, reversed]) {
  const entries = [{lotId:lot.lotId, organizationId:lot.organizationId, operation:'grant', amountCredits:100, eventKey:'grant-0'}]
  for (const [operation, value] of [['reserve',reserved],['capture',captured],['release',released],['refund',reversed]]) {
    if (value > 0) entries.push({lotId:lot.lotId,organizationId:lot.organizationId,operation,amountCredits:value,eventKey:operation+'-0'})
  }
  return entries
}
for (const scenario of findings.cases) {
  test('SMT University wallet: ' + scenario.name, () => {
    const run = () => inspectCommercialLot(lot, journal(scenario.values))
    if (!scenario.valid) return assert.throws(run)
    const actual = run()
    const [r,c,l,v] = scenario.values
    assert.deepEqual(actual, {
      availableCredits: 100-r+l-v,
      heldCredits: r-c-l,
      consumedCredits: c,
      reversedCredits: v
    })
  })
}
test('SMT proofs are successful', () => assert.match(findings.proof, /UNSAT/))
test('foreign organization and replay event fail closed', () => {
  const base = journal([10,0,0,0])
  assert.throws(() => inspectCommercialLot(lot, [...base, {...base[1], eventKey:'foreign', organizationId:'other-org'}]))
  assert.throws(() => inspectCommercialLot(lot, [...base, {...base[1]}]))
})
