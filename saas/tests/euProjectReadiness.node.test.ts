import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyEuProjectEvidence } from '../lib/security/euProjectReadiness.ts'
const primary='qpblefwtnbivuusxmabv'
test('EU hosting claims require independently identified European project',()=>{
 assert.equal(verifyEuProjectEvidence(null, primary).ready,false)
 assert.equal(verifyEuProjectEvidence({projectRef:primary,projectRegion:'eu-central-1',verifiedAt:'2026-10-09'},primary).ready,false)
 assert.equal(verifyEuProjectEvidence({projectRef:'abcdefghijklmnopqrst',projectRegion:'us-west-2',verifiedAt:'2026-10-09'},primary).ready,false)
 const yes=verifyEuProjectEvidence({projectRef:'abcdefghijklmnopqrst',projectRegion:'eu-central-1',verifiedAt:'2026-10-09'},primary)
 assert.deepEqual(yes,{ready:true,reason:'eu_project_verified_region_only'})
})
