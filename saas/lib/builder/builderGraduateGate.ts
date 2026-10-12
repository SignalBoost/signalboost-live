// Builder graduate gate (2026-10-12).
// Unhealthy coder graduates must not block RunPod or the bounded coding fallback.
// Serving is opt-in; failures open a per-model circuit breaker.
export type BuilderGraduateMode = 'off' | 'shadow' | 'serve'

export function builderGraduateMode(env: NodeJS.ProcessEnv = process.env): BuilderGraduateMode {
  const raw = String(env.BUILDER_GRADUATE_MODE || '').trim().toLowerCase()
  return raw === 'off' || raw === 'serve' ? raw : 'shadow'
}

/** Short budget so a slow graduate hands over to RunPod/DeepSeek quickly. */
export function builderGraduateTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.BUILDER_GRADUATE_TIMEOUT_MS || '20000')
  return Number.isFinite(n) ? Math.max(5_000, Math.min(60_000, Math.floor(n))) : 20_000
}

const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 15 * 60_000
const breaker = new Map<string, { failures: number; openUntil: number }>()

export function builderGraduateAllowed(modelKey: string, now = Date.now()): boolean {
  const state = breaker.get(modelKey)
  return !state || state.openUntil <= now
}

export function recordBuilderGraduateResult(modelKey: string, ok: boolean, now = Date.now()): void {
  if (ok) { breaker.delete(modelKey); return }
  const state = breaker.get(modelKey) ?? { failures: 0, openUntil: 0 }
  state.failures += 1
  if (state.failures >= FAILURE_THRESHOLD) {
    state.openUntil = now + COOLDOWN_MS
    state.failures = 0
    console.warn('[builder-graduate-breaker-open]', JSON.stringify({ modelKey, cooldownMs: COOLDOWN_MS }))
  }
  breaker.set(modelKey, state)
}

/** Test seam. */
export function resetBuilderGraduateBreaker(): void { breaker.clear() }
