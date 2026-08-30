// A pasted runtime/build log is evidence to analyze, not code to execute or a provenance query.
const OPERATIONAL_LOG = /(?:^\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:running|cloning|installing|restored)\b|\b(?:running|cloning|installing|restored build cache)\b[\s\S]{0,160}\b(?:vercel|next\.js|npm|node)\b|\bvercel cli\s+\d)/im

export type OperationalLogAnalysis = Readonly<{
  failed: boolean
  testFailures: string[]
  command: string | null
  exitCode: number | null
}>

export function isPastedOperationalLog(input: string): boolean {
  return OPERATIONAL_LOG.test(String(input || ''))
}

export function analyzeOperationalLog(input: string): OperationalLogAnalysis {
  const text = String(input || '')
  const testFailures = [...text.matchAll(/^(?:\d{2}:\d{2}:\d{2}\.\d{3}\s+)?✖\s+([^\r\n]+)/gm)]
    .map(match => match[1].trim())
    .filter(Boolean)
    .slice(0, 3)
  const commandMatch = text.match(/Error:\s*Command\s+"([^"]+)"\s+exited\s+with\s+(\d+)/i)
  const exitMatch = text.match(/\bexit(?:ed)?\s+(\d+)\b/i)
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
    return 'This is a partial Vercel build log, not editable source code. The shown entries are warnings and passing tests; the excerpt ends before the final build error. Paste the final error lines after the failure marker and the affected source file, then COS can repair and verify it.'
  }
  const failures = analysis.testFailures.length
    ? ` The failing checks shown are: ${analysis.testFailures.join('; ')}.`
    : ''
  const command = analysis.command
    ? ` The final command \`${analysis.command}\` exited ${analysis.exitCode ?? 'non-zero'}.`
    : analysis.exitCode !== null
      ? ` The build exited ${analysis.exitCode}.`
      : ''
  return `This Vercel build failed.${command}${failures} This is build evidence, not editable source code. Send the affected source file or the final assertion/error block for one failing test, and COS can make and verify the repair.`
}
