// saas/lib/ai/cos/cosProblemClass.ts
//
// THE GROUPING KEY FOR CONTINUOUS LEARNING.
//
// `subject` is not a reporting label — it is the bucket the learning loop reasons about. The
// metacognitive capability map groups by `problemClass || subject`; gap detection groups retained
// knowledge by subject; skills carry a subject; the independence report trends teacher dependency
// by subject. So if subjects are wrong, COS cannot form a capability map, cannot notice "I keep
// failing this class", and cannot prioritise what to practise next — experience accumulates
// without ever organising into capability.
//
// Two defects this replaces, both observed in production data:
//   1. UNBOUNDED CARDINALITY — teacher/council writers fell back to the verbatim prompt, so
//      "Who is the current US president?" and "Who is the current President of the United States?"
//      became two unrelated subjects. Recurrence evidence never concentrates and no class can
//      ever trend.
//   2. ONE GIANT BUCKET — the turn recorder fell back to 'general reasoning', so every ordinary
//      turn landed in a single class carrying no signal about what COS is actually good at.
//
// The fix is one bounded taxonomy every writer shares: foundational domains first (so historical
// rows and the study curriculum keep aligning), then a small set of general classes chosen by
// intent. The result is a closed set — a prompt always maps to one of a knowable number of
// classes, and the same question in different words maps to the same class.
//
// Classification must use the user's task, not the evidence/advisory envelope injected around it.
// The same USER QUESTION / Original question extraction used by worker routing therefore protects
// learning telemetry as well. This is deterministic and adds no model call or embedding.

import { nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'
import { cosRoutingObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'

/**
 * General classes used when a prompt does not belong to a foundational study domain. Kept small
 * and stable on purpose — this is a taxonomy, not a tag cloud. Order matters: the first matching
 * class wins, so more specific intents are listed before broader ones.
 */
const GENERAL_PROBLEM_CLASSES: { id: string; test: RegExp }[] = [
  { id: 'current public facts', test: /\b(current|currently|today|todays|right now|as of now|latest|most recent|nowadays|this (?:year|month|week)|who is the (?:president|prime minister|ceo|leader))\b/i },
  { id: 'opinion and judgment', test: /\b(best|worst|worse|favou?rite|opinion|do you think|better than|rank the|greatest|most overrated)\b/i },
  { id: 'people and organizations', test: /\b(who (?:is|was|are|were)|whose|biography|founder|founded|ceo of|company|organization|organisation)\b/i },
  { id: 'definitions and concepts', test: /\b(what (?:is|are|does)|define|definition|meaning of|stands for|subfield|category of|difference between|vs\.?|versus)\b/i },
  { id: 'cos self description', test: /\b(cos|signalboost|your (?:architecture|components|memory|provenance|pipeline)|show me (?:cos|your)|internal systems?)\b/i },
  { id: 'incident diagnosis', test: /\b(diagnos|root cause|why (?:is|are|did|does).*(?:slow|fail|error|down|spike|regress)|troubleshoot|incident|outage|latency|p9[59]|timeout)\b/i },
  { id: 'code and implementation', test: /\b(code|function|script|typescript|javascript|python|sql|query|regex|api call|implement|refactor|compile|stack trace)\b/i },
  { id: 'math and calculation', test: /\b(calculat|compute|how (?:much|many)|percentage|average|sum of|convert|equation|formula)\b/i },
  { id: 'planning and strategy', test: /\b(plan|roadmap|strateg|should (?:i|we)|prioriti|recommend|next steps?|approach|trade-?off)\b/i },
  { id: 'writing and content', test: /\b(write|draft|rewrite|summari[sz]e|translate|email|post|headline|copy for)\b/i },
]

export const UNCLASSIFIED_PROBLEM_CLASS = 'general reasoning'

export function knownProblemClasses(): string[] {
  return [...GENERAL_PROBLEM_CLASSES.map(entry => entry.id), UNCLASSIFIED_PROBLEM_CLASS]
}

export function classifyProblemClass(prompt: string): string {
  const text = cosRoutingObjective(prompt)
  if (!text) return UNCLASSIFIED_PROBLEM_CLASS

  const foundational = nearestFoundationalSubject(text)
  if (foundational) return foundational

  for (const entry of GENERAL_PROBLEM_CLASSES) {
    if (entry.test.test(text)) return entry.id
  }
  return UNCLASSIFIED_PROBLEM_CLASS
}
