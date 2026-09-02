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

export function isOperationalLogEvidence(input: string): boolean {
  return OPERATIONAL_LOG.test(String(input || ''))
}

/** Intent only; this does not grant authority and does not require log evidence. */
export function hasExplicitOperationalLogRepairIntent(input: string): boolean {
  return EXPLICIT_LOG_REPAIR.test(String(input || ''))
}

export function isExplicitOperationalLogRepairRequest(input: string): boolean {
  const text = String(input || '')
  return isOperationalLogEvidence(text) && hasExplicitOperationalLogRepairIntent(text)
}

/**
 * "Pasted operational log" here means passive log evidence. An explicit repair request is
 * intentionally excluded so authenticated Builder/Platform Engineer routing can evaluate it.
 */
export function isPastedOperationalLog(input: string): boolean {
  const text = String(input || '')
  return isOperationalLogEvidence(text) && !isExplicitOperationalLogRepairRequest(text)
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
    return 'The excerpt shows a Vercel build in progress, but it does not include a failing assertion or a non-zero final command, so there is not enough evidence yet to identify a defect. No code was changed. Paste the final error or ✖ assertion and, if you want a code repair, attach the affected source file.'
  }
  const failures = analysis.testFailures.length
    ? ` The failing checks shown are: ${analysis.testFailures.join('; ')}.`
    : ''
  const command = analysis.command
    ? ` The final command \`${analysis.command}\` exited ${analysis.exitCode ?? 'non-zero'}.`
    : analysis.exitCode !== null
      ? ` The build command exited ${analysis.exitCode}.`
      : ''
  return `This Vercel build failed.${command}${failures} No code was changed from the log alone. Attach the affected source file and COS can diagnose, repair, and verify it; if the source is not available, paste the final assertion/error block and COS will continue the diagnosis.`
}
