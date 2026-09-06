import { Sandbox } from '@vercel/sandbox'
import { posix as pathPosix } from 'node:path'
import { BUILDER_TURN_TIMEOUT_ERROR } from './control-adapter.ts'
import type { BuilderFile, BuilderRunnerPort, BuilderRunResult, BuilderWorkspacePort } from './contracts.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { SIGNALBOOST_REPOSITORY_URL } from './repository-repair-target.ts'

const REPOSITORY_ROOT = '/tmp/cos-signalboost-repair'
const PROJECT_ROOT = `${REPOSITORY_ROOT}/saas`
const MAX_FILE_BYTES = 512 * 1024
const MAX_VISIBLE_FILES = 80
const MAX_SEARCH_RESULTS = 32
const MAX_CHANGED_FILES = 30
const MAX_PATCH_BYTES = 480 * 1024
const COMMAND_TIMEOUT_MS = 60_000
const SETUP_TIMEOUT_MS = 90_000
const SANDBOX_LIFETIME_MS = 260_000
const SANDBOX_STOP_TIMEOUT_MS = 5_000
const EXCLUDED_SEGMENTS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.vercel'])
const SECRET_LIKE = /(^|\/)(?:\.env(?:\.[^/]*)?|(?:credentials?|secrets?|tokens?|private[-_.]?key|id_rsa|id_ed25519|service[-_.]?account)(?:\.[^/]*)?)(?:$|\/)|\.(?:pem|key|p12|pfx)$/i
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const RELATIVE_MODULE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\()\s*['"](\.{1,2}\/[^'"\r\n]+)['"]/g
const MODULE_CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.cts'] as const

type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>
type CommandResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function bounded(value: string, maximum = 16_000): string {
  return String(value || '').slice(0, maximum)
}

function absoluteDeadline(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function remainingMs(deadlineAtMs: number | null, requestedMs: number): number {
  if (deadlineAtMs === null) return requestedMs
  const remaining = Math.floor(deadlineAtMs - Date.now())
  if (remaining <= 0) throw new Error(BUILDER_TURN_TIMEOUT_ERROR)
  return Math.max(1, Math.min(requestedMs, remaining))
}

async function withinAbsoluteDeadline<T>(work: Promise<T>, deadlineAtMs: number | null): Promise<T> {
  if (deadlineAtMs === null) return await work
  const timeoutMs = remainingMs(deadlineAtMs, Number.MAX_SAFE_INTEGER)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(BUILDER_TURN_TIMEOUT_ERROR)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function safeRepositoryWorkspacePath(value: unknown): string {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^saas\//, '')
  if (!normalized || normalized.length > 260 || normalized.startsWith('/') || CONTROL_CHARACTER.test(normalized)) throw new Error('builder_invalid_path')
  const segments = normalized.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || EXCLUDED_SEGMENTS.has(segment))) throw new Error('builder_invalid_path')
  if (SECRET_LIKE.test(normalized)) throw new Error('builder_invalid_path')
  return normalized
}

export function safeRepositoryChangedPath(value: unknown): string {
  const normalized = String(value || '').replace(/\\/g, '/')
  if (!normalized.startsWith('saas/')) throw new Error('builder_repository_scope_violation')
  try {
    return safeRepositoryWorkspacePath(normalized)
  } catch {
    throw new Error('builder_repository_scope_violation')
  }
}

function stripProjectPrefix(value: string): string | null {
  try { return safeRepositoryChangedPath(value) } catch { return null }
}

function unique(values: readonly string[], limit = MAX_VISIBLE_FILES): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, limit)
}

function nulPaths(value: string): string[] {
  return value.split('\0').filter(Boolean)
}

/**
 * Discover only one-hop relative module neighbors from an already-authorized visible source file.
 * This gives Platform Engineer enough architectural context to follow a wrapper/re-export after a
 * refactor without exposing the whole repository listing. Aliases, packages, traversal outside the
 * staged `saas/` project, secret-like paths, dependency trees, and build output remain excluded.
 */
