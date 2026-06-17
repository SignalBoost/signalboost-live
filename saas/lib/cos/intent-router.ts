// saas/lib/cos/intent-router.ts
// ─────────────────────────────────────────────────────────────────────────────
// v1 IntentRouter: a fast, code-only heuristic. NO model call (no latency tax).
// Signals: execution/advisory keyword priors, the surface page, imperative shape,
// and the optional `preferredMode` hint. Implements the locked rules:
//   • fail OPEN — below the confidence threshold, return `mixed`.
//   • the client hint is advisory, never binding.
// The interface leaves room for an LLM classifier later with zero caller changes.
// ─────────────────────────────────────────────────────────────────────────────
import type { IntentRouter, Intent, TurnContext } from './contracts'

// Tunable knobs, kept explicit so they are testable and auditable.
const CONFIDENCE_THRESHOLD = 0.6   // below this ⇒ mixed (fail open)
const HINT_WEIGHT = 2              // weight of an explicit preferredMode hint

const EXECUTE_PRIORS: RegExp[] = [
  /\b(set|update|change|rotate|create|add|delete|remove|disable|enable)\b/i,
  /\b(deploy|redeploy|migrat\w*|run|execute|stage|commit|push|sync)\b/i,
  /\b(env\s*var|variable|secret|key|webhook|bucket|product|price|domain)\b/i,
  /\b(vercel|supabase|stripe|github|resend|elevenlabs|assemblyai)\b/i,
]

const ADVISE_PRIORS: RegExp[] = [
  /\b(should|would|could|why|how come|what if|trade[\s-]?off|pros?\s+and\s+cons?)\b/i,
  /\b(architect\w*|scal\w*|design|approach|pattern|refactor|debt)\b/i,
  /\b(pricing|price\s+point|packag\w*|monetiz\w*|tier|margin|unit economics)\b/i,
  /\b(strateg\w*|market|positioning|pitch|enterprise|competitor|moat|roadmap)\b/i,
  /\b(recommend|advise|opinion|think|brainstorm|compare|evaluate)\b/i,
]

// A bare imperative ("set FOO=bar", "rotate the key") leans execute.
const IMPERATIVE_LEAD = /^(set|create|add|delete|remove|rotate|deploy|run|stage|commit|sync|update|change|disable|enable|migrate)\b/i

function countHits(text: string, priors: RegExp[]): number {
  let n = 0
  for (const re of priors) if (re.test(text)) n++
  return n
}

export class HeuristicIntentRouter implements IntentRouter {
  async classify(ctx: TurnContext): Promise<Intent> {
    const text = (ctx.turn.latestUserText || '').slice(0, 2000)
    const surface = (ctx.turn.surface || '').toLowerCase()

    let execScore = countHits(text, EXECUTE_PRIORS)
    let adviseScore = countHits(text, ADVISE_PRIORS)

    if (IMPERATIVE_LEAD.test(text.trim())) execScore += 1

    // Surface page is a weak prior, never decisive on its own.
    if (surface.includes('infrastructure') || surface.includes('hub') || surface.includes('deploy')) execScore += 0.5
    if (surface.includes('strategy') || surface.includes('advisory') || surface.includes('plan')) adviseScore += 0.5

    // The demoted hint: a nudge, weighted but not binding.
    const hint = ctx.signals?.preferredMode
    if (hint === 'execute') execScore += HINT_WEIGHT
    else if (hint === 'advise') adviseScore += HINT_WEIGHT

    const total = execScore + adviseScore
    const lead = Math.abs(execScore - adviseScore)
    // Confidence is the margin of victory, normalized. No signal ⇒ 0 ⇒ mixed.
    const confidence = total > 0 ? Math.min(1, lead / total) : 0

    if (confidence < CONFIDENCE_THRESHOLD) {
      return {
        kind: 'mixed',
        confidence,
        rationale: `mixed (fail-open): exec=${execScore} advise=${adviseScore} hint=${hint ?? 'none'} conf=${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}`,
      }
    }

    const kind = execScore > adviseScore ? 'execute' : 'advise'
    return {
      kind,
      confidence,
      rationale: `${kind}: exec=${execScore} advise=${adviseScore} hint=${hint ?? 'none'} conf=${confidence.toFixed(2)}`,
    }
  }
}
