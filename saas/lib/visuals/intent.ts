export type ConciergeVisualIntent = Readonly<{ filename: string }>

const VISUAL_ACTION = /\b(?:sketch|draw|illustrate|visuali[sz]e|generate|create|make|design)\b/i
const VISUAL_SUBJECT = /\b(?:image|picture|illustration|drawing|sketch|diagram|scene|visual|render(?:ing)?|poster|infographic)\b/i

/** Explicit requests for a new visual, never ordinary questions about a visual subject. */
export function isConciergeVisualObjective(prompt: string): boolean {
  const value = String(prompt || '').trim()
  return Boolean(value && VISUAL_ACTION.test(value) && VISUAL_SUBJECT.test(value))
}

export function detectConciergeVisualIntent(prompt: string): ConciergeVisualIntent | null {
  return isConciergeVisualObjective(prompt) ? Object.freeze({ filename: 'visual.png' }) : null
}
