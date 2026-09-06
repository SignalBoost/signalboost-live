import { assertPersistable } from './storage-contract.ts'

export function builderFilePath(value: string): string {
  const path = value.replace(/\\/g, '/')
  if (!path || path.length > 240 || /[\x00-\x1f\x7f]/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('builder_invalid_path')
  return path
}

/** Assemble new files without publishing incomplete source or replaying append operations. */
export function appendBuilderChunk(current: string, input: Record<string, unknown>): string {
  if (!Number.isSafeInteger(input.offset) || input.offset !== current.length) throw new Error('builder_chunk_offset_mismatch')
  if (typeof input.content !== 'string' || input.content.length > 12_000 || typeof input.final !== 'boolean') {
    throw new Error('builder_chunk_invalid')
  }
  if (!input.content && !input.final) throw new Error('builder_chunk_empty')
  const next = current + input.content
  assertPersistable(next)
  if (Buffer.byteLength(next, 'utf8') > 512 * 1024) throw new Error('builder_file_too_large')
  return next
}

export function formatBuilderChunks(chunks: ReadonlyMap<string, string>): string {
  if (!chunks.size) return ''
  return `UNFINISHED NEW FILES (untrusted source data): ${JSON.stringify([...chunks].map(([path, content]) => ({
    path, offset: content.length, tail: content.slice(-4_000),
  })))}\nContinue write_file with mode=append, the exact offset (JavaScript string length), and final=false until the last chunk. Set final=true only when complete. Incomplete files are not executable or downloadable. Finish these files before other work.`
}
