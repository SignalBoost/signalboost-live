// saas/lib/ai/cos/runpodCapacityError.ts
//
// Distinguish "RunPod has no free GPU on the configured host" from every other way a reasoner call
// can fail, so it stops disappearing into the generic "did not return an answer" message.
//
// WHY THIS MATTERS: that generic message is indistinguishable from a cold-start timeout, a wake
// permission refusal, an aborted fetch, or a genuinely bad reasoning turn. The only place the real
// distinction survives is a console.error line in Vercel logs — useful for a person who thinks to go
// looking, useless for the same failure surfacing as an unhelpful chat reply or a benchmark 0%. The
// Aug 19 16:01 UTC watchdog read (podId yvj6e9zboi7ofo, desiredStatus EXITED) plus the RunPod error
// "There are not enough free GPUs on the host machine to start this pod" is the confirmed real
// production shape this exists to catch.
//
// THIS IS A STRING MATCH ON A THIRD-PARTY ERROR MESSAGE, disclosed plainly rather than hidden behind
// a confident-looking function name. RunPod does not publish a stable error code for capacity
// exhaustion — only free-text inside a GraphQL `errors[].message`. If RunPod changes their wording,
// this stops matching and the failure falls back to the ordinary generic message; it never turns a
// genuine capacity failure into a false positive for anything else; a false negative just costs the
// diagnostic clarity this module adds, not correctness.
//
// PURE. No network, no environment reads.

export type RunpodFailureClassification = {
  capacityUnavailable: boolean
  /** The regex source that matched, for anyone who needs to verify or extend the list. */
  matchedPattern: string | null
}

// Observed and documented, not exhaustive. Each entry is commented with where it came from.
const CAPACITY_PATTERNS: Array<{ pattern: RegExp; note: string }> = [
  {
    // Exact production message, Aug 19 2026: "There are not enough free GPUs on the host machine to
    // start this pod."
    pattern: /not enough (free )?gpus?\s+(on|available)/i,
    note: 'observed_production_2026-08-19',
  },
  {
    // Common RunPod phrasing for the same underlying condition on a different code path.
    pattern: /no (longer any )?(gpu )?(instances|workers|hosts)\s+available/i,
    note: 'known_runpod_phrasing',
  },
  {
    pattern: /insufficient (gpu )?capacity/i,
    note: 'known_runpod_phrasing',
  },
  {
    pattern: /no capacity (is )?available/i,
    note: 'known_runpod_phrasing',
  },
]

export function classifyRunpodFailure(rawMessage: string): RunpodFailureClassification {
  const message = String(rawMessage ?? '')
  for (const { pattern } of CAPACITY_PATTERNS) {
    if (pattern.test(message)) {
      return { capacityUnavailable: true, matchedPattern: pattern.source }
    }
  }
  return { capacityUnavailable: false, matchedPattern: null }
}

/**
 * Build the diagnostic reason string for a confirmed capacity failure. Distinct wording from every
 * other escalation reason, and distinct from the generic "did not return an answer" — the whole
 * point is that this one is immediately recognizable without opening Vercel logs.
 */
export function runpodCapacityUnavailableReason(args: { podId: string | null; originalMessage: string }): string {
  const pod = args.podId ? ` (pod ${args.podId})` : ''
  return `RunPod GPU capacity unavailable${pod} — the configured host has no free GPU to start this pod right now. RunPod said: ${String(args.originalMessage ?? '').slice(0, 300)}`
}