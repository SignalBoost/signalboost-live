import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { LAB_CREDENTIAL_KINDS } from '../lib/ai/cos/labCustomerCredentialVault.ts'
import { LAB_PROVIDER_CATALOG, customerTeacherDefinition } from '../lib/ai/cos/labCustomerProviderCatalog.ts'

const hosted = ['xai','deepseek','qwen','mistral','groq','openrouter','together','fireworks','deepinfra']
test('every implemented hosted API provider has a fixed HTTPS endpoint and supported teacher transport', () => {
  for (const kind of hosted) {
    assert.ok(LAB_CREDENTIAL_KINDS.includes(kind as typeof LAB_CREDENTIAL_KINDS[number]))
    const entry = LAB_PROVIDER_CATALOG.find(p => p.kind === kind)
    assert.ok(entry, kind)
    assert.equal(entry.teacherTransport, 'openai_compatible')
    assert.equal(entry.supports['teacher.generate'], true)
    assert.equal(entry.supports['training.execute'], false)
    assert.ok(entry.defaultEndpoint?.startsWith('https://'))
    const definition = customerTeacherDefinition({ kind, model: 'test-model', endpoint: null })
    assert.equal(definition.defaultEndpoint, entry.defaultEndpoint)
  }
})
test('server persistence allows listed types, never opens training execution for hosted teachers', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261012020000_lab_customer_hosted_ai_adapters.sql', import.meta.url), 'utf8')
  for(const kind of hosted) assert.ok(sql.includes("'" + kind + "'"))
  assert.match(sql, /alter table lab.provider_credentials/)
  assert.doesNotMatch(sql, /customer_training_runs|grant\s|service_role/)
})
test('training form never defaults to a specific provider or model and hides unimplemented options', () => {
  const ui = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url),'utf8')
  assert.match(ui, /useState\(''\)\s*\n\s*const \[modelSelection/)
  assert.match(ui, /copy\.trainingProviderLabel/)
  assert.doesNotMatch(ui, /Coming soon/)
  assert.doesNotMatch(ui, /useState\('Qwen\//)
})

test('section 2 requires explicit teacher, compute, model and budget choices', () => {
  const ui = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
  assert.match(ui, /aria-label=\{copy.teacherProviderLabel\}/)
  assert.match(ui, /selectedTeacherCredentials\.map/)
  assert.match(ui, /setTeacherProviderKind\(event.target.value\); setTeacherId\(''\); setTeacherModel\(''\)/)
  assert.match(ui, /setComputeProviderKind\(event.target.value\); setComputeId\(''\); setBaseModel\(''\)/)
  assert.match(ui, /const \[budget, setBudget\] = useState\(''\)/)
  assert.match(ui, /const \[hourly, setHourly\] = useState\(''\)/)
  assert.match(ui, /!teacherProviderKind \|\| !teacherId/)
})
