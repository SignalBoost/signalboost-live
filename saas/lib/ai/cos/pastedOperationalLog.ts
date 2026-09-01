// A pasted runtime/build log is evidence to analyze, not code to execute, a provenance query,
// a visual job, or a request to portray anyone named inside a test title.
const OPERATIONAL_LOG = /(?:^\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:running|cloning|installing|restored)\b|\b(?:running|cloning|installing|restored build cache)\b[\s\S]{0,400}\b(?:vercel|next\.js|npm|node)\b|\bvercel cli\s+\d|\b(?:✖\s+failing tests|ℹ\s+fail\s+\d+|error:\s*command\s+")\b)/im

// Explicit repair language is authority intent, not proof of authority. Callers still have to
// enforce authentication, exact repository/source scope, and the relevant Builder safety lane.
// Keep this deliberately narrow so words such as "failed", "error", or test names inside the
// pasted log cannot accidentally turn passive evidence into an execution request.
const EXPLICIT_LOG_REPAIR = /(?:^|[\n.!?]\s*)(?:please\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:this|the\s+(?:build|failure|error|code|problem)|it)\b|\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:this|it|the\s+(?:build|failure|error|problem))\b|\bi\s+(?:need|want)\s+(?:you\s+to\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:this|it|the\s+(?:build|failure|error|problem))\b/i

export type OperationalLogAnalysis = Readonly<{
  failed: boolean
  testFailures: string[]
  command: string | null
  exitCode: number | null
}>

export function isExplicitOperationalLogRepairRequest(input: string): boolean {
  const text = String(input || '')
  return OPERATIONAL_LOG.test(text) && EXPLICIT_LOG_REPAIR.test(text)
}

/**
 * "Pasted operational log" here means passive log evidence. An explicit repair request is
 * intentionally excluded so authenticated Builder/Platform Engineer routing can evaluate it.
 */
export function isPastedOperationalLog(input: string): boolean {
  const text = String(input || '')
  return OPERATIONAL_LOG.test(text) && !isExplicitOperationalLogRepairRequest(text)
}

export function analyzeOperationalLog(input: string): OperationalLogAnalysis {
  const text = String(input || '')
  const testFailures = [...text.matchAll(/^(?:\d{2}:\d{2}:\d{2}\.\d{3}\s+)?✖\s+([^\r\n]+)/gm)]
    .map(match => match[1].trim())
    .filter(line => !/^failing tests:?$/i.test(line))
    .filter(Boolean)
    .slice(0, 3)
  const commandMatch = text.match(/Error:\s*Command\s+"([^"]+)"\s+exited\s+with\s+(\d+)/i)
  // Vercel always prints `Running "exit 1"` before the real command. That is not the build result.
  const exitMatch = text.match(/\b(?:exited with|command "[^"]+" exited with)\s+(\d+)\b/i)
  const exitCode = Number(commandMatch?.[2] || exitMatch?.[1])
  return {
    failed: testFailures.length > 0 || (Number.isFinite(exitCode) && exitCode !== 0),
    testFailures,
    command: commandMatch?.[1] || null,
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
  }
}

export function operationalLogReply(input: string): string {
  const analysis = analyzeOperationalLog(input)
  if (!analysis.failed) {
    return 'This is a Vercel build log, not editable source code and not a request to portray anyone. The shown entries are setup, warnings, or passing tests. Paste the lines after "failing tests" (the ✖ assertions) and the affected source file if you want a repair.'
  }
  const failures = analysis.testFailures.length
    ? ` The failing checks shown are: ${analysis.testFailures.join('; ')}.`
    : ''
  const command = analysis.command
    ? ` The final command \`${analysis.command}\` exited ${analysis.exitCode ?? 'non-zero'}.`
    : analysis.exitCode !== null
      ? ` The build command exited ${analysis.exitCode}.`
      : ''
  return `This Vercel build failed.${command}${failures} Names that appear inside test titles are not people to draw or invent. This is build evidence, not editable source code. Send the affected source file or the final assertion/error block for one failing test, and COS can make and verify the repair.`
}
