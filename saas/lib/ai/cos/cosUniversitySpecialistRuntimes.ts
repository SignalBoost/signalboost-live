// saas/lib/ai/cos/cosUniversitySpecialistRuntimes.ts
/**
 * The runtime identity a registered specialist executes under.
 *
 * The bound executor was written for one role. Its runtime string, its identity guard and its system
 * prompt all named software engineering as literals, so a cybersecurity or quantum specialist could
 * be registered, given a curriculum, admitted to a programme — and then throw
 * `agent_capstone_runtime_unavailable` on its first exam. Every layer around it is already
 * role-agnostic: the database binding accepts any registered role, the model policy declares domain
 * subjects per role, the Master's lane is agent-scoped and the practice gate is at parity. This is
 * the last literal.
 *
 * Software keeps its exact historical runtime string. Changing it would orphan every bound row
 * already written and every database constraint that matches it, so the mapping is explicit rather
 * than derived for that one role.
 */

/** Roles the registry admits. Kept in step with the agent registry's own check constraint. */
export const UNIVERSITY_SPECIALIST_ROLES = [
  'software_engineering',
  'cybersecurity',
  'quantitative_data_science',
  'enterprise_operations_governance',
  'scientific_physical_systems',
  'aerospace_nuclear_safety',
  'molecular_biomedical_sciences',
  'neuroscience_biophysics',
  'actuarial_insurance_risk',
  'quantum_theoretical_physics',
] as const

export type UniversitySpecialistRole = (typeof UNIVERSITY_SPECIALIST_ROLES)[number]

/** Historical runtime for the first specialist. Never regenerate this one — evidence depends on it. */
export const SOFTWARE_SPECIALIST_RUNTIME = 'university_software_specialist_v1' as const

const RUNTIME_BY_ROLE: Readonly<Record<UniversitySpecialistRole, string>> = {
  software_engineering: SOFTWARE_SPECIALIST_RUNTIME,
  cybersecurity: 'university_cybersecurity_specialist_v1',
  quantitative_data_science: 'university_quantitative_data_science_specialist_v1',
  enterprise_operations_governance: 'university_enterprise_operations_governance_specialist_v1',
  scientific_physical_systems: 'university_scientific_physical_systems_specialist_v1',
  aerospace_nuclear_safety: 'university_aerospace_nuclear_safety_specialist_v1',
  molecular_biomedical_sciences: 'university_molecular_biomedical_sciences_specialist_v1',
  neuroscience_biophysics: 'university_neuroscience_biophysics_specialist_v1',
  actuarial_insurance_risk: 'university_actuarial_insurance_risk_specialist_v1',
  quantum_theoretical_physics: 'university_quantum_theoretical_physics_specialist_v1',
}

/** Human-readable role name for the learner's own system prompt. */
const TITLE_BY_ROLE: Readonly<Record<UniversitySpecialistRole, string>> = {
  software_engineering: 'Software Specialist',
  cybersecurity: 'Cybersecurity Specialist',
  quantitative_data_science: 'Quantitative Data Science Specialist',
  enterprise_operations_governance: 'Enterprise Operations and Governance Specialist',
  scientific_physical_systems: 'Scientific and Physical Systems Specialist',
  aerospace_nuclear_safety: 'Aerospace and Nuclear Safety Specialist',
  molecular_biomedical_sciences: 'Molecular and Biomedical Sciences Specialist',
  neuroscience_biophysics: 'Neuroscience and Biophysics Specialist',
  actuarial_insurance_risk: 'Actuarial and Insurance Risk Specialist',
  quantum_theoretical_physics: 'Quantum and Theoretical Physics Specialist',
}

export function isUniversitySpecialistRole(role: unknown): role is UniversitySpecialistRole {
  return typeof role === 'string' && (UNIVERSITY_SPECIALIST_ROLES as readonly string[]).includes(role)
}

/**
 * The runtime string for a role, or null when the role is not a registered specialist. Null is the
 * fail-closed answer: an unknown role gets no runtime, so it can never execute or write evidence.
 */
export function universitySpecialistRuntime(role: unknown): string | null {
  return isUniversitySpecialistRole(role) ? RUNTIME_BY_ROLE[role] : null
}

export function universitySpecialistTitle(role: unknown): string | null {
  return isUniversitySpecialistRole(role) ? TITLE_BY_ROLE[role] : null
}

/**
 * Identity rule for bound execution: a well-formed agent id, never COS, holding a registered
 * specialist role. COS is excluded because it is the generalist and answers through its own reasoner.
 */
export function isBoundSpecialistIdentity(agentId: string, role: unknown): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,179}$/.test(agentId) && agentId !== 'cos' && isUniversitySpecialistRole(role)
}
