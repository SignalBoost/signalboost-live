// saas/lib/ai/cos/runpodCapacityError.ts
//
// Legacy compatibility for historical RunPod incidents. SignalBoost no longer uses RunPod for COS
// inference. This classifier is intentionally inert unless the *active* LOCAL_AI_BASE_URL itself is
// a RunPod proxy. Stale RUNPOD_* environment variables must never make DeepInfra failures look like
// RunPod failures or leak a historical pod id into a user-facing reason.

import { localInferenceTargetsRunpod } from './runpodConfig.ts'

export type RunpodFailureClassification = {
  capacityUnavailable: boolean
  matchedPattern: string | null
}

const CAPACITY_PATTERNS: RegExp[] = [
  /not enough (free )?gpus?\s+(on|available)/i,
  /no (longer any )?(gpu )?(instances|workers|hosts)\s+available/i,
  /insufficient (gpu )?capacity/i,
  /no capacity (is )?available/i,
]

export function classifyRunpodFailure(rawMessage: string): RunpodFailureClassification {
  if (!localInferenceTargetsRunpod()) return { capacityUnavailable: false, matchedPattern: null }
  const message = String(rawMessage ?? '')
  for (const pattern of CAPACITY_PATTERNS) {
    if (pattern.test(message)) return { capacityUnavailable: true, matchedPattern: pattern.source }
  }
  return { capacityUnavailable: false, matchedPattern: null }
}

/** Historical compatibility only; unreachable when COS is configured for DeepInfra or another provider. */
export function runpodCapacityUnavailableReason(args: { podId: string | null; originalMessage: string }): string {
  const pod = args.podId ? ` (pod ${args.podId})` : ''
  return `Legacy RunPod capacity unavailable${pod}. Provider message: ${String(args.originalMessage ?? '').slice(0, 300)}`
}
