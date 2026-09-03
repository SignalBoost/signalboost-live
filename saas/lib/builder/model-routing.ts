export const DEFAULT_BUILDER_CODING_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'

/**
 * Builder's coding model is a server-owned deployment choice. Browser/user input never selects it.
 * Keeping this selector separate from LOCAL_AI_MODEL lets ordinary COS stay on its accepted primary
 * reasoner while Builder and Platform Engineer use coding-specialist compute on the same DeepInfra
 * transport and credential boundary.
 */
export function configuredBuilderCodingModel(
  value: string | undefined = process.env.BUILDER_AI_MODEL,
): string {
  return value?.trim() || DEFAULT_BUILDER_CODING_MODEL
}
