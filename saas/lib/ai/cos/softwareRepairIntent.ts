// saas/lib/ai/cos/softwareRepairIntent.ts
//
// A plain-language request to repair software: "Fix the Failed to fetch error on the Builder page",
// "my login form does not submit, can you fix it?". Production 2026-10-21: such requests never left
// chat — "Fix the …" was read as a text edit, the rest got a canned answer — because every software
// route demanded pasted code, a file name or a stack trace. A repair verb (or a broken-behaviour
// phrase) aimed at a software subject is enough; authoring a message stays an edit.

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
