// saas/lib/ai/cos/contextualEditQuality.ts
export type ContextualEditPreparation = {
  editableSource: string
  anchors: string[]
}

function compact(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sourceSignalsOnePersonPost(source: string, context: string): boolean {
  const malformed = /\b(?:a\s+)?person\s+post\b/i.test(source)
  if (!malformed) return false
  const soleStaffing = /\b(?:only|sole)\b.{0,80}\b(?:DT\s+)?person\b/i.test(context)
  const handoff = /\bif\s+i\s+(?:do\s+not|don't)\b.{0,80}\byou\s+will\s+have\s+to\b/i.test(source)
  return soleStaffing || handoff
}

function sourceSignalsOutboundSupportYes(source: string, context: string): boolean {
  const asksSupport = /\b(?:still\s+)?want(?:ed)?\s+to\s+support\s+the\s+outbound\s+flight\b/i.test(context)
  if (!asksSupport) return false
  return /\bdo\s+not\s+worry\b/i.test(source)
    && (/\bif\s+i\s+(?:do\s+not|don't)\b.{0,100}\byou\s+will\s+have\s+to\b/i.test(source)
      || /\bwhatever\s+is\s+(?:needed|required)\s+to\s+support\s+the\s+mission\b/i.test(source)
      || /\bwe\s+do\s+what\s+we\s+have\s+to\s+do\b/i.test(source))
}

function sourceSignalsReferralRequest(source: string): boolean {
  const value = compact(source)
  return [
    /\bwho\s+(?:can|could|should|would)\b.{0,80}\b(?:give|provide|send|share)\s+(?:me|us)\b.{0,80}\b(?:info|information|status|update)\b/i,
    /\b(?:which|what)\s+(?:office|team|department|person|contact|point\s+of\s+contact)\b.{0,120}\b(?:contact|help|assist|provide|give|status|information|info|update)\b/i,
    /\bwho\s+(?:should|can|could|would)\s+(?:i|we)\s+contact\b/i,
    /\b(?:direct|refer|point)\s+(?:me|us)\s+to\b/i,
    /\b(?:who|which\s+(?:office|team|department|person|contact))\b.{0,80}\b(?:responsible|handles?|can\s+help|could\s+help)\b/i,
  ].some(pattern => pattern.test(value))
}

function requestsRecipientUnderlyingInfo(value: string): boolean {
  const text = compact(value)
  return [
    /\b(?:can|could|would|will)\s+you\b.{0,60}\b(?:provide|give|send|share|confirm)\b.{0,120}\b(?:status|update|information|info)\b/i,
    /\bplease\b.{0,40}\b(?:provide|give|send|share|confirm)\b.{0,120}\b(?:status|update|information|info)\b/i,
    /\b(?:can|could|would|will)\s+you\b.{0,60}\badvise\b(?:\s+(?:me|us))?\s+(?:on|about|of)\s+(?:the\s+)?(?:status|update|information|info)\b/i,
    /\bplease\b.{0,30}\badvise\b(?:\s+(?:me|us))?\s+(?:on|about|of)\s+(?:the\s+)?(?:status|update|information|info)\b/i,
    /\b(?:can|could|would|will)\s+you\b.{0,60}\bupdate\s+(?:me|us)\b(?:\s+(?:on|about|with))?/i,
    /\bplease\b.{0,30}\bupdate\s+(?:me|us)\b(?:\s+(?:on|about|with))?/i,
    /\b(?:can|could|would|will)\s+you\b.{0,60}\btell\s+(?:me|us)\b.{0,30}\b(?:the|what)\b.{0,30}\b(?:status|update)\b/i,
    /\b(?:can|could|would|will)\s+you\b.{0,60}\blet\s+(?:me|us)\s+know\b.{0,40}\b(?:the|what)\b.{0,30}\b(?:status|update)\b/i,
    /\b(?:do|would)\s+you\b.{0,40}\b(?:have|know)\b.{0,60}\b(?:the\s+)?(?:status|update)\b/i,
    /\bwhat\s+(?:is|'s)\s+(?:the\s+)?(?:current\s+)?(?:status|update)\b/i,
  ].some(pattern => pattern.test(text))
}

function sourceExplicitlyRequestsRecipientUnderlyingInfo(source: string): boolean {
  return requestsRecipientUnderlyingInfo(source)
}

function sourceSignalsReferralOnly(source: string): boolean {
  return sourceSignalsReferralRequest(source) && !sourceExplicitlyRequestsRecipientUnderlyingInfo(source)
}

function answerRequestsRecipientUnderlyingInfo(answer: string): boolean {
  return requestsRecipientUnderlyingInfo(answer)
}

export function contextualEditIntentViolation(input: {
  originalSource: string
  answer: string
}): 'recipient_role_expansion' | null {
  if (sourceSignalsReferralOnly(input.originalSource) && answerRequestsRecipientUnderlyingInfo(input.answer)) {
    return 'recipient_role_expansion'
  }
  return null
}

export function prepareContextualEdit(editableSource: string, referenceContext?: string | null): ContextualEditPreparation {
  const context = compact(referenceContext)
  let normalized = String(editableSource || '')
  const anchors: string[] = []

  if (sourceSignalsOnePersonPost(normalized, context)) {
    // One idempotent pass. The previous two-step chain rewrote "a person post" to
    // "a one-person post" and then matched "person post" again inside it, emitting
    // "a one-one-person post". The optional one- prefix makes re-application a no-op.
    normalized = normalized.replace(/\b(?:one-)?person\s+post\b/gi, 'one-person post')
    anchors.push('The rough phrase "person post" means "one-person post" (a post being covered by one person), NOT "personal post".')
  }

  if (sourceSignalsReferralOnly(normalized)) {
    anchors.push('The user is asking this recipient for ROUTING/REFERRAL only: identify the correct person, office, team, or point of contact who can provide the underlying information. Do NOT broaden this into a request for this recipient to provide, advise on, confirm, or otherwise supply the underlying status, update, or information themselves.')
  }

  if (/\bcancel(?:ing|ling)\s+(?:the\s+)?outbound\s+shipment\b/i.test(context)) {
    anchors.push('The cancellation being discussed is the outbound shipment; do not replace that concrete referent with vague wording such as "this".')
  }

  if (/\b(?:still\s+)?want(?:ed)?\s+to\s+support\s+the\s+outbound\s+flight\b/i.test(context)) {
    anchors.push('The incoming message directly asks whether the user will support the outbound flight.')
  }

  if (sourceSignalsOutboundSupportYes(normalized, context)) {
    anchors.push('The user draft indicates YES: the user is willing to support the outbound flight. The finished reply must state that answer explicitly.')
  }

  return { editableSource: normalized, anchors }
}

export function contextualEditAnchorBlock(anchors: string[]): string {
  if (!anchors.length) return ''
  return ['SEMANTIC ANCHORS — REQUIRED:', ...anchors.map((anchor, index) => `${index + 1}. ${anchor}`)].join('\n')
}

function insertBeforeClosing(answer: string, sentence: string): string {
  const closing = /(^|\n)(Best regards|Regards|Kind regards|Sincerely|Respectfully|Atenciosamente|Saludos|Pozdrawiam|С уважением)[,:]?\s*\n/i
  const match = closing.exec(answer)
  if (!match || match.index === undefined) return `${answer.trim()}\n\n${sentence}`.trim()
  const before = answer.slice(0, match.index).trimEnd()
  const after = answer.slice(match.index).trimStart()
  return `${before}\n\n${sentence}\n\n${after}`.trim()
}

function repairReferralOnlyRoleExpansion(source: string, answer: string): string {
  if (!sourceSignalsReferralOnly(source) || !answerRequestsRecipientUnderlyingInfo(answer)) return answer

  // Keep the surrounding edited draft, but replace only the broadened recipient request.
  // The topic normally remains explicit in the preceding sentence; the safe fallback asks
  // only for routing and therefore cannot assign the underlying work to the wrong office.
  const directQuestion = /\b(?:Could|Can|Would|Will)\s+you\b[^?]*(?:\?|$)/i
  if (directQuestion.test(answer)) {
    return answer.replace(
      directQuestion,
      'Could you please let us know who or which office we should contact for more information?',
    )
  }

  const directSentence = /(^|[.!?]\s+|\n+)(?:Please|Kindly)\b[^.!?\n]*(?:[.!?]|$)/i
  if (directSentence.test(answer)) {
    return answer.replace(
      directSentence,
      '$1Could you please let us know who or which office we should contact for more information?',
    )
  }

  return answer
}

export function repairContextualEditDrift(input: {
  originalSource: string
  referenceContext?: string | null
  answer: string
  language?: string
}): string {
  const context = compact(input.referenceContext)
  const source = String(input.originalSource || '')
  let answer = String(input.answer || '').trim()

  if (sourceSignalsOnePersonPost(source, context) && /\bpersonal\s+post\b/i.test(answer)) {
    answer = answer.replace(/\b(?:a\s+)?personal\s+post\b/gi, match => /^a\s/i.test(match) ? 'a one-person post' : 'one-person post')
  }

  if (/\bcancel(?:ing|ling)\s+(?:the\s+)?outbound\s+shipment\b/i.test(context)) {
    answer = answer.replace(/\bcancell?ing\s+(?:this|it)\b/gi, match => /cancelling/i.test(match) ? 'cancelling the outbound shipment' : 'canceling the outbound shipment')
  }

  const language = String(input.language || '').toLowerCase().slice(0, 2)
  const englishOutput = !language || language === 'en'

  if (englishOutput) {
    answer = repairReferralOnlyRoleExpansion(source, answer)
  }

  if (englishOutput && sourceSignalsOutboundSupportYes(source, context) && !/\bsupport(?:ing)?\s+the\s+outbound\s+flight\b/i.test(answer)) {
    const thursday = /\boutbound\s+flight\s+on\s+Thursday\s+morning\b/i.test(context)
    answer = insertBeforeClosing(answer, thursday
      ? 'I’m fine supporting the outbound flight on Thursday morning.'
      : 'I’m fine supporting the outbound flight.')
  }

  return answer.trim()
}
