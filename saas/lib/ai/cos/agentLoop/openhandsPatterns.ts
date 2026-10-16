// saas/lib/ai/cos/agentLoop/openhandsPatterns.ts
//
// Two agent-harness patterns ported from the OpenHands Software Agent SDK (MIT License,
// Copyright (c) 2026 OpenHands contributors; https://github.com/OpenHands/software-agent-sdk —
// full notice in ./THIRD_PARTY_NOTICES.md):
//
//   1. StuckDetector  (openhands-sdk/openhands/sdk/conversation/stuck_detector.py)
//      Detects an agent repeating the same action with the same result, the same failing action,
//      or alternating between two actions. Thresholds are the SDK defaults (4, 4, 6).
//   2. Critic with iterative refinement  (openhands-sdk/openhands/sdk/critic/base.py,
//      agent/critic_mixin.py)
//      When the agent finishes, a critic scores the answer; below the success threshold, and within
//      max_iterations, the agent continues with a follow-up prompt instead of finishing.
//
// Adapted to COS: steps are this loop's tool calls; the critic is an LLM completeness review that
// returns one verdict per distinct thing the request asks for.

export type LoopStep = Readonly<{ action: string; observation: string; error: boolean }>

export const STUCK_THRESHOLDS = Object.freeze({ actionObservation: 4, actionError: 4, alternatingPattern: 6 })

export type StuckPattern = 'action_observation_loop' | 'action_error_loop' | 'alternating_pattern'

/** Canonical action key: tool name plus its arguments with keys sorted. */
export function actionKey(name: string, argumentsJson: string): string {
  let args: unknown = argumentsJson
  try { args = JSON.parse(argumentsJson || '{}') } catch {}
  const canonical = (value: unknown): unknown => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
      : value
  return `${name}:${JSON.stringify(canonical(args))}`
}

export function observationIsError(observation: string): boolean {
  const first = String(observation || '').split('\n', 1)[0]
  return /^(?:Error:|HTTP [45]\d\d |Could not |Refused |Skipped |Browser could not )/.test(first) || /^exit_code=(?!0\b)-?\d+/.test(first)
}

/** StuckDetector.is_stuck, over this turn's tool steps (all follow the single user message). */
export function detectStuck(steps: readonly LoopStep[], thresholds = STUCK_THRESHOLDS): Readonly<{ pattern: StuckPattern; repetitions: number }> | null {
  const tail = (count: number) => steps.slice(-count)
  const same = (items: readonly LoopStep[], pick: (step: LoopStep) => string) => items.every(step => pick(step) === pick(items[0]))

  // Scenario 1: same action, same observation.
  const repeated = tail(thresholds.actionObservation)
  if (repeated.length === thresholds.actionObservation && same(repeated, step => step.action) && same(repeated, step => step.observation)) {
    return { pattern: 'action_observation_loop', repetitions: repeated.length }
  }
  // Scenario 2: same action, errors every time.
  const failing = tail(thresholds.actionError)
  if (failing.length === thresholds.actionError && same(failing, step => step.action) && failing.every(step => step.error)) {
    return { pattern: 'action_error_loop', repetitions: failing.length }
  }
  // Scenario 4: alternating A/B action-observation pairs.
  const alternating = tail(thresholds.alternatingPattern)
  if (alternating.length === thresholds.alternatingPattern) {
    const even = alternating.filter((_, index) => index % 2 === 0)
    const odd = alternating.filter((_, index) => index % 2 === 1)
    if (same(even, step => step.action) && same(odd, step => step.action) && same(even, step => step.observation) && same(odd, step => step.observation) && even[0].action !== odd[0].action) {
      return { pattern: 'alternating_pattern', repetitions: alternating.length }
    }
  }
  return null
}

export function stuckNudge(stuck: Readonly<{ pattern: StuckPattern; repetitions: number }>): string {
  const what = stuck.pattern === 'action_error_loop'
    ? `the same tool call failed ${stuck.repetitions} times in a row`
    : stuck.pattern === 'alternating_pattern'
      ? `you alternated between the same two tool calls ${stuck.repetitions} times`
      : `you repeated the same tool call ${stuck.repetitions} times with the same result`
  return `HARNESS: ${what}. Stop calling tools and answer with what you have; name any part of the request you could not find.`
}

export const ITERATIVE_REFINEMENT = Object.freeze({ successThreshold: 1, maxIterations: 1 })

export type CriticResult = Readonly<{ score: number; parts: number; missing: readonly string[] }>

export const CRITIC_SYSTEM_PROMPT = [
  'You are a strict reviewer of an assistant\'s answer. List each distinct thing the user\'s request asks for, then decide whether the answer provides it.',
  'A part counts as answered when the answer gives it, or explicitly says it could not be found. Formatting, tone and length do not matter.',
  'Reply with JSON only, no prose: {"parts":[{"ask":"<short description>","answered":true|false}]}',
].join('\n')

export function criticMessages(request: string, answer: string): { role: 'user'; content: string }[] {
  return [{ role: 'user', content: `REQUEST:\n${String(request).slice(0, 4_000)}\n\nANSWER:\n${String(answer).slice(0, 8_000)}` }]
}

/** Parses the critic's verdict; null when it is not a usable verdict (the SDK then skips refinement). */
export function parseCriticVerdict(text: string): CriticResult | null {
  const raw = String(text || '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: any
  try { parsed = JSON.parse(raw.slice(start, end + 1)) } catch { return null }
  const parts = Array.isArray(parsed?.parts) ? parsed.parts.filter((part: any) => part && typeof part.answered === 'boolean') : []
  if (!parts.length) return null
  const missing = parts.filter((part: any) => !part.answered).map((part: any) => String(part.ask || '').trim().slice(0, 200)).filter(Boolean)
  return { score: (parts.length - missing.length) / parts.length, parts: parts.length, missing }
}

export function shouldRefine(result: CriticResult, iteration: number, config = ITERATIVE_REFINEMENT): boolean {
  return iteration < config.maxIterations && result.score < config.successThreshold
}

/** CriticBase.get_followup_prompt, naming the parts the critic found missing. */
export function refinementPrompt(result: CriticResult, iteration: number): string {
  return [
    `HARNESS REVIEW (iteration ${iteration}): the answer appears incomplete (${Math.round(result.score * 100)}% of the request covered).`,
    `Not covered: ${result.missing.join('; ')}.`,
    'Use the tools to find each missing part, then give the complete answer to the whole request. If a part cannot be found, say so explicitly.',
  ].join('\n')
}
