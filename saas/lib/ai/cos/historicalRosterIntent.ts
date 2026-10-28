// Recognize an explicit list request, not keywords scattered through a pasted document.
export function asksForHistoricalRoster(input: string): boolean {
  const parts = String(input || '').trim().split(/\n\s*\n/).filter(Boolean)
  const request = (parts[parts.length - 1] || '').trim()
  if (request.length > 400) return false
  return /^(please\s+)?(list|name|enumerate|show)\b/i.test(request)
    && /\b(former|past|previous|historical)\b/i.test(request)
    && /\b(secretaries|secretary|officeholders|presidents|ministers)\b/i.test(request)
}