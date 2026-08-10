export function isMissingCorpusTable(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase()
  return message.includes("business_intelligence_corpus") && (
    message.includes('could not find the table') ||
    message.includes('schema cache') ||
    message.includes('relation') && message.includes('does not exist')
  )
}
