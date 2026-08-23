// COS request-specific intent disambiguation.
//
// "Script" is polysemous: it can mean authored prose/dialogue or executable source code.
// The production failure on 2026-08-23 was an ordinary writing request:
//   Produce a script for 'Nova' without assuming whether it's a person, product, or company.
// A second production failure used:
//   Generate a script and then explain the reasoning behind each line.
// The local reasoner guessed the programming sense and asked for a language. This module keeps
// that decision deterministic. An unqualified authoring request is content; executable code
// requires an explicit programming signal or a clearly computational behavior.
//
// The same request-specific seam also carries narrow high-stakes disciplines for executive
// decisions and regulated guidance. Sparse business facts must not become invented precision, and
// named legal regimes must not be reconstructed from model memory as if they were current law.

import { regulatedOperationalScenarioDirective } from './regulatedOperationalScenarioIntent.ts'

export type ScriptRequestMode = 'content' | 'code' | 'none'

const SCRIPT_AUTHORING =
  /\b(?:write|draft|produce|generate|create|compose|prepare|develop|make)\b[^.!?;\n]{0,120}\b(?:a\s+|an\s+|the\s+)?script\b|\bscript\b[^.!?;\n]{0,80}\b(?:for|about)\b/i

const EXPLICIT_CODE_SIGNAL =
  /\b(?:source\s+code|code|program(?:ming)?|python|javascript|typescript|node(?:\.js)?|bash|shell\s+script|powershell|ruby|perl|php|java|c\+\+|c#|golang|rust|swift|kotlin|sql|command[- ]line|cli|executable|automation\s+script)\b|\.(?:py|js|ts|sh|ps1|rb|php|go|rs)\b/i

const COMPUTATIONAL_SCRIPT_BEHAVIOR =
  /\bscript\b[^.!?;\n]{0,60}\b(?:to|that|which)\b[^.!?;\n]{0,100}\b(?:rename|parse|process|scrape|crawl|download|upload|delete|copy|move|monitor|compile|deploy|execute|automate|query\s+(?:a\s+)?database|call\s+(?:an?\s+)?api|read\s+(?:a\s+)?file|write\s+(?:to\s+)?(?:a\s+)?file|run\s+(?:on|in|under))\b/i

const LINE_RATIONALE_REQUEST =
  /\b(?:explain|describe|give)\b[^.!?;\n]{0,80}\b(?:reason(?:ing)?|rationale|purpose|why)\b[^.!?;\n]{0,80}\b(?:each|every)\s+line\b|\bline[- ]by[- ]line\b[^.!?;\n]{0,80}\b(?:reason(?:ing)?|rationale|purpose|explanation)\b/i

const EXECUTIVE_DECISION_SCENARIO =
  /\b(?:leadership\s+team|ceo|cfo|coo|board|head\s+of\s+sales|vp\s+of\s+infrastructure|department\s+lead|operating\s+expenses?|opex|runway|budget\s+cuts?|budget\s+breach|cost\s+reduction|headcount|layoffs?|restructur(?:e|ing)|acquisition|due\s+diligence|merger|enterprise\s+contract|arr|sre\s+capacity|triage\s+process)\b/i

const EXECUTIVE_DECISION_VERB =
  /\b(?:decide|design|facilitate|triage|cut|reduce|prioriti[sz]e|allocate|restructure|acquire|handle|recommend|approve|protect|extend|save|freeze|cancel|deliver|provision|frame|quantif(?:y|ies)|propose)\b/i

const REGULATED_HIRING_TOPIC =
  /\b(?:hiring|recruit(?:ing|ment)?|candidate\s+screening|employment|selection\s+workflow|automated\s+employment|workforce\s+screening)\b/i

const REGULATED_HIRING_REGIME =
  /\b(?:eu\s+ai\s+act|artificial\s+intelligence\s+act|eeoc|title\s+vii|employment\s+law|anti[- ]discrimination|disparate\s+impact|compliance|regulatory\s+requirements?)\b/i

function userQuestionOnly(prompt: string): string {
  const full = String(prompt || '').slice(0, 24_000)
  const marker = 'USER QUESTION:'
  const index = full.lastIndexOf(marker)
  return (index >= 0 ? full.slice(index + marker.length) : full).trim().slice(0, 12_000)
}

export function classifyScriptRequest(prompt: string): ScriptRequestMode {
  const input = userQuestionOnly(prompt)
  if (!SCRIPT_AUTHORING.test(input)) return 'none'
  if (EXPLICIT_CODE_SIGNAL.test(input) || COMPUTATIONAL_SCRIPT_BEHAVIOR.test(input)) return 'code'
  return 'content'
}

export function executiveDecisionDirective(prompt: string): string | null {
  const input = userQuestionOnly(prompt)
  if (!EXECUTIVE_DECISION_SCENARIO.test(input) || !EXECUTIVE_DECISION_VERB.test(input)) return null
  return [
    'EXECUTIVE DECISION MODE: EVIDENCE-BOUNDED, REVERSIBLE-FIRST, AND GOVERNANCE-AWARE.',
    'Treat every number, date, capacity statement, contractual condition, compliance status, and feasibility claim that the user did not explicitly supply as UNKNOWN unless it is mechanically derivable from supplied facts.',
    'Do not invent savings ranges, budget impacts, utilization levels, staffing percentages, dates, quarters, probabilities, outage costs, contract penalties, implementation effort, headcount changes, or other numeric targets. Do not manufacture precision to make a decision matrix look complete.',
    'Do not invent a workaround such as a phased/MVP/MVT delivery and then state that it satisfies the contract. Contract acceptance, customer consent, security readiness, and SLA compliance remain conditions to verify unless the user supplied them.',
    'Separate KNOWN FACTS, UNKNOWN/NEEDS-VALIDATION items, OPTIONS, and DECISION CONSEQUENCES. State what evidence would change the recommendation.',
    'When the CEO wants mutually constrained outcomes, treat that as a goal, not proof that both are simultaneously feasible. Show the resource/budget/operational constraint explicitly and identify what additional resource, scope change, schedule change, or risk acceptance would be required to make both possible.',
    'For resource conflicts, evaluate customer/revenue dependency, regulatory/security obligation, reversibility, time-to-cash, switching cost, reliability exposure, downstream dependency, and contractual flexibility. Do not use revenue attribution or executive preference as a shortcut.',
    'A recommendation may be conditional. Never claim that an option is low risk, contract-compliant, security-compliant, or budget-compliant until the facts establish that conclusion.',
    'Include an auditable decision matrix with: option, known upside, known downside, unresolved assumptions, required approval, owner, and decision trigger. Use placeholders rather than fabricated numbers for unknown quantities.',
    'Use neutral professional language and preserve the facts exactly as supplied.',
  ].join(' ')
}

export function regulatedHiringComplianceDirective(prompt: string): string | null {
  const input = userQuestionOnly(prompt)
  if (!REGULATED_HIRING_TOPIC.test(input) || !REGULATED_HIRING_REGIME.test(input)) return null
  return [
    'REGULATED HIRING AI MODE: FAIRNESS/COMPLIANCE FRAMEWORK IS ALLOWED; CURRENT LEGAL CLAIMS REQUIRE AUTHORITATIVE EVIDENCE.',
    'Answer the governance design question directly: explain how to combine efficiency, bias testing, human oversight, auditability, appeal/recourse, monitoring, and deployment controls.',
    'Do not state that the EU AI Act, EEOC, Title VII, or another named regime currently classifies, mandates, prohibits, or requires a specific practice, threshold, timeline, formula, or human-review rule unless authoritative current evidence for that exact claim is present in the prompt.',
    'Do not present the four-fifths/80% rule, demographic parity, equalized odds, feature-importance output, or any single metric as a universal legal compliance threshold. Distinguish statistical screening signals, engineering fairness metrics, policy choices, and legal conclusions.',
    'If current legal obligations are not live-verified, clearly label them as requiring jurisdiction-specific verification from the relevant authoritative regulator/statute and qualified counsel; do not fill the gap from model memory.',
    'Separate: (1) timeless control design, (2) facts that require current legal verification, and (3) organization-specific policy decisions. Never turn a best practice into a claimed legal mandate.',
  ].join(' ')
}

function pureScriptDirective(input: string): string | null {
  const mode = classifyScriptRequest(input)
  if (mode === 'none') return null

  if (mode === 'code') {
    return [
      'SCRIPT MODE: EXECUTABLE CODE.',
      'The user supplied explicit programming or computational signals, so interpret "script" as source code.',
      'Follow the requested language/runtime and behavior; do not reinterpret it as marketing, video, dialogue, or narration.',
    ].join(' ')
  }

  const rationaleRule = LINE_RATIONALE_REQUEST.test(input)
    ? 'After the script, explain each line with a concise purpose or design rationale. Do not expose private chain-of-thought; give only the useful, user-facing reason for what that line is doing.'
    : ''

  return [
    'SCRIPT MODE: WRITTEN/NARRATIVE CONTENT, NOT SOURCE CODE.',
    'Write the requested script directly. Do not output Python, JavaScript, Bash, classes, functions, or other executable code, and do not ask the user to choose a programming language.',
    'If the user explicitly says not to assume what the named subject is, treat that as a content constraint: use type-neutral wording and do not invent whether the subject is a person, product, company, service, or anything else.',
    'Ambiguity about the subject does not make the writing task impossible; satisfy the request with neutral language instead of refusing or substituting a software template.',
    rationaleRule,
  ].filter(Boolean).join(' ')
}

export function scriptRequestDirective(prompt: string): string | null {
  const input = userQuestionOnly(prompt)
  const directives = [
    pureScriptDirective(input),
    executiveDecisionDirective(input),
    regulatedOperationalScenarioDirective(input),
    regulatedHiringComplianceDirective(input),
  ].filter(Boolean)
  return directives.length ? directives.join('\n\n') : null
}
