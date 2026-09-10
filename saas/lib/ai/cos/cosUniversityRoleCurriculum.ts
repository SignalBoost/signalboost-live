import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  cosUniversityMastersTrackById,
  type CosUniversityMastersTrackId,
} from './cosUniversityMasters.ts'

export type CosUniversityAgentRole =
  | 'chief_of_staff_generalist'
  | 'software_engineering'
  | 'cybersecurity'
  | 'quantitative_data_science'
  | 'enterprise_operations_governance'
  | 'scientific_physical_systems'
  | 'aerospace_nuclear_safety'
  | 'molecular_biomedical_sciences'
  | 'neuroscience_biophysics'
  | 'actuarial_insurance_risk'
  | 'quantum_theoretical_physics'

const ROLE_TRACK: Readonly<Record<Exclude<CosUniversityAgentRole, 'chief_of_staff_generalist'>, CosUniversityMastersTrackId>> = Object.freeze({
  software_engineering: 'applied_ai_systems',
  cybersecurity: 'security_and_trust',
  quantitative_data_science: 'quantitative_decision_science',
  enterprise_operations_governance: 'enterprise_operations_and_governance',
  scientific_physical_systems: 'scientific_and_physical_systems',
  aerospace_nuclear_safety: 'aerospace_nuclear_safety_systems',
  molecular_biomedical_sciences: 'molecular_biomedical_sciences',
  neuroscience_biophysics: 'neuroscience_biophysical_systems',
  actuarial_insurance_risk: 'actuarial_insurance_risk',
  quantum_theoretical_physics: 'quantum_theoretical_physics',
})

export type CosUniversityRoleCurriculumAssignment = Readonly<{
  agentId: string
  role: CosUniversityAgentRole
  foundationRequired: true
  advancedProgramId: CosUniversityMastersTrackId | null
  requiredModuleKeys: readonly string[]
  status: 'foundation_in_progress' | 'generalist_continuing_education' | 'advanced_curriculum_assigned'
  authorityExpanded: false
}>

/** Role determines specialization only after the common foundation; it never grants authority. */
export function assignCosUniversityRoleCurriculum(input: {
  agentId: string
  role: CosUniversityAgentRole
  undergraduateCredentialAwarded: boolean
}): CosUniversityRoleCurriculumAssignment {
  const agentId = String(input.agentId || '').trim()
  if (!agentId) throw new Error('A durable AI agent identity is required.')
  const advancedProgramId = input.role === 'chief_of_staff_generalist' ? null : ROLE_TRACK[input.role]
  if (!input.undergraduateCredentialAwarded) {
    return Object.freeze({ agentId, role: input.role, foundationRequired: true, advancedProgramId, requiredModuleKeys: [], status: 'foundation_in_progress', authorityExpanded: false })
  }
  if (!advancedProgramId) {
    return Object.freeze({ agentId, role: input.role, foundationRequired: true, advancedProgramId: null, requiredModuleKeys: [], status: 'generalist_continuing_education', authorityExpanded: false })
  }
  const track = cosUniversityMastersTrackById(advancedProgramId)
  if (!track || !COS_UNIVERSITY_MASTERS_PROGRAMS[advancedProgramId]) throw new Error(`Unknown advanced curriculum: ${advancedProgramId}`)
  return Object.freeze({
    agentId,
    role: input.role,
    foundationRequired: true,
    advancedProgramId,
    requiredModuleKeys: Object.freeze(track.curriculumModules.map(module => module.key)),
    status: 'advanced_curriculum_assigned',
    authorityExpanded: false,
  })
}

