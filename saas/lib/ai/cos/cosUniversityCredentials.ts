export type CosUniversityCredentialLevel = 'undergraduate' | 'masters' | 'phd' | 'professional_certificate'

export type CosUniversityCredential = Readonly<{
  credentialKey: string
  programKey: string
  programLevel: CosUniversityCredentialLevel
  title: string
  standing: 'A' | 'A+'
  awardedAt: string
}>

export const COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY = 'cos_generalist_undergraduate_v1'
export const COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_TITLE = 'COS University Generalist Undergraduate Credential'

/**
 * Credential keys are globally unique. COS keeps its historical key; every other registered agent gets an
 * agent-scoped key (same shape as Master's keys) so one agent's degree can never collide with another's.
 */
export function cosUniversityGeneralistUndergraduateCredentialKey(agentId: string): string {
  const id = String(agentId || '').trim()
  if (!id) throw new Error('agent_id_required')
  return id === 'cos' ? COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY : `${id}:generalist_undergraduate:v1`
}
