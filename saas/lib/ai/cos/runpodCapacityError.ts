// saas/lib/ai/cos/runpodCapacityError.ts
//
// RunPod is the preferred iTMounts text compute plane again, while LOCAL_AI/DeepInfra is fallback.
// Capacity classification must therefore recognize explicit RunPod control/runtime failures even when
// LOCAL_AI_BASE_URL itself points at DeepInfra. It still refuses to relabel unrelated provider errors:
// either the message must identify RunPod or the active LOCAL_AI endpoint must itself be RunPod.

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
  const message = String(rawMessage ?? '')
  const explicitlyRunpod = /\brunpod\b/i.test(message)
  if (!explicitlyRunpod && !localInferenceTargetsRunpod()) return { capacityUnavailable: false, matchedPattern: null }
  for (const pattern of CAPACITY_PATTERNS) {
    if (pattern.test(message)) return { capacityUnavailable: true, matchedPattern: pattern.source }
  }
  return { capacityUnavailable: false, matchedPattern: null }
}

export function runpodCapacityUnavailableReason(args: { podId: string | null; originalMessage: string }): string {
  const pod = args.podId ? ` (pod ${args.podId})` : ''
  return `RunPod primary capacity unavailable${pod}. DeepInfra fallback may remain available. Provider message: ${String(args.originalMessage ?? '').slice(0, 300)}`
}
