/**
 * A request's enumerated deliverables form an answer-acceptance contract.
 * This operates on any analytical assignment, not on scenario-specific phrases.
 * It never invents a response or executes an operation.
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

const STOP = new Set(['what','which','where','with','from','into','this','that','then','each','every','your','their','them','these','those','about','would','could','should','cause','causes','root','most','likely','provide','produce','state','list','rank','identify','describe','explain','design','compare','evaluate','analyze','analyse','investigate','recommend','determine','versus','between','step','steps','the','and','for','are','does','how','any','all','missing','plausible','single','evidence'])
function topicWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) || [])
    .map(word => word.replace(/(?:ations?|ments?|ences?|ings?|ed|es|s)$/, ''))
    .filter(word => word.length >= 4 && !STOP.has(word))
}

/**
 * Conservative heuristic: numbered sections establish explicit completion, while
 * non-numbered prose must substantively cover task-specific nouns. This is an
 * inexpensive host check, not a substitute for semantic adjudication.
 */
export function missingAnalyticalTasks(prompt: string, answer: string): string[] {
  const tasks = requestedAnalyticalTasks(prompt)
  if (!tasks.length) return []
  const body = String(answer || '')
  const vocabulary = new Set(topicWords(body))
  return tasks.filter((directive, index) => {
    const numbered = new RegExp('(?:^|\\n)\\s*(?:#{1,5}\\s*)?' + (index + 1) + '[.)][ \\t]+').test(body)
    if (numbered) return false
    const topics = [...new Set(topicWords(directive))]
    if (!topics.length) return body.length < tasks.length * 90
    return topics.filter(word => vocabulary.has(word)).length < Math.min(2, topics.length)
  })
}

export function analyticalTaskRepairDirective(prompt: string, answer: string): string {
  const missing = missingAnalyticalTasks(prompt, answer)
  return missing.length
    ? 'TASK CONTRACT: The preceding draft did not demonstrably fulfill these user-requested deliverables:\n'
      + missing.map((item, index) => (index + 1) + '. ' + item).join('\n')
      + '\nAnswer the full ORIGINAL request. Give each requested deliverable substantive treatment; distinguish observations, hypotheses, and uncertainty. Missing production telemetry limits certainty, not preliminary analytical work. Never claim to have run investigations you did not run.'
    : ''
}
