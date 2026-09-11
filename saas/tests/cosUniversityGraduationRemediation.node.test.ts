import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  applyCosUniversityGraduationRemediation,
  parseCosUniversityGraduationRemediation,
  COS_UNIVERSITY_GRADUATION_REMEDIATION_SEMANTICS,
} from '../lib/ai/cos/cosUniversityGraduationRemediation.ts'

const scope = { agentId: 'software-specialist', programKey: 'generalist_undergraduate_v1' }
const receipt = (pendingCount = 0) => ({
  ...scope, pendingCount,
  blockers: Array.from({ length: Math.min(25, pendingCount) }, (_, i) => ({ planId: `plan-${i}`, sourceKind: 'recertification', status: 'ready_for_exam' })),
  checkedAt: '2026-09-11T19:30:00.000Z', semantics: COS_UNIVERSITY_GRADUATION_REMEDIATION_SEMANTICS,
})
const root = path.resolve(import.meta.dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

test('zero is accepted only from a complete, correctly scoped database receipt', () => {
  assert.equal(parseCosUniversityGraduationRemediation(receipt(), scope).pendingCount, 0)
  for (const value of [null, undefined, [], '', {}, { ...receipt(), pendingCount: '0' }, { ...receipt(), blockers: null }]) {
    assert.throws(() => parseCosUniversityGraduationRemediation(value, scope))
  }
})

test('another agent, program, or blank identity can never clear this agent', () => {
  for (const invalid of [{ agentId: 'cos' }, { programKey: 'another_program' }]) {
    assert.throws(() => parseCosUniversityGraduationRemediation({ ...receipt(), ...invalid }, scope), /scope_mismatch/)
  }
  for (const agentId of ['', ' ', ' software-specialist ']) {
    assert.throws(() => parseCosUniversityGraduationRemediation(receipt(), { ...scope, agentId }), /invalid_graduation_remediation_scope/)
  }
})

test('queued, studying and ready-for-exam failures all block even with otherwise sufficient grades', () => {
  const eligible = { graduated: false, awardEligible: true, prerequisitesReady: true, standing: 'A', authorityExpanded: false }
  for (const status of ['queued', 'studying', 'ready_for_exam']) {
    const proof = receipt(1)
    proof.blockers[0].status = status
    const result = applyCosUniversityGraduationRemediation(eligible, parseCosUniversityGraduationRemediation(proof, scope))
    assert.equal(result.awardEligible, false)
    assert.equal(result.prerequisitesReady, false)
    assert.equal(result.graduated, false)
    assert.equal(result.standing, 'A', 'a pending plan is not a new scored assessment')
    assert.equal(result.authorityExpanded, false)
  }
  assert.equal(eligible.awardEligible, true, 'input is not mutated')
})

test('a clear remediation gate cannot waive residence, evidence, or other graduation requirements', () => {
  const blocked = { graduated: false, awardEligible: false, prerequisitesReady: false }
  const result = applyCosUniversityGraduationRemediation(blocked, parseCosUniversityGraduationRemediation(receipt(), scope))
  assert.equal(result.awardEligible, false)
  assert.equal(result.prerequisitesReady, false)
  assert.equal(result.graduated, false)
})

test('later remediation preserves the immutable historical credential', () => {
  const credential = { credentialKey: 'historical-credential', awardedAt: '2026-11-10T00:00:00Z' }
  const original = { graduated: true, awardEligible: false, prerequisitesReady: false, credential, standing: 'A' }
  const result = applyCosUniversityGraduationRemediation(original, parseCosUniversityGraduationRemediation(receipt(1), scope))
  assert.equal(result.graduated, true)
  assert.equal(result.awardEligible, false)
  assert.equal(result.credential, credential)
  assert.equal(result.standing, 'A')
})

test('malformed counts, omitted blockers, duplicate plans and invalid times fail closed', () => {
  for (const invalid of [
    { pendingCount: -1 }, { pendingCount: 0.5 }, { pendingCount: NaN }, { pendingCount: Number.MAX_SAFE_INTEGER + 1 },
    { pendingCount: 1, blockers: [] }, { pendingCount: 0, blockers: receipt(1).blockers },
    { checkedAt: 'invalid' }, { semantics: 'untrusted' },
    { pendingCount: 2, blockers: [receipt(1).blockers[0], receipt(1).blockers[0]] },
  ]) assert.throws(() => parseCosUniversityGraduationRemediation({ ...receipt(), ...invalid }, scope))
})

test('all pending plans are counted while the diagnostic sample stays bounded', () => {
  const result = parseCosUniversityGraduationRemediation(receipt(1000), scope)
  assert.equal(result.pendingCount, 1000)
  assert.equal(result.blockers.length, 25)
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.blockers))
})

