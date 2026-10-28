// saas/lib/builder/source-files.ts
//
// Source files a person attaches to a Builder request. They are staged into the Builder V2 workspace as they are;
// V2 decides what to run and edit. (The retired V1 debug-file job is gone: an attached-file repair is an ordinary
// V2 job, never refused as "legacy debug mode".)

export type BuilderSourceFile = Readonly<{ path: string; content: string }>

const WORKSPACE_EXTENSION = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizePath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/')
}

function decodeDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl)
  if (!match) return ''
  const mediaType = String(match[1] || '').toLowerCase()
  const payload = match[3] || ''
  const textual = !mediaType
    || mediaType.startsWith('text/')
    || /javascript|typescript|json|python|x-python|ecmascript/.test(mediaType)
    || mediaType === 'application/octet-stream'
  if (!textual) return ''
  try {
    return match[2] ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload)
  } catch {
    return ''
  }
}

/**
 * Accept Builder `{path,content}` files and Concierge `{name,dataUrl}` attachments.
 * Workspace source, manifests and data are preserved.
 */
export function extractBuilderSourceFiles(raw: unknown): BuilderSourceFile[] {
  if (!Array.isArray(raw)) return []
  const files: BuilderSourceFile[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const path = normalizePath(record.path || record.name || record.filename)
    const content = typeof record.content === 'string' && record.content
      ? record.content
      : decodeDataUrl(text(record.dataUrl))
    const admitted = WORKSPACE_EXTENSION.test(path) && new TextEncoder().encode(content).byteLength <= 512 * 1024
      ? Object.freeze({ path, content }) : null
    if (!admitted || seen.has(admitted.path)) continue
    seen.add(admitted.path)
    files.push(admitted)
    if (files.length >= 100) break
  }
  return files
}
