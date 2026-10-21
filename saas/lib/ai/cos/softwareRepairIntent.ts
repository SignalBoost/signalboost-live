// saas/lib/ai/cos/softwareRepairIntent.ts
//
// A plain-language request to repair software: "Fix the Failed to fetch error on the Builder page",
// "my login form does not submit, can you fix it?". Production 2026-10-21: such requests never left
// chat — "Fix the …" was read as a text edit, the rest got a canned answer — because every software
// route demanded pasted code, a file name or a stack trace. A repair verb (or a broken-behaviour
// phrase) aimed at a software subject is enough; authoring a message stays an edit.

import { pastedSourceCode, structuredApplicationBuild } from './cosReasoningRolePolicy.ts'

const REPAIR_ACTION = /\b(?:fix|fixes|fixing|debug|debugging|repair|troubleshoot|resolve)\b/i
const BROKEN_BEHAVIOUR = /\b(?:(?:does|do|did|is|are)\s*(?:not|n['’]t)\s+(?:work|working|load|loading|submit|submitting|save|saving|open|opening|start|starting|run|running|respond|responding|show|showing|display|displaying|connect|connecting)|not\s+working|broken|crash(?:es|ed|ing)?|fails?|failing|failed\s+to\s+\w+|throws?|stuck|hangs?|freez(?:es|ing))\b/i
const SOFTWARE_SUBJECT = /\b(?:app|application|website|web\s*site|site|page|screen|button|form|login|log\s*in|sign[\s-]?in|signup|sign[\s-]?up|checkout|cart|dashboard|endpoint|api|server|backend|frontend|database|query|function|component|module|script|code|bug|error|exception|stack\s*trace|crash|build|deploy(?:ment)?|test|tests|route|link|menu|navbar|upload|download|builder|workspace|plugin|extension|integration|webhook|cron|job|request|response|fetch|timeout|404|500|502|503)\b/i
// Editing words aimed at prose: "fix the grammar", "fix my email", "correct this paragraph".
const PROSE_SUBJECT = /\b(?:grammar|spelling|typos?|punctuation|wording|phrasing|tone|sentence|paragraph|email|e-mail|letter|message|text|essay|draft|translation|caption|post|resume|cv|cover\s+letter)\b/i
const EDIT_COMMAND = /^\s*(?:edit|rewrite|proofread|polish|translate|correct)\b/i
// The repair is aimed at the prose itself: "fix the typos in …", "fix my email".
const PROSE_REPAIR = /\b(?:fix|correct|repair)\s+(?:the\s+|my\s+|this\s+|these\s+|any\s+)?(?:grammar|spelling|typos?|punctuation|wording|phrasing|tone|email|e-mail|letter|message|text|sentence|paragraph|draft|translation)\b/i

export function isSoftwareRepairRequest(prompt: string): boolean {
  const text = String(prompt || '').trim().slice(0, 4000)
  if (!text || EDIT_COMMAND.test(text) || PROSE_REPAIR.test(text)) return false
  const asksRepair = REPAIR_ACTION.test(text) || BROKEN_BEHAVIOUR.test(text)
  if (!asksRepair || !SOFTWARE_SUBJECT.test(text)) return false
  // Prose wins only when no software subject is named besides it.
  if (PROSE_SUBJECT.test(text)) {
    const withoutProse = text.replace(new RegExp(PROSE_SUBJECT.source, 'gi'), ' ')
    if (!SOFTWARE_SUBJECT.test(withoutProse)) return false
  }
  return true
}

// An instruction to make something: "Create a Node.js script … and fix any bugs", "Can you build me …".
// A build word that only describes the problem ("users cannot create an account", "the build error") is not one.
const BUILD_VERB = '(?:create|build|make|write|implement|scaffold|generate|develop)'
const BUILD_INSTRUCTION = new RegExp(
  `(?:^|[.!?\\n]\\s*)(?:please\\s+)?${BUILD_VERB}\\s+(?:me\\s+)?(?:a|an|the|my|this|new)\\b`
  + `|\\b(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?${BUILD_VERB}\\b`
  + `|\\bi\\s+(?:want|need|would\\s+like)\\s+(?:you\\s+to\\s+)?${BUILD_VERB}\\b`,
  'i',
)
// A short snippet under the request ("Debug this Python script:\nx = [1, 2]\nprint(x[2])") is the code, even
// when it is too small for the two-signal paste detector (Codex on #4736).
const INLINE_CODE_LINE = /^\s*(?:[A-Za-z_$][\w$.[\]'"]*\s*[+\-*/%]?=(?!=)\s*\S|[A-Za-z_$][\w$.]*\s*\(.*\)\s*;?\s*$|(?:def|class|function|const|let|var|import|from|return|if|for|while|async|export)\b)/

function carriesInlineCode(text: string): boolean {
  if (pastedSourceCode(text)) return true
  const lines = text.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean)
  return lines.some(line => INLINE_CODE_LINE.test(line))
}

/**
 * A repair of code that is not here: "Fix the bug in checkout.ts", "Debug my Python script, it crashes".
 * Naming a file or a language is not the file (Codex on #4734). A request that builds something, or that
 * carries its code inline, is Builder's to run directly.
 */
export function repairAwaitingSource(prompt: string): boolean {
  const text = String(prompt || '')
  return isSoftwareRepairRequest(text)
    && !BUILD_INSTRUCTION.test(text)
    && !structuredApplicationBuild(text)
    && !carriesInlineCode(text)
}
