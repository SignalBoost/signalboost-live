/** Fail closed when a copied COS conversation is submitted as a fresh coding objective. */
export function builderCopiedTranscriptBlocker(objective: string): { error: string; reply: string } | null {
  const requestHeaders = [...objective.matchAll(/^\s*YOUR REQUEST\s+\d+\s*$/gim)]
  const responseHeaders = [...objective.matchAll(/^\s*COS response\s+\d+\s*$/gim)]
  // Ordinary source code, issue templates, and quoted single-turn examples must remain admissible.
  if (!requestHeaders.length || !responseHeaders.length) return null
  const firstResponse = responseHeaders[0].index ?? objective.length
  const firstRequest = requestHeaders[0].index ?? 0
  if (firstResponse <= firstRequest) return null
  // An entire prior request followed by COS's answer is history, not a new executable objective.
  return {
    error: 'builder_copied_conversation_objective',
    reply: 'Builder received a copied conversation containing YOUR REQUEST and COS response sections. No job was started. Start a new workspace and submit only the current standalone coding objective; keep prior results in History.',
  }
}
