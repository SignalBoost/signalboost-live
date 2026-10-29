import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('Builder resume and evidence cannot select COS task rows',()=>{
 const s=source('lib/builder/job-store.ts')
 assert.match(s,/builderSoleResumableJob[\s\S]*?\.eq\('job_kind', 'standard'\)/)
 assert.match(s,/readBuilderEvidenceJob[\s\S]*?\.eq\('job_kind', 'standard'\)/)
})
test('History Builder executions and Developer workspace list exclude COS tasks',()=>{
 assert.match(source('app/api/assistant/chats/route.ts'),/builderExecutions[\s\S]*?\.eq\('job_kind', 'standard'\)/)
 const s=source('lib/builder/workspace-supabase.ts')
 assert.match(s,/async listWorkspaces[\s\S]*?\.eq\('job_kind', 'cos_turn'\)/)
 assert.match(s,/cosWorkspaceIds\.has/)
})
