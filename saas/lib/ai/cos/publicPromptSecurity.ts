// Public Concierge prompt-exfiltration boundary.
// This is deterministic and runs before model inference. It protects public delivery
// without treating normal security-design questions as extraction requests.

export const PUBLIC_CONCIERGE_SECURITY_REFUSAL = 'I am unable to assist with that request.'

function normalized(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const PROTECTED_TARGET = /\b(?:system|developer|hidden|private|internal|initialization|configuration|backend|organizational)\s*(?:prompt|instruction(?:s)?|context|configuration|directive(?:s)?|guideline(?:s)?|note(?:s)?|data|metadata)|\b(?:private\s+(?:knowledge base|memo(?:s)?|context)|system prompt|developer instructions|reference context)\b/i
const EXTRACTION_ACTION = /\b(?:repeat|output|print|display|show|reveal|expose|disclose|summari[sz]e|translate|encode|convert|base64|rot13|hex|cipher|continue|include|recite|verbatim|word[- ]for[- ]word)\b/i
const FICTIONAL_BYPASS = /\b(?:fiction(?:al)?|story|roleplay|game|pretend|hypothetical|completion)\b/i
// A fictional wrapper cannot be used to request the exact operating instructions of
// the assistant being portrayed. This deliberately describes a request shape, not a
// fixed product name or a fixed attack sentence.
const FICTIONAL_SELF_INSTRUCTION_EXTRACTION = /\b(?:fiction(?:al)?|story|roleplay|game|pretend|hypothetical|completion)\b[\s\S]{0,240}\b(?:customer\s+support\s+ai|support\s+ai|concierge|assistant|bot)\b[\s\S]{0,320}\b(?:exact|full|entire|verbatim)\b[\s\S]{0,96}\b(?:instructions?|directives?|prompt|configuration)\b/i
const SECURITY_ADVICE = /\b(?:implement|add|recommend|design|protect|secure|guardrail|mitigation|detect|filter|block|prevent|test|audit)\b/i
const CONTEXT_REPLAY = /\b(?:document|text|section|above|previous|preceding)\b[\s\S]{0,160}\b(?:continue|repeat|recite|verbatim|word[- ]for[- ]word)\b/i
const PROMPT_SIGNATURE = /\b(?:you are concierge|instructions?|directive|configuration|prompt|context)\b/i

export function isPublicPromptExfiltrationAttempt(input: string): boolean {
  const text = normalized(input)
  if (!text) return false
  if (CONTEXT_REPLAY.test(text) && PROMPT_SIGNATURE.test(text)) return true
  if (FICTIONAL_SELF_INSTRUCTION_EXTRACTION.test(text)) return true
  if (!PROTECTED_TARGET.test(text)) return false
  if (SECURITY_ADVICE.test(text) && !/\b(?:your|the|this|all|full|entire|exact)\b.{0,24}\b(?:prompt|instruction|context|configuration|directive|guideline|note|data)\b/i.test(text)) return false
  return EXTRACTION_ACTION.test(text) || FICTIONAL_BYPASS.test(text)
}

function decodedBase64ContainsLeak(text: string): boolean {
  const tokens = text.match(/\b[A-Za-z0-9+/]{48,}={0,2}\b/g) || []
  return tokens.some(token => {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8')
      return /reference context\s*-\s*read only|original message|begin system prompt|developer instructions/i.test(decoded)
    } catch {
      return false
    }
  })
}

export function hasUnsafePublicModelOutput(reply: string): boolean {
  const text = String(reply || '')
  if (!text) return false
  if (/reference context\s*-\s*read only|original message\s*-{2,}|begin\s+(?:system|developer)\s+(?:prompt|instructions?)/i.test(text)) return true
  if (/^\s*you are concierge\b[\s\S]{0,900}\b(?:must never|always prioritize|do not attempt to guess|core directive)\b/i.test(text)) return true
  return decodedBase64ContainsLeak(text)
}
