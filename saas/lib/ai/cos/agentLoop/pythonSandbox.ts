// saas/lib/ai/cos/agentLoop/pythonSandbox.ts
//
// The COS code-execution tool: the same shape frontier assistants use for data analysis. A
// short-lived Vercel Sandbox runs model-written Python against files the harness staged (data the
// turn retrieved, never data the model typed). Network is opened only for the package index while
// pinned libraries install, then closed (deny-all) before any model code runs. One sandbox per turn,
// reused across run_python calls, always stopped when the turn ends.

import { randomUUID } from 'node:crypto'
import { Sandbox } from '@vercel/sandbox'

const WORK = '/tmp/work'
const PYLIB = '/tmp/work/.pylib'
const SANDBOX_TIMEOUT_MS = 150_000
const INSTALL_TIMEOUT_MS = 60_000
const RUN_TIMEOUT_MS = 40_000
const STDOUT_LIMIT = 8_000
const STDERR_LIMIT = 4_000
const MAX_IMAGES = 3
const MAX_IMAGE_BYTES = 4_000_000
// Runs the model's program with file opens instrumented: every path under data/ that the program
// opens is appended to a per-session log the harness reads afterwards. builtins.open and io.open
// cover open(), json.load(open()), pathlib, csv and pandas readers.
export function runnerSource(readLog: string): string {
  return [
    'import builtins, io, os, runpy',
    '_original_open = io.open',
    `_log = ${JSON.stringify(readLog)}`,
    'def _tracked_open(file, *args, **kwargs):',
    '    try:',
    '        path = os.path.relpath(os.path.abspath(os.fspath(file)), "/tmp/work")',
    '        if path.startswith("data" + os.sep) and os.path.isfile(os.path.join("/tmp/work", path)):',
    '            with _original_open(_log, "a") as handle:',
    '                handle.write(path + "\\n")',
    '    except Exception:',
    '        pass',
    '    return _original_open(file, *args, **kwargs)',
    'builtins.open = _tracked_open',
    'io.open = _tracked_open',
    'runpy.run_path("main.py", run_name="__main__")',
  ].join('\n')
}

const PACKAGE_INDEX_HOSTS = Object.freeze(['pypi.org', 'files.pythonhosted.org'])
// Libraries the model may import. Only these are ever installed; nothing else reaches the index.
const BASE_PACKAGES = Object.freeze(['matplotlib==3.10.7', 'numpy==2.3.4'])
const OPTIONAL_PACKAGES: Readonly<Record<string, string>> = Object.freeze({ pandas: 'pandas==2.3.3' })

export type StagedFile = Readonly<{ path: string; content: string }>
export type PythonImage = Readonly<{ name: string; png: Buffer }>
export type PythonRunResult = Readonly<{
  /** data/ files the program actually opened (instrumented, not inferred from the source text). */
  dataReads: readonly string[]
  exitCode: number
  stdout: string
  stderr: string
  images: readonly PythonImage[]
  timedOut: boolean
}>

export interface PythonSession {
  run(input: { code: string; files: readonly StagedFile[]; timeoutMs?: number }): Promise<PythonRunResult>
  close(): Promise<void>
}

type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>

