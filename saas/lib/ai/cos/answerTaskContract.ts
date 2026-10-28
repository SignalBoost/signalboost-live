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
  // A repeated generic paragraph under different numbered headings is not eight
  // independent analytical deliverables. Check section bodies, not their headings.
  const seenSectionBodies = new Set<string>()
  // Parse all numbered sections once. Searching independently for each heading and
  // slicing from that match can accidentally include the NEXT heading as content.
  const sections = [...body.matchAll(/(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(\d{1,2})[.)][ \t]+/g)]
  return tasks.filter((directive, index) => {
    const position = sections.findIndex(item => Number(item[1]) === index + 1)
    if (position >= 0) {
      const match = sections[position]
      const end = position + 1 < sections.length
        ? sections[position + 1].index! : body.length
      const section = body.slice(match.index! + match[0].length, end).trim()
      // A heading or a copy of the user's checklist is not a completed task.
      // Require a meaningful amount of explanation and novel analytical content.
      const requestedWords = new Set(topicWords(directive))
      const novel = new Set(topicWords(section).filter(word => !requestedWords.has(word)))
      const firstLine = section.split('\n', 1)[0].trim()
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      // Only omit a first line that actually repeats the requested task heading.
      // Inline numbered answers must retain their substantive opening analysis.
      const plainFirstLine = firstLine.replace(/^[#*_`\s]+|[#*_`\s]+$/g, '').trim()
      // Standalone short titles may paraphrase the task (e.g. "**Root causes**").
      // Do not strip an opening analytical sentence just because it spans lines.
      const standaloneHeading = section.includes('\n')
        && (normalize(firstLine) === normalize(directive)
          || (plainFirstLine.split(/\s+/).length <= 8
            && plainFirstLine.length <= 72
            && !/[.!?;:]$/.test(plainFirstLine)
            && !/[,;]/.test(plainFirstLine)))
      const answerBody = standaloneHeading ? section.slice(section.indexOf('\n') + 1).trim() : section
      // Evaluate the actual answer, not its heading. A copied task title can
      // otherwise supply enough length and vocabulary to pass an empty response.
      const answerWords = new Set(topicWords(answerBody))
      const answerNovel = [...answerWords].filter(word => !requestedWords.has(word))
      const normalized = answerBody.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const repeatsPriorSection = seenSectionBodies.has(normalized)
      seenSectionBodies.add(normalized)
      return answerBody.length < 100 || answerNovel.length < 7 || repeatsPriorSection
    }
    // Some legitimate answers use prose headings instead of numbers. Permit those
    // only when the answer meaningfully mentions the task's subject matter.
    const topics = [...new Set(topicWords(directive))]
    if (!topics.length) return body.length < tasks.length * 90
    return topics.filter(word => vocabulary.has(word)).length < Math.min(2, topics.length)
  })
}

/**
 * Whether an analysis may be released. A draft that meets the contract always may. A draft with gaps may still be
 * released when it is a substantive analysis: long enough for the requested deliverables and covering the subject
 * matter of at least half of them anywhere in the text (section numbering varies; nested numbered lists confuse the
 * section parser). A non-answer ("I need more readings before investigating") is never released.
 * Production 2026-10-25: complete model answers (finish_reason stop, 1,000-3,140 tokens) to an 8-task incident
 * analysis were discarded because the section parser reported gaps, and the owner got a refusal instead.
 */
export function releasableAnalyticalAnswer(prompt: string, answer: string): boolean {
  const tasks = requestedAnalyticalTasks(prompt)
  if (!tasks.length) return true
  const missing = missingAnalyticalTasks(prompt, answer)
  if (!missing.length) return true
  // Judge only the answer's own analysis: lines that repeat a requested task heading and paragraphs repeated
  // under several headings do not count (Codex on #4900: the checklist plus one refusal paragraph repeated
  // eight times must stay a non-answer).
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const headings = new Set(tasks.map(normalize))
  const seen = new Set<string>()
  const body = String(answer || '').split(/\n\s*\n|\n(?=\s*(?:#{1,6}\s*)?\d{1,2}[.)]\s)/)
    .map(block => block.split('\n').filter(line => !headings.has(normalize(line.replace(/^\s*(?:#{1,6}\s*)?(?:\d{1,2}[.)]\s*)?/, '')))).join('\n').trim())
    .filter(block => {
      const key = normalize(block)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    }).join('\n\n')
  if (body.length < tasks.length * 250) return false
  const vocabulary = new Set(topicWords(body))
  const covered = tasks.filter(directive => {
    const topics = [...new Set(topicWords(directive))]
    return !topics.length || topics.filter(word => vocabulary.has(word)).length >= Math.min(2, topics.length)
  }).length
  return covered * 2 >= tasks.length
}

export function analyticalTaskRepairDirective(prompt: string, answer: string): string {
  const missing = missingAnalyticalTasks(prompt, answer)
  return missing.length
    ? 'TASK CONTRACT: The preceding draft did not demonstrably fulfill these user-requested deliverables:\n'
      + missing.map((item, index) => (index + 1) + '. ' + item).join('\n')
      + '\nAnswer the full ORIGINAL request. Give each requested deliverable substantive treatment; distinguish observations, hypotheses, and uncertainty. Missing production telemetry limits certainty, not preliminary analytical work. Never claim to have run investigations you did not run.'
    : ''
}

/**
 * Outcome ledger projection: a completed agent/tool call is not evidence that the
 * original user request was fulfilled. Consumers persist this structured verdict
 * alongside the original request and immutable execution receipts.
 *
 * No model-supplied "done" flag can turn a missing deliverable into success.
 */
export type OutcomeEvidenceReceipt = Readonly<{
  kind: 'test' | 'source' | 'execution' | 'artifact' | 'human'
  reference: string
  verified: boolean
}>

export type TaskOutcomeVerdict = Readonly<{
  status: 'verified' | 'incomplete' | 'awaiting_verification'
  originalRequest: string
  remainingDeliverables: readonly string[]
  verifiedReceiptCount: number
  blockers: readonly string[]
}>

export function evaluateTaskOutcome(input: Readonly<{
  originalRequest: string
  answer: string
  receipts?: readonly OutcomeEvidenceReceipt[]
  requiresExecutionEvidence?: boolean
  blockers?: readonly string[]
}>): TaskOutcomeVerdict {
  const originalRequest = String(input.originalRequest || '')
  const remainingDeliverables = missingAnalyticalTasks(originalRequest, input.answer)
  const blockers = [...new Set((input.blockers ?? []).map(String).filter(Boolean))]
  const receipts = input.receipts ?? []
  const verifiedReceiptCount = receipts.filter(receipt =>
    receipt.verified === true && receipt.reference.trim().length > 0
  ).length
  const executionVerified = receipts.some(receipt =>
    receipt.verified === true
      && receipt.kind === 'execution'
      && receipt.reference.trim().length > 0
  )
  const missingExecution = input.requiresExecutionEvidence === true && !executionVerified
  if (missingExecution) blockers.push('verified_execution_receipt_missing')
  const status = remainingDeliverables.length || blockers.length
    ? 'incomplete'
    : input.requiresExecutionEvidence === true && !verifiedReceiptCount
      ? 'awaiting_verification'
      : 'verified'
  return { status, originalRequest, remainingDeliverables, verifiedReceiptCount, blockers }
}
