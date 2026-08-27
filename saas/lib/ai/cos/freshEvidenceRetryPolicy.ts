// Pure retry policy for current-fact evidence synthesis.
// No provider imports: this module is executable in the mandatory standalone Node test gate.

export const FRESH_SYNTHESIS_MAX_ATTEMPTS = 2
export const FRESH_SYNTHESIS_DEFAULT_ATTEMPT_TIMEOUT_MS = 35_000
const MIN_ATTEMPT_TIMEOUT_MS = 5_000
const MAX_ATTEMPT_TIMEOUT_MS = 60_000

export function boundedFreshSynthesisAttemptTimeoutMs(
  globalTimeoutMs: number,
  configuredValue: unknown = process.env.COS_FRESH_LOCAL_SYNTHESIS_TIMEOUT_MS,
): number {
  const configured = configuredValue == null || configuredValue === ''
    ? FRESH_SYNTHESIS_DEFAULT_ATTEMPT_TIMEOUT_MS
    : Number(configuredValue)
  const requested = Number.isFinite(configured) ? configured : FRESH_SYNTHESIS_DEFAULT_ATTEMPT_TIMEOUT_MS
  const bounded = Math.max(MIN_ATTEMPT_TIMEOUT_MS, Math.min(MAX_ATTEMPT_TIMEOUT_MS, requested))
  return Math.min(globalTimeoutMs, bounded)
}

export async function runFreshSynthesisTransportAttempts<T>(
  operation: (attempt: number) => Promise<T>,
  onRetry?: (event: { attempt: number; nextAttempt: number; error: unknown }) => void,
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= FRESH_SYNTHESIS_MAX_ATTEMPTS; attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt }
    } catch (error) {
      lastError = error
      if (attempt < FRESH_SYNTHESIS_MAX_ATTEMPTS) {
        onRetry?.({ attempt, nextAttempt: attempt + 1, error })
        continue
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Fresh synthesis transport failed'))
}
