// Host backstop for explicit owner-authorized PAC execution. This is intent only;
// the browser route enforces authentication and the Assistant surface separately.
export function requestsProductionAcceptanceExecution(prompt: string): boolean {
  const text = String(prompt || '').trim()
  if (!text || text.length > 12_000) return false
  const campaign = /\b(?:COS-PAC-001|iTMounts-PAC-001|production acceptance campaign)\b/i.test(text)
  const execute = /\b(?:run|execute|start|launch|perform|carry out|rerun|re-run)\b/i.test(text)
  const reviewOnly = /\b(?:review|explain|summarize|critique|analy[sz]e)\b/i.test(text) && !execute
  return campaign && execute && !reviewOnly
}
