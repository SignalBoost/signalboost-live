// saas/lib/ai/cos/composerIntakeBound.ts
// A pasted build/runtime log carries its verdict at the END: the ✖ assertions and the
// `Error: Command "…" exited with 1` line are the last thing printed. The public composer used a
// plain textarea `maxLength`, which truncates from the FRONT — so an oversized paste silently
// dropped exactly the evidence the log lane needs, and analyzeOperationalLog() correctly reported
// "build in progress, no failing assertion" for a build that had in fact failed.
//
// Bounding still matters, so this keeps a head slice (the Cloning/branch/commit lines that identify
// the deployment) AND a tail slice (the failure block), with an explicit elision marker between
// them. Nothing is dropped silently.

export const PUBLIC_COMPOSER_MAX_CHARS = 64_000
export const COMPOSER_HEAD_CHARS = 8_000
export const COMPOSER_ELISION = '\n…[middle of the pasted text omitted — head and tail kept]…\n'

export function boundComposerIntake(input: unknown, max: number = PUBLIC_COMPOSER_MAX_CHARS): string {
  const text = String(input ?? '')
  const ceiling = Number.isFinite(max) ? Math.max(COMPOSER_ELISION.length + 2, Math.floor(max)) : PUBLIC_COMPOSER_MAX_CHARS
  if (text.length <= ceiling) return text

  const budget = ceiling - COMPOSER_ELISION.length
  const head = Math.max(0, Math.min(COMPOSER_HEAD_CHARS, Math.floor(budget / 2)))
  const tail = Math.max(0, budget - head)
  return `${text.slice(0, head)}${COMPOSER_ELISION}${text.slice(text.length - tail)}`
}
