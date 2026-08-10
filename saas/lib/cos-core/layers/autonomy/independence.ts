export type IndependenceEnvironment = Record<string, string | undefined>

const present = (env: IndependenceEnvironment, name: string) => Boolean(env[name]?.trim())

export type COSIndependenceAssessment = {
  localConfigured: boolean
  localPrimary: boolean
  cloudFallbackDisabled: boolean
  cloudKeysAbsent: boolean
  strictProviderIndependent: boolean
  score: number
  blockers: string[]
}

/** Deployment-level proof that COS can operate without OpenAI or Anthropic. */
export function assessCOSIndependence(env: IndependenceEnvironment = process.env): COSIndependenceAssessment {
  const localConfigured = present(env, 'LOCAL_AI_BASE_URL')
  const localPrimary = env.AI_MODEL_PROVIDER?.trim().toLowerCase() === 'local'
  const cloudFallbackDisabled = env.LOCAL_AI_ALLOW_CLOUD_FALLBACK !== 'true'
  const cloudKeysAbsent = !present(env, 'OPENAI_API_KEY') && !present(env, 'ANTHROPIC_API_KEY')
  const blockers: string[] = []

  if (!localConfigured) blockers.push('LOCAL_AI_BASE_URL is not configured.')
  if (!localPrimary) blockers.push('AI_MODEL_PROVIDER must be local.')
  if (!cloudFallbackDisabled) blockers.push('LOCAL_AI_ALLOW_CLOUD_FALLBACK must be disabled for strict independence.')
  if (!cloudKeysAbsent) blockers.push('OpenAI/Anthropic keys are still present; remove them for zero-cloud proof mode.')

  const checks = [localConfigured, localPrimary, cloudFallbackDisabled, cloudKeysAbsent]
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  return {
    localConfigured,
    localPrimary,
    cloudFallbackDisabled,
    cloudKeysAbsent,
    strictProviderIndependent: blockers.length === 0,
    score,
    blockers,
  }
}
