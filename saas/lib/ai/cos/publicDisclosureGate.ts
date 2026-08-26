// saas/lib/ai/cos/publicDisclosureGate.ts
//
// COS MUST NOT HAND COMPANY INTERNALS TO THE PUBLIC CHANNEL.
//
// Owner-directed architecture (2026-08-26): COS is the only reasoner, the Concierge is a passive
// renderer, and the boundary is enforced AT COS. A renderer that filters is one filter miss away
// from a leak; a reasoner whose output was never allowed to contain internals has nothing to
// leak. This module is that enforcement — the last check before a public-scope answer is
// released.
//
// It is deliberately SEPARATE from publicScenarioScope.ts, which solves a different problem and
// has a disqualifying property for this one: it returns no violations at all when the request is
// SignalBoost-specific. That is correct for its job (stopping catalog context bleeding into
// unrelated third-party scenarios) and exactly wrong here, because "what model powers COS?" IS a
// SignalBoost-specific request and is the highest-risk question a visitor can ask. This gate
// applies to every public answer regardless of subject.
//
// FALSE POSITIVES ARE THE REAL DESIGN PROBLEM. A public visitor may legitimately ask about
// mixture-of-experts models, knowledge graphs, or semantic caching as general technical topics,
// and answering those is not a leak. So the rule is not "this word appeared" — it is:
//
//   TIER A  unambiguous internal identifiers. No legitimate general answer contains these, so
//           they are violations wherever they appear: infrastructure vendor names we run on,
//           environment variable names, table names, project identifiers, internal evidence
//           citation labels, and the provenance funnel notation.
//
//   TIER B  terms that are only a leak when SELF-ATTRIBUTED. A model family name, an internal
//           component name, or a confidence value is a violation when it appears near a
//           self-reference ("COS runs on...", "my underlying model is...", "powered by..."),
//           and is ordinary technical content otherwise.
//
// Zero imports, pure functions, so the rule is unit-testable without the reasoner.

export type PublicDisclosureViolation =
  | 'infrastructure_identifier'
  | 'internal_identifier'
  | 'evidence_label'
  | 'provenance_funnel'
  | 'model_self_attribution'
  | 'internal_component_self_attribution'
  | 'internal_metric_self_attribution'

/** How far from a self-reference a Tier B term still counts as self-attributed. */
const SELF_ATTRIBUTION_WINDOW = 220

// ---------------------------------------------------------------------------------------------
// TIER A — always a violation
// ---------------------------------------------------------------------------------------------

/** Hosts and platforms this deployment actually runs on. Naming them is naming our stack. */
const INFRASTRUCTURE_IDENTIFIER =
  /(?<![\p{L}\p{N}_])(?:deepinfra|runpod|together\.ai|fireworks\.ai|groq\b|supabase|vercel)(?![\p{L}\p{N}_])/iu

/** Environment variables, table names, internal routes, project refs. */
const INTERNAL_IDENTIFIER =
  /(?<![\p{L}\p{N}_])(?:COS_[A-Z_]+|LOCAL_AI_[A-Z_]+|cos_[a-z_]+_queue|cos-primary|cos_campaign|agent-gateway|portable-license|\/api\/(?:cos-primary|concierge|support)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![\p{L}\p{N}_])/iu

