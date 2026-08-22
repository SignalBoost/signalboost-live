// Keep controlled-comparison fixtures out of the private capability-acceptance rotation.
// They intentionally share the durable case table so the comparison harness can reuse scoring,
// but they are not part of the six private acceptance cases surfaced by /cos-capability-benchmark.

export const CONTROLLED_COMPARISON_PRIVATE_ORIGIN = 'controlled-comparison-private-v1'

export function isPrivateCapabilityAcceptanceOrigin(origin: unknown): boolean {
  return String(origin ?? '').trim() !== CONTROLLED_COMPARISON_PRIVATE_ORIGIN
}
