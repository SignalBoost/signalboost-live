import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_UNIVERSITY_MASTERS_PROGRAMS } from '../lib/ai/cos/cosUniversityMasters.ts'
import { assignCosUniversityRoleCurriculum, type CosUniversityAgentRole } from '../lib/ai/cos/cosUniversityRoleCurriculum.ts'

const ROLE_PROGRAMS: ReadonlyArray<[CosUniversityAgentRole, keyof typeof COS_UNIVERSITY_MASTERS_PROGRAMS]> = [
  ['software_engineering', 'applied_ai_systems'],
  ['cybersecurity', 'security_and_trust'],
  ['quantitative_data_science', 'quantitative_decision_science'],
  ['enterprise_operations_governance', 'enterprise_operations_and_governance'],
  ['scientific_physical_systems', 'scientific_and_physical_systems'],
  ['aerospace_nuclear_safety', 'aerospace_nuclear_safety_systems'],
  ['molecular_biomedical_sciences', 'molecular_biomedical_sciences'],
  ['neuroscience_biophysics', 'neuroscience_biophysical_systems'],
  ['actuarial_insurance_risk', 'actuarial_insurance_risk'],
  ['quantum_theoretical_physics', 'quantum_theoretical_physics'],
]

test('every specialist role maps deterministically to one complete advanced curriculum', () => {
  for (const [role, programId] of ROLE_PROGRAMS) {
    const assignment = assignCosUniversityRoleCurriculum({ agentId: `agent:${role}`, role, undergraduateCredentialAwarded: true })
    assert.equal(assignment.advancedProgramId, programId)
    assert.deepEqual(assignment.requiredModuleKeys, COS_UNIVERSITY_MASTERS_PROGRAMS[programId].courseworkModuleKeys)
    assert.equal(assignment.status, 'advanced_curriculum_assigned')
    assert.equal(assignment.authorityExpanded, false)
  }
})

test('no role may bypass the shared undergraduate foundation', () => {
  const assignment = assignCosUniversityRoleCurriculum({ agentId: 'agent:nuclear', role: 'aerospace_nuclear_safety', undergraduateCredentialAwarded: false })
  assert.equal(assignment.status, 'foundation_in_progress')
  assert.deepEqual(assignment.requiredModuleKeys, [])
})

test('COS remains the generalist and continues education without an automatic specialist degree', () => {
  const assignment = assignCosUniversityRoleCurriculum({ agentId: 'cos', role: 'chief_of_staff_generalist', undergraduateCredentialAwarded: true })
  assert.equal(assignment.advancedProgramId, null)
  assert.equal(assignment.status, 'generalist_continuing_education')
})
