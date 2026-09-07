// saas/lib/visuals/freshGeneration.ts
// DeepInfra's OpenAI-compatible Images API does not expose the model's seed control.
// A random token alone can be semantically ignored by the image model, so each creation request
// also receives a deterministic, human-readable composition variation derived from that token.
// Explicit user constraints always win; only unspecified composition details may vary.

const FRAMING_VARIANTS = Object.freeze([
  'Use a wider framing with more surrounding context where framing is not explicitly constrained.',
  'Use a closer framing with stronger subject presence where framing is not explicitly constrained.',
  'Use a medium-distance framing with clear separation between primary and secondary elements.',
  'Use more negative space and a less centered crop where the request permits.',
  'Use a fuller edge-to-edge composition with less empty background where the request permits.',
  'Use stronger foreground-to-background depth where the request permits.',
  'Use a flatter graphic composition with clearer shape separation where the request permits.',
  'Use a more panoramic spatial balance where aspect and framing are not explicitly constrained.',
] as const)

const LAYOUT_VARIANTS = Object.freeze([
  'Place the main visual weight left of center and balance it with secondary detail on the right.',
  'Place the main visual weight right of center and balance it with secondary detail on the left.',
  'Use an asymmetric diagonal flow rather than a centered arrangement.',
  'Use a layered triangular arrangement rather than an even horizontal arrangement.',
  'Use a stronger foreground/background separation with a visibly different placement of non-required elements.',
  'Use a cleaner centered hierarchy but change scale relationships and spacing of non-required elements.',
  'Use a sweeping side-to-side flow with a different spatial relationship among non-required elements.',
  'Use an offset focal point with stronger directional movement through the frame.',
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

function variationHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function freshVisualComposition(variationId: string): string {
  const seed = variationHash(String(variationId || 'fresh'))
  const framing = FRAMING_VARIANTS[seed % FRAMING_VARIANTS.length]
  const layout = LAYOUT_VARIANTS[Math.floor(seed / FRAMING_VARIANTS.length) % LAYOUT_VARIANTS.length]
  const detail = DETAIL_VARIANTS[Math.floor(seed / (FRAMING_VARIANTS.length * LAYOUT_VARIANTS.length)) % DETAIL_VARIANTS.length]
  return [framing, layout, detail].join(' ')
}

export function freshVisualPrompt(prompt: string, variationId: string = crypto.randomUUID()): string {
  const objective = prompt.trim()
  return [
    objective,
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
