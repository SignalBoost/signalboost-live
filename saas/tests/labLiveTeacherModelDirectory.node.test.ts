import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8')
const api=read('../app/api/lab/teacher-models/route.ts')
const ui=read('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx')
const sql=read('../supabase/migrations/20261012030000_lab_model_directory_credential.sql')

test('model choices originate in live provider APIs and not static curated lists',()=>{
  assert.match(api,/huggingface: \{ url: 'https:\/\/router\.huggingface\.co\/v1\/models'/)
  // No platform price list: every model the key can use is offered.
  assert.doesNotMatch(api,/priced_teacher_models|teacher_rate_cards|priced/)
  for(const name of ['huggingface','openai','anthropic','gemini','xai','deepseek','qwen','mistral','groq','openrouter','together','fireworks','deepinfra'])assert.match(api,new RegExp(name+': \\{ url:'))
  assert.match(api,/await fetch\(spec\.url/)
  assert.match(api,/cache: 'no-store'/)
  assert.match(api,/redirect: 'error'/)
  assert.match(api,/source: 'live'/)
})
test('customer model discovery is credential-bound and never exposes keys',()=>{
  assert.match(api,/customerSession\(\)/)
  assert.match(api,/itmounts_lab_customer_open_model_directory_credential/)
  assert.match(api,/openCustomerCredential/)
  assert.match(api,/data\.providerKind !== provider/)
  assert.doesNotMatch(api,/process\.env\.[A-Z_]*API_KEY/)
  assert.match(sql,/customer_member_role\(uid, p_organization_id\)/)
  assert.match(sql,/revoked_at is null/)
  assert.match(sql,/revoke all on function public\.itmounts_lab_customer_open_model_directory_credential\(uuid,uuid\) from public, anon, service_role/)
})
test('teacher dropdown uses credential and current workspace for live data',()=>{
  assert.match(ui,/teacher-models\?provider=/)
  assert.match(ui,/credentialId=\$\{encodeURIComponent\(teacherId\)\}/)
  assert.match(ui,/organizationId=\$\{encodeURIComponent\(organizationId\)\}/)
  assert.match(ui,/setTeacherModelsError\(true\)/)
  assert.match(ui,/teacherModels\.map\(model => <option key=\{model\.id\} value=\{model\.id\}>\{model\.id\}<\/option>\)/)
  assert.doesNotMatch(ui,/model\.priced/)
  assert.match(ui,/LAB UI v2026\.10\.12\.10/)
})
