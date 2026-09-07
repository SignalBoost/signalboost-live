// saas/lib/ai/cos/pastedOperationalLog.ts
// A pasted runtime/build log is evidence to analyze, not code to execute, a provenance query,
// a visual job, or a request to portray anyone named inside a test title.
const OPERATIONAL_LOG = /(?:^\d{2}:\d{2}:\d{2}\.\d{3}\s+(?:running|cloning|installing|restored)\b|\b(?:running|cloning|installing|restored build cache)\b[\s\S]{0,400}\b(?:vercel|next\.js|npm|node)\b|\bvercel cli\s+\d|\b(?:✖\s+failing tests|ℹ\s+fail\s+\d+|error:\s*command\s+")\b)/im

// Browser textareas and copied log panes can clip off both the beginning and the final error block.
// Dense timestamped Vercel/test-runner output is still operational evidence even when those classic
// anchors are gone. Requiring several timestamped lines plus a build/runtime marker avoids turning
// ordinary prose containing one time stamp into log authority.
const CLIPPED_LOG_TIMESTAMP = /(?:^|\n)\d{2}:\d{2}:\d{2}\.\d{3}\s+/g
const CLIPPED_LOG_MARKER = /(?:file:\/\/\/vercel\/path0|\/vercel\/path0\/saas\/tests\/|MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES Module|node:internal\/test_runner|\bVercel CLI\b|\bnext build\b|(?:^|\s)[✔✓✖]\s|ℹ\s+(?:tests|pass|fail)\b)/im

// Legacy compatibility helpers. Canonical browser routing no longer uses phrase matching to decide
// what the person wants; requestUnderstanding.ts performs semantic intent resolution instead.
const LEGACY_EXPLICIT_LOG_REPAIR = /(?:^|[\n.!?]\s*)(?:please\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:this|the\s+(?:build|failure|error|code|problem)|it)\b|\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:this|it|the\s+(?:build|failure|error|problem))\b|\bi\s+(?:need|want)\s+(?:you\s+to\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:this|it|the\s+(?:build|failure|error|problem))\b/i

const OPERATIONAL_REPAIR_MAX_CHARS = 60_000
const OPERATIONAL_REPAIR_HEAD_CHARS = 8_000
const OPERATIONAL_REPAIR_OMISSION = '\n\n[... operational log middle omitted by SignalBoost transport; build header and failure tail preserved ...]\n\n'

export type OperationalLogAnalysis = Readonly<{
  failed: boolean
  testFailures: string[]
  command: string | null
  exitCode: number | null
}>

export function isOperationalLogEvidence(input: string): boolean {
  const text = String(input || '')
  if (OPERATIONAL_LOG.test(text)) return true
  const timestampCount = text.match(CLIPPED_LOG_TIMESTAMP)?.length ?? 0
  return timestampCount >= 3 && CLIPPED_LOG_MARKER.test(text)
}

/** @deprecated Canonical browser routing uses semantic request understanding. */
export function hasExplicitOperationalLogRepairIntent(input: string): boolean {
  return LEGACY_EXPLICIT_LOG_REPAIR.test(String(input || ''))
}

/** @deprecated Canonical browser routing uses semantic request understanding. */
export function isExplicitOperationalLogRepairRequest(input: string): boolean {
  const text = String(input || '')
  return isOperationalLogEvidence(text) && hasExplicitOperationalLogRepairIntent(text)
}

/**
 * A pasted operational log is evidence, regardless of what words happen to occur inside it.
 * Whether the human wants analysis, explanation, repair, or something else is a separate semantic
 * decision. Keeping those concepts separate prevents log text or magic phrases from becoming
 * execution authority.
 */
export function isPastedOperationalLog(input: string): boolean {
  return isOperationalLogEvidence(String(input || ''))
}

/**
 * Repository repair needs both immutable deployment identity near the start of a build log and the
 * failing assertions/exit status near the end. Builder's durable objective is capped at 64k, so a
 * huge browser paste must never be naively truncated from one side. Keep a bounded head + tail and
 * make the omission explicit. Passive diagnosis may still inspect its own smaller bounded view.
 */
export function compactOperationalLogForRepair(input: string, maxChars = OPERATIONAL_REPAIR_MAX_CHARS): string {
  const text = String(input || '').trim()
  const limit = Math.max(4_000, Math.min(64_000, Math.floor(Number(maxChars) || OPERATIONAL_REPAIR_MAX_CHARS)))
  if (text.length <= limit) return text

  const available = Math.max(1, limit - OPERATIONAL_REPAIR_OMISSION.length)
  const headChars = Math.min(OPERATIONAL_REPAIR_HEAD_CHARS, Math.max(1, Math.floor(available / 3)))
  const tailChars = Math.max(1, available - headChars)
  return `${text.slice(0, headChars).trimEnd()}${OPERATIONAL_REPAIR_OMISSION}${text.slice(-tailChars).trimStart()}`
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

/**
 * A person who hands over a failing log and is asked "want me to fix it?" answers like
 * a person. The offer is intentionally natural language; semantic request understanding decides
 * what the reply means, while authentication and execution policy decide whether action is allowed.
 */
export function operationalLogRepairHandoff(language = 'en'): string {
  const locale = String(language || 'en').toLowerCase()
  if (locale === 'es') return 'Puedo repararlo. ¿Quieres que lo haga?'
  if (locale === 'pt') return 'Posso reparar isso. Quer que eu faça?'
  if (locale === 'pl') return 'Mogę to naprawić. Chcesz, żebym to zrobił?'
  if (locale === 'ru') return 'Я могу это исправить. Хотите, чтобы я это сделал?'
  return 'I can repair this. Want me to?'
}

/** Recognises this module's own emitted offer. Matching text we generated ourselves is
 * not classifying a human's words, so no vocabulary rule is implied by this list. */
export function isOperationalLogRepairOffer(reply: string): boolean {
  const text = String(reply || '')
  return (['en', 'es', 'pt', 'pl', 'ru'] as const).some(locale => text.includes(operationalLogRepairHandoff(locale)))
}

export function ensureOperationalLogRepairHandoff(reply: string, language = 'en'): string {
  const text = String(reply || '').trim()
  if (isOperationalLogRepairOffer(text)) return text
  const handoff = operationalLogRepairHandoff(language)
  return text ? `${text} ${handoff}` : handoff
}

export function operationalLogReply(input: string): string {
  const analysis = analyzeOperationalLog(input)
  if (!analysis.failed) {
    return `The excerpt shows a Vercel build in progress, but it does not include a failing assertion or a non-zero final command, so there is not enough evidence yet to identify a defect. No code was changed. Paste the final error or ✖ assertion. ${operationalLogRepairHandoff('en')}`
  }
  const failures = analysis.testFailures.length
    ? ` The failing checks shown are: ${analysis.testFailures.join('; ')}.`
    : ''
  const command = analysis.command
    ? ` The final command \`${analysis.command}\` exited ${analysis.exitCode ?? 'non-zero'}.`
    : analysis.exitCode !== null
      ? ` The build command exited ${analysis.exitCode}.`
      : ''
  return `This Vercel build failed.${command}${failures} No code was changed because this was passive diagnostic evidence, not a repair request. ${operationalLogRepairHandoff('en')}`
}