/** Internal evidence citation labels. These only exist inside our prompts. */
const EVIDENCE_LABEL = /\[(?:CL|KG|OEM|EM|SK)\s*#?\s*\d*\]/i

/** The provenance funnel notation, e.g. "40 retrieved -> 0 relevant -> 0 selected". */
const PROVENANCE_FUNNEL =
  /\d+\s*(?:retrieved|selected|injected|cited)\s*(?:→|->|>)\s*\d+|(?<![\p{L}\p{N}_])(?:retrieved\s*→|relevant\s*→|selected\s*→|injected\s*→)/iu

// ---------------------------------------------------------------------------------------------
// TIER B — a violation only when self-attributed
// ---------------------------------------------------------------------------------------------

/**
 * Phrases in which the answer is describing ITSELF or the product, rather than the world.
 * A Tier B term inside the window around one of these is a disclosure.
 */
const SELF_REFERENCE =
  /(?<![\p{L}\p{N}_])(?:powered\s+by|runs?\s+on|running\s+on|built\s+on|based\s+on\s+the\s+model|my\s+(?:model|reasoner|underlying|architecture|training|confidence)|I\s+(?:am|use|run|was\s+trained|rely)|(?:the\s+)?underlying\s+(?:model|engine|reasoner)|this\s+(?:assistant|system|concierge|service)\s+(?:uses|is|runs)|COS\s+(?:uses|runs|is\s+powered|relies)|concierge\s+(?:uses|runs|is\s+powered))(?![\p{L}\p{N}_])/iu

/** Model families and weight-class descriptors. Ordinary topics until self-attributed. */
const MODEL_TERM =
  /(?<![\p{L}\p{N}_])(?:qwen|llama|mistral|mixtral|deepseek|gemma|phi-\d|gpt-[\d.]+|claude|anthropic|openai|open-weight|\d+\s*b\s*[-–]?\s*a\d+\s*b|\d{2,3}b\s+parameter|mixture[-\s]of[-\s]experts|moe)(?![\p{L}\p{N}_])/iu

/** Internal subsystem names. "Knowledge graph" is a real general term — hence Tier B. */
const INTERNAL_COMPONENT =
  /(?<![\p{L}\p{N}_])(?:enterprise\s+memory|knowledge\s+graph|learned\s+corpus|semantic\s+cache|cognitive\s+skills|user\s+memory|provenance\s+record|release\s+gate|escalation\s+threshold|external\s+(?:ai\s+)?fallback|failed\s+closed|fail\s+closed)(?![\p{L}\p{N}_])/iu

/** Internal scoring. A bare number is fine; "my confidence is 0.78" is not. */
const INTERNAL_METRIC =
  /(?<![\p{L}\p{N}_])(?:confidence\s+(?:score\s+)?(?:of\s+)?0?\.\d+|threshold\s+(?:of\s+)?0?\.\d+|confidence\s+threshold|token\s+ceiling|max[_\s]?tokens)(?![\p{L}\p{N}_])/iu

function selfAttributedWindows(answer: string): string[] {
  const windows: string[] = []
  const finder = new RegExp(SELF_REFERENCE.source, 'giu')
  let match: RegExpExecArray | null
  while ((match = finder.exec(answer)) !== null) {
    const start = Math.max(0, match.index - SELF_ATTRIBUTION_WINDOW)
    const end = Math.min(answer.length, match.index + match[0].length + SELF_ATTRIBUTION_WINDOW)
    windows.push(answer.slice(start, end))
    if (finder.lastIndex === match.index) finder.lastIndex += 1
  }
  return windows
}

/**
 * Internal disclosures present in a public-scope answer. Empty array means the answer is safe to
 * render publicly. Applies to every public answer, on every subject.
 */
export function publicDisclosureViolations(answer: string): PublicDisclosureViolation[] {
  const value = String(answer ?? '')
  if (!value.trim()) return []
  const violations: PublicDisclosureViolation[] = []

  if (INFRASTRUCTURE_IDENTIFIER.test(value)) violations.push('infrastructure_identifier')
  if (INTERNAL_IDENTIFIER.test(value)) violations.push('internal_identifier')
  if (EVIDENCE_LABEL.test(value)) violations.push('evidence_label')
  if (PROVENANCE_FUNNEL.test(value)) violations.push('provenance_funnel')

  const windows = selfAttributedWindows(value)
  if (windows.length) {
    if (windows.some(window => MODEL_TERM.test(window))) {
      violations.push('model_self_attribution')
    }
    if (windows.some(window => INTERNAL_COMPONENT.test(window))) {
      violations.push('internal_component_self_attribution')
    }
    if (windows.some(window => INTERNAL_METRIC.test(window))) {
      violations.push('internal_metric_self_attribution')
    }
  }

  return violations
}

/** True when the answer may be released on a public surface as written. */
export function isPublicReleasable(answer: string): boolean {
  return publicDisclosureViolations(answer).length === 0
}
