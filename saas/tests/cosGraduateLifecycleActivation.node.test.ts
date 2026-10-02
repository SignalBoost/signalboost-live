import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('runtime activation appends exact graduate artifact lifecycle evidence',()=>{
 const s=read('lib/ai/cos/cosUniversityGraduateRuntime.ts')
 assert.match(s,/p_event_type: 'activated'/)
 assert.match(s,/p_trained_artifact_hash: decision\.trainedArtifactHash/)
 assert.match(s,/activationEvidenceHash/)
 assert.match(s,/authorityExpanded: false/)
})

test('existing graduates receive idempotent graduation and activation provenance',()=>{
 const s=read('supabase/migrations/20261001235000_backfill_graduate_lifecycle_provenance.sql')
 assert.match(s,/event_type='graduated'/)
 assert.match(s,/event_type='activated'/)
 assert.match(s,/source','registry_backfill'/)
 assert.match(s,/authority_expanded = false/)
 assert.match(s,/append_cos_graduate_lifecycle_event/)
})
