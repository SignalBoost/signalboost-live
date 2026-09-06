import { createHash } from 'node:crypto'
import type { BuilderFile } from './contracts.ts'

const MAX_FILES = 200
const MAX_FILE_CONTENT = 8000
const MAX_CONTENT = 24000
export type BuilderSourceSnapshot = {
  version: 1
  scope: 'runner_input'
  files: { path: string; sha256: string; content: string; truncated: boolean }[]
  omittedFiles: number
}
export const builderSourceDigest = (content: string): string => createHash('sha256').update(content).digest('hex')

/** Capture before dispatch, never from model claims or a later workspace read. */
export function captureBuilderSource(files: readonly Pick<BuilderFile, 'path' | 'content'>[]): BuilderSourceSnapshot {
  let remaining = MAX_CONTENT
  const recorded = [...files].sort((a, b) => a.path.localeCompare(b.path)).slice(0, MAX_FILES).map(file => {
    const content = file.content.slice(0, Math.min(MAX_FILE_CONTENT, remaining))
    remaining -= content.length
    return { path: file.path, sha256: builderSourceDigest(file.content), content, truncated: content.length !== file.content.length }
  })
  return { version: 1, scope: 'runner_input', files: recorded, omittedFiles: Math.max(0, files.length - recorded.length) }
}

/** Bounded persistence boundary shared by workspace and authorized repository results. */
export function builderRunSourceEvidence(output: unknown): { sourceSnapshot?: BuilderSourceSnapshot } {
  const snapshot = output && typeof output === 'object' ? (output as Record<string, unknown>).sourceSnapshot as BuilderSourceSnapshot | undefined : undefined
  if (!snapshot || snapshot.version !== 1 || snapshot.scope !== 'runner_input' || !Array.isArray(snapshot.files)
    || snapshot.files.length > MAX_FILES || !Number.isSafeInteger(snapshot.omittedFiles) || snapshot.omittedFiles < 0) return {}
  let size = 0
  const paths = new Set<string>()
  for (const file of snapshot.files) {
    if (!file || typeof file.path !== 'string' || file.path.length > 240 || paths.has(file.path)
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)
      || typeof file.content !== 'string' || file.content.length > MAX_FILE_CONTENT || typeof file.truncated !== 'boolean') return {}
    paths.add(file.path)
    size += file.content.length
    if (size > MAX_CONTENT || (!file.truncated && builderSourceDigest(file.content) !== file.sha256)) return {}
  }
  return { sourceSnapshot: snapshot }
}

/** A match identifies only the supplied pre-command source, never an entire post-run state. */
export function builderSourceComparison(trace: readonly unknown[], current: readonly { path: string; sha256: string }[]) {
  const runs = trace.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    return item.toolId === 'run' ? [{ item, eventId: index + 1 }] : []
  })
  const latest = runs.at(-1)
  const snapshot = builderRunSourceEvidence(latest?.item.output ?? latest?.item).sourceSnapshot
  return {
    scope: 'last_recorded_run_input', eventId: latest?.eventId ?? null,
    identityAvailable: Boolean(snapshot),
    note: 'This compares full-content fingerprints with input supplied to the last recorded command runner. It is not a post-command or final-job snapshot. Missing historical snapshots cannot be reconstructed from current files. Command execution must be established separately by its outcome.',
    files: current.map(file => {
      const historical = snapshot?.files.find(record => record.path === file.path)
      return { path: file.path, currentSha256: file.sha256, recordedSha256: historical?.sha256 ?? null,
        relation: historical ? historical.sha256 === file.sha256 ? 'same' : 'different' : 'unavailable' }
    }),
  }
}
