// saas/lib/builder/vercel-sandbox-runner.ts
import { Sandbox } from '@vercel/sandbox'
import type { BuilderRunResult, BuilderRunnerPort } from './contracts.ts'
import { normalizeBuilderSandboxCommand } from './project-context.ts'
import { builderDependencyPlan, validateBuilderLock } from './dependencies.ts'
import { builderFilePath } from './file-chunks.ts'

const ROOT = '/tmp/cos-builder'
const COMMAND_TIMEOUT_MS = 20_000
const SANDBOX_TIMEOUT_MS = 100_000
const OUTPUT_LIMIT = 16_000
const bounded = (value: string): string => String(value || '').slice(0, OUTPUT_LIMIT)

/** Host installs declared registry packages before exposing source. All user commands run deny-all. */
export class VercelSandboxBuilderRunner implements BuilderRunnerPort {
  private readonly createSandbox: typeof Sandbox.create
  constructor(createSandbox: typeof Sandbox.create = Sandbox.create) { this.createSandbox = createSandbox }
  async run(input: { workspaceId: string; command: string; files: readonly { path: string; content: string }[] }): Promise<BuilderRunResult> {
    const command = normalizeBuilderSandboxCommand(String(input.command || '').trim(), input.files)
    if (!command || command.length > 2_000) throw new Error('builder_invalid_command')
    for (const file of input.files) builderFilePath(file.path)
    const dependencies = builderDependencyPlan(input.files)
    const sandbox = await this.createSandbox({
      runtime: 'node24', timeout: SANDBOX_TIMEOUT_MS, resources: { vcpus: 1 },
      networkPolicy: 'deny-all', persistent: false, env: { HOME: '/tmp' }, tags: { surface: 'cos-builder' },
    })
    const generatedFiles: { path: string; content: string }[] = []
    try {
      const prepared = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '--', ROOT], timeoutMs: COMMAND_TIMEOUT_MS })
      if (prepared.exitCode !== 0) throw new Error('builder_sandbox_root_failed')
      if (dependencies) {
        await sandbox.writeFiles([
          { path: `${ROOT}/package.json`, content: Buffer.from(dependencies.manifest) },
          { path: '/tmp/builder-user.npmrc', content: Buffer.from('') },
          { path: '/tmp/builder-global.npmrc', content: Buffer.from('') },
          ...(dependencies.lock ? [{ path: `${ROOT}/package-lock.json`, content: Buffer.from(dependencies.lock) }] : []),
        ])
        await sandbox.updateNetworkPolicy({ allow: ['registry.npmjs.org'] })
        try {
          const install = await sandbox.runCommand({ cmd: 'npm',
            args: [dependencies.command, '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org',
              '--userconfig=/tmp/builder-user.npmrc', '--globalconfig=/tmp/builder-global.npmrc'], cwd: ROOT, timeoutMs: 60_000 })
          if (install.exitCode !== 0) return { exitCode: install.exitCode, stdout: '',
            stderr: `Dependency installation failed before the requested command ran: ${bounded(await install.stderr())}`, timedOut: false,
            executedCommand: `npm ${dependencies.command} --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --userconfig=/tmp/builder-user.npmrc --globalconfig=/tmp/builder-global.npmrc` }
          if (!dependencies.lock) {
            const lock = await sandbox.runCommand({ cmd: 'cat', args: [`${ROOT}/package-lock.json`], timeoutMs: 5_000 })
            if (lock.exitCode !== 0) throw new Error('builder_dependency_lock_missing')
            const content = await lock.stdout()
            if (Buffer.byteLength(content) > 512 * 1024) throw new Error('builder_dependency_lock_too_large')
            validateBuilderLock(content)
            generatedFiles.push({ path: 'package-lock.json', content })
          }
        } finally {
          // If closing egress fails, source staging and execution never happen.
          await sandbox.updateNetworkPolicy('deny-all')
        }
      }
      await sandbox.writeFiles(input.files.map(file => ({ path: `${ROOT}/${file.path}`, content: Buffer.from(file.content, 'utf8') })))
      try {
        const result = await sandbox.runCommand({ cmd: 'sh', args: ['-lc', command], cwd: ROOT, timeoutMs: COMMAND_TIMEOUT_MS })
        const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
        return { exitCode: result.exitCode, stdout: bounded(stdout), stderr: bounded(stderr), timedOut: false, generatedFiles }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'builder_sandbox_execution_failed'
        return { exitCode: 124, stdout: '', stderr: bounded(message), timedOut: /timeout|timed out|SIGKILL/i.test(message), generatedFiles }
      }
    } finally {
      await sandbox.stop().catch(() => undefined)
    }
  }
}
