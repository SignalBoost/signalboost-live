// Pure command-shape classifier for governed external actions.
// Keep this dependency-free so transport regressions can execute under the Node/Vercel gate
// without importing the full COS orchestration/server runtime.

export function isExternalActionCommand(input: string): boolean {
  const executionVerb = '(?:run|execute|perform|investigate|check|fetch|pull|read|scan|audit|search|look up|research|deploy|commit|merge|create|update|delete|send|publish|queue|launch|start|render|rendering|fix|repair|change|modify|invite|reset|archive|upload|empty|transfer|pay|purchase|book|reserve|cancel|approve|reject|call the tool|use (?:the )?tools?)'
  const actionOpener = new RegExp(`^\\s*(?:(?:please|kindly)\\s+|i\\s+(?:need|want)\\s+you\\s+to\\s+)?${executionVerb}\\b`, 'i')
  const target = /\b(repo|repository|github|vercel|supabase|logs?|metrics?|status page|production|deployment|database|table|file|route|api|web|internet|youtube|publication|magazine|journal|provider|video|render(?:ing)?|campaign|prospect|email|message|customer|contact|recipient|user|account|password|storage|bucket|object|payment|invoice|subscription|order|ticket|calendar|event|meeting|domain|dns)\b/i
  const diagnosticVerbThenQuestionWord = /\b(?:run|execute|perform|investigate|check|fetch|pull|read|scan|audit|search|look up|research)\s+(?:why|what|how|whether|if|when|where)\b/i
  const diagnosticOpener = /^\s*(why|what|how|when|where|which|who|explain|describe|tell me|is|are|was|were|does|did|do|could|would|should)\b/i
  const endsAsQuestion = /\?\s*$/
  if (diagnosticVerbThenQuestionWord.test(input) || diagnosticOpener.test(input) || endsAsQuestion.test(input)) return false

  const clauses = String(input || '')
    .split(/(?:[.!?;]|\n+|—|--|\band then\b|\bthen\b)/iu)
    .map(part => part.trim())
    .filter(Boolean)

  return clauses.some(clause => actionOpener.test(clause) && target.test(clause))
}
