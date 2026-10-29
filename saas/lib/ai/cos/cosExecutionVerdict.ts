/** A successful transport response is not evidence of completed customer execution. */
export function refusedRequestedExecution(reply: string): boolean {
  const text = String(reply || '').trim()
  return /^(?:I\s+(?:cannot|can't|am\s+unable\s+to)|Unable\s+to|Cannot)\s+(?:execute|perform|complete|run|carry\s+out|fulfill|fulfil)\b/i.test(text)
}
