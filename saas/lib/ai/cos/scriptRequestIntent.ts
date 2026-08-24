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
// The same request-specific seam also carries a narrow executive-decision discipline for high-
// stakes management scenarios. That prevents a generic model instinct from turning sparse facts
// into invented savings percentages, blanket freezes, accusations about department leaders, or
// simplistic "cost center = expendable" recommendations.

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
  /\b(?:leadership\s+team|ceo|cfo|coo|board|department\s+lead|operating\s+expenses?|opex|runway|budget\s+cuts?|cost\s+reduction|headcount|layoffs?|restructur(?:e|ing)|acquisition|due\s+diligence|merger|triage\s+process|head\s+of\s+enterprise\s+sales|enterprise\s+sales|product\s+lead|self[- ]serve|product[- ]led\s+growth|\bplg\b|contracted\s+renewals?)\b/i

const EXECUTIVE_DECISION_VERB =
  /\b(?:decide|design|facilitate|triage|cut|reduce|prioriti[sz]e|allocate|restructure|acquire|handle|recommend|approve|protect|extend|save|freeze|cancel)\b/i

// Executive requests may use an unlimited variety of verbs (for example, "outline"), so the
// gate keys on the request shape rather than an ever-growing verb list.
const EXECUTIVE_DELIVERABLE =
  /\b(?:roadmap|(?:the|a|an|our|your|my)\s+plan|action\s+plan|playbook|proposal|recommendations?|next\s+steps|course\s+of\s+action|strategy|framework|memo|briefing|agenda|trade[-\s]?offs?|decision\s+(?:process|framework|memo|rights))\b/i
const EXECUTIVE_DECISION_QUESTION = /\b(?:how|what|which|who|should|would)\b[^?]{0,400}\?/i
const EXECUTIVE_SUBSTANCE_MIN_CHARS = 160

function executiveRequestShape(input: string): boolean {
  if (EXECUTIVE_DECISION_VERB.test(input)) return true
  if (input.length < EXECUTIVE_SUBSTANCE_MIN_CHARS) return false
  return EXECUTIVE_DELIVERABLE.test(input) || EXECUTIVE_DECISION_QUESTION.test(input)
}

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
  if (!EXECUTIVE_DECISION_SCENARIO.test(input) || !executiveRequestShape(input)) return null
  return [
    'EXECUTIVE DECISION MODE: EVIDENCE-BOUNDED, REVERSIBLE-FIRST, AND GOVERNANCE-AWARE.',
    'Do not assume an across-the-board percentage cut, dishonesty by budget owners, or that a cost center is less important merely because revenue attribution is indirect unless the user explicitly supplied that fact.',
    'Do not invent savings ranges, rework costs, headcount percentages, contractor reductions, deal structures, or other numeric targets. If a number is useful only as an example, label it clearly as illustrative and keep it separate from the recommendation.',
    'Separate known facts from hypotheses and from decisions still requiring data. State what evidence would change the decision.',
    'For resource cuts, evaluate each spend line by criticality, customer/revenue dependency, regulatory/security obligation, reversibility, time-to-cash, switching cost, and downstream dependency. Do not use "revenue center" versus "cost center" as a shortcut.',
    'Sequence actions from reversible to irreversible: freeze new commitments and obvious duplication first; then renegotiate, consolidate, resize, or defer; use headcount or structural cuts only after the required savings gap is quantified and decision rights are explicit.',
    'Define a central target and a comparable decision template across departments, but do not force equal departmental percentages unless the facts justify equal elasticity.',
    'Include an auditable decision process: owner, evidence, recommendation, impact, dependency, reversibility, implementation date, and metric that would trigger reconsideration.',
    'Use neutral professional language. Do not call a person a liability, accuse leaders of hiding spend, threaten disclosure, or recommend coercion when escalation through normal governance is sufficient.',
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
  ].filter(Boolean)
  return directives.length ? directives.join('\n\n') : null
}
