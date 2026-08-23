// COS script-intent disambiguation.
//
// "Script" is polysemous: it can mean authored prose/dialogue or executable source code.
// The production failure on 2026-08-23 was an ordinary writing request:
//   Produce a script for 'Nova' without assuming whether it's a person, product, or company.
// A second production failure used:
//   Generate a script and then explain the reasoning behind each line.
// The local reasoner guessed the programming sense and asked for a language. This module keeps
// that decision deterministic. An unqualified authoring request is content; executable code
// requires an explicit programming signal or a clearly computational behavior.

export type ScriptRequestMode = 'content' | 'code' | 'none'

const SCRIPT_AUTHORING =
  /\b(?:write|draft|produce|generate|create|compose|prepare|develop|make)\b[^.!?;\n]{0,120}\b(?:a\s+|an\s+|the\s+)?script\b|\bscript\b[^.!?;\n]{0,80}\b(?:for|about)\b/i

const EXPLICIT_CODE_SIGNAL =
  /\b(?:source\s+code|code|program(?:ming)?|python|javascript|typescript|node(?:\.js)?|bash|shell\s+script|powershell|ruby|perl|php|java|c\+\+|c#|golang|rust|swift|kotlin|sql|command[- ]line|cli|executable|automation\s+script)\b|\.(?:py|js|ts|sh|ps1|rb|php|go|rs)\b/i

const COMPUTATIONAL_SCRIPT_BEHAVIOR =
  /\bscript\b[^.!?;\n]{0,60}\b(?:to|that|which)\b[^.!?;\n]{0,100}\b(?:rename|parse|process|scrape|crawl|download|upload|delete|copy|move|monitor|compile|deploy|execute|automate|query\s+(?:a\s+)?database|call\s+(?:an?\s+)?api|read\s+(?:a\s+)?file|write\s+(?:to\s+)?(?:a\s+)?file|run\s+(?:on|in|under))\b/i

const LINE_RATIONALE_REQUEST =
  /\b(?:explain|describe|give)\b[^.!?;\n]{0,80}\b(?:reason(?:ing)?|rationale|purpose|why)\b[^.!?;\n]{0,80}\b(?:each|every)\s+line\b|\bline[- ]by[- ]line\b[^.!?;\n]{0,80}\b(?:reason(?:ing)?|rationale|purpose|explanation)\b/i

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

export function scriptRequestDirective(prompt: string): string | null {
  const input = userQuestionOnly(prompt)
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
