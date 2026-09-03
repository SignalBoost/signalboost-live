// saas/lib/ai/cos/platformIdentityContext.ts
//
// Owner rule (2026-09-03): NOTHING about SignalBoost's current configuration is hard-coded.
// The runtime supplies the facts; the neural reasoner supplies the intelligence. A hard-coded
// default is not a safety net here — it is a lie that survives a misconfiguration silently. The
// previous hard-coded Builder default named a different model release from the one Production
// actually runs, and it would have been reported to the owner as fact had the environment
// variable ever gone missing. No model, provider or version literal belongs in this file.
//
// Two failure modes, deliberately different:
//   - EXECUTION (Builder coding calls): fail closed. Running a coding job on a guessed model is
//     worse than an error. See requireBuilderCodingModel().
//   - DISCLOSURE (owner self-knowledge): report the gap. A missing string must not take down an
//     ordinary owner turn, and must never be filled in with a plausible value.

export type PlatformModelTopology = Readonly<{
  primaryReasonerModel: string | null
  builderCodingModel: string | null
  embeddingModel: string | null
  managedProvider: string | null
}>

export const BUILDER_MODEL_NOT_CONFIGURED = 'builder_model_not_configured'

/** A configuration value that is absent is null. It is never substituted. */
function configured(value: string | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

export function currentPlatformModelTopology(): PlatformModelTopology {
  return {
    primaryReasonerModel: configured(process.env.LOCAL_AI_MODEL),
    builderCodingModel: configured(process.env.DEEPINFRA_BUILDER_MODEL),
    embeddingModel: configured(process.env.LOCAL_AI_EMBEDDING_MODEL),
    managedProvider: configured(process.env.LOCAL_AI_MANAGED_PROVIDER),
  }
}

/**
 * Execution path. Builder must never run on an assumed model, so an unset variable is a
 * configuration error the operator can act on, not a silent substitution.
 */
export function requireBuilderCodingModel(): string {
  const model = currentPlatformModelTopology().builderCodingModel
  if (!model) throw new Error(BUILDER_MODEL_NOT_CONFIGURED)
  return model
}

const NOT_CONFIGURED = 'NOT CONFIGURED — no value is set in this runtime and no default is substituted'

function fact(label: string, value: string | null, variable: string): string {
  return `- ${label} ${value ?? `${NOT_CONFIGURED} (${variable})`}`
}

/**
 * Trusted runtime facts for the authenticated owner channel.
 *
 * This is CONTEXT, not an answer template. The neural reasoner receives these facts on ordinary
 * owner turns and decides from the meaning of the user's request whether they are relevant, how
 * much detail to use, and how to explain the relationship between components. No regex/detector
 * selects a canned owner identity answer.
 *
 * Public delivery never receives this block; public model/provider disclosure remains a separate
 * deterministic safety boundary.
 */
export function ownerPlatformIdentityContext(): string {
  const topology = currentPlatformModelTopology()
  return [
    'TRUSTED OWNER RUNTIME CONTEXT — SIGNALBOOST MODEL TOPOLOGY:',
    fact('General COS reasoning model:', topology.primaryReasonerModel, 'LOCAL_AI_MODEL'),
    fact('Builder / Platform Engineer coding-specialist model:', topology.builderCodingModel, 'DEEPINFRA_BUILDER_MODEL'),
    fact('Embedding model:', topology.embeddingModel, 'LOCAL_AI_EMBEDDING_MODEL'),
    fact('Managed inference provider:', topology.managedProvider, 'LOCAL_AI_MANAGED_PROVIDER'),
    '- The Builder coding model is task-specialized. It is selected only after work is routed into',
    '  authenticated COS Builder / Platform Engineer coding execution; it does not replace the',
    '  general COS reasoner for ordinary conversation, analysis, research synthesis, or Concierge.',
    '- IDENTIFIERS ABOVE ARE VERBATIM FACTUAL ATOMS. Reproduce any model name, provider name or',
    '  version EXACTLY as written, character for character. You may explain, compare and reason',
    '  about what these components do and why they are separated. You may NOT alter, abbreviate,',
    '  expand, infer, or version-complete them — never add or change a version suffix, date or',
    '  release tag. If a line above says NOT CONFIGURED, say that it is not currently configured;',
    '  do not supply a likely value.',
    '- Treat these lines as current runtime facts, not as a scripted response. Reason over the',
    '  user request and these facts together. Decide relevance semantically, explain roles and',
    '  relationships in your own words, and do not mechanically echo this block.',
    '- If the owner asks broadly about your model, architecture, specs, stack, or what runs a',
    '  capability, distinguish the general reasoner from specialized models when that distinction',
    '  materially answers the question. Never imply that one specialist model powers the whole platform.',
  ].join('\n')
}
