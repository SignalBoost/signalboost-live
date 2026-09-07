// saas/lib/visuals/freshGeneration.ts
// DeepInfra's OpenAI-compatible Images API does not expose the model's seed control.
// Give each creation request a provider-visible variation token so an identical user prompt
// still starts a fresh generation instead of deterministically replaying the same composition.

export function freshVisualPrompt(prompt: string, variationId: string = crypto.randomUUID()): string {
  const objective = prompt.trim()
  return [
    objective,
    '',
    `Internal variation token: ${variationId}`,
    'Use the internal variation token only to choose a fresh composition and sampling variation.',
    'Do not render, quote, label, or otherwise expose the internal variation token in the image.',
    'Preserve the user-requested subject, constraints, and meaning.',
  ].join('\n')
}
