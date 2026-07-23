import { createHash } from 'node:crypto'
import type { SanitizedArtifactMetadata, SandboxArtifact } from './contracts.ts'
import type { SandboxRuntimePolicy } from './policy.ts'

const SECRET_NAME = /\.env(?:$|[._-])|(^|[\\/._-])(credentials?|secrets?|tokens?|private-key|id_rsa|id_ed25519|service-account|stripe|supabase|vercel|github-token)(?=$|[\\/._-])/i
const SAFE_MEDIA_TYPE = /^(text\/(plain|csv|markdown)|application\/(json|pdf)|image\/(png|jpeg|webp))$/i

export function sanitizeSandboxArtifacts(artifacts: readonly SandboxArtifact[], workspacePath: string, policy: Pick<SandboxRuntimePolicy, 'maximumArtifactCount' | 'maximumArtifactSizeBytes' | 'maximumTotalArtifactSizeBytes'>): SanitizedArtifactMetadata[] {
  let total = 0
  return artifacts.map((artifact, index) => {
    let rejectionReason: string | undefined
    const path = artifact.path
    if (index >= policy.maximumArtifactCount) rejectionReason = 'artifact_count_limit_exceeded'
    else if (!path || path.includes('\0')) rejectionReason = 'invalid_path'
    else if (/^(\/|\\|[a-zA-Z]:[\\/])/.test(path)) rejectionReason = 'absolute_path_not_allowed'
    else if (path.split(/[\\/]+/).includes('..')) rejectionReason = 'parent_traversal_not_allowed'
    else if (path.startsWith(`${workspacePath}/`) || path === workspacePath) rejectionReason = 'path_must_be_relative_to_workspace'
    else if (SECRET_NAME.test(path)) rejectionReason = 'secret_like_filename'
    else if (artifact.kind && artifact.kind !== 'file') rejectionReason = 'unsafe_artifact_kind'
    else if (artifact.sizeBytes < 0 || artifact.sizeBytes > policy.maximumArtifactSizeBytes) rejectionReason = 'artifact_size_limit_exceeded'
    else if (total + artifact.sizeBytes > policy.maximumTotalArtifactSizeBytes) rejectionReason = 'total_artifact_size_limit_exceeded'
    if (!rejectionReason) total += artifact.sizeBytes
    const digest = /^[a-f0-9]{64}$/i.test(artifact.sha256 ?? '') ? artifact.sha256!.toLowerCase() : artifact.content ? createHash('sha256').update(artifact.content).digest('hex') : undefined
    return Object.freeze({
      relativePath: path.replace(/\\/g, '/'),
      sizeBytes: Math.max(0, artifact.sizeBytes),
      ...(SAFE_MEDIA_TYPE.test(artifact.mediaType ?? '') ? { mediaType: artifact.mediaType } : {}),
      ...(digest ? { sha256: digest } : {}),
      truncated: Boolean(artifact.truncated),
      ...(rejectionReason ? { rejectionReason } : {}),
    })
  })
}
