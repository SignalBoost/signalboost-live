import type { BuilderToolTrace } from './contracts.ts'

export type BuilderVerificationOrder = Readonly<{ command: string; path: string; afterTestChange: boolean }>
const testPath = (path: string) => /(?:^|\/)(?:tests?|__tests__)\/|(?:^|\/)test_[^/]+\.py$|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.(?:go|py)$/.test(path)
const normalizedPath = (value: unknown) => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^(?:\.\/|workspace\/)/, '')
const normalizedCommand = (value: unknown) => String(value || '').trim().replace(/^`|`$/g, '')

/** Explicit user sequencing only. Quoted source blocks are not control instructions. */
export function builderVerificationOrder(objective: string): readonly BuilderVerificationOrder[] {
  const request = objective.replace(/```[\s\S]*?```/g, '')
  const afterTestChange = /\b(?:add|write|create|extend)\b[^.!?\n]{0,100}\b(?:tests?|assertions?|coverage)\b/i.test(request)
  const orders: BuilderVerificationOrder[] = []
  const pattern = /\b(?:run|execute)\s+(`?(?:node|python3?|npm|pnpm|yarn|bun)\s+[^\n]{1,300}?)\s+before\s+(?:changing|editing|modifying|updating|patching|rewriting)\s+`?((?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]+)`?/gi
  for (const match of request.matchAll(pattern)) {
    const prefix = request.slice(Math.max(0, match.index - 30), match.index)
    if (/(?:do not|don't|never|need not|no need to)\s*$/i.test(prefix)) continue
    const command = normalizedCommand(match[1])
    const path = normalizedPath(match[2]).replace(/[.,;]$/, '')
    if (/[;\n]|\s(?:before|after|then)\s/i.test(command) || path.split('/').some(part => part === '..' || part === '.') || testPath(path)) continue
    if (!orders.some(order => order.path === path && order.command === command)) orders.push({ command, path, afterTestChange })
  }
  return orders.slice(0, 8)
}

/** A baseline taken before the requested new tests cannot authorize the implementation edit. */
export function pendingBuilderVerificationOrder(orders: readonly BuilderVerificationOrder[], trace: readonly BuilderToolTrace[]) {
  const testChange = trace.findLastIndex(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file')
    && testPath(normalizedPath(item.input.path)) && (item.output as { pending?: boolean } | undefined)?.pending !== true)
  return orders.filter(order => {
    if (order.afterTestChange && testChange < 0) return true
    return !trace.some((item, index) => {
      if (index <= testChange || item.toolId !== 'run'
        || normalizedCommand(item.input.command) !== order.command) return false
      const output = item.output as { exitCode?: unknown; timedOut?: unknown } | undefined
      return typeof output?.exitCode === 'number' && output.timedOut === false
        && (item.ok ? output.exitCode === 0 : output.exitCode !== 0)
    })
  })
}

export function verificationOrderGuidance(pending: readonly BuilderVerificationOrder[]): string {
  return pending.length ? `REQUIRED VERIFICATION ORDER: ${pending.map(order => `${order.afterTestChange ? 'Add the requested tests/assertions in a test file, then run' : 'Run'} ${JSON.stringify(order.command)} before changing ${JSON.stringify(order.path)}`).join('; ')}. A run made before the new test edit does not satisfy that sequence. A real failing test is useful evidence; timeouts and unexecuted commands do not count.` : ''
}

export function isVerificationProtectedPath(path: unknown, pending: readonly BuilderVerificationOrder[]): boolean {
  return pending.some(order => order.path === normalizedPath(path))
}
