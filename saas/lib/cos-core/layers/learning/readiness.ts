export type LearningReadinessEnvironment = {
  [key: string]: string | undefined
  COS_AUTONOMOUS_LEARNING_ENABLED?: string
  COS_LIVE_SOURCES_ENABLED?: string
  YOUTUBE_API_KEY?: string
  COS_DAILY_LEARNING_URLS?: string
}

export type LearningReadiness = {
  autonomousLearningEnabled: boolean
  liveSourcesEnabled: boolean
  youtubeConfigured: boolean
  approvedUrlsConfigured: number
  sources: Array<{ name: string; available: boolean; requiresKey: boolean }>
  readyForLiveLearning: boolean
}

export function getLearningReadiness(
  env: LearningReadinessEnvironment = process.env,
): LearningReadiness {
  const autonomousLearningEnabled = env.COS_AUTONOMOUS_LEARNING_ENABLED === 'true'
  const liveSourcesEnabled = env.COS_LIVE_SOURCES_ENABLED === 'true'
  const youtubeConfigured = Boolean(env.YOUTUBE_API_KEY?.trim())
  const approvedUrlsConfigured = (env.COS_DAILY_LEARNING_URLS ?? '')
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .length

  const sources = [
    { name: 'Crossref', available: liveSourcesEnabled, requiresKey: false },
    { name: 'OpenAlex', available: liveSourcesEnabled, requiresKey: false },
    { name: 'Europe PMC', available: liveSourcesEnabled, requiresKey: false },
    { name: 'Open Library', available: liveSourcesEnabled, requiresKey: false },
    { name: 'GDELT', available: liveSourcesEnabled, requiresKey: false },
    { name: 'YouTube metadata', available: liveSourcesEnabled && youtubeConfigured, requiresKey: true },
    { name: 'Approved URLs', available: autonomousLearningEnabled && approvedUrlsConfigured > 0, requiresKey: false },
  ]

  return {
    autonomousLearningEnabled,
    liveSourcesEnabled,
    youtubeConfigured,
    approvedUrlsConfigured,
    sources,
    readyForLiveLearning: autonomousLearningEnabled && liveSourcesEnabled,
  }
}
