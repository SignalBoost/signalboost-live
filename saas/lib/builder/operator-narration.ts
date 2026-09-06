import { builderEvidenceEvents } from './evidence-events.ts'

type OperatorTraceEntry = Readonly<{
  round?: number
  toolId?: string
  ok?: boolean
  input?: Record<string, unknown>
  output?: unknown
  error?: string
  failureClass?: string
  remediation?: string
  command?: string
  path?: string
  exitCode?: number
}>

type OperatorRepairResult = Readonly<{
  ok: boolean
  answer?: string
  error?: string
  trace?: readonly OperatorTraceEntry[]
}>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function commandOf(entry: OperatorTraceEntry | undefined): string {
  return text(entry?.command) || text(entry?.input?.command)
}

function pathOf(entry: OperatorTraceEntry): string {
  return text(entry.path)
    || text(entry.input?.path)
    || text(entry.input?.filePath)
    || text(entry.input?.filename)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function quotedPaths(paths: readonly string[]): string {
  return paths.map(path => `\`${path}\``).join(', ')
}

function failureLabel(value: unknown): string {
  const normalized = text(value).replace(/[_-]+/g, ' ')
  return normalized || 'unclassified'
}

function latestFailure(trace: readonly OperatorTraceEntry[]): OperatorTraceEntry | undefined {
  return [...trace].reverse().find(entry => entry.ok === false)
}

function latestRemediation(trace: readonly OperatorTraceEntry[]): string {
  return text([...trace].reverse().find(entry => entry.ok === false && text(entry.remediation))?.remediation)
}

/**
 * User-facing repair narration is derived only from recorded Builder tool evidence. It deliberately
 * avoids exposing model chain-of-thought or presenting an internal error code as the conversation.
 */
export function formatBuilderOperatorRepairReply(result: OperatorRepairResult): string {
  const trace = Array.isArray(result.trace) ? result.trace : []
  const events = builderEvidenceEvents(trace)
  const failedRun = trace.find((_, index) => events[index].outcome === 'exited_nonzero')
  const successfulRuns = trace.filter((_, index) => events[index].outcome === 'exited_zero')
  const successfulRun = successfulRuns.at(-1)
  const changedPaths = unique(trace
    .filter((_, index) => events[index].outcome === 'mutation_recorded')
    .map(pathOf))
  const lastFailure = latestFailure(trace)

  const lines: string[] = []
  if (failedRun) {
    lines.push('Found — I reproduced the reported failure in the isolated Builder workspace.')
    const command = commandOf(failedRun)
    lines.push(command
      ? `Diagnosed — the ${failureLabel(failedRun.failureClass)} failure was isolated with \`${command}\`.`
      : `Diagnosed — the ${failureLabel(failedRun.failureClass)} failure was isolated from the recorded tool evidence.`)
  } else {
    lines.push('Found — I inspected the repair request and the available workspace evidence.')
    lines.push(/budget_exhausted|builder_turn_timeout/.test(text(result.error))
      ? 'Diagnosed — the work limit was reached before verification completed.'
      : lastFailure
      ? `Diagnosed — the remaining blocker is a ${failureLabel(lastFailure.failureClass)} failure.`
      : 'Diagnosed — no failing proof was recorded before the terminal result.')
  }

  if (result.ok) {
    if (changedPaths.length) lines.push(`Fixed — updated ${quotedPaths(changedPaths)}.`)
    else lines.push('Fixed — no code change was required because the supplied proof was already passing.')

    if (successfulRun) {
      const command = commandOf(successfulRun)
      lines.push(command
        ? `Verified — \`${command}\` passed with exit code 0.`
        : 'Verified — the recorded proving command passed with exit code 0.')
    } else {
      lines.push('Verification — no successful proving command was recorded, so I am not labeling this repair verified.')
    }

    return lines.join('\n')
  }

  lines.push(changedPaths.length
    ? `Fixing — I changed ${quotedPaths(changedPaths)}, but the proof has not passed yet.`
    : 'Fixing — no safe code change reached a passing proof in this run.')
  lines.push('Verification — not passed yet. I am not calling this fixed.')
  const remediation = latestRemediation(trace)
  lines.push(`Next action — ${remediation || 'use the recorded failure evidence for the next targeted repair attempt.'}`)
  return lines.join('\n')
}
