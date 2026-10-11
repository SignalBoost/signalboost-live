/** Cancellation is terminal for routing; it must never start another provider. */
export function throwIfInferenceAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

export function modelTransportSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  throwIfInferenceAborted(signal)
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