export function repositoryDependencyCandidates(importerValue: unknown, sourceValue: unknown): readonly string[] {
  let importer: string
  try { importer = safeRepositoryWorkspacePath(importerValue) } catch { return Object.freeze([]) }
  const source = String(sourceValue || '')
  if (!source || source.includes('\0')) return Object.freeze([])
  const directory = pathPosix.dirname(importer)
  const candidates: string[] = []
  for (const match of source.matchAll(RELATIVE_MODULE_SPECIFIER)) {
    const specifier = String(match[1] || '').trim()
    if (!specifier) continue
    const resolved = pathPosix.normalize(pathPosix.join(directory, specifier))
    if (!resolved || resolved === '..' || resolved.startsWith('../') || pathPosix.isAbsolute(resolved)) continue
    const variants = pathPosix.extname(resolved)
      ? [resolved]
      : [
          ...MODULE_CANDIDATE_EXTENSIONS.map(extension => `${resolved}${extension}`),
          ...MODULE_CANDIDATE_EXTENSIONS.map(extension => `${resolved}/index${extension}`),
        ]
    for (const variant of variants) {
      try { candidates.push(safeRepositoryWorkspacePath(variant)) } catch { /* keep discovery fail-closed */ }
    }
  }
  return Object.freeze(unique(candidates, 32))
}

async function commandOutput(result: Awaited<ReturnType<SandboxInstance['runCommand']>>, maximum = 16_000): Promise<CommandResult> {
  const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
  return Object.freeze({ exitCode: result.exitCode, stdout: bounded(stdout, maximum), stderr: bounded(stderr, maximum) })
}

/**
 * One persistent microVM backs the whole repair turn. The host performs only fixed repository and
 * dependency setup while networking is open, then changes the firewall to deny-all before the model
 * may inspect, edit, or execute anything.
 */
export class VercelRepositoryRepairSession implements BuilderWorkspacePort, BuilderRunnerPort {
  private readonly sandbox: SandboxInstance
  private readonly target: SignalBoostRepositoryRepairTarget
  private readonly deadlineAtMs: number | null
  private readonly visiblePaths = new Set<string>()
  private networkLocked = false

  private constructor(sandbox: SandboxInstance, target: SignalBoostRepositoryRepairTarget, deadlineAtMs: number | null) {
    this.sandbox = sandbox
    this.target = target
    this.deadlineAtMs = deadlineAtMs
  }

  static async create(
    target: SignalBoostRepositoryRepairTarget,
    options?: { deadlineAtMs?: number },
  ): Promise<VercelRepositoryRepairSession> {
    const fullCommitSha = String(target.fullCommitSha || '').toLowerCase()
    if (target.repositoryUrl !== SIGNALBOOST_REPOSITORY_URL || !/^[0-9a-f]{40}$/.test(fullCommitSha)) {
      throw new Error('builder_repository_target_not_authorized')
    }

    const deadlineAtMs = absoluteDeadline(options?.deadlineAtMs)
    const sandboxLifetimeMs = remainingMs(deadlineAtMs, SANDBOX_LIFETIME_MS)
    const sandbox = await withinAbsoluteDeadline(Sandbox.create({
      runtime: 'node24',
      timeout: sandboxLifetimeMs,
      resources: { vcpus: 2 },
      persistent: false,
      networkPolicy: 'allow-all',
      env: { CI: '1', npm_config_audit: 'false', npm_config_fund: 'false' },
      tags: { surface: 'cos-platform-engineer', repository: 'signalboost-live' },
    }), deadlineAtMs)
    const session = new VercelRepositoryRepairSession(sandbox, target, deadlineAtMs)
    try {
      await session.requireSetupSuccess('git', ['init', '--quiet', REPOSITORY_ROOT], '/tmp')
      await session.requireSetupSuccess('git', ['-C', REPOSITORY_ROOT, 'remote', 'add', 'origin', SIGNALBOOST_REPOSITORY_URL], '/tmp')
      await session.requireSetupSuccess('git', ['-C', REPOSITORY_ROOT, 'fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', fullCommitSha], '/tmp')
      await session.requireSetupSuccess('git', ['-C', REPOSITORY_ROOT, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], '/tmp')
      await session.assertPinnedRevision()

      // The dependency graph is pinned by package-lock.json. Install scripts are disabled during
      // bootstrap; repair proof should prefer the narrowest relevant test or typecheck command.
      await session.requireSetupSuccess(
        'npm',
        ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
        PROJECT_ROOT,
        SETUP_TIMEOUT_MS,
      )

      await withinAbsoluteDeadline(sandbox.update({ networkPolicy: 'deny-all' }), deadlineAtMs)
      session.networkLocked = true
      await session.initializeVisiblePaths()
      return session
    } catch (error) {
      await session.close()
      throw error
    }
  }

