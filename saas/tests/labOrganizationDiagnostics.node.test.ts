import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const sql=readFileSync(new URL('../supabase/migrations/20261015110000_lab_organization_diagnostics.sql',import.meta.url),'utf8')
const api=readFileSync(new URL('../app/api/lab/training/diagnostics/route.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabOrganizationDiagnostics.tsx',import.meta.url),'utf8')
const panel=readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx',import.meta.url),'utf8')
test('database limits aggregate diagnostics to owner/admin and one organization',()=>{
 assert.match(sql,/not in \('owner','admin'\)/)
 assert.match(sql,/organization_id=p_organization_id/g)
 assert.match(sql,/created_at>=now\(\)-interval '30 days'/)
 assert.match(sql,/revoke all on function public\.itmounts_lab_customer_run_diagnostics/)
 assert.doesNotMatch(sql,/jsonb_build_object\('.*prompt|credential_id|teacher_model|status_message|job_url/i)
})
test('authenticated observed diagnostic endpoint and owner UI',()=>{
 assert.match(api,/customerSession\(\)/)
 assert.match(api,/observeLabRequest\('training\.diagnostics'/)
 assert.match(api,/UUID_RE\.test\(organizationId\)/)
 assert.match(panel,/canManage && org && <LabOrganizationDiagnostics/)
 assert.match(ui,/fetch\('\/api\/lab\/training\/diagnostics\?'/)
})
