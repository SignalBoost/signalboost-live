import test from 'node:test'
import assert from 'node:assert/strict'
import { selectBuilderExecutionProvider as select } from '../lib/builder/provider-selection.ts'
const authorized={metadata:{builderProvider:'cursor-cloud',platformRepair:true,cursorRepository:'SignalBoost/signalboost-live'},ownerAuthorized:true,jobKind:'standard',cursorCredentialConfigured:true}
test('explicit owner-approved repo can select Cursor',()=>assert.equal(select(authorized).provider,'cursor-cloud'))
test('customer BYOI and non-owner jobs are never sent to Cursor',()=>{
 for(const ownerAuthorized of [false]) assert.equal(select({...authorized,ownerAuthorized}).provider,'internal-v2')
 for(const jobKind of ['debug_file','arbitrary']) assert.equal(select({...authorized,jobKind}).provider,'internal-v2')
})
test('no credential or no repository consent falls back to internal V2',()=>{
 assert.equal(select({...authorized,cursorCredentialConfigured:false}).provider,'internal-v2')
 assert.equal(select({...authorized,metadata:{...authorized.metadata,platformRepair:false}}).provider,'internal-v2')
 assert.equal(select({...authorized,metadata:{...authorized.metadata,cursorRepository:'other/repo'}}).provider,'internal-v2')
})
test('default remains internal V2',()=>assert.equal(select({...authorized,metadata:{}}).provider,'internal-v2'))
