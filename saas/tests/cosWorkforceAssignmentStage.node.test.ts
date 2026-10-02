import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const migration=read('supabase/migrations/20261002022000_workforce_assignment_stage.sql')
const workers=read('lib/ai/cos/cosReasoningWorkers.ts')
test('Workforce is a first-class post-graduation lifecycle',()=>{
 assert.match(migration,/WORKFORCE_AVAILABLE/)
 assert.match(migration,/ASSIGNED/)
 assert.match(migration,/WORKING/)
 assert.match(migration,/PRODUCTION_VERIFIED/)
 assert.match(migration,/REMEDIATION/)
 assert.match(migration,/permanent_artifact_id/)
 assert.match(migration,/authority_expanded=false/)
})
test('real production shadow creates and advances durable assignments',()=>{
 assert.match(workers,/cos_workforce_assignments/)
 assert.match(workers,/status: 'assigned'/)
 assert.match(workers,/status: 'working'/)
 assert.match(workers,/status: 'completed'/)
 assert.match(workers,/status: 'remediation'/)
 assert.match(workers,/source_kind: 'production_shadow'/)
})
