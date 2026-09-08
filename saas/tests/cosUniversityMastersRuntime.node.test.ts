import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('Master’s evidence ledger remains service-only and immutable', () => {
  const schema = file('supabase/migrations/20260908171000_cos_university_masters_evidence.sql')
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_masters_evidence from anon, authenticated, service_role/i)
  assert.match(schema, /grant select, insert on table public\.cos_university_masters_evidence to service_role/i)
  assert.match(schema, /before update or delete on public\.cos_university_masters_evidence/i)
  assert.doesNotMatch(schema, /\bprompt\s+text\b/i)
  assert.doesNotMatch(schema, /\brubric\s+jsonb\b/i)
  assert.doesNotMatch(schema, /\breply\s+text\b/i)
})

test('Master’s runtime reuses University enrollment and credential ledgers', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /from\('cos_university_program_enrollments'\)/)
  assert.match(runtime, /buildCosUniversityProgramEnrollment/)
  assert.match(runtime, /level: 'masters'/)
  assert.match(runtime, /from\('cos_university_credentials'\)/)
  assert.match(runtime, /program_level: 'masters'/)
  assert.match(runtime, /readCosUniversityGeneralistGraduationStatus/)
  assert.match(runtime, /evaluateCosUniversityMastersAdmission/)
  assert.match(runtime, /evaluateCosUniversityMastersGraduation/)
})

test('Master’s evidence preserves program and module identity from storage to evaluator', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /EVIDENCE_SELECT = 'evidence_key,program_id,module_key,/)
  assert.match(runtime, /program_id: CosUniversityMastersProgramId/)
  assert.match(runtime, /module_key: string \| null/)
  assert.match(runtime, /programId: row\.program_id/)
  assert.match(runtime, /moduleKey: row\.module_key/)
  assert.match(runtime, /program_id: input\.programId/)
  assert.match(runtime, /module_key: moduleKey/)
})

test('Master’s evidence reads newest rows before bounded evaluation and restores chronology', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  const load = runtime.slice(runtime.indexOf('async function loadEvidence'), runtime.indexOf('export async function readCosUniversityMastersEvidence'))
  assert.match(load, /order\('observed_at', \{ ascending: false \}\)/)
  assert.match(load, /\.limit\(5000\)/)
  assert.match(load, /\.slice\(\)\.reverse\(\)/)
})

test('host evidence rejects future timestamps, pre-enrollment evidence, and invalid module scope', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /observedMs > Date\.now\(\) \+ MAX_FUTURE_CLOCK_SKEW_MS/)
  assert.match(runtime, /observedMs < enrolledAt/)
  assert.match(runtime, /cosUniversityMastersModuleByKey\(input\.programId, moduleKey\)/)
  assert.match(runtime, /input\.stage === 'graduate_coursework'/)
  assert.match(runtime, /else if \(moduleKey\)/)
})

test('Master’s enrollment is host-computed and single-track', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /undergraduateCredentialAwarded: Boolean\(generalist\.credential\)/)
  assert.match(runtime, /currentGeneralistStanding: generalist\.currentCompetenceStanding/)
  assert.match(runtime, /currentSubjectStanding\[row\.subjectId\] = row\.grade/)
  assert.match(runtime, /loadAnyMastersEnrollment/)
  assert.match(runtime, /already_enrolled_at_next_level/)
})

test('Master’s catalog reuses one shared undergraduate admission state', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  const route = file('app/api/admin/cos-university-masters/route.ts')
  assert.match(runtime, /readCosUniversityMastersSharedAdmissionState/)
  assert.match(route, /const sharedAdmissionState = await readCosUniversityMastersSharedAdmissionState\(now\)/)
  assert.match(route, /readCosUniversityMastersRuntimeStatus\(id, now, sharedAdmissionState\)/)
})

test('owner API cannot write Master’s academic evidence or self-award', () => {
  const route = file('app/api/admin/cos-university-masters/route.ts')
  assert.match(route, /requireOwner/)
  assert.match(route, /academicEvidenceWriteExposed: false/)
  assert.match(route, /ensureCosUniversityMastersEnrollment/)
  assert.match(route, /evaluateAndAwardCosUniversityMastersCredential/)
  assert.doesNotMatch(route, /recordHostCosUniversityMastersEvidence/)
  assert.doesNotMatch(route, /evidenceKey/)
  assert.doesNotMatch(route, /variantHash/)
})

test('credential issuance still requires admission, evidence, residence and deadline gates', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /admission\.admitted/)
  assert.match(runtime, /cosUniversityProgramMayGraduate\(enrollment, now\)/)
  assert.match(runtime, /graduation\.graduated/)
  assert.match(runtime, /minimum_residence_incomplete/)
  assert.match(runtime, /masters_program_deadline_expired/)
  assert.match(runtime, /host_masters_graduation_gate/)
  assert.match(runtime, /authorityExpanded: false/)
})
