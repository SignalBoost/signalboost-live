// saas/lib/visuals/freshGeneration.ts
// DeepInfra's OpenAI-compatible Images API does not expose the model's seed control.
// A random token alone can be semantically ignored by the image model, so each creation request
// also receives a deterministic, human-readable composition variation derived from that token.
// Explicit user constraints always win; only unspecified composition details may vary.

const FRAMING_VARIANTS = Object.freeze([
  'Use a wider environmental view with more surrounding context where framing is not explicitly constrained.',
  'Use a closer action-focused view with stronger subject presence where framing is not explicitly constrained.',
  'Use a medium-distance environmental view with clear separation between primary and secondary elements.',
  'Use more negative space with an asymmetric crop where the request permits.',
  'Use a fuller edge-to-edge environment with less empty background where the request permits.',
  'Use stronger foreground-to-background depth where the request permits.',
  'Use a natural spatial composition with clear depth where the request permits.',
  'Use a more panoramic environmental balance where aspect and framing are not explicitly constrained.',
] as const)

const LAYOUT_VARIANTS = Object.freeze([
  'Place the main visual weight left of center and balance it with secondary environmental detail on the right.',
  'Place the main visual weight right of center and balance it with secondary environmental detail on the left.',
  'Use an asymmetric diagonal flow with clear directional movement.',
  'Use a layered triangular arrangement with distinct foreground, middle-ground, and background relationships.',
  'Use a stronger foreground/background separation with a visibly different placement of non-required elements.',
  'Use an offset focal point with different scale relationships and spacing among non-required elements.',
  'Use a sweeping side-to-side flow with a different spatial relationship among non-required elements.',
  'Use a dynamic off-center focal point with stronger directional movement through the image.',
] as const)

const DETAIL_VARIANTS = Object.freeze([
  'If the scene contains action, choose a different instant of motion or gesture; otherwise vary secondary geometry and spacing.',
  'If people or animals are present, vary pose and relative placement; otherwise vary secondary shapes and background structure.',
  'Change the non-required environmental arrangement and depth cues while preserving every explicit subject requirement.',
  'Vary the visual rhythm, spacing, and secondary details so the result is recognizably new rather than a close remake.',
  'Choose different non-required foreground and background details while keeping the requested subject unchanged.',
  'Vary the balance between primary and secondary elements and avoid repeating a familiar stock composition.',
  'Choose a different non-required pose, orientation, or secondary-object arrangement where applicable.',
  'Make the non-required composition details clearly distinct while preserving requested identities, objects, text, and constraints.',
] as const)

const MARK_OBJECTIVE = /\b(?:logo|logotype|emblem|badge|crest|insignia|icon|symbol|mark|shield|logotipo|emblema|distintivo|escudo|brasao|icone|simbolo|marca|blason|icono|logotyp|emblemat|odznaka|herb|ikona|znak|логотип|эмблема|значок|герб|иконка|символ)\b/iu

function variationHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function userObjective(prompt: string): string {
  const value = String(prompt || '').trim()
  const marker = /(?:^|\n)USER REQUEST:\s*\n/gi
  let match: RegExpExecArray | null = null
  let last: RegExpExecArray | null = null
  while ((match = marker.exec(value)) !== null) last = match
  return last ? value.slice((last.index || 0) + last[0].length).trim() : value
}

function baseGenerationPrompt(objective: string): readonly string[] {
  if (MARK_OBJECTIVE.test(objective)) {
    return [
      objective,
      '',
      'ORIGINAL GRAPHIC-MARK GENERATION DIRECTIVE:',
      'Create the requested original graphic mark as a clean design asset.',
      'Use a composition appropriate to the requested mark type and do not reconstruct an existing named brand or team design from memory.',
    ]
  }

  return [
    objective,
    '',
    'FULL-FRAME VISUAL GENERATION DIRECTIVE:',
    'Create the requested visual as a complete edge-to-edge image occupying the entire rectangular canvas.',
    'Extend the requested environment and background continuously to every edge of the image.',
    'Compose the primary subjects naturally inside a surrounding environment appropriate to the request.',
    'Use spatial depth, contextual surroundings, and scene composition appropriate to the requested subject and style.',
  ]
}

export function freshVisualComposition(variationId: string): string {
  const seed = variationHash(String(variationId || 'fresh'))
  const framing = FRAMING_VARIANTS[seed % FRAMING_VARIANTS.length]
  const layout = LAYOUT_VARIANTS[Math.floor(seed / FRAMING_VARIANTS.length) % LAYOUT_VARIANTS.length]
  const detail = DETAIL_VARIANTS[Math.floor(seed / (FRAMING_VARIANTS.length * LAYOUT_VARIANTS.length)) % DETAIL_VARIANTS.length]
  return [framing, layout, detail].join(' ')
}

export function freshVisualPrompt(prompt: string, variationId: string = crypto.randomUUID()): string {
  const objective = userObjective(prompt)
  return [
    ...baseGenerationPrompt(objective),
    '',
    'FRESH GENERATION DIRECTIVE:',
    freshVisualComposition(variationId),
    'Generate this image from scratch. Make the non-required composition recognizably different from earlier generations of the same request.',
    'Only vary details the user did not explicitly constrain. Every explicit user requirement overrides the variation directive.',
    `Internal variation token: ${variationId}`,
    'Do not render, quote, label, or otherwise expose the internal variation token in the image.',
    'Preserve the user-requested subject, constraints, and meaning.',
  ].join('\n')
}
