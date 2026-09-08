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
