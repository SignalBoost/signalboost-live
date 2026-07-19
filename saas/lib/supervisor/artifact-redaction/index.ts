export const SUPERVISOR_ARTIFACT_REDACTION_SCHEMA_VERSION = 'supervisor-artifact-redaction-v1' as const

export type SupervisorArtifactReviewStatus = 'approved' | 'rejected' | 'review_required'

export interface SupervisorArtifactReference {
  artifactId: string
  artifactType: 'screenshot' | 'html' | 'log' | 'json' | 'text' | 'other'
  uri?: string
  digest?: string
  metadata?: Record<string, unknown>
}

export interface SupervisorArtifactReview {
  artifactId: string
  artifactType: SupervisorArtifactReference['artifactType']
  status: SupervisorArtifactReviewStatus
  reasonCodes: string[]
  safeReference?: string
  digest?: string
  metadata: Record<string, string | number | boolean | null>
  schemaVersion: typeof SUPERVISOR_ARTIFACT_REDACTION_SCHEMA_VERSION
}

const forbidden = /(authorization|bearer\s+[a-z0-9._-]+|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|credential|session[_-]?id|localstorage|sessionstorage|file:\/\/|[a-z]:\\)/i
const safeSchemes = /^(https:\/\/|artifact:\/\/|evidence:\/\/)/i
const primitive = (value: Record<string, unknown> = {}) => Object.fromEntries(Object.entries(value)
  .filter(([key, item]) => !forbidden.test(key) && (item === null || ['string','number','boolean'].includes(typeof item)))
  .map(([key, item]) => [key, typeof item === 'string' && forbidden.test(item) ? '[redacted]' : item])
  .sort(([a],[b]) => a.localeCompare(b))) as Record<string, string | number | boolean | null>

export function reviewSupervisorArtifact(reference: SupervisorArtifactReference): SupervisorArtifactReview {
  const reasons: string[] = []
  const id = reference.artifactId.trim()
  const uri = reference.uri?.trim()
  const digest = reference.digest?.trim()
  if (!id) reasons.push('artifact_id_missing')
  if (uri && (!safeSchemes.test(uri) || forbidden.test(uri))) reasons.push('unsafe_reference')
  if (digest && !/^[a-f0-9]{32,128}$/i.test(digest)) reasons.push('invalid_digest')
  const metadata = primitive(reference.metadata)
  const rawMetadata = JSON.stringify(reference.metadata ?? {})
  if (forbidden.test(rawMetadata)) reasons.push('sensitive_metadata_redacted')
  if (reference.artifactType === 'screenshot' || reference.artifactType === 'html') reasons.push('visual_redaction_review_required')

  const hardFailure = reasons.some(reason => ['artifact_id_missing','unsafe_reference','invalid_digest'].includes(reason))
  const status: SupervisorArtifactReviewStatus = hardFailure ? 'rejected' : reasons.includes('visual_redaction_review_required') ? 'review_required' : 'approved'
  return Object.freeze({
    artifactId: id,
    artifactType: reference.artifactType,
    status,
    reasonCodes: [...new Set(reasons)].sort(),
    safeReference: uri && safeSchemes.test(uri) && !forbidden.test(uri) ? uri : undefined,
    digest: digest && /^[a-f0-9]{32,128}$/i.test(digest) ? digest.toLowerCase() : undefined,
    metadata,
    schemaVersion: SUPERVISOR_ARTIFACT_REDACTION_SCHEMA_VERSION,
  })
}
