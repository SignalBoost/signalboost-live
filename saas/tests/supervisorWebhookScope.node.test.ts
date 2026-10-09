import test from 'node:test'
import assert from 'node:assert/strict'
import {verifiedPlatformVercelWebhookScope} from '../lib/autonomous-supervisor/vercelWebhookScope.ts'
import {readFileSync} from 'node:fs'

test('Supervisor webhook refuses absent, foreign, or conflicting project identity',()=>{
 const owned='prj_OurPlatform123'
 assert.equal(verifiedPlatformVercelWebhookScope({payload:{deployment:{projectId:owned}}},owned),true)
 assert.equal(verifiedPlatformVercelWebhookScope({payload:{deployment:{name:'platform'}}},owned),false)
 assert.equal(verifiedPlatformVercelWebhookScope({payload:{deployment:{projectId:'prj_customer'}}},owned),false)
 assert.equal(verifiedPlatformVercelWebhookScope({payload:{deployment:{projectId:owned},project:{id:'prj_customer'}}},owned),false)
 assert.equal(verifiedPlatformVercelWebhookScope({payload:{deployment:{projectId:owned}}},undefined),false)
})
test('scope check precedes diagnosis and investigation staging',()=>{
 const route=readFileSync('app/api/autonomous-supervisor/vercel/route.ts','utf8')
 assert.ok(route.indexOf('verifiedPlatformVercelWebhookScope(body')<route.indexOf('normalizeVercelIncident(body)'))
 assert.ok(route.indexOf('verifiedPlatformVercelWebhookScope(body')<route.indexOf('diagnoseIncident(incident)'))
})
