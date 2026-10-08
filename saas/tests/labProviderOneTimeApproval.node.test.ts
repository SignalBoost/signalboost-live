import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalMatchesProviderAction,providerApprovalActionDigest } from '../lib/ai/cos/labProviderOneTimeApproval.ts'
const scope={organizationId:'11111111-2222-4333-8444-555555555555',permanentArtifactId:'22222222-3333-4444-8555-666666666666',providerId:'provider-a',capability:'teacher.invoke' as const}
const partial={scope,harnessRunId:'run-1',actionId:'call-1',secretReference:`vault://${scope.organizationId}/teacher`}
const request={...partial,actionDigest:providerApprovalActionDigest(partial)}
const approval={approvalId:'approval-1',organizationId:scope.organizationId,permanentArtifactId:scope.permanentArtifactId,providerId:scope.providerId,capability:scope.capability,harnessRunId:'run-1',actionId:'call-1',secretReference:partial.secretReference,actionDigest:request.actionDigest,expiresAt:'2026-10-09T12:00:00Z',approvedByHuman:true,consumedAt:null,revokedAt:null}
const now=new Date('2026-10-08T12:00:00Z')
test('Phase 3: exact valid unconsumed human approval matches advisory redemption contract',()=>{
 assert.equal(approvalMatchesProviderAction(request,approval,now),true)
})
test('Phase 3: replay, revocation, absent human decision and expiry fail closed',()=>{
 for(const a of [null,{...approval,consumedAt:'2026-10-08T11:00:00Z'},{...approval,revokedAt:'2026-10-08T11:00:00Z'},{...approval,approvedByHuman:false},{...approval,expiresAt:'2026-10-08T11:00:00Z'}])assert.equal(approvalMatchesProviderAction(request,a,now),false)
})
test('Phase 3: cross tenant/artifact/provider/capability, action, run and vault changes fail closed',()=>{
 for(const r of [
 {...request,scope:{...scope,organizationId:'tenant-b'}},
 {...request,scope:{...scope,permanentArtifactId:'other'}},
 {...request,scope:{...scope,providerId:'other'}},
 {...request,scope:{...scope,capability:'compute.execute' as const}},
 {...request,actionId:'call-2'},
 {...request,harnessRunId:'run-2'},
 {...request,secretReference:`vault://${scope.organizationId}/other`},
 {...request,actionDigest:'0'.repeat(64)},
 ])assert.equal(approvalMatchesProviderAction(r,approval,now),false)
})
test('Phase 3: malformed approval id, altered digest and observation clock fail closed',()=>{
 assert.equal(approvalMatchesProviderAction(request,{...approval,approvalId:' '},now),false)
 assert.equal(approvalMatchesProviderAction(request,{...approval,actionDigest:'0'.repeat(64)},now),false)
 assert.equal(approvalMatchesProviderAction(request,approval,new Date(NaN)),false)
})
