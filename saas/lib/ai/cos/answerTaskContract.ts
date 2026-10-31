// saas/lib/ai/cos/answerTaskContract.ts
/**
 * A request's enumerated analytical deliverables. Used only to give a numbered analytical assignment a bounded
 * no-draft recovery attempt and to brief the verifier; whether an answer delivers them is decided solely by the
 * independent verifier (answerOutcomeVerifier.ts), never by word counts or vocabulary.
 */
export function requestedAnalyticalTasks(prompt: string): string[] {
  const text = String(prompt || '')
  const tasks = [...text.matchAll(/^\s*([1-9]\d?)[.)] +([^\n]{8,240})/gm)]
    .map(match => ({ number: Number(match[1]), directive: match[2].trim() }))
  if (tasks.length < 3 || tasks.length > 20 || tasks[0].number !== 1) return []
  if (!tasks.every((item, index) => item.number === index + 1)) return []
  const directives = tasks.map(item => item.directive)
  const analytical = /^(?:list|rank|identify|describe|produce|design|explain|state|compare|assess|evaluate|analy[sz]e|recommend|trace|audit|investigate|outline|summarize|determine|distinguish)\b/i
  return directives.every(item => analytical.test(item)) ? directives : []
}
