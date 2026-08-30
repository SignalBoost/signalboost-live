export type BuilderImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

const BUILDER_IMAGE_ARTIFACT_RE = /^artifact-image-base64:(image\/(?:png|jpeg|webp)):([\s\S]+)$/

export function decodeBuilderImageArtifact(content: string): { mime: BuilderImageMime; bytes: Buffer } | null {
  const match = BUILDER_IMAGE_ARTIFACT_RE.exec(content)
  if (!match) return null
  return {
    mime: match[1] as BuilderImageMime,
    bytes: Buffer.from(match[2], 'base64'),
  }
}