  private commandTimeout(requestedMs: number): number {
    return remainingMs(this.deadlineAtMs, requestedMs)
  }

  private async exec(cmd: string, args: string[], cwd = PROJECT_ROOT, timeoutMs = COMMAND_TIMEOUT_MS, maximum = 16_000): Promise<CommandResult> {
    try {
      const commandTimeoutMs = this.commandTimeout(timeoutMs)
      const result = await withinAbsoluteDeadline(
        this.sandbox.runCommand({ cmd, args, cwd, timeoutMs: commandTimeoutMs }),
        this.deadlineAtMs,
      )
      return await withinAbsoluteDeadline(commandOutput(result, maximum), this.deadlineAtMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'sandbox_command_failed'
      if (message === BUILDER_TURN_TIMEOUT_ERROR) throw error
      return Object.freeze({ exitCode: 1, stdout: '', stderr: bounded(message, maximum) })
    }
  }

  private async requireSetupSuccess(cmd: string, args: string[], cwd: string, timeoutMs = 30_000): Promise<void> {
    if (this.networkLocked) throw new Error('builder_repository_setup_after_network_lock')
    const result = await this.exec(cmd, args, cwd, timeoutMs)
    if (result.exitCode !== 0) throw new Error(`builder_repository_setup_failed:${bounded(result.stderr || result.stdout, 800)}`)
  }

  private async assertPinnedRevision(): Promise<void> {
    const expected = String(this.target.fullCommitSha || '').toLowerCase()
    const revision = await this.exec('git', ['-C', REPOSITORY_ROOT, 'rev-parse', 'HEAD'], '/tmp', 20_000)
    if (!expected || revision.exitCode !== 0 || revision.stdout.trim().toLowerCase() !== expected) {
      throw new Error('builder_repository_revision_mismatch')
    }
  }

  private async initializeVisiblePaths(): Promise<void> {
    const requested = this.target.pathHints.map(path => stripProjectPrefix(path)).filter((path): path is string => Boolean(path))
    const defaults = ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'scripts/vercel-cos-gates.mjs']
    const symbolMatches: string[] = []
    for (const symbol of this.target.symbolHints.slice(0, 12)) {
      if (!/^[A-Za-z_$][\w$]{0,120}$/.test(symbol)) continue
      const result = await this.exec('git', ['-C', REPOSITORY_ROOT, 'grep', '-l', '-F', '-e', symbol, '--', 'saas'], '/tmp', 20_000, 40_000)
      if (result.exitCode !== 0 && result.exitCode !== 1) continue
      for (const line of result.stdout.split('\n')) {
        const path = stripProjectPrefix(line)
        if (path) symbolMatches.push(path)
      }
    }

    const initial = unique([...requested, ...symbolMatches, ...defaults])
    for (const path of initial) {
      if (await this.isRegularProjectFile(path)) this.visiblePaths.add(path)
    }

    // The model sees only a bounded dependency neighborhood, not a repo-wide file list. Follow one
    // relative import/re-export hop from implicated files so refactors such as a thin wrapper moving
    // implementation to a sibling module do not strand Platform Engineer on the obsolete surface.
    for (const path of unique([...requested, ...symbolMatches], 32)) {
      if (!this.visiblePaths.has(path) || this.visiblePaths.size >= MAX_VISIBLE_FILES) continue
      const file = await this.readFile('', path).catch(() => null)
      if (!file) continue
      for (const dependency of repositoryDependencyCandidates(path, file.content)) {
        if (this.visiblePaths.size >= MAX_VISIBLE_FILES) break
        if (await this.isRegularProjectFile(dependency)) this.visiblePaths.add(dependency)
      }
    }

    if (this.visiblePaths.size === 0) throw new Error('builder_repository_context_empty')
  }

