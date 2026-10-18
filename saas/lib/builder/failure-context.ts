import { posix } from 'node:path'
import type { BuilderWorkspacePort } from './contracts.ts'

/** Only existing workspace paths are admitted; diagnostics cannot request host files. */
export function builderFailurePaths(command: string, diagnostic: string, files: readonly string[]): string[] {
  const normalized = diagnostic.replace(/\\/g, '/')
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const named = files.map(path => ({ path,
    at: normalized.search(new RegExp(`(?:^|[\\s('"/])${escape(path)}:\\d+(?::\\d+)?\\b`, 'm')) }))
    .filter(match => match.at >= 0).sort((a, b) => a.at - b.at).map(match => match.path)
  // A runtime can fail without a stack (e.g. an explicit nonzero exit).
  const entrypoints = files.filter(path => /\.[cm]?[jt]sx?$/.test(path)
    && new RegExp(`(?:^|[\\s'"])${escape(path)}(?:$|[\\s'"])`).test(command))
  return [...new Set([...named, ...entrypoints])]
}

/** Resolve the direct local imports of the failing caller before incidental source files. */
export async function builderFailureImports(workspace: BuilderWorkspacePort | undefined, workspaceId: string,
  paths: readonly string[], files: readonly string[]): Promise<string[]> {
  if (!workspace) return []
  const imported: string[] = []
  for (const path of paths.slice(0, 4)) {
    const file = await workspace.readFile(workspaceId, path)
    if (!file) continue
    for (const match of file.content.matchAll(/(?:require\(\s*|from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
      const base = posix.normalize(posix.join(posix.dirname(path), match[1]))
      const resolved = [base, ...['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '/index.js', '/index.ts'].map(ext => base + ext)]
        .find(candidate => files.includes(candidate))
      if (resolved && !imported.includes(resolved)) imported.push(resolved)
    }
  }
  return imported
}
