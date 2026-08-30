export type ConciergeArtifactFormat = 'txt' | 'pdf'

export type ConciergeArtifactIntent = Readonly<{
  format: ConciergeArtifactFormat
  filenameStem: string
}>

const ACTION = /\b(?:create|make|prepare|generate|give|send|download|export|save|write|i\s+(?:need|want|would\s+like))\b/i
const PDF = /(?:\bpdf\b|\.pdf\b)/i
const TEXT = /(?:\.txt\b|\b(?:plain\s+)?text\s+(?:file|document)\b|\btxt\s+(?:file|document)\b)/i

function filenameStem(prompt: string): string {
  const match = /\b(?:named|called|as)\s+[“"'\`]?([a-z0-9][a-z0-9 _-]{0,80})/i.exec(prompt)
  const raw = (match?.[1] || 'document')
    .replace(/\.(?:pdf|txt)\b.*$/i, '')
    .trim()
    .replace(/[^a-z0-9 _-]+/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return raw || 'document'
}

/** Deterministic artifact detection for authenticated Concierge tool routing. */
export function detectConciergeArtifactIntent(prompt: string): ConciergeArtifactIntent | null {
  const value = String(prompt || '').trim()
  if (!value || !ACTION.test(value)) return null
  const format: ConciergeArtifactFormat | null = PDF.test(value) ? 'pdf' : TEXT.test(value) ? 'txt' : null
  return format ? Object.freeze({ format, filenameStem: filenameStem(value) }) : null
}

export function isConciergeArtifactObjective(prompt: string): boolean {
  return detectConciergeArtifactIntent(prompt) !== null
}
