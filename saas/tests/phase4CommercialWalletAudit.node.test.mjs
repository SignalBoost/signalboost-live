import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectCommercialLot} from '../lib/billing/phase4CommercialWalletAudit.mjs'
const lot={lotId:'lot-a',organizationId:'org-a',grantedCredits:100}
const entry=(operation,amountCredits,eventKey)=>({lotId:'lot-a',organizationId:'org-a',operation,amountCredits,eventKey})
test('reserve capture release and refund reconcile without mixing BYOI',()=>{
 const result=inspectCommercialLot(lot,[
  entry('grant',100,'grant-1'),entry('reserve',60,'reserve-1'),
  entry('capture',40,'capture-1'),entry('release',20,'release-1'),
  entry('refund',10,'refund-1')])
 assert.deepEqual(result,{availableCredits:50,heldCredits:0,consumedCredits:40,reversedCredits:10})
})
test('rejects overspend, cross-tenant entries, replay and partial grant',()=>{
 const grant=entry('grant',100,'grant-1')
 for(const entries of [
  [grant,entry('reserve',101,'reserve-1')],
  [grant,entry('release',10,'release-1')],
  [grant,entry('capture',10,'capture-1')],
  [grant,entry('refund',101,'refund-1')],
  [grant,{...entry('reserve',10,'reserve-1'),organizationId:'org-b'}],
  [grant,entry('reserve',10,'grant-1')],
  [entry('grant',99,'grant-1')],
  [grant,entry('provider_charge',10,'provider-1')]
 ]) assert.throws(()=>inspectCommercialLot(lot,entries))
})
test('denies unsafe numbers and unknown accounting',()=>{
 assert.throws(()=>inspectCommercialLot({...lot,grantedCredits:1.5},[]))
 assert.throws(()=>inspectCommercialLot(lot,[entry('grant',100,'grant-1'),entry('reserve',NaN,'reserve-1')]))
})
