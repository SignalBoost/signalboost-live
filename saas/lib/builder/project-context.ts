export type BuilderProjectContext = Readonly<{
  manifestPath: string | null
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null
  scripts: Readonly<Record<string, string>>
  testFiles: readonly string[]
  recommendedTestCommand: string | null
}>

type ProjectFile = Readonly<{ path: string; content?: string }>

function packageManager(files: readonly ProjectFile[]): BuilderProjectContext['packageManager'] {
  const paths = new Set(files.map(file => file.path))
  if (paths.has('pnpm-lock.yaml')) return 'pnpm'
  if (paths.has('yarn.lock')) return 'yarn'
  if (paths.has('bun.lockb') || paths.has('bun.lock')) return 'bun'
  return paths.has('package-lock.json') || paths.has('package.json') ? 'npm' : null
}

function testCommand(manager: BuilderProjectContext['packageManager'], scripts: Readonly<Record<string, string>>, testFiles: readonly string[]): string | null {
  const script = typeof scripts.test === 'string' ? scripts.test.trim() : ''
  // A hardcoded `node --test a.ts b.ts …` suite cannot be aimed with `npm test -- file`.
  // Point at one staged test file or the model OOMs the sandbox (exit 137).
  if (/\bnode\s+--test\s+\S+/.test(script) && testFiles.length > 0) {
    return `node --experimental-strip-types --test ${testFiles[0]}`
  }
  if (script) {
    if (manager === 'pnpm') return 'pnpm test'
    if (manager === 'yarn') return 'yarn test'
    if (manager === 'bun') return 'bun test'
    return 'npm test'
  }
  if (testFiles.length > 0) return `node --test ${testFiles.slice(0, 8).join(' ')}`
  return null
}

export function normalizeBuilderSandboxCommand(command: string): string {
  let next = String(command || '').trim()
  next = next.replace(/^(?:cd\s+(?:\/home\/user\/repos\/saas|\/vercel\/path0\/saas|\/tmp\/cos-builder)\/?\s*&&\s*)+/i, '')
  const aimed = next.match(/^npm\s+(?:run\s+)?test\s+--\s+(\S+)/i)
  if (aimed && /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(aimed[1])) {
    return `node --experimental-strip-types --test ${aimed[1]}`
  }
  return next
}

export function discoverBuilderProjectContext(files: readonly ProjectFile[]): BuilderProjectContext {
  const manifest = files.find(file => file.path === 'package.json')
  let scripts: Record<string, string> = {}
  if (manifest?.content) {
    try {
      const parsed = JSON.parse(manifest.content) as { scripts?: unknown }
      if (parsed.scripts && typeof parsed.scripts === 'object' && !Array.isArray(parsed.scripts)) {
        scripts = Object.fromEntries(Object.entries(parsed.scripts)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .slice(0, 30))
      }
    } catch {
      // The model receives the manifest itself through the workspace read tool; malformed JSON is not invented here.
    }
  }
  const tests = files.map(file => file.path)
    .filter(path => /(^|\/)(__tests__\/.*|tests?\/.*|.*\.(test|spec)\.[cm]?[jt]sx?)$/i.test(path))
    .slice(0, 20)
  const manager = packageManager(files)
  return Object.freeze({
    manifestPath: manifest ? 'package.json' : null,
    packageManager: manager,
    scripts: Object.freeze(scripts),
    testFiles: Object.freeze(tests),
    recommendedTestCommand: testCommand(manager, scripts, tests),
  })
}

export function formatBuilderProjectContext(context: BuilderProjectContext): string {
  const details = {
    manifest: context.manifestPath,
    packageManager: context.packageManager,
    scripts: context.scripts,
    testFiles: context.testFiles,
    recommendedTestCommand: context.recommendedTestCommand,
  }
  return `PROJECT CONTEXT (staged workspace only): ${JSON.stringify(details)}`
}
