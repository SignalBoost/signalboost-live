import type { BuilderFailureClass, BuilderLoopResult, BuilderToolTrace, BuilderVerifiedRepairLesson } from './contracts.ts'

const bounded = (value: unknown, length: number) => String(value || '').replace(/\u0000/g, '').slice(0, length)

function command(trace: BuilderToolTrace): string {
  return bounded(trace.input.command, 2_000)
}

function runSucceeded(trace: BuilderToolTrace): boolean {
  return trace.toolId === 'run' && trace.ok && Number((trace.output as { exitCode?: unknown } | undefined)?.exitCode) === 0
}

/** Never admits chat history or an unproven response as a Builder lesson. */
export function verifiedRepairLesson(result: BuilderLoopResult): BuilderVerifiedRepairLesson | null {
  if (!result.ok) return null
  const failed = result.trace.find(item => !item.ok && item.failureClass)
  if (!failed?.failureClass) return null
  const failedAt = result.trace.indexOf(failed)
  const proof = result.trace.slice(failedAt + 1).find(runSucceeded)
  if (!proof) return null
  const output = failed.output as { stdout?: unknown; stderr?: unknown } | undefined
  const causeEvidence = bounded(output?.stderr || output?.stdout || failed.error, 2_000)
  const fixSummary = bounded(result.answer, 2_000)
  const regressionCommand = command(proof)
  if (!causeEvidence || !fixSummary || !regressionCommand) return null
  return Object.freeze({
    failureClass: failed.failureClass,
    causeEvidence,
    fixSummary,
    regressionCommand,
    runtime: 'node24-network-denied-ephemeral',
  })
}

/**
 * Prior lessons are deliberately not replayed as code, commands, model summaries, or
 * raw error text. They are a bounded signal that this failure class was previously
 * repaired in the same fixed runtime, and are shown only after a matching failure.
 */
export function formatVerifiedLessonsForPrompt(
  lessons: readonly BuilderVerifiedRepairLesson[],
  observedFailureClass: BuilderFailureClass | null,
): string {
  if (!observedFailureClass) return ''
  const matches = lessons.filter(lesson => lesson.failureClass === observedFailureClass && lesson.runtime === 'node24-network-denied-ephemeral').length
  if (!matches) return ''
  return `PRIOR VERIFIED REPAIR HISTORY: ${matches} prior ${observedFailureClass} repair lesson(s) passed a regression command in this same node24, network-denied, ephemeral environment. This is only a hint: use the current turn's evidence, do not reuse prior code, commands, raw errors, or model summaries.`
}