  private absolutePath(path: string): string {
    return `${PROJECT_ROOT}/${safeRepositoryWorkspacePath(path)}`
  }

  private async isRegularProjectFile(path: string): Promise<boolean> {
    const absolute = this.absolutePath(path)
    const result = await this.exec('test', ['-f', absolute], '/tmp', 10_000)
    if (result.exitCode !== 0) return false
    const symlink = await this.exec('test', ['-L', absolute], '/tmp', 10_000)
    return symlink.exitCode !== 0
  }

  private async ensureSafeResolvedParent(path: string): Promise<void> {
    const safe = safeRepositoryWorkspacePath(path)
    const parent = safe.includes('/') ? safe.slice(0, safe.lastIndexOf('/')) : '.'
    const absoluteParent = parent === '.' ? PROJECT_ROOT : `${PROJECT_ROOT}/${parent}`
    const mkdir = await this.exec('mkdir', ['-p', absoluteParent], '/tmp', 10_000)
    if (mkdir.exitCode !== 0) throw new Error('builder_invalid_path')
    const resolved = await this.exec('readlink', ['-f', absoluteParent], '/tmp', 10_000)
    const value = resolved.stdout.trim()
    if (resolved.exitCode !== 0 || (value !== PROJECT_ROOT && !value.startsWith(`${PROJECT_ROOT}/`))) throw new Error('builder_invalid_path')
  }

  async listFiles(_workspaceId: string): Promise<readonly Pick<BuilderFile, 'path' | 'updatedAt'>[]> {
    return Object.freeze([...this.visiblePaths].sort().map(path => Object.freeze({ path, updatedAt: 0 })))
  }

  /**
   * Literal search across the staged project, returning matching paths only — never file bodies.
   *
   * This is the discovery capability the seeded listing cannot provide. Seeding greps the symbols
   * named in the failed build; it cannot anticipate a symbol the model only realises it needs
   * three rounds in, or an implementation that was committed to the wrong directory. Without it
   * the model must guess paths, and a wrong guess is indistinguishable from a missing file.
   *
   * It widens no boundary. `git grep` is already how seeding works, it is scoped to `saas`, every
   * hit passes the same path rules readFile applies, and symlinks and non-regular files are
   * dropped. Matches join the visible set because a path the model has been told exists is a path
   * it may read.
   */
  async searchFiles(_workspaceId: string, value: string): Promise<readonly string[]> {
    const query = String(value || '').trim()
    if (!query || query.length > 200 || query.includes('\0') || CONTROL_CHARACTER.test(query)) return Object.freeze([])
    const result = await this.exec('git', ['-C', REPOSITORY_ROOT, 'grep', '-l', '-F', '-e', query, '--', 'saas'], '/tmp', 20_000, 40_000)
    // Exit 1 is git grep reporting no match, which is an answer, not a failure.
    if (result.exitCode !== 0 && result.exitCode !== 1) return Object.freeze([])
    const found: string[] = []
    for (const line of result.stdout.split('\n')) {
      if (found.length >= MAX_SEARCH_RESULTS) break
      const path = stripProjectPrefix(line)
      if (!path || found.includes(path)) continue
      if (!await this.isRegularProjectFile(path)) continue
      found.push(path)
      this.visiblePaths.add(path)
    }
    return Object.freeze(found)
  }

