import { Sandbox } from '@vercel/sandbox'
import type { BuilderRunResult, BuilderRunnerPort } from './contracts.ts'

const ROOT = '/tmp/cos-builder'
const COMMAND_TIMEOUT_MS = 20_000
const SANDBOX_TIMEOUT_MS = 45_000
const OUTPUT_LIMIT = 16_000

function bounded(value: string): string { return String(value || '').slice(0, OUTPUT_LIMIT) }
function parent(path: string): string { return path.slice(0, path.lastIndexOf('/')) }
function shellQuote(value: string): string { return `'${String(value).replace(/'/g, "'\\\"'\\\"'")}'` }

/** Executes only the supplied user workspace inside an ephemeral, network-denied MicroVM. */
export class VercelSandboxBuilderRunner implements BuilderRunnerPort {
  async run(input: { workspaceId: string; command: string; files: readonly { path: string; content: string }[] }): Promise<BuilderRunResult> {
    const command = String(input.command || '').trim()
    if (!command || command.length > 2_000) throw new Error('builder_invalid_command')
    const sandbox = await Sandbox.create({
      runtime: 'node24',
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 1 },
      networkPolicy: 'deny-all',
      persistent: false,
      // runtime: node24 supplies Node on its own runtime PATH. Do not replace PATH here:
      // doing so hides the runtime binary and makes every `node` command fail.
      env: { HOME: '/tmp' },
      tags: { surface: 'cos-builder' },
    })
    try {
      for (const file of input.files) {
        const destination = `${ROOT}/${file.path}`
        const encoded = Buffer.from(file.content, 'utf8').toString('base64')
        const directory = parent(destination) || ROOT
        const stage = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-lc', `mkdir -p -- ${shellQuote(directory)} && printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(destination)}`],
          timeoutMs: COMMAND_TIMEOUT_MS,
        })
        if (stage.exitCode !== 0) throw new Error('builder_sandbox_stage_failed')
      }
      try {
        const result = await sandbox.runCommand({ cmd: 'sh', args: ['-lc', `cd ${ROOT} && ${command}`], cwd: ROOT, timeoutMs: COMMAND_TIMEOUT_MS })
        const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
        return { exitCode: result.exitCode, stdout: bounded(stdout), stderr: bounded(stderr), timedOut: false }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'builder_sandbox_execution_failed'
        return { exitCode: 124, stdout: '', stderr: bounded(message), timedOut: /timeout|timed out|SIGKILL/i.test(message) }
      }
    } finally {
      await sandbox.stop().catch(() => undefined)
    }
  }
}
