import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('PhD runtime reuses canonical University enrollment and credential ledgers', () => {
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  assert.match(runtime, /from\('cos_university_program_enrollments'\)/)
  assert.match(runtime, /program_level: 'phd'/)
  assert.match(runtime, /from\('cos_university_credentials'\)/)
  assert.match(runtime, /cosUniversityPhdCredentialKey/)
  assert.match(runtime, /buildCosUniversityProgramEnrollment\(\{ programKey: before\.programKey, level: 'phd'/)
  assert.match(runtime, /readCosUniversityMastersRuntimeStatus/)
  assert.match(runtime, /evaluateCosUniversityPhdAdmission/)
  assert.doesNotMatch(runtime, /caller.*graduat/i)
})

test('PhD research need is host-controlled and cannot be self-declared by the owner API', () => {
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  const route = file('app/api/admin/cos-university-phd/route.ts')
  const schema = file('supabase/migrations/20260908192500_cos_university_phd_runtime.sql')
  assert.match(runtime, /recordHostCosUniversityPhdResearchNeed/)
  assert.match(runtime, /host_authority: 'university_research_strategy'/)
  assert.match(schema, /host_authority text not null default 'university_research_strategy'/)
  assert.match(route, /researchNeedWriteExposed: false/)
  assert.doesNotMatch(route, /recordHostCosUniversityPhdResearchNeed/)
})

test('PhD actor identities are durable host principals rather than role-name independence claims', () => {
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  const schema = file('supabase/migrations/20260908192500_cos_university_phd_runtime.sql')
  assert.match(schema, /cos_university_phd_actor_identities/)
  assert.match(schema, /principal_fingerprint text not null/)
  assert.match(schema, /principal_type text not null/)
  assert.match(runtime, /principalFingerprint/)
  assert.match(runtime, /phd_candidate_principal_not_independent/)
  assert.match(runtime, /phd_principal_independence_separation_failed/)
  assert.match(runtime, /CRITICAL_PRINCIPAL_STAGES/)
  assert.match(routeSafe(), /actorIdentityWriteExposed: false/)
})

function routeSafe(): string {
  return file('app/api/admin/cos-university-phd/route.ts')
}

test('PhD project and evidence ledgers bind a coherent research lineage and are browser-inaccessible', () => {
  const schema = file('supabase/migrations/20260908192500_cos_university_phd_runtime.sql')
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  const route = routeSafe()
  assert.match(schema, /create table if not exists public\.cos_university_phd_projects/i)
  assert.match(schema, /create table if not exists public\.cos_university_phd_evidence/i)
  assert.match(schema, /research_project_id text not null/i)
  assert.match(schema, /protocol_id text not null/i)
  assert.match(schema, /parent_evidence_ids text\[\]/i)
  assert.match(schema, /reproducible_artifact_hash text/i)
  assert.match(schema, /replicated_artifact_hash text/i)
  assert.match(runtime, /projectForEvidence/)
  assert.match(runtime, /parentRows\.some/)
  assert.match(route, /projectWriteExposed: false/)
  assert.match(route, /academicEvidenceWriteExposed: false/)
  assert.doesNotMatch(route, /recordHostCosUniversityPhdEvidence/)
  assert.doesNotMatch(route, /recordHostCosUniversityPhdProject/)
})

test('PhD academic ledgers are service-only RLS and immutable', () => {
  const schema = file('supabase/migrations/20260908192500_cos_university_phd_runtime.sql')
  for (const table of [
    'cos_university_phd_actor_identities',
    'cos_university_phd_research_needs',
    'cos_university_phd_projects',
    'cos_university_phd_evidence',
  ]) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(schema, new RegExp(`revoke all on table public\\.${table} from anon, authenticated, service_role`, 'i'))
    assert.match(schema, new RegExp(`grant select, insert on table public\\.${table} to service_role`, 'i'))
  }
  assert.match(schema, /before update or delete on public\.cos_university_phd_evidence/i)
  assert.match(schema, /before update or delete on public\.cos_university_phd_projects/i)
  assert.match(schema, /before update or delete on public\.cos_university_phd_actor_identities/i)
  assert.match(schema, /before update or delete on public\.cos_university_phd_research_needs/i)
  assert.doesNotMatch(schema, /prompt text/i)
  assert.doesNotMatch(schema, /rubric jsonb/i)
  assert.doesNotMatch(schema, /reply text/i)
  assert.doesNotMatch(schema, /graduated boolean/i)
})

test('PhD credential gate requires coherent graduation, principal separation, calendar, and A+ pursuit', () => {
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  assert.match(runtime, /graduation\.graduated\s*&&\s*principalIndependence\.ok/)
  assert.match(runtime, /cosUniversityProgramMayGraduate\(enrollment, now\)/)
  assert.match(runtime, /graduation\.standing === 'A\+'/)
  assert.match(runtime, /graduation\.standing === 'A' && status\.timingStatus === 'target_date_passed'/)
  assert.match(runtime, /phd_A_plus_pursuit_active_until_target_date/)
  assert.match(runtime, /authorityExpanded: false/)
})

test('owner-visible PhD current competence fails closed when principal independence is not proven', () => {
  const route = routeSafe()
  assert.match(route, /const runtimePrograms = await Promise\.all/)
  assert.match(route, /currentCompetenceStanding: status\.principalIndependence\.ok/)
  assert.match(route, /\? status\.currentCompetenceStanding/)
  assert.match(route, /: 'not_graduated' as const/)
})

test('PhD actor/project/evidence writes remain host-only seams', () => {
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  const route = routeSafe()
  for (const seam of [
    'recordHostCosUniversityPhdActorIdentity',
    'recordHostCosUniversityPhdResearchNeed',
    'recordHostCosUniversityPhdProject',
    'recordHostCosUniversityPhdEvidence',
  ]) {
    assert.match(runtime, new RegExp(`export async function ${seam}`))
    assert.doesNotMatch(route, new RegExp(seam))
  }
})

test('PhD owner manual admission and evaluation obey the same fail-closed runtime switch', () => {
  const route = routeSafe()
  assert.match(route, /function runtimeEnabled\(\): boolean/)
  assert.match(route, /COS_UNIVERSITY_PHD_RUNTIME_ENABLED === 'true'/)
  assert.match(route, /function disabledResponse\(\)/)
  assert.match(route, /phd_runtime_fail_closed/)
  assert.equal((route.match(/if \(!runtimeEnabled\(\)\) return disabledResponse\(\)/g) || []).length, 2)
})

test('PhD admission and progress crons are secret-gated, fail closed, and bounded', () => {
  const admission = file('app/api/cron/cos-university-phd-admission/route.ts')
  const progress = file('app/api/cron/cos-university-phd-progress/route.ts')
  const vercel = JSON.parse(file('vercel.json')) as {
    env: Record<string, string>
    crons: Array<{ path: string; schedule: string }>
  }
  for (const route of [admission, progress]) {
    assert.match(route, /CRON_SECRET/)
    assert.match(route, /auth !== `Bearer \$\{secret\}`/)
    assert.match(route, /COS_UNIVERSITY_PHD_RUNTIME_ENABLED !== 'true'/)
    assert.match(route, /phd_runtime_fail_closed/)
  }
  assert.equal(vercel.env.COS_UNIVERSITY_PHD_RUNTIME_ENABLED, 'true')
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-phd-admission'), {
    path: '/api/cron/cos-university-phd-admission', schedule: '5 * * * *',
  })
  assert.deepEqual(vercel.crons.find(row => row.path === '/api/cron/cos-university-phd-progress'), {
    path: '/api/cron/cos-university-phd-progress', schedule: '56 * * * *',
  })
})
