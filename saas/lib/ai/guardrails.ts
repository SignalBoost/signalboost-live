export function sanitizePublicText(input: string, maxLength = 12000): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(ignore|disregard)\s+(all|previous|prior)\s+(instructions|rules)\b/gi, '[removed unsafe instruction]')
    .replace(/\b(system prompt|developer message|secret key|api key|password)\b/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function assertSafeOutreachMessage(message: string): { ok: boolean; reason?: string } {
  const text = message.toLowerCase()
  if (message.length < 40) return { ok: false, reason: 'Message is too short.' }
  if (message.length > 2500) return { ok: false, reason: 'Message is too long.' }
  if (/(guarantee|guaranteed)\s+(revenue|sales|ranking|results)/i.test(message)) return { ok: false, reason: 'Message contains prohibited guarantees.' }
  if (text.includes('scraped private') || text.includes('behind login')) return { ok: false, reason: 'Message implies private data access.' }
  return { ok: true }
}