  async readFile(_workspaceId: string, value: string): Promise<BuilderFile | null> {
    const path = safeRepositoryWorkspacePath(value)
    if (!await this.isRegularProjectFile(path)) return null
    const size = await this.exec('stat', ['-c', '%s', this.absolutePath(path)], '/tmp', 10_000)
    const fileBytes = Number(size.stdout.trim())
    if (size.exitCode !== 0 || !Number.isSafeInteger(fileBytes) || fileBytes < 0 || fileBytes > MAX_FILE_BYTES) throw new Error('builder_file_too_large')
    const encoded = await this.exec('base64', ['-w0', this.absolutePath(path)], '/tmp', 15_000, Math.ceil(fileBytes * 1.5) + 256)
    if (encoded.exitCode !== 0) throw new Error('builder_file_read_failed')
    const content = Buffer.from(encoded.stdout, 'base64').toString('utf8')
    if (content.includes('\0')) throw new Error('builder_binary_file_not_allowed')
    this.visiblePaths.add(path)
    return Object.freeze({ path, content, updatedAt: Date.now() })
  }

  async writeFile(_workspaceId: string, value: string, contentValue: string): Promise<BuilderFile> {
    const path = safeRepositoryWorkspacePath(value)
    const content = String(contentValue ?? '')
    if (bytes(content) > MAX_FILE_BYTES) throw new Error('builder_file_too_large')
    await this.ensureSafeResolvedParent(path)
    const absolute = this.absolutePath(path)
    const symlink = await this.exec('test', ['-L', absolute], '/tmp', 10_000)
    if (symlink.exitCode === 0) throw new Error('builder_invalid_path')
    const encoded = Buffer.from(content, 'utf8').toString('base64')
    const writeScript = "require('node:fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2], 'base64'))"
    const result = await this.exec('node', ['-e', writeScript, absolute, encoded], '/tmp', 20_000)
    if (result.exitCode !== 0) throw new Error('builder_file_write_failed')
    this.visiblePaths.add(path)
    return Object.freeze({ path, content, updatedAt: Date.now() })
  }

  async editFile(workspaceId: string, value: string, searchValue: string, replaceValue: string): Promise<BuilderFile> {
    const path = safeRepositoryWorkspacePath(value)
    const search = String(searchValue ?? '')
    if (!search) throw new Error('builder_edit_search_required')
    const current = await this.readFile(workspaceId, path)
    if (!current) throw new Error('builder_file_not_found')
    const first = current.content.indexOf(search)
    if (first < 0) throw new Error('builder_edit_search_not_found')
    if (current.content.indexOf(search, first + search.length) >= 0) throw new Error('builder_edit_search_not_unique')
    return this.writeFile(workspaceId, path, `${current.content.slice(0, first)}${String(replaceValue ?? '')}${current.content.slice(first + search.length)}`)
  }

