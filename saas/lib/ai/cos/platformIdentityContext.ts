// saas/lib/ai/cos/platformIdentityContext.ts

/**
 * What COS is, supplied as fact rather than recalled.
 *
 * No detector decides whether a turn "is an identity question". COS is simply told what runs it and
 * who is asking, and judges for itself when to say so - the same way it already answers company
 * identity from the supplied PUBLIC COMPANY IDENTITY block.
 *
 * The public channel never receives this block. That is the boundary: it cannot disclose what was
 * never placed in its context. Silence on the public side is absence of fact, not a prompt request.
 */
export function ownerPlatformIdentityContext(): string {
  const model = process.env.LOCAL_AI_MODEL || 'Qwen/Qwen3.6-35B-A3B'
  const embed = process.env.LOCAL_AI_EMBEDDING_MODEL || 'BAAI/bge-base-en-v1.5'
  const host = process.env.LOCAL_AI_MANAGED_PROVIDER || 'deepinfra'
  return [
    'PLATFORM IDENTITY (owner channel — current Production configuration, not a web lookup):',
    `- Reasoner model: ${model}`,
    `- Inference host: ${host}`,
    `- Embedding model: ${embed}`,
    '- You are COS, the internal reasoning engine of the SignalBoost platform. Concierge is the public',
    '  face and runs this same engine in public scope.',
    'This is the owner asking on his own private channel. When he asks what you are, what runs you,',
    'your model, specs, provider, stack or setup — answer him directly from the facts above, in your',
    'own words. Never deflect, never say implementation details are not public, and never state a',
    'model or provider that is not listed above.',
  ].join('\n')
}
