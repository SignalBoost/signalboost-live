import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('Master’s evidence ledger is service-only immutable academic evidence with no hidden exam content', () => {
  const schema = file('supabase/migrations/20260908171000_cos_university_masters_evidence.sql')
  assert.match(schema, /create table if not exists public\.cos_university_masters_evidence/i)
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_masters_evidence from anon, authenticated, service_role/i)
  assert.match(schema, /grant select, insert on table public\.cos_university_masters_evidence to service_role/i)
  assert.match(schema, /before update or delete on public\.cos_university_masters_evidence/i)
  assert.match(schema, /authority_stage/i)
  assert.match(schema, /program_key = 'specialist_masters_' \|\| program_id \|\| '_v1'/i)
  assert.match(schema, /length\(btrim\(variant_hash\)\) > 0/i)
  assert.match(schema, /verified_practical = true/i)
  assert.match(schema, /stage = 'graduate_coursework' or independent = true/i)
  assert.doesNotMatch(schema, /\bprompt\s+text\b/i)
  assert.doesNotMatch(schema, /\brubric\s+jsonb\b/i)
  assert.doesNotMatch(schema, /\breply\s+text\b/i)
  assert.doesNotMatch(schema, /\bgraduated\s+boolean\b/i)
})

test('Master’s runtime reuses the University program and credential ledgers rather than inventing a parallel degree system', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /from\('cos_university_program_enrollments'\)/)
  assert.match(runtime, /buildCosUniversityProgramEnrollment/)
  assert.match(runtime, /level: 'masters'/)
  assert.match(runtime, /from\('cos_university_credentials'\)/)
  assert.match(runtime, /program_level: 'masters'/)
  assert.match(runtime, /cosUniversityProgramTimingStatus/)
  assert.match(runtime, /cosUniversityProgramMayGraduate/)
  assert.match(runtime, /readCosUniversityGeneralistGraduationStatus/)
  assert.match(runtime, /academicStateFromRows/)
  assert.match(runtime, /evaluateCosUniversityMastersAdmission/)
  assert.match(runtime, /evaluateCosUniversityMastersGraduation/)
})

test('Master’s evidence preserves program identity from storage through graduation evaluation', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /EVIDENCE_SELECT = 'evidence_key,program_id,/)
  assert.match(runtime, /program_id: CosUniversityMastersProgramId/)
  assert.match(runtime, /programId: row\.program_id/)
  assert.match(runtime, /program_id: input\.programId/)
})

test('Master’s evidence reads newest rows before the 5,000-row cap, then restores chronological evaluation order', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  const load = runtime.slice(runtime.indexOf('async function loadEvidence'), runtime.indexOf('export type CosUniversityMastersSharedAdmissionState'))
  assert.match(load, /order\('observed_at', \{ ascending: false \}\)/)
  assert.match(load, /\.limit\(5000\)/)
  assert.match(load, /\.slice\(\)\.reverse\(\)/)
  assert.ok(load.indexOf("ascending: false") < load.indexOf('.limit(5000)'))
})

test('Master’s host write rejects future-dated evidence beyond bounded clock skew', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /MAX_FUTURE_CLOCK_SKEW_MS = 5 \* 60_000/)
  assert.match(runtime, /observedMs > Date\.now\(\) \+ MAX_FUTURE_CLOCK_SKEW_MS/)
})

test('Master’s enrollment is host-computed from current undergraduate and subject prerequisites', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /undergraduateCredentialAwarded: Boolean\(generalist\.credential\)/)
  assert.match(runtime, /currentGeneralistStanding: generalist\.currentCompetenceStanding/)
  assert.match(runtime, /currentSubjectStanding\[row\.subjectId\] = row\.grade/)
  assert.match(runtime, /if \(!before\.admission\.admitted\)/)
  assert.match(runtime, /state: 'admission_denied'/)
  assert.doesNotMatch(runtime, /admitted\s*:\s*true\s*[,}]/)
})

test('Master’s catalog loads shared undergraduate admission state only once and reuses it across tracks', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  const route = file('app/api/admin/cos-university-masters/route.ts')
  assert.match(runtime, /readCosUniversityMastersSharedAdmissionState/)
  assert.match(runtime, /sharedAdmissionState \?\? await readCosUniversityMastersSharedAdmissionState\(now\)/)
  assert.match(route, /const sharedAdmissionState = await readCosUniversityMastersSharedAdmissionState\(now\)/)
  assert.match(route, /readCosUniversityMastersRuntimeStatus\(id, now, sharedAdmissionState\)/)
})

test('Master’s runtime honors the canonical single-next-level admission and cannot open a second parallel track', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /loadAnyMastersEnrollment/)
  assert.match(runtime, /existingMasters\.programKey !== before\.programKey/)
  assert.match(runtime, /already_enrolled_at_next_level/)
})

test('Master’s academic write seam enforces active enrollment and host authority and is not browser exposed', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  const route = file('app/api/admin/cos-university-masters/route.ts')
  assert.match(runtime, /recordHostCosUniversityMastersEvidence/)
  assert.match(runtime, /input\.authority !== cosUniversityMastersExpectedAuthority\(input\.stage\)/)
  assert.match(runtime, /if \(!status\.enrollment \|\| status\.credential\) return false/)
  assert.match(runtime, /timingStatus === 'deadline_expired'/)
  assert.match(runtime, /stage !== 'graduate_coursework'/)
  assert.match(runtime, /stage === 'verified_practical_work'/)
  assert.match(route, /requireOwner/)
  assert.match(route, /academicEvidenceWriteExposed: false/)
  assert.doesNotMatch(route, /recordHostCosUniversityMastersEvidence/)
  assert.doesNotMatch(route, /evidenceKey/)
  assert.doesNotMatch(route, /variantHash/)
})

test('Master’s credential issuance requires current admission, evidence, residence and deadline gates', () => {
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.match(runtime, /admission\.admitted/)
  assert.match(runtime, /cosUniversityProgramMayGraduate\(enrollment, now\)/)
  assert.match(runtime, /graduation\.graduated/)
  assert.match(runtime, /minimum_residence_incomplete/)
  assert.match(runtime, /masters_program_deadline_expired/)
  assert.match(runtime, /host_masters_graduation_gate/)
  assert.match(runtime, /authorityExpanded: false/)
  assert.match(runtime, /credentialStanding/)
  assert.match(runtime, /currentCompetenceStanding/)
})

test('Master’s owner API can read, enroll and request evaluation but cannot self-award or self-grade', () => {
  const route = file('app/api/admin/cos-university-masters/route.ts')
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /ensureCosUniversityMastersEnrollment/)
  assert.match(route, /export async function PUT/)
  assert.match(route, /evaluateAndAwardCosUniversityMastersCredential/)
  assert.doesNotMatch(route, /cos_university_credentials/)
  assert.doesNotMatch(route, /cos_university_masters_evidence/)
  assert.doesNotMatch(route, /graduated\s*:\s*true/)
})