const bounded = (value: string, limit: number): string => {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars]` : text
}

export function stagedDataPath(name: string): string {
  const safe = String(name || '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80)
  if (!safe) throw new Error('cos_agent_invalid_data_name')
  return `data/${safe}`
}

/** Packages the code needs beyond the always-installed base set. */
export function optionalPackagesFor(code: string): string[] {
  return Object.entries(OPTIONAL_PACKAGES)
    .filter(([module]) => new RegExp(`^\\s*(?:import|from)\\s+${module}\\b`, 'm').test(code))
    .map(([, pinned]) => pinned)
}

export class VercelPythonSession implements PythonSession {
  private sandbox: SandboxInstance | null = null
  private readonly installed = new Set<string>()
  private readonly createSandbox: typeof Sandbox.create
  private readonly readLog = `/tmp/.cos-reads-${randomUUID()}`

  constructor(createSandbox: typeof Sandbox.create = Sandbox.create) {
    this.createSandbox = createSandbox
  }

  private async install(sandbox: SandboxInstance, packages: readonly string[]): Promise<string | null> {
    const missing = packages.filter(name => !this.installed.has(name))
    if (!missing.length) return null
    await sandbox.updateNetworkPolicy({ allow: [...PACKAGE_INDEX_HOSTS] })
    try {
      const result = await sandbox.runCommand({
        cmd: 'python3',
        args: ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '--no-input', '--only-binary=:all:', '--target', PYLIB, ...missing],
        cwd: WORK,
        timeoutMs: INSTALL_TIMEOUT_MS,
      })
      if (result.exitCode !== 0) return bounded(await result.stderr(), STDERR_LIMIT) || 'package installation failed'
      for (const name of missing) this.installed.add(name)
      return null
    } finally {
      // Model code never runs with network access.
      await sandbox.updateNetworkPolicy('deny-all')
    }
  }

  private async ready(): Promise<SandboxInstance> {
    if (this.sandbox) return this.sandbox
    const sandbox = await this.createSandbox({
      runtime: 'python3.13',
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 2 },
      networkPolicy: 'deny-all',
      persistent: false,
      env: { HOME: '/tmp', MPLBACKEND: 'Agg', PYTHONPATH: PYLIB, PYTHONDONTWRITEBYTECODE: '1' },
      tags: { surface: 'cos-agent-python' },
    })
    try {
      const prepared = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '--', `${WORK}/data`, `${WORK}/out`, PYLIB], timeoutMs: 10_000 })
      if (prepared.exitCode !== 0) throw new Error('cos_agent_sandbox_prepare_failed')
      this.sandbox = sandbox
      return sandbox
    } catch (error) {
      await sandbox.stop().catch(() => undefined)
      throw error
    }
  }

  async run(input: { code: string; files: readonly StagedFile[]; timeoutMs?: number }): Promise<PythonRunResult> {
    const code = String(input.code || '')
    if (!code.trim() || code.length > 40_000) {
      return { dataReads: [], exitCode: 2, stdout: '', stderr: 'code must be 1-40000 characters', images: [], timedOut: false }
    }
    try {
      const sandbox = await this.ready()
      const installError = await this.install(sandbox, [...BASE_PACKAGES, ...optionalPackagesFor(code)])
      if (installError) return { dataReads: [], exitCode: 3, stdout: '', stderr: `Package installation failed: ${installError}`, images: [], timedOut: false }
      await sandbox.runCommand({ cmd: 'sh', args: ['-c', `rm -f ${WORK}/out/* ${this.readLog}`], timeoutMs: 10_000 })
      await sandbox.writeFiles([
        ...input.files.map(file => ({ path: `${WORK}/${file.path}`, content: Buffer.from(file.content, 'utf8') })),
        { path: `${WORK}/main.py`, content: Buffer.from(code, 'utf8') },
        { path: `${WORK}/.cos_runner.py`, content: Buffer.from(runnerSource(this.readLog), 'utf8') },
      ])
      let exitCode = 124
      let stdout = ''
      let stderr = ''
      let timedOut = false
      try {
        const result = await sandbox.runCommand({ cmd: 'python3', args: ['.cos_runner.py'], cwd: WORK, timeoutMs: Math.max(5_000, Math.min(RUN_TIMEOUT_MS, input.timeoutMs ?? RUN_TIMEOUT_MS)) })
        exitCode = result.exitCode
        ;[stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
      } catch (error) {
        stderr = error instanceof Error ? error.message : 'execution failed'
        timedOut = /timeout|timed out|SIGKILL/i.test(stderr)
      }
      const images: PythonImage[] = []
      const listing = await sandbox.runCommand({ cmd: 'sh', args: ['-c', `ls -1 ${WORK}/out 2>/dev/null | grep -i '\\.png$' | head -n ${MAX_IMAGES}`], timeoutMs: 10_000 })
      for (const name of (await listing.stdout()).split('\n').map(value => value.trim()).filter(Boolean)) {
        const png = await sandbox.readFileToBuffer({ path: `${WORK}/out/${name}` })
        if (png && png.length <= MAX_IMAGE_BYTES && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) images.push({ name, png })
      }
      const reads = await sandbox.readFileToBuffer({ path: this.readLog }).catch(() => null)
      const dataReads = [...new Set(String(reads || '').split('\n').map(value => value.trim()).filter(value => value.startsWith('data/')))]
      return { dataReads, exitCode, stdout: bounded(stdout, STDOUT_LIMIT), stderr: bounded(stderr, STDERR_LIMIT), images, timedOut }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'sandbox unavailable'
      return { dataReads: [], exitCode: 125, stdout: '', stderr: bounded(`Sandbox unavailable: ${message}`, STDERR_LIMIT), images: [], timedOut: false }
    }
  }

  async close(): Promise<void> {
    const sandbox = this.sandbox
    this.sandbox = null
    if (sandbox) await sandbox.stop().catch(() => undefined)
  }
}
