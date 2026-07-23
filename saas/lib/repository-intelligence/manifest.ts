import { readdir, lstat, readFile, realpath } from 'node:fs/promises'
import { resolve, relative, basename, extname, sep } from 'node:path'
import type { RepositoryFileEntry, RepositoryLanguage, RepositoryManifest, RepositoryScanOptions, ScanWarning } from './contracts.ts'
import { isSecretLikePath, resolveRepositoryScanPolicy, validateRepositoryScanOptions } from './policy.ts'

const languageByExtension: Record<string, RepositoryLanguage> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.mjs': 'javascript',
  '.cjs': 'javascript', '.jsx': 'jsx', '.json': 'json', '.md': 'markdown',
  '.mdx': 'markdown', '.yml': 'yaml', '.yaml': 'yaml', '.css': 'css',
  '.html': 'html', '.htm': 'html', '.sql': 'sql', '.py': 'python',
  '.sh': 'shell', '.bash': 'shell',
}

export const detectRepositoryLanguage = (path: string): RepositoryLanguage =>
  languageByExtension[extname(path).toLowerCase()] ?? 'unknown'

export const isTestFile = (path: string) =>
  /(^|\/)(tests?|__tests__)\//.test(path) || /\.(node\.)?(test|spec)\.(ts|tsx|js|jsx)$/.test(path)

const isGenerated = (path: string) =>
  /(^|\/)(generated|artifacts)\//.test(path) || /\.generated\./.test(path)

const isText = (bytes: Uint8Array) => !bytes.subarray(0, 8192).includes(0)

export async function createRepositoryManifest(options: RepositoryScanOptions): Promise<RepositoryManifest> {
  const issues = validateRepositoryScanOptions(options)
  if (issues.length) {
    throw new Error(`Unsafe repository scan options: ${issues.map(issue => issue.field).join(', ')}`)
  }

  const policy = resolveRepositoryScanPolicy(options)
  const root = await realpath(resolve(options.repositoryRoot))
  const files: RepositoryFileEntry[] = []
  const boundaries: { relativePath: string; marker: any }[] = []
  const warnings: ScanWarning[] = []
  let visited = 0
  let bytes = 0
  let excluded = 0

  const warn = (relativePath: string | null, code: string, message: string) => {
    if (warnings.length < policy.maximumWarningCount) warnings.push({ relativePath, code, message })
  }

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > policy.maximumDirectoryDepth) {
      warn(relative(directory, root), 'depth_limit', 'Directory depth limit reached')
      return
    }

    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      warn(relative(directory, root), 'unreadable_directory', 'Directory could not be read')
      return
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= policy.maximumFiles) {
        warn(null, 'file_count_limit', 'File limit reached')
        return
      }
      if (!policy.includeHiddenFiles && entry.name.startsWith('.')) {
        excluded++
        continue
      }

      const absolute = resolve(directory, entry.name)
      const rel = relative(root, absolute).split(sep).join('/')
      if (!rel || rel.startsWith('../') || resolve(root, rel) !== absolute) {
        warn(null, 'outside_root', 'Path outside repository root rejected')
        continue
      }

      let stat
      try {
        stat = await lstat(absolute)
      } catch {
        warn(rel, 'unreadable', 'Path could not be inspected')
        continue
      }

      if (stat.isSymbolicLink()) {
        excluded++
        warn(rel, 'symbolic_link', 'Symbolic link skipped')
        continue
      }
      if (stat.isDirectory()) {
        if (policy.excludedDirectoryNames.includes(entry.name)) {
          excluded++
          continue
        }
        await walk(absolute, depth + 1)
        continue
      }
      if (!stat.isFile()) continue

      visited++
      if (isSecretLikePath(rel, policy.secretPatterns)) {
        excluded++
        continue
      }
      if (stat.size > policy.maximumFileSizeBytes) {
        excluded++
        warn(rel, 'file_too_large', 'File exceeds size limit')
        continue
      }
      if (bytes + stat.size > policy.maximumTotalBytes) {
        excluded++
        warn(rel, 'total_byte_limit', 'Total byte limit reached')
        continue
      }

      let content
      try {
        content = await readFile(absolute)
      } catch {
        warn(rel, 'unreadable', 'File could not be read')
        continue
      }
      if (!isText(content)) {
        excluded++
        warn(rel, 'binary', 'Binary file skipped')
        continue
      }

      bytes += content.byteLength
      const marker = basename(rel)
      if (['package.json', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].includes(marker)) {
        boundaries.push({ relativePath: rel, marker })
      }
      files.push({
        relativePath: rel,
        language: detectRepositoryLanguage(rel),
        sizeBytes: stat.size,
        packageBoundary: null,
        isTest: isTestFile(rel),
        isGenerated: isGenerated(rel),
      })
    }
  }

  await walk(root, 0)
  const sortedBoundaries = boundaries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  for (const file of files) {
    const candidates = sortedBoundaries.filter(boundary => {
      const boundaryDirectory = boundary.relativePath.includes('/')
        ? boundary.relativePath.slice(0, boundary.relativePath.lastIndexOf('/'))
        : ''
      return boundaryDirectory === '' || file.relativePath === boundary.relativePath || file.relativePath.startsWith(`${boundaryDirectory}/`)
    })
    file.packageBoundary = candidates.at(-1)?.relativePath ?? null
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return {
    files,
    packageBoundaries: sortedBoundaries,
    testFiles: files.filter(file => file.isTest).map(file => ({ relativePath: file.relativePath, frameworkHint: 'node:test' })),
    warnings: warnings.sort((a, b) => (a.relativePath ?? '').localeCompare(b.relativePath ?? '') || a.code.localeCompare(b.code)),
    statistics: { filesVisited: visited, filesIncluded: files.length, bytesInspected: bytes, filesExcluded: excluded },
  }
}
