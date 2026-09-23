import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl=new URL(
  '../supabase/migrations/20260923104000_residency_infrastructure_retry_constraint_repair.sql',
  import.meta.url,
)

test('Residency infrastructure retries drop the actual Production constraint',async()=>{
  const sql=await readFile(migrationUrl,'utf8')
  assert.match(
    sql,
    /drop constraint if exists cos_university_residency_case_residency_id_competency_id_va_key/,
  )
  assert.match(
    sql,
    /drop constraint if exists cos_university_residency_case_runs_residency_id_competency_id_variant_hash_key/,
  )
  assert.match(sql,/cos_residency_case_variant_attempt_idx/)
  assert.match(sql,/residency_id,\s*competency_id,\s*variant_hash,\s*started_at desc/)
  assert.doesNotMatch(sql,/drop constraint.*cos_university_residency_competency_evidence/i)
})