test('ordinary study and terminal plans cannot be mislabeled as pending remediation receipts', () => {
  for (const change of [
    { sourceKind: 'academic_rotation' }, { sourceKind: 'language_rotation' }, { sourceKind: 'owner_directed_material' },
    { status: 'completed' }, { status: 'superseded' }, { status: 'unknown' }, { planId: '' },
  ]) {
    const proof = receipt(1)
    Object.assign(proof.blockers[0], change)
    assert.throws(() => parseCosUniversityGraduationRemediation(proof, scope))
  }
})

test('the real runner reads and applies the host gate before capstone execution', () => {
  const source = read('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(source, /db\.rpc\('read_cos_university_undergraduate_remediation'/)
  assert.match(source, /parseCosUniversityGraduationRemediation\(result\.data, \{ agentId, programKey: UNDERGRADUATE_PROGRAM_KEY \}\)/)
  assert.match(source, /loadUndergraduateRemediation\(agentId\)/)
  assert.match(source, /applyCosUniversityGraduationRemediation\(/)
  const entry = source.slice(source.indexOf('export async function runCosUniversityGeneralistGraduationGate'))
  const blocked = entry.indexOf('unresolved_undergraduate_remediation')
  assert.ok(blocked > 0 && blocked < entry.indexOf('const runtimeBlocker ='))
  assert.ok(blocked < entry.indexOf('await createOrFindCapstoneRun('))
})

test('issuance rechecks remediation and records the actual check; failure is not a cleared gate', () => {
  const source = read('lib/ai/cos/cosUniversityGraduationRunner.ts')
  const award = source.slice(source.indexOf('async function awardUndergraduateCredential('), source.indexOf('async function createOrFindCapstoneRun('))
  const check = award.indexOf('await loadUndergraduateRemediation(agentId)')
  assert.ok(check > 0 && check < award.indexOf("db.from('cos_university_credentials').insert("))
  assert.match(award, /if \(remediation\.pendingCount > 0\) throw new Error\('unresolved_undergraduate_remediation'\)/)
  assert.match(award, /remediation,/)
})

test('database insertion is guarded and serialized with same-agent plan mutations', () => {
  const sql = read('supabase/migrations/20260911194828_university_graduation_remediation_gate.sql')
  assert.match(sql, /BEFORE INSERT ON public\.cos_university_credentials/)
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\.cos_university_study_plans/)
  assert.equal((sql.match(/pg_catalog\.pg_advisory_xact_lock/g) || []).length, 2)
  assert.match(sql, /transaction_isolation/)
  assert.match(sql, /read committed/)
  assert.match(sql, /unresolved_undergraduate_remediation/)
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path = ''/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.read_cos_university_undergraduate_remediation\(text, text\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.read_cos_university_undergraduate_remediation\(text, text\) TO service_role/)
})

test('the database scopes legacy null program keys and excludes unrelated and terminal work', () => {
  const sql = read('supabase/migrations/20260911194828_university_graduation_remediation_gate.sql')
  assert.match(sql, /p\.agent_id = p_agent_id/)
  assert.match(sql, /p\.program_key IS NULL OR p\.program_key = p_program_key/)
  assert.match(sql, /p\.academic_level = 'undergraduate'/)
  assert.match(sql, /p\.source_kind IN \('failure_autopsy', 'operational_weakness', 'recertification'\)/)
  assert.match(sql, /p\.status NOT IN \('completed', 'superseded'\)/)
  assert.match(sql, /count\(\*\)/)
  assert.match(sql, /LIMIT 25/)
  assert.match(read('scripts/vercel-cos-gates.mjs'), /tests\/cosUniversityGraduationRemediation\.node\.test\.ts/)
})
