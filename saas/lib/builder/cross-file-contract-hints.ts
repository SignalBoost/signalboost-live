/**
 * Conservative CommonJS API hints for Builder repair prompts.
 * These are diagnostics, never acceptance evidence or a reason to modify tests.
 * Avoid a runtime compiler/parser dependency in the production worker.
 */
import type { BuilderWorkspacePort } from './contracts.ts'

const MAX_FILES = 24
const MAX_SOURCE = 12_000
const MAX_HINTS = 30

export async function builderCrossFileContractHints(
  workspace: BuilderWorkspacePort | undefined,
  workspaceId: string,
  knownPaths: readonly string[],
): Promise<string[]> {
  if (!workspace) return []
  const paths = knownPaths.filter(path => /^(src|test)\/[a-zA-Z0-9_./-]+\.[cm]?js$/.test(path)).slice(0, MAX_FILES)
  const files = await Promise.all(paths.map(async path => {
    const file = await workspace.readFile(workspaceId, path)
    return file ? { path, code: file.content.slice(0, MAX_SOURCE) } : null
  }))
  const sources = files.filter((file): file is {path: string; code: string} => Boolean(file && file.path.startsWith('src/')))
  const tests = files.filter((file): file is {path: string; code: string} => Boolean(file && file.path.startsWith('test/')))
  const hints: string[] = []
  for (const source of sources) {
    const exported = source.code.match(/module\.exports\s*=\s*\{([^}]{0,1500})\}/m)?.[1]
    if (!exported) continue
    const exports = [...exported.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[:,]|$)/g)].map(match => match[1])
    if (!exports.length) continue
    const definitions = [...source.code.matchAll(/\b(?:class|function)\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])
    // Class methods are best-effort hints, not a JavaScript type checker.
    const methods = [...source.code.matchAll(/^\s{2,}(?!if\b|for\b|while\b|switch\b|catch\b)([A-Za-z_$][\w$]*)\s*\(([^)]{0,160})\)\s*\{/gm)]
      .map(match => `${match[1]}(${match[2]})`).slice(0, 20)
    hints.push(`${source.path}: CommonJS exports [${exports.join(', ')}]; declared functions/classes [${definitions.join(', ')}]; candidate methods [${methods.join(', ')}]`)
    if (hints.length >= MAX_HINTS) break
  }
  for (const test of tests) {
    const imports = [...test.code.matchAll(/require\(['"]\.\.\/(src\/[\w./-]+)['"]\)/g)]
      .map(match => match[1]).slice(0, 12)
    if (imports.length) hints.push(`${test.path}: imports [${[...new Set(imports)].join(', ')}]`)
    if (hints.length >= MAX_HINTS) break
  }
  return hints
}
