/**
 * REA capability harness: tool execution contracts, not an answer generator.
 * Every adapter is observed by an explicit receipt; failures never become a fabricated result.
 * The calling route owns authorization, spending approval, and response synthesis.
 */
export type ReaCapability = 'web_research' | 'browser_retrieval' | 'structured_data' | 'chart_rendering' | 'code_execution'
export type ReaReceipt<T = unknown> =
  | { status: 'ok'; capability: ReaCapability; adapter: string; elapsedMs: number; data: T; evidence: readonly string[] }
  | { status: 'error'; capability: ReaCapability; adapter: string; elapsedMs: number; reason: string }
export type ReaAdapter<T = unknown> = {
  id: string
  capability: ReaCapability
  /** Permitted by the caller's policy, not inferred by the model. */
  invoke: (input: unknown, signal: AbortSignal) => Promise<{ data: T; evidence: readonly string[] }>
}
export type ReaExecutionPolicy = {
  allowedCapabilities: readonly ReaCapability[]
  allowedAdapters: readonly string[]
  /** The caller must explicitly allow paid calls; a fallback must never expand permissions. */
  approvedSpend: boolean
  paidAdapters?: readonly string[]
  timeoutMs: number
}
export type ReaExecutionResult<T = unknown> = {
  success: boolean
  receipt?: ReaReceipt<T>
  attempts: readonly ReaReceipt<T>[]
}
const msg = (error: unknown): string => error instanceof Error ? error.message : String(error)

export async function executeReaCapability<T>(
  capability: ReaCapability,
  input: unknown,
  adapters: readonly ReaAdapter<T>[],
  policy: ReaExecutionPolicy,
): Promise<ReaExecutionResult<T>> {
  if (!policy.allowedCapabilities.includes(capability)) return { success: false, attempts: [] }
  const candidates = adapters.filter(adapter => adapter.capability === capability
    && policy.allowedAdapters.includes(adapter.id)
    && (policy.approvedSpend || !(policy.paidAdapters || []).includes(adapter.id)))
  const attempts: ReaReceipt<T>[] = []
  for (const adapter of candidates) {
    const started = Date.now()
    const controller = new AbortController()
    const timeoutMs = Math.max(1, Math.min(Math.floor(policy.timeoutMs), 60_000))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const work = Promise.resolve().then(() => adapter.invoke(input, controller.signal))
      // Bound the wait even for an adapter that does not obey AbortSignal.
      const outcome = await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new Error('execution_timeout'))
          }, timeoutMs)
        }),
      ])
      if (!Array.isArray(outcome.evidence) || outcome.evidence.some(item => typeof item !== 'string')) {
        throw new Error('invalid_evidence_receipt')
      }
      const receipt: ReaReceipt<T> = {
        status: 'ok', capability, adapter: adapter.id,
        elapsedMs: Date.now() - started, data: outcome.data, evidence: outcome.evidence,
      }
      attempts.push(receipt)
      return { success: true, receipt, attempts }
    } catch (error) {
      attempts.push({
        status: 'error', capability, adapter: adapter.id,
        elapsedMs: Date.now() - started, reason: msg(error),
      })
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  return { success: false, attempts }
}

/** Date/value contract usable for financial, weather, sensor, and operational charts. */
export type ReaTimePoint = { timestamp: string; value: number }
export function validateReaTimeSeries(points: readonly ReaTimePoint[]): ReaTimePoint[] {
  if (points.length < 2) throw new Error('insufficient_series_observations')
  const checked = points.map(point => {
    const epoch = Date.parse(point.timestamp)
    if (!Number.isFinite(epoch) || !Number.isFinite(point.value)) throw new Error('invalid_series_observation')
    return { timestamp: new Date(epoch).toISOString(), value: point.value }
  })
  checked.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  if (checked.some((p, i) => i > 0 && p.timestamp === checked[i - 1].timestamp)) {
    throw new Error('duplicate_series_timestamp')
  }
  return checked
}