  async run(input: { workspaceId: string; command: string; files: readonly BuilderFile[] }): Promise<BuilderRunResult> {
    if (!this.networkLocked) throw new Error('builder_repository_network_not_locked')
    const command = String(input.command || '').trim()
    if (!command || command.length > 2_000 || /[\0\r]/.test(command)) throw new Error('builder_invalid_command')
    const started = Date.now()
    try {
      const commandTimeoutMs = this.commandTimeout(COMMAND_TIMEOUT_MS)
      const result = await withinAbsoluteDeadline(
        this.sandbox.runCommand({ cmd: 'sh', args: ['-lc', command], cwd: PROJECT_ROOT, timeoutMs: commandTimeoutMs }),
        this.deadlineAtMs,
      )
      const [stdout, stderr] = await withinAbsoluteDeadline(
        Promise.all([result.stdout(), result.stderr()]),
        this.deadlineAtMs,
      )
      return Object.freeze({ exitCode: result.exitCode, stdout: bounded(stdout), stderr: bounded(stderr), timedOut: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'sandbox_command_failed'
      if (message === BUILDER_TURN_TIMEOUT_ERROR) throw error
      const timedOut = /timed?\s*out|timeout/i.test(message) || Date.now() - started >= COMMAND_TIMEOUT_MS
      return Object.freeze({ exitCode: timedOut ? 124 : 1, stdout: '', stderr: bounded(message), timedOut })
    }
  }

  async collectChanges(): Promise<Readonly<{ patch: string; files: readonly BuilderFile[] }>> {
    await this.assertPinnedRevision()

    const untrackedResult = await this.exec('git', ['-C', REPOSITORY_ROOT, 'ls-files', '-z', '--others', '--exclude-standard'], '/tmp', 15_000, 80_000)
    if (untrackedResult.exitCode !== 0) throw new Error('builder_repository_diff_failed')
    const untracked = unique(nulPaths(untrackedResult.stdout), MAX_CHANGED_FILES + 1)

    const trackedResult = await this.exec('git', ['-C', REPOSITORY_ROOT, 'diff', '--name-only', '-z', '--diff-filter=ACDMRT', 'HEAD', '--'], '/tmp', 15_000, 80_000)
    if (trackedResult.exitCode !== 0) throw new Error('builder_repository_diff_failed')
    const tracked = unique(nulPaths(trackedResult.stdout), MAX_CHANGED_FILES + 1)

    const allChanged = unique([...tracked, ...untracked], MAX_CHANGED_FILES + 1)
    if (allChanged.length > MAX_CHANGED_FILES) throw new Error('builder_repository_change_limit')
    for (const path of allChanged) safeRepositoryChangedPath(path)

    if (untracked.length) {
      const intent = await this.exec('git', ['-C', REPOSITORY_ROOT, 'add', '-N', '--', ...untracked], '/tmp', 20_000)
      if (intent.exitCode !== 0) throw new Error('builder_repository_diff_failed')
    }

    const names = await this.exec('git', ['-C', REPOSITORY_ROOT, 'diff', '--name-only', '-z', '--diff-filter=ACDMRT', 'HEAD', '--', 'saas'], '/tmp', 15_000, 80_000)
    if (names.exitCode !== 0) throw new Error('builder_repository_diff_failed')
    const changedPaths = unique(nulPaths(names.stdout).map(path => safeRepositoryChangedPath(path)), MAX_CHANGED_FILES + 1)
    if (changedPaths.length > MAX_CHANGED_FILES) throw new Error('builder_repository_change_limit')

    const patchResult = await this.exec('git', ['-C', REPOSITORY_ROOT, 'diff', '--no-ext-diff', '--unified=3', 'HEAD', '--', 'saas'], '/tmp', 30_000, MAX_PATCH_BYTES + 1)
    if (patchResult.exitCode !== 0) throw new Error('builder_repository_diff_failed')
    if (bytes(patchResult.stdout) > MAX_PATCH_BYTES) throw new Error('builder_repository_patch_too_large')
    await this.assertPinnedRevision()

    const files: BuilderFile[] = []
    for (const path of changedPaths) {
      const file = await this.readFile('', path)
      if (file) files.push(file)
    }
    return Object.freeze({ patch: patchResult.stdout, files: Object.freeze(files) })
  }

  async close(): Promise<void> {
    try {
      const stopDeadlineAtMs = Date.now() + SANDBOX_STOP_TIMEOUT_MS
      await Promise.race([
        this.sandbox.stop(),
        new Promise<void>(resolve => setTimeout(resolve, remainingMs(stopDeadlineAtMs, SANDBOX_STOP_TIMEOUT_MS))),
      ])
    } catch {
      // Cleanup remains best-effort; the sandbox lifetime is also bounded by the request deadline.
    }
  }
}
