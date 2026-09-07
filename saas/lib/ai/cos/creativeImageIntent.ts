// saas/lib/ai/cos/creativeImageIntent.ts
// Deterministic intent boundary for text-to-image execution. Keep this narrow: COS should
// execute explicit visual-creation requests, not image search, OCR, analysis, or editing.

const IMAGE_NOUN = /\b(?:image|picture|photo|photograph|graphic|illustration|artwork|poster|banner|thumbnail|wallpaper|logo|icon|visual)\b/i
const CREATE_VERB = /\b(?:generate|create|make|design|produce|draw|illustrate|render)\b/i
const DIRECT_DRAW_VERB = /\bdraw\b/i
const NON_GENERATION = /\b(?:search|find|look up|identify|analy[sz]e|describe|explain|read|ocr|extract|edit|modify|retouch|remove|replace|upscale)\b/i
const NON_VISUAL_DRAW = /\bdraw\s+(?:(?:a|an|the|some|my|your|our)\s+)?(?:conclusion|inference|distinction|comparison|parallel|attention|blood|lots?|cards?|straws?|salary|wages?|benefits?|interest|breath|bath|curtains?|weapon|gun|sword)\b/i

export function isCosCreativeImageRequest(input: string): boolean {
  const text = String(input || '').trim()
  if (!text || NON_GENERATION.test(text)) return false

  // "Draw" is itself an explicit visual-creation instruction in ordinary usage. Do not require
  // the user to add a redundant noun such as "image" or "illustration". Keep common non-visual
  // senses out of the image lane so phrases such as "draw a conclusion" remain text reasoning.
  if (DIRECT_DRAW_VERB.test(text) && !NON_VISUAL_DRAW.test(text)) return true

  if (!IMAGE_NOUN.test(text) || !CREATE_VERB.test(text)) return false

  // Require the creation verb and visual noun to belong to the same short request rather than
  // combining unrelated words from a long pasted document.
  return /\b(?:generate|create|make|design|produce|draw|illustrate|render)\b[\s\S]{0,140}\b(?:image|picture|photo|photograph|graphic|illustration|artwork|poster|banner|thumbnail|wallpaper|logo|icon|visual)\b/i.test(text)
    || /\b(?:image|picture|photo|photograph|graphic|illustration|artwork|poster|banner|thumbnail|wallpaper|logo|icon|visual)\b[\s\S]{0,80}\b(?:generate|create|make|design|produce|draw|illustrate|render)\b/i.test(text)
}
