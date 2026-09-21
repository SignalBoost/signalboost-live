// saas/provider-hub-host/mcp-stdio-transport.ts
//
// Host-owned MCP stdio transport.
//
// This module is intentionally outside Provider Hub core. The core knows JSON-RPC and exact
// scope; the host owns process lifecycle, executable selection, package installation, environment,
// filesystem and browser availability. Nothing in the registry may choose an arbitrary command.
//
// MCP stdio is newline-delimited JSON-RPC on stdin/stdout. Server logs belong on stderr. Each
// transport instance owns one child process so initialize -> notifications/initialized ->
// tools/list -> tools/call all share one MCP session.
//
// Security:
// - shell=false; no registry field is ever interpolated into a shell command.
// - the command resolver is host code, keyed by exact serverId + transportRef + scope.
// - child environment is minimal unless the host explicitly supplies additional values.
// - stdout lines are bounded and malformed JSON fails the process closed.
// - stderr is never surfaced in thrown errors because upstream logs can contain page data.
// - close() terminates the server so a launched browser cannot outlive the governed session.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  McpOutboundScope,
  McpOutboundTransport,
  McpOutboundTransportInput,
} from './mcp-outbound-client.ts'

export const MCP_STDIO_TRANSPORT_VERSION = 'mcp-stdio-transport-v1' as const

export interface McpStdioCommand {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}

export interface McpStdioCommandResolver {
  resolve(input: {
    serverId: string
    transportRef: string
    scope: McpOutboundScope
  }): McpStdioCommand
}

export interface McpStdioTransportFactory {
  create(input: {
    serverId: string
    transportRef: string
    scope: McpOutboundScope
  }): McpOutboundTransport
}

type Pending = {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`mcp_stdio_${name}_required`)
  return normalized
}

function scopeKey(scope: McpOutboundScope): string {
  return [scope.tenantId, scope.environmentId, scope.portableId].map(value => required(value, 'scope')).join('\u0000')
}

function responseId(value: unknown): string | number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as Record<string, unknown>).id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

function safeEnvironment(extra?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    TMPDIR: process.env.TMPDIR || '/tmp',
    CI: process.env.CI || '1',
    NO_COLOR: '1',
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (!key || key.includes('\0') || typeof value !== 'string' || value.includes('\0')) {
      throw new Error('mcp_stdio_invalid_environment')
    }
    base[key] = value
  }
  return base
}

class NodeMcpStdioTransport implements McpOutboundTransport {
  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = ''
  private readonly pending = new Map<string | number, Pending>()
  private closed = false

  constructor(
    private readonly serverId: string,
    private readonly transportRef: string,
    private readonly fixedScope: McpOutboundScope,
    private readonly command: McpStdioCommand,
    private readonly maxLineBytes: number,
  ) {}

  private assertInput(input: McpOutboundTransportInput): void {
    if (input.serverId !== this.serverId) throw new Error('mcp_stdio_server_scope_mismatch')
    if (scopeKey(input.scope) !== scopeKey(this.fixedScope)) throw new Error('mcp_stdio_portable_scope_mismatch')
    if (this.closed) throw new Error('mcp_stdio_transport_closed')
  }

  private rejectAll(code: string): void {
    const error = new Error(code)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    if (Buffer.byteLength(this.stdoutBuffer, 'utf8') > this.maxLineBytes) {
      this.rejectAll('mcp_stdio_response_too_large')
      this.child?.kill('SIGTERM')
      return
    }

    for (;;) {
      const newline = this.stdoutBuffer.indexOf('\n')
      if (newline < 0) break
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (!line) continue

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        this.rejectAll('mcp_stdio_invalid_json')
        this.child?.kill('SIGTERM')
        return
      }

      const id = responseId(parsed)
      if (id === null) continue // server notification/progress event; not a request response.
      const pending = this.pending.get(id)
      if (!pending) continue
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.resolve(parsed)
    }
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    if (this.closed) throw new Error('mcp_stdio_transport_closed')

    const command = required(this.command.command, 'command')
    const args = Object.freeze([...(this.command.args ?? [])].map((arg) => required(arg, 'argument')))
    const child = spawn(command, args, {
      cwd: this.command.cwd,
      env: safeEnvironment(this.command.env),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => this.handleStdout(String(chunk)))
    // Deliberately drain stderr without exposing it. MCP server logs may contain page data.
    child.stderr.on('data', () => {})
    child.once('error', () => this.rejectAll('mcp_stdio_process_error'))
    child.once('close', code => {
      this.child = null
      if (!this.closed) this.rejectAll(`mcp_stdio_process_exited:${code ?? 'unknown'}`)
    })
    this.child = child
    return child
  }

  private write(request: Readonly<Record<string, unknown>>): void {
    const child = this.ensureStarted()
    const line = JSON.stringify(request)
    if (Buffer.byteLength(line, 'utf8') > this.maxLineBytes) throw new Error('mcp_stdio_request_too_large')
    child.stdin.write(`${line}\n`)
  }

  async send(input: McpOutboundTransportInput): Promise<unknown> {
    this.assertInput(input)
    const id = responseId(input.request)
    if (id === null) throw new Error('mcp_stdio_request_id_required')
    if (this.pending.has(id)) throw new Error('mcp_stdio_duplicate_request_id')

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('mcp_stdio_request_timeout'))
      }, input.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.write(input.request)
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('mcp_stdio_write_failed'))
      }
    })
  }

  async notify(input: McpOutboundTransportInput): Promise<void> {
    this.assertInput(input)
    if (Object.prototype.hasOwnProperty.call(input.request, 'id')) {
      throw new Error('mcp_stdio_notification_must_not_have_id')
    }
    this.write(input.request)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.rejectAll('mcp_stdio_transport_closed')
    const child = this.child
    this.child = null
    if (!child || child.killed) return

    child.stdin.end()
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      child.once('close', finish)
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL')
        finish()
      }, 1_000).unref()
    })
  }
}

export function createNodeMcpStdioTransportFactory(options: {
  commandResolver: McpStdioCommandResolver
  maxLineBytes?: number
}): McpStdioTransportFactory {
  if (!options?.commandResolver || typeof options.commandResolver.resolve !== 'function') {
    throw new Error('mcp_stdio_command_resolver_required')
  }
  const maxLineBytes = Number.isInteger(options.maxLineBytes) && Number(options.maxLineBytes) > 0
    ? Number(options.maxLineBytes)
    : 2 * 1024 * 1024

  return Object.freeze({
    create(input) {
      const serverId = required(input.serverId, 'server_id')
      const transportRef = required(input.transportRef, 'transport_ref')
      const fixedScope = Object.freeze({ ...input.scope })
      const command = options.commandResolver.resolve({ serverId, transportRef, scope: fixedScope })
      return new NodeMcpStdioTransport(serverId, transportRef, fixedScope, command, maxLineBytes)
    },
  })
}
