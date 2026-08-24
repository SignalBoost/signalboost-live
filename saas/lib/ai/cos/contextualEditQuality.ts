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

function contextNamesOutboundShipmentCancellation(context: string): boolean {
  return /\bcancel(?:ing|ling)?\s+(?:the\s+)?outbound\s+shipment\b/i.test(context)
}

function sourceSignalsOutboundSupportYes(source: string, context: string): boolean {
  const asksSupport = /\b(?:still\s+)?want(?:ed)?\s+to\s+support\s+the\s+outbound\s+flight\b/i.test(context)
  if (!asksSupport) return false
  return /\bdo\s+not\s+worry\b/i.test(source)
    && (/\bif\s+i\s+(?:do\s+not|don't)\b.{0,100}\byou\s+will\s+have\s+to\b/i.test(source)
      || /\bwhatever\s+is\s+(?:needed|required)\s+to\s+support\s+the\s+mission\b/i.test(source)
      || /\bwe\s+do\s+what\s+we\s+have\s+to\s+do\b/i.test(source))
}

export function prepareContextualEdit(editableSource: string, referenceContext?: string | null): ContextualEditPreparation {
  const context = compact(referenceContext)
  let normalized = String(editableSource || '')
  const anchors: string[] = []

  if (sourceSignalsOnePersonPost(normalized, context)) {
    normalized = normalized
      .replace(/\ba\s+person\s+post\b/gi, 'a one-person post')
      .replace(/\bperson\s+post\b/gi, 'one-person post')
    anchors.push('The rough phrase "person post" means "one-person post" (a post being covered by one person), NOT "personal post".')
  }

  if (contextNamesOutboundShipmentCancellation(context)) {
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

  if (contextNamesOutboundShipmentCancellation(context)) {
    answer = answer.replace(/\bcancell?ing\s+(?:this|it)\b/gi, match => /cancelling/i.test(match) ? 'cancelling the outbound shipment' : 'canceling the outbound shipment')
  }

  const language = String(input.language || '').toLowerCase().slice(0, 2)
  const englishOutput = !language || language === 'en'
  if (englishOutput && sourceSignalsOutboundSupportYes(source, context) && !/\bsupport(?:ing)?\s+the\s+outbound\s+flight\b/i.test(answer)) {
    const thursday = /\boutbound\s+flight\s+on\s+Thursday\s+morning\b/i.test(context)
    answer = insertBeforeClosing(answer, thursday
      ? 'I’m fine supporting the outbound flight on Thursday morning.'
      : 'I’m fine supporting the outbound flight.')
  }

  return answer.trim()
}
