export type RunpodOrphanGuardInput = {
  running: boolean
  uptimeSeconds: number
  healthy: boolean
  graceSeconds: number
}

/**
 * A running GPU with no healthy reasoner past the cold-start grace window is an orphaned
 * compute allocation, not useful COS capacity. Stop it regardless of recent failed-request
 * activity so billing cannot be extended by retries that never reached inference.
 */
export function shouldStopUnhealthyRunpod(input: RunpodOrphanGuardInput): boolean {
  if (!input.running || input.healthy) return false
  const uptimeSeconds = Number.isFinite(input.uptimeSeconds) ? Math.max(0, input.uptimeSeconds) : 0
  const graceSeconds = Number.isFinite(input.graceSeconds) ? Math.max(60, input.graceSeconds) : 300
  return uptimeSeconds >= graceSeconds
}
