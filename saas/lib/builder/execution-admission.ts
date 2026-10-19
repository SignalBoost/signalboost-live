export type BuilderAdmissionBlocker = Readonly<{
  error: 'builder_inference_spend_cap_unavailable'
  status: 'incomplete'
  reply: string
  execution_allowed: false
  external_action_taken: false
}>

/** Call-count budgets and post-hoc usage records do not enforce a dollar ceiling. */
export function builderExecutionAdmissionBlocker(objective: string): BuilderAdmissionBlocker | null {
  const lines = String(objective || '').split(/\r?\n/)
  const hardSpendLimit = lines.some(line => {
    const runLimit = /^\s*(?:limits?|budget|spend(?:ing)? (?:cap|limit))\s*:/i.test(line)
      || /\b(?:this (?:run|job|attempt)|inference (?:spend(?:ing)?|cost))\b/i.test(line)
    return runLimit && /(?:\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:USD|dollars?)\b)/i.test(line)
      && /\b(?:max(?:imum)?|at most|under|no more than|cap|limit|budget|ceiling)\b/i.test(line)
  })
  if (!hardSpendLimit) return null
  return {
    error: 'builder_inference_spend_cap_unavailable',
    status: 'incomplete',
    reply: 'INCOMPLETE: Builder cannot currently enforce the requested inference spending cap before each model call. Call-count and time limits do not guarantee a dollar limit. No Builder job or workspace was created, and no model call, repository change, or deployment was started.',
    execution_allowed: false,
    external_action_taken: false,
  }
}
