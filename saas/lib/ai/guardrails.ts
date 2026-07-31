// saas/lib/ai/guardrails.ts
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

  // UNFILLED TEMPLATE PLACEHOLDER. On 2026-07-30 a real outreach email reached a real
  // prospect signed "Best regards, [Your Name]" — the draft was written with a
  // placeholder, approved by a human who skimmed it, and sent. Nothing in the pipeline
  // looked. A placeholder in an outbound message is always a defect, never intent, so
  // it is cheap and safe to refuse here: this runs at draft creation AND again
  // immediately before every send, single-row and batch.
  const placeholder = findTemplatePlaceholder(message)
  if (placeholder) return { ok: false, reason: `Message contains an unfilled template placeholder: ${placeholder}` }

  // PROMPT ECHO. On 2026-07-30 a queue row appeared whose entire body was the owner's
  // own instruction to COS ("You are my AI Chief of Staff… Run an email outreach
  // campaign… Find 10."). A model handed the prompt straight through as the message and
  // nothing looked. An outbound sales email never addresses an AI or asks it to find N
  // companies, so these phrasings are safe to refuse outright.
  const echo = findPromptEcho(message)
  if (echo) return { ok: false, reason: `Message looks like an instruction to the assistant, not an outbound email: ${echo}` }

  return { ok: true }
}

const PROMPT_ECHO_PATTERNS: RegExp[] = [
  /\byou are (?:my|an|the)\s+(?:ai\b|assistant\b|chief of staff\b)/i,
  /\bchief of staff\b/i,
  /\brun an (?:email )?outreach campaign\b/i,
  /\bfind \d{1,3}\b[^.]{0,80}\b(?:companies|prospects|leads|targets|accounts)\b/i,
  /\bfind \d{1,3}\.\s*$/i,
  /\bthe email should be (?:in|written)\b/i,
  /\bwrite (?:the|an) email in \w+\b/i,
  /\b(?:target|targets):\s/i,
  /\bstart in (?:the )?[A-Z][a-z]+\.\s*(?:find|encontr|busca)\b/i,
]

export function findPromptEcho(message: string): string | null {
  const text = String(message || '')
  for (const pattern of PROMPT_ECHO_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[0].slice(0, 60)
  }
  return null
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  // [Your Name], [Company], [First Name], [insert product], [Recipient] ...
  /\[\s*(your|insert|add|name|first[\s_-]?name|last[\s_-]?name|full[\s_-]?name|company|company[\s_-]?name|business|title|role|position|city|country|product|service|sender|signature|recipient|contact|team|date|link|url|website|placeholder|x{2,})\b[^\]]{0,48}\]/i,
  // {{name}}, {{ company }}, {name}
  /\{\{[^}]{1,60}\}\}/,
  /\{\s*(your|insert|name|company|first[\s_-]?name|recipient|product|signature)\b[^}]{0,40}\}/i,
  // <your name>, <insert company>
  /<\s*(your|insert)\b[^>]{0,48}>/i,
  // Bare TODO / FIXME left in a draft.
  /\b(TODO|FIXME)\b/,
]

export function findTemplatePlaceholder(message: string): string | null {
  const text = String(message || '')
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[0].slice(0, 60)
  }
  return null
}
