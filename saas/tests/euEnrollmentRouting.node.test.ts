import test from 'node:test'
import assert from 'node:assert/strict'
import { proposedEnrollmentRegion,selectEnrollmentTarget } from '../lib/security/euEnrollmentRouting.ts'
const eu={region:'EU_EEA' as const,projectRef:'abcdefghijklmnopqrst',ready:true}
const us={region:'US' as const,projectRef:'qpblefwtnbivuusxmabv',ready:true}
test('all EU/EEA countries select European enrollment by default',()=>{
 for(const country of ['DE','FR','IT','ES','PT','PL','IE','NO','IS','LI'])
  assert.equal(proposedEnrollmentRegion(country),'EU_EEA')
 assert.equal(proposedEnrollmentRegion('US'),'US')
})
test('EU enrollment fails closed without verified target or confirmation',()=>{
 assert.throws(()=>selectEnrollmentTarget({countryCode:'DE',confirmedRegion:'US',targets:[eu,us]}),/downgrade/)
 assert.throws(()=>selectEnrollmentTarget({countryCode:'DE',confirmedRegion:'EU_EEA',targets:[us]}),/unavailable/)
 assert.throws(()=>selectEnrollmentTarget({countryCode:'DE',confirmedRegion:null,targets:[eu]}),/confirmation/)
 assert.deepEqual(selectEnrollmentTarget({countryCode:'DE',confirmedRegion:'EU_EEA',targets:[eu,us]}),eu)
})
