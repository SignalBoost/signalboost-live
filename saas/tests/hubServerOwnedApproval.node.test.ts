import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8')
test('legacy Hub route cannot accept client-approved execution',()=>{
 const s=read('../app/api/hub/run/route.ts')
 assert.match(s,/approvalGranted: false/)
 assert.match(s,/approverRole: undefined/)
 assert.doesNotMatch(s,/approvalGranted: !!body\?\.approvalGranted/)
 assert.doesNotMatch(s,/approverRole: typeof body\?\.approverRole/)
})
test('elevated Hub route only grants approval to session-verified owner',()=>{
 const s=read('../app/api/hub/operator/run/route.ts')
 assert.match(s,/const elevated = body\?\.elevated === true && isOwner/)
 assert.match(s,/approvalGranted: decision\.autoApproved === true && elevated && isOwner/)
 assert.match(s,/approverRole: decision\.autoApproved === true && elevated && isOwner \? role : undefined/)
 assert.doesNotMatch(s,/!!body\?\.approvalGranted/)
 assert.doesNotMatch(s,/typeof body\?\.approverRole/)
})
